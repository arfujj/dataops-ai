import Link from "next/link";

export default function NotFound() {
  return (
    <main className="loading-screen">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="mono text-[52px] font-semibold leading-none tracking-[-0.05em] text-[var(--text-faint)]">404</span>
        <p className="text-md font-semibold text-[var(--text)]">This surface does not exist</p>
        <p className="max-w-[380px] text-sm leading-6 text-[var(--text-muted)]">
          The page may have moved, or the resource was removed from this workspace.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/dashboard" className="btn btn-primary">Back to overview</Link>
          <Link href="/incidents" className="btn btn-secondary">Incident queue</Link>
        </div>
      </div>
    </main>
  );
}
