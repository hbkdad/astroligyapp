import type { Metadata } from "next";

import type { PublicDailyLoadResult } from "@/application/load-public-daily-readings";
import { publicMetadata } from "@/presentation/public-seo";
import { ZODIAC_SIGNS, type ZodiacSign } from "@/domain/astro/zodiac";
import {
  isPublicHoroscopeSign,
  type PublicHoroscopeViewState,
} from "@/presentation/public-horoscope-read-model";

export function publicHoroscopeStaticParams() {
  return ZODIAC_SIGNS.map((sign) => ({ sign }));
}

export function publicHoroscopeMetadata(sign: string): Metadata {
  const label = isPublicHoroscopeSign(sign)
    ? sign.charAt(0).toUpperCase() + sign.slice(1)
    : "Public";
  return publicMetadata({
    path: `/horoscope/${sign}`,
    title: `${label} Daily Sky Reflection`,
    description: `A current UTC ${label} sign-target reading that separates validated shared-sky facts from general astrology-tradition reflections.`,
    eligible: isPublicHoroscopeSign(sign),
  });
}

export async function loadPublicHoroscopeViewState(
  sign: ZodiacSign,
  load: () => Promise<PublicDailyLoadResult>,
): Promise<PublicHoroscopeViewState> {
  const result = await load();
  if (!result.ok) {
    return {
      status:
        result.error.code === "source-unavailable" ? "unavailable" : "error",
      message: result.error.message,
    };
  }
  const model = result.value.models[ZODIAC_SIGNS.indexOf(sign)];
  if (!model || model.sign !== sign) {
    return {
      status: "error",
      message: "Public daily reading is temporarily unavailable",
    };
  }
  return { status: "ready", model };
}
