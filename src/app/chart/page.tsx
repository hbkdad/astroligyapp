import type { Metadata } from "next";

import { NatalChartView } from "@/components/natal-chart-view";
import { DEMO_NATAL_CHART } from "@/presentation/natal-chart-demo";
import { publicMetadata } from "@/presentation/public-seo";

export const metadata: Metadata = publicMetadata({
  path: "/chart",
  title: "Natal Chart Demo",
  description:
    "An accessible local visualization of a validated tropical Whole Sign natal chart.",
  eligible: false,
});

export default function ChartPage() {
  return (
    <NatalChartView state={{ status: "ready", model: DEMO_NATAL_CHART }} />
  );
}
