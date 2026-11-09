/** pnpm template:update: bring the template's newer changes into this copy as one commit, keeping yours. */
import { join } from "node:path";
import { updateFromTemplate } from "./lib/template-update";

process.exitCode = updateFromTemplate(join(import.meta.dirname, ".."));
