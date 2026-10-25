/**
 * Client-only URL state reaches copied links only when its view declares the
 * key: each `param` a chart menu takes in `ReportPage chartParams`, and each
 * hidden report-form field a native-history control writes in
 * `clientPresentationParams`. Keys compare as written, a literal or a constant.
 */
import type { SourceFile } from "./auth-coverage";

const FEATURE = /^src\/features\/([^/]+)\//;

function declared(text: string, prop: string): Set<string> {
  const list = text.match(new RegExp(`\\b${prop}=\\{\\[([^\\]]*)\\]\\}`))?.[1] ?? "";
  return new Set([...list.matchAll(/["']?([\w-]+)["']?/g)].flatMap((match) => match[1] ?? []));
}

function chartParams(text: string): string[] {
  return [...text.matchAll(/\bparam=(?:"|\{)([\w-]+)/g)].flatMap((match) => match[1] ?? []);
}

/** Hidden report-form fields in a file that writes presentation state through native history. */
function presentationFields(text: string): string[] {
  if (!text.includes("writePresentationUrl(")) return [];
  return [...text.matchAll(/<input\b[^>]*>/gs)]
    .filter(([input]) => input.includes('type="hidden"'))
    .flatMap(([input]) => input.match(/\bname=(?:"|\{)([\w-]+)/)?.[1] ?? []);
}

export function findPresentationGaps(files: readonly SourceFile[]): string[] {
  const views = new Map<string, SourceFile[]>();
  for (const file of files) {
    const view = file.path.match(FEATURE)?.[1];
    if (view && !/\.(test|e2e)\.tsx?$/.test(file.path)) views.set(view, [...(views.get(view) ?? []), file]);
  }
  const gaps: string[] = [];
  for (const [view, viewFiles] of views) {
    const pagePath = `src/features/${view}/page.tsx`;
    const page = viewFiles.find((file) => file.path === pagePath);
    if (!page) continue;
    const kinds = [
      { prop: "chartParams", what: "chart param", used: chartParams },
      { prop: "clientPresentationParams", what: "presentation field", used: presentationFields },
    ];
    for (const { prop, what, used } of kinds) {
      const listed = declared(page.text, prop);
      const seen = new Set<string>();
      for (const file of viewFiles)
        for (const key of used(file.text)) {
          seen.add(key);
          if (!listed.has(key))
            gaps.push(
              `\`${file.path}\` writes ${what} \`${key}\`, which \`${pagePath}\` does not list in \`ReportPage ${prop}\`; add it so copied links keep the choice.`,
            );
        }
      for (const key of listed)
        if (!seen.has(key))
          gaps.push(
            `\`${pagePath}\` lists \`${key}\` in \`ReportPage ${prop}\`, but no control in the view writes it; remove it.`,
          );
    }
  }
  return gaps;
}
