/** Types for scripts/sourcemedium-preview.mjs, which runs under plain Node. */
export const DEFAULT_SOURCEMEDIUM_URL: string;

export function sourcemediumOrigin(value: string | undefined): string;

export function runPreview(input: {
  env: Readonly<Record<string, string | undefined>>;
  fetch: (url: string | URL, init?: RequestInit) => Promise<Response>;
  archive: () => Uint8Array;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
  summary: (markdown: string) => void;
  now?: () => number;
}): Promise<number>;
