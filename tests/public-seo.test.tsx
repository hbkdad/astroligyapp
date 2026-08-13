import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PublicReferencePage } from "@/components/public-reference-page";
import { loadPublicSiteConfiguration, publicUrl } from "@/config/public-site";
import { publicMetadata } from "@/presentation/public-seo";

afterEach(() => vi.unstubAllEnvs());

describe.sequential("public SEO boundary", () => {
  it("defaults to a complete crawl deny and empty sitemap", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(sitemap()).toEqual([]);
    expect(
      publicMetadata({ path: "/astrology", title: "A", description: "B" }),
    ).toMatchObject({
      alternates: { canonical: "http://localhost:3000/astrology" },
      robots: { index: false, follow: false, noarchive: true },
    });
  });

  it("requires an explicit HTTPS origin before indexing", () => {
    expect(() =>
      loadPublicSiteConfiguration({
        PUBLIC_SITE_INDEXING_ENABLED: "true",
        PUBLIC_SITE_ORIGIN: "http://example.test",
      }),
    ).toThrow();
    expect(() =>
      publicUrl("/account/private/value", loadPublicSiteConfiguration({})),
    ).not.toThrow();
    expect(() =>
      publicUrl("/unsafe?private=value", loadPublicSiteConfiguration({})),
    ).toThrow();
  });

  it("aligns enabled robots, sitemap, and canonical metadata", () => {
    vi.stubEnv("PUBLIC_SITE_INDEXING_ENABLED", "true");
    vi.stubEnv("PUBLIC_SITE_ORIGIN", "https://cosmic.example.test");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://cosmic.example.test/sitemap.xml",
      host: "https://cosmic.example.test",
    });
    const urls = sitemap().map(({ url }) => url);
    expect(urls).toHaveLength(15);
    expect(urls).toContain("https://cosmic.example.test/astrology");
    expect(urls).toContain("https://cosmic.example.test/horoscope/pisces");
    expect(urls.some((url) => /account|match|chart|timeline/.test(url))).toBe(
      false,
    );
    expect(
      publicMetadata({
        path: "/moon-phase",
        title: "Moon",
        description: "Guide",
      }).robots,
    ).toMatchObject({ index: true, follow: true });
  });

  it("renders visible breadcrumbs that agree with sanitized JSON-LD", () => {
    const html = renderToStaticMarkup(
      <PublicReferencePage
        eyebrow="Reference"
        title="Unique guide"
        summary="Useful summary"
        currentLabel="Astrology"
        currentPath="/astrology"
        sections={[{ title: "Geometry", paragraphs: ["Visible explanation"] }]}
        related={[
          { label: "Moon", href: "/moon-phase", description: "Moon guide" },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain("Visible explanation");
    expect(html).not.toMatch(/birthProfileId|calculationRunId|ownerId/);
  });
});
