import type { Metadata } from "next";

import { TimelineView } from "@/components/timeline-view";
import { getDemoTimeline } from "@/presentation/timeline-demo";

export const metadata: Metadata = {
  title: "My Timeline",
  description:
    "An accessible timeline of deterministic astrology, lunar, station, and numerology event facts.",
};

export default async function TimelinePage() {
  const model = await getDemoTimeline();
  return <TimelineView state={{ status: "ready", model }} />;
}
