import { PublicReferencePage } from "@/components/public-reference-page";
import { publicMetadata } from "@/presentation/public-seo";

export const metadata = publicMetadata({
  path: "/moon-phase",
  title: "Moon Phase Geometry Guide",
  description:
    "Understand phase angle, approximate illumination, waxing and waning, and the limits of mean-cycle Moon age.",
});

export default function MoonPhaseReferencePage() {
  return (
    <PublicReferencePage
      eyebrow="Moon reference"
      title="How Moon phase geometry is calculated"
      summary="The phase label comes from the Moon's angular position relative to the Sun—not from a calendar guess."
      currentLabel="Moon phases"
      currentPath="/moon-phase"
      sections={[
        {
          title: "Phase angle sets the cycle position",
          paragraphs: [
            "The normalized phase angle is Moon longitude minus Sun longitude, wrapped into 0 through just under 360 degrees. New Moon is centred at 0 degrees, First Quarter at 90, Full Moon at 180, and Third Quarter at 270.",
            "Eight 45-degree sectors provide the familiar New, Crescent, Quarter, Gibbous, Full, Disseminating, Third Quarter, and Balsamic labels.",
          ],
        },
        {
          title: "Illumination is an explicit approximation",
          paragraphs: [
            "The geometric approximation uses (1 - cosine of the phase angle) divided by 2. It reaches zero near New Moon and one near Full Moon. It does not model atmospheric visibility, terrain, rise and set, or local horizon conditions.",
          ],
        },
        {
          title: "Moon age is not an event clock",
          paragraphs: [
            "Estimated age scales the phase angle over the published mean synodic month of 29.53059 days. That value is useful context, but refined phase events must come from provider positions and a bounded root search—not by adding a mean number of days.",
          ],
        },
      ]}
      related={[
        {
          label: "Astrology calculations",
          href: "/astrology",
          description:
            "Review zodiac, aspect, house, and provenance boundaries.",
        },
        {
          label: "Moon demo",
          href: "/moon",
          description:
            "Inspect the intentionally no-index local calculation demonstration.",
        },
        {
          label: "Daily sky reflections",
          href: "/horoscope/cancer",
          description:
            "Explore a general Cancer sign-target reading and source trace.",
        },
      ]}
    />
  );
}
