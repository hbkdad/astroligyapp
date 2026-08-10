import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicHoroscopeView } from "@/components/public-horoscope-view";
import { isPublicHoroscopeSign } from "@/presentation/public-horoscope-read-model";
import {
  loadPublicHoroscopeViewState,
  publicHoroscopeMetadata,
  publicHoroscopeStaticParams,
} from "@/presentation/public-horoscope-route";
import { loadCurrentPublicDailyReadings } from "@/server/public-daily-reading-loader";

type PublicHoroscopePageProps = {
  params: Promise<{ sign: string }>;
};

// Route segment values must remain literals for Next.js static analysis.
export const dynamicParams = false;
export const revalidate = 900;

export function generateStaticParams() {
  return publicHoroscopeStaticParams();
}

export async function generateMetadata({
  params,
}: PublicHoroscopePageProps): Promise<Metadata> {
  const { sign } = await params;
  return publicHoroscopeMetadata(sign);
}

export default async function PublicHoroscopePage({
  params,
}: PublicHoroscopePageProps) {
  const { sign } = await params;
  if (!isPublicHoroscopeSign(sign)) notFound();
  const state = await loadPublicHoroscopeViewState(
    sign,
    loadCurrentPublicDailyReadings,
  );
  return <PublicHoroscopeView state={state} deliveryMode="current-preview" />;
}
