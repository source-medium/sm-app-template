/** The highest default test port (the fixed-store browser server); the offset must keep it a valid port. */
const HIGHEST_DEFAULT_PORT = 3109;

/**
 * SM_TEST_PORT_OFFSET shifts every local test server together, so independent
 * checkouts keep their own servers. Each server adds this to its default port.
 */
export function testPortOffset(env: Record<string, string | undefined> = process.env): number {
  const text = env.SM_TEST_PORT_OFFSET ?? "0";
  const offset = Number(text);
  const highest = 65535 - HIGHEST_DEFAULT_PORT;
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(offset) || offset > highest) {
    throw new Error(`SM_TEST_PORT_OFFSET must be an integer from 0 through ${highest}.`);
  }
  return offset;
}
