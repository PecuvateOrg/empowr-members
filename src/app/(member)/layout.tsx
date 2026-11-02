import { SiteHeader } from "@/components/SiteHeader";
import { InstallPrompt } from "@/components/messaging/InstallPrompt";

export default function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <SiteHeader />
      <InstallPrompt />
      {children}
    </div>
  );
}
