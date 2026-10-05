import type { Rule } from "eslint";

type TemplateRule = Rule.RuleModule & { meta: { messages: Record<string, string> } };

declare const plugin: {
  meta: { name: string };
  rules: Record<"no-client-locale-format" | "no-process-env" | "server-only-import", TemplateRule>;
};
export default plugin;
