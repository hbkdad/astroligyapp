import type { Metadata } from "next";

import { TimelineView } from "@/components/timeline-view";
import { getDemoTimeline } from "@/presentation/timeline-demo";
import { publicMetadata } from "@/presentation/public-seo";

export const metadata: Metadata = publicMetadata({
  path: "/timeline",
  title: "Timeline Demo",
  description:
    "An accessible local demonstration of deterministic astrology, lunar, station, and numerology event facts.",
  eligible: false,
});

export default async function TimelinePage() {
  const model = await getDemoTimeline();
  return <TimelineView state={{ status: "ready", model }} />;
}
