import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every data page is dynamic and private (Cache-Control: private, no-store).
export default defineCloudflareConfig({});
