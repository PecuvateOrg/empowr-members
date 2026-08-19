import { PublicHeader } from "@/components/PublicHeader";

export default function SessionsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <PublicHeader />
      {children}
    </div>
  );
}
