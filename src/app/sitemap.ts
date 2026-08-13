import type { MetadataRoute } from "next";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import {
  INDEXABLE_PUBLIC_PATHS,
  loadPublicSiteConfiguration,
  publicUrl,
} from "@/config/public-site";
import { publicLunarRouteDates } from "@/presentation/public-lunar-date";

export const revalidate = 86_400;

export default function sitemap(): MetadataRoute.Sitemap {
  const config = loadPublicSiteConfiguration();
  if (!config.indexingEnabled) return [];
  return [
    ...INDEXABLE_PUBLIC_PATHS,
    ...ZODIAC_SIGNS.map((sign) => `/horoscope/${sign}` as const),
    ...publicLunarRouteDates(new Date()).map(
      (date) => `/moon-phase/${date}` as const,
    ),
  ].map((path) => ({
    url: publicUrl(path, config),
    changeFrequency:
      path.startsWith("/horoscope/") || /^\/moon-phase\/\d/.test(path)
        ? ("daily" as const)
        : ("monthly" as const),
  }));
}
