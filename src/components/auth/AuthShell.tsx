import Image from "next/image";
import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-cream px-4 py-12 sm:px-6">
      <Link href="/">
        <Image
          src="/logo.png"
          alt="Empowr CIC"
          width={140}
          height={140}
          priority
          className="h-auto w-[72px]"
        />
      </Link>
      <div className="mt-6 w-full max-w-md rounded-2xl bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight text-black">
          {title}
        </h1>
        <p className="mt-1 text-mid">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-5 text-sm font-semibold text-mid">{footer}</p>
    </main>
  );
}
