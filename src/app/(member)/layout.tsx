import { SiteHeader } from "@/components/SiteHeader";
import { InstallBanner } from "@/components/messaging/InstallBanner";

export default function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <SiteHeader />
      <InstallBanner />
      {children}
    </div>
  );
}
