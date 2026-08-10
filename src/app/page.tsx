import { PersonalDashboard } from "@/components/personal-dashboard";
import { getDemoDashboard } from "@/presentation/dashboard-demo";

export default async function HomePage() {
  return (
    <PersonalDashboard
      state={{ status: "ready", model: await getDemoDashboard() }}
    />
  );
}
