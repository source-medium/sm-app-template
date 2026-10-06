import { notFound, redirect } from "next/navigation";
import { appConfig } from "@/app.config";

/** The home page is the first navigation entry, so removing any one view never leaves "/" broken. */
export default function Home() {
  const first = appConfig.nav[0];
  if (!first) notFound();
  redirect(first.href);
}
