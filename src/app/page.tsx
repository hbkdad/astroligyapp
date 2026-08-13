import { PersonalDashboard } from "@/components/personal-dashboard";
import { getDemoDashboard } from "@/presentation/dashboard-demo";
import { publicMetadata } from "@/presentation/public-seo";

export const metadata = publicMetadata({
  path: "/",
  title: "Personal Cosmic Calendar",
  description:
    "A local demonstration of deterministic astrology, lunar, and numerology presentation.",
  eligible: false,
});

export default async function HomePage() {
  return (
    <PersonalDashboard
      state={{ status: "ready", model: await getDemoDashboard() }}
    />
  );
}
