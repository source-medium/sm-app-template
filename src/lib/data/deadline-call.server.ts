/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * What a single warehouse call needs whichever client sends it: one deadline
 * linked to the caller's abort signal, and response bodies read under one
 * byte budget. The BigQuery client and the data API client each extend it
 * with their own requests.
 */
import "server-only";
import { WarehouseError } from "./warehouse-error";

/** Test seams; production uses the platform's fetch and clock. */
export type CallSeams = { fetch?: typeof fetch; now?: () => number };

export class DeadlineCall {
  private readonly controller = new AbortController();
  private readonly startedAt: number;
  private readonly deadlineAt: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly unlink: () => void;
  private responseBytes = 0;
  protected readonly fetchImpl: typeof fetch;
  protected readonly now: () => number;

  constructor(
    seams: CallSeams,
    deadlineMs: number,
    callerSignal: AbortSignal | undefined,
    private readonly maxResponseBytes: number,
  ) {
    this.fetchImpl = seams.fetch ?? globalThis.fetch;
    this.now = seams.now ?? Date.now;
    this.startedAt = this.now();
    this.deadlineAt = this.startedAt + deadlineMs;
    this.timer = setTimeout(
      () => this.controller.abort(new DOMException("Deadline exceeded", "TimeoutError")),
      deadlineMs,
    );
    const onAbort = () => this.controller.abort(new DOMException("Cancelled", "AbortError"));
    if (callerSignal?.aborted) onAbort();
    callerSignal?.addEventListener("abort", onAbort, { once: true });
    this.unlink = () => callerSignal?.removeEventListener("abort", onAbort);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  remainingMs(): number {
    return Math.max(1, this.deadlineAt - this.now());
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.unlink();
  }

  /** A JSON body. The byte budget spans every response this call reads, so paging cannot exceed it. */
  async readJson(response: Response): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) throw new SyntaxError("Empty response body");
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.responseBytes += value.byteLength;
        if (this.responseBytes > this.maxResponseBytes) {
          await reader.cancel();
          throw new WarehouseError("result_too_large", { reason: "response_bytes" });
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      return JSON.parse(chunks.join(""));
    } finally {
      reader.releaseLock();
    }
  }
}
