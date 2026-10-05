/**
 * The template's own lint rules. Each message is one sentence naming the fix,
 * because the reader is often a coding agent acting on a non-developer's
 * behalf.
 */

const LOCALE_METHODS = new Set(["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]);
const INTL_FORMATTERS = new Set(["DateTimeFormat", "NumberFormat", "RelativeTimeFormat"]);

function isUseClient(program) {
  return program.body.some((node) => node.type === "ExpressionStatement" && node.directive === "use client");
}

/** Server and browser can disagree on locale and time zone, so client components never format. */
const noClientLocaleFormat = {
  meta: {
    type: "problem",
    messages: {
      locale:
        "Client components must not format numbers or dates with {{name}} (server and browser can disagree, causing hydration errors); format on the server with src/lib/format.ts and pass the string as a prop.",
    },
    schema: [],
  },
  create(context) {
    let client = false;
    return {
      Program(node) {
        client = isUseClient(node);
      },
      MemberExpression(node) {
        if (!client || node.property.type !== "Identifier") return;
        if (LOCALE_METHODS.has(node.property.name)) {
          context.report({ node, messageId: "locale", data: { name: node.property.name } });
        }
        if (
          node.object.type === "Identifier" &&
          node.object.name === "Intl" &&
          INTL_FORMATTERS.has(node.property.name)
        ) {
          context.report({ node, messageId: "locale", data: { name: `Intl.${node.property.name}` } });
        }
      },
    };
  },
};

/** Configuration is read in one place so modes cannot drift. */
const noProcessEnv = {
  meta: {
    type: "problem",
    messages: {
      env: "Read configuration through src/lib/config/env.server.ts instead of process.env, so the app's mode is derived in one place; add new variables to that parser.",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "process" &&
          node.property.type === "Identifier" &&
          node.property.name === "env"
        ) {
          context.report({ node, messageId: "env" });
        }
      },
    };
  },
};

/** A *.server.ts file holds credentials or warehouse access and must never reach a browser bundle. */
const serverOnlyImport = {
  meta: {
    type: "problem",
    messages: {
      missing:
        'Server modules (*.server.ts) must start with `import "server-only";` so they can never be bundled for the browser; add that line at the top.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const imported = node.body.some(
          (statement) => statement.type === "ImportDeclaration" && statement.source.value === "server-only",
        );
        if (!imported) context.report({ node, messageId: "missing" });
      },
    };
  },
};

export default {
  meta: { name: "sm-app-template" },
  rules: {
    "no-client-locale-format": noClientLocaleFormat,
    "no-process-env": noProcessEnv,
    "server-only-import": serverOnlyImport,
  },
};
