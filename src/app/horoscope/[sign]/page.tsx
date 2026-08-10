import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicHoroscopeView } from "@/components/public-horoscope-view";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import { getDemoPublicHoroscope } from "@/presentation/public-horoscope-demo";
import { isPublicHoroscopeSign } from "@/presentation/public-horoscope-read-model";

type PublicHoroscopePageProps = {
  params: Promise<{ sign: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return ZODIAC_SIGNS.map((sign) => ({ sign }));
}

export async function generateMetadata({
  params,
}: PublicHoroscopePageProps): Promise<Metadata> {
  const { sign } = await params;
  const label = isPublicHoroscopeSign(sign)
    ? sign.charAt(0).toUpperCase() + sign.slice(1)
    : "Public";
  return {
    title: `${label} Daily Sky Reflection`,
    description:
      "A no-index local demo separating shared-sky facts from general astrology-tradition reflections.",
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PublicHoroscopePage({
  params,
}: PublicHoroscopePageProps) {
  const { sign } = await params;
  if (!isPublicHoroscopeSign(sign)) notFound();
  const model = await getDemoPublicHoroscope(sign);
  return <PublicHoroscopeView state={{ status: "ready", model }} />;
}
