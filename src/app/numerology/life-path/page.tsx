import { PublicReferencePage } from "@/components/public-reference-page";
import { publicMetadata } from "@/presentation/public-seo";

export const metadata = publicMetadata({
  path: "/numerology/life-path",
  title: "Life Path Number Calculation Guide",
  description:
    "Follow a versioned Pythagorean Life Path calculation with explicit date reduction and master-number handling.",
});

export default function LifePathReferencePage() {
  return (
    <PublicReferencePage
      eyebrow="Numerology reference"
      title="How a Life Path number is reduced from a birth date"
      summary="A transparent arithmetic walkthrough using the site's declared Pythagorean convention."
      currentLabel="Life Path"
      currentPath="/numerology/life-path"
      sections={[
        {
          title: "Reduce the date components",
          paragraphs: [
            "The engine accepts a strict Gregorian date in YYYY-MM-DD form. It reduces year, month, and day components, then reduces their sum. The output preserves every arithmetic operation so the result can be reconstructed.",
            "Under the default convention, 11, 22, and 33 are preserved whenever they appear at a reduction step. Other traditions may use different rules, so the strategy and version must accompany the result.",
          ],
        },
        {
          title: "Worked example: July 15, 1990",
          paragraphs: [
            "For 1990-07-15, the year digits reduce from 1 + 9 + 9 + 0 to 19 and then 10 and 1. July contributes 7. Day 15 reduces to 6. The component total is 1 + 7 + 6 = 14, which reduces to Life Path 5.",
            "This example demonstrates the arithmetic only. Meanings attached to the number are tradition-framed interpretations, not scientific measurements or outcome predictions.",
          ],
        },
        {
          title: "Privacy and calendar boundaries",
          paragraphs: [
            "A public guide does not need to collect or expose a person's birth date. Personalized calculations belong in protected account flows, and private inputs must never appear in public URLs, analytics, fixtures, or routine logs.",
          ],
        },
      ]}
      related={[
        {
          label: "Astrology calculations",
          href: "/astrology",
          description:
            "See how deterministic sky geometry stays separate from interpretation.",
        },
        {
          label: "Moon phase geometry",
          href: "/moon-phase",
          description: "Understand the positional model behind lunar phases.",
        },
        {
          label: "Numerology demo",
          href: "/numerology",
          description:
            "Inspect a no-index traced demonstration of the complete strategy.",
        },
      ]}
    />
  );
}
