import { SiteHeader } from "@/components/SiteHeader";

export default function ContactLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <SiteHeader />
      {children}
    </div>
  );
}
