import type { Metadata } from "next";
import { NumerologyView } from "@/components/numerology-view";
import { DEMO_NUMEROLOGY } from "@/presentation/numerology-demo";
import { publicMetadata } from "@/presentation/public-seo";

export const metadata: Metadata = publicMetadata({
  path: "/numerology",
  title: "Numerology Demo",
  description:
    "An accessible local demonstration of deterministic Pythagorean numerology results and traces.",
  eligible: false,
});
export default function NumerologyPage() {
  return <NumerologyView state={{ status: "ready", model: DEMO_NUMEROLOGY }} />;
}
