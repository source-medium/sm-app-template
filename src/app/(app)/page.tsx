import { redirect } from "next/navigation";
import { appConfig } from "@/app.config";

/** The home page is the first navigation entry, so removing any one view never leaves "/" broken. */
export default function Home() {
  redirect(appConfig.nav[0]?.href ?? "/overview");
}
