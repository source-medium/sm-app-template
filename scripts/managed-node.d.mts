/** Types for scripts/managed-node.mjs, which runs under plain Node. */
export function managedNodeEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  hosting: string | undefined,
): Record<string, string | undefined>;

export function managedServerBindingRefusal(
  command: string,
  args: readonly string[],
  hosting: string | undefined,
): string | null;
