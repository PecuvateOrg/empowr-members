export default function BasketLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6" aria-busy="true">
      <div className="h-9 w-48 animate-pulse rounded bg-line" />
      <div className="mt-6 h-48 animate-pulse rounded-2xl bg-card shadow-sm" />
    </main>
  );
}
