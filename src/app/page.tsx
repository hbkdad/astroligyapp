import { PersonalDashboard } from "@/components/personal-dashboard";
import { DEMO_DASHBOARD } from "@/presentation/dashboard-demo";

export default function HomePage() {
  return (
    <PersonalDashboard state={{ status: "ready", model: DEMO_DASHBOARD }} />
  );
}
