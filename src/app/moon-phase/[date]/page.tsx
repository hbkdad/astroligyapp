import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PublicLunarCalendarUnavailable,
  PublicLunarCalendarView,
} from "@/components/public-lunar-calendar-view";
import { publicLunarDateWindow } from "@/presentation/public-lunar-date";
import { toPublicLunarCalendarReadModel } from "@/presentation/public-lunar-calendar-read-model";
import { publicMetadata } from "@/presentation/public-seo";
import { loadPublicLunarCalendar } from "@/server/public-lunar-calendar-loader";

export const revalidate = 21_600;
type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  const window = publicLunarDateWindow(date, new Date());
  if (!window)
    return publicMetadata({
      path: "/moon-phase",
      title: "Moon Date Not Found",
      description:
        "The requested Moon calendar date is outside the published window.",
      eligible: false,
    });
  const result = await loadPublicLunarCalendar(date);
  return publicMetadata({
    path: `/moon-phase/${date}`,
    title: `Moon Phase for ${date}`,
    description: `Validated geocentric Moon phase, sign, approximate illumination, and refined lunar events for ${date} UTC.`,
    eligible: result.ok,
  });
}

export default async function PublicLunarDatePage({ params }: Props) {
  const { date } = await params;
  const window = publicLunarDateWindow(date, new Date());
  if (!window) notFound();
  const result = await loadPublicLunarCalendar(date);
  if (!result.ok) return <PublicLunarCalendarUnavailable />;
  return (
    <PublicLunarCalendarView
      model={toPublicLunarCalendarReadModel(result.value, window)}
    />
  );
}
