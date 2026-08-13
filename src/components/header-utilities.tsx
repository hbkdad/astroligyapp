import { AccountNavigation } from "@/components/account-navigation";

export function HeaderUtilities({ badge }: { badge: string }) {
  return (
    <div className="header-utilities">
      <span className="demo-badge">{badge}</span>
      <AccountNavigation />
    </div>
  );
}
