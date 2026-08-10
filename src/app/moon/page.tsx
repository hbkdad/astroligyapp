import type { Metadata } from "next";

import { MoonView } from "@/components/moon-view";
import { getDemoMoon } from "@/presentation/moon-demo";

export const metadata: Metadata = {
  title: "Moon",
  description:
    "An accessible view of validated current and upcoming lunar facts.",
};

export default async function MoonPage() {
  return <MoonView state={{ status: "ready", model: await getDemoMoon() }} />;
}
