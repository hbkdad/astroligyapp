import type { Metadata } from "next";
import { NumerologyView } from "@/components/numerology-view";
import { DEMO_NUMEROLOGY } from "@/presentation/numerology-demo";

export const metadata: Metadata = {
  title: "Numerology",
  description:
    "An accessible view of deterministic Pythagorean numerology results and traces.",
};
export default function NumerologyPage() {
  return <NumerologyView state={{ status: "ready", model: DEMO_NUMEROLOGY }} />;
}
