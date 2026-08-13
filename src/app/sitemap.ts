import type { MetadataRoute } from "next";
import { ZODIAC_SIGNS } from "@/domain/astro/zodiac";
import {
  INDEXABLE_PUBLIC_PATHS,
  loadPublicSiteConfiguration,
  publicUrl,
} from "@/config/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  const config = loadPublicSiteConfiguration();
  if (!config.indexingEnabled) return [];
  return [
    ...INDEXABLE_PUBLIC_PATHS,
    ...ZODIAC_SIGNS.map((sign) => `/horoscope/${sign}` as const),
  ].map((path) => ({
    url: publicUrl(path, config),
    changeFrequency: path.startsWith("/horoscope/")
      ? ("daily" as const)
      : ("monthly" as const),
  }));
}
