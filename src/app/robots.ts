import type { MetadataRoute } from "next";
import { loadPublicSiteConfiguration, publicUrl } from "@/config/public-site";

export default function robots(): MetadataRoute.Robots {
  const config = loadPublicSiteConfiguration();
  if (!config.indexingEnabled)
    return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: publicUrl("/sitemap.xml", config),
    host: config.origin,
  };
}
