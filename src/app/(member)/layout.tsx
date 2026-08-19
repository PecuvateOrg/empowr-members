import { MemberHeader } from "@/components/MemberHeader";

export default function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <MemberHeader />
      {children}
    </div>
  );
}
