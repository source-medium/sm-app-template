/** pnpm skills:sync: regenerate .claude/skills from .agents/skills. */
import { root } from "./lib/environment";
import { syncSkills } from "./lib/skills";

const count = syncSkills(root);
console.log(`Copied ${count} skill file${count === 1 ? "" : "s"} from .agents/skills to .claude/skills.`);
