import type { Metadata } from "next";

import { loadPublicSiteConfiguration, publicUrl } from "@/config/public-site";

export function publicMetadata({
  path,
  title,
  description,
  eligible = true,
}: {
  path: string;
  title: string;
  description: string;
  eligible?: boolean;
}): Metadata {
  const config = loadPublicSiteConfiguration();
  const index = config.indexingEnabled && eligible;
  const canonical = publicUrl(path, config);
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index, follow: index, noarchive: !index },
    openGraph: {
      type: "website",
      locale: "en_CA",
      siteName: "Personal Cosmic Calendar",
      title,
      description,
      url: canonical,
    },
  };
}

export function breadcrumbJsonLd(
  items: readonly Readonly<{ label: string; path: string }>[],
) {
  const config = loadPublicSiteConfiguration();
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: publicUrl(item.path, config),
    })),
  }).replace(/</g, "\\u003c");
}
