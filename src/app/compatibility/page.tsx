import type { Metadata } from "next";
import { CompatibilityView } from "@/components/compatibility-view";
import { DEMO_COMPATIBILITY } from "@/presentation/compatibility-demo";

export const metadata: Metadata = {
  title: "Compatibility",
  description:
    "A transparent local demonstration of deterministic compatibility facts and product-defined category metrics.",
  robots: { index: false, follow: false },
};
export default function CompatibilityPage() {
  return (
    <CompatibilityView state={{ status: "ready", model: DEMO_COMPATIBILITY }} />
  );
}
