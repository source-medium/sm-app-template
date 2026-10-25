/**
 * The vendored managed-app contract's examples (contracts/managed-app-v1),
 * imported rather than read from disk so the workerd tests can use them too.
 */
import examples from "../../contracts/managed-app-v1/examples.json";

export { examples };

type Section = Exclude<keyof typeof examples, "$comment" | "contract">;

/** The valid example `caseName` in `section`; throws when the vendored contract no longer has it. */
export function contractExample<S extends Section>(
  section: S,
  caseName: string,
): (typeof examples)[S]["valid"][number] {
  const valid: readonly { case: string }[] = examples[section].valid;
  const found = valid.find((entry) => entry.case === caseName);
  if (!found) throw new Error(`the vendored contract has no ${section} example "${caseName}"`);
  return found as (typeof examples)[S]["valid"][number];
}
