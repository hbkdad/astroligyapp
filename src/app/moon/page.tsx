import type { Metadata } from "next";

import { MoonView } from "@/components/moon-view";
import { getDemoMoon } from "@/presentation/moon-demo";
import { publicMetadata } from "@/presentation/public-seo";

export const metadata: Metadata = publicMetadata({
  path: "/moon",
  title: "Moon Demo",
  description:
    "An accessible local demonstration of validated current and upcoming lunar facts.",
  eligible: false,
});

export default async function MoonPage() {
  return <MoonView state={{ status: "ready", model: await getDemoMoon() }} />;
}
