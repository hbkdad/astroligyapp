import type { Metadata } from "next";

import { NatalChartView } from "@/components/natal-chart-view";
import { DEMO_NATAL_CHART } from "@/presentation/natal-chart-demo";

export const metadata: Metadata = {
  title: "My Chart",
  description:
    "An accessible visualization of a validated tropical Whole Sign natal chart.",
};

export default function ChartPage() {
  return (
    <NatalChartView state={{ status: "ready", model: DEMO_NATAL_CHART }} />
  );
}
