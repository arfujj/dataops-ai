"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/icons";
import { Button, Card, CardBody } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="loading-screen">
      <Card className="w-[min(100%-32px,460px)]">
        <CardBody>
          <div className="empty-state !p-2">
            <span className="empty-icon" style={{ color: "var(--danger)" }}><Icon name="alertTriangle" size={20} /></span>
            <p className="empty-title">Something went wrong</p>
            <p className="empty-copy">
              {error.message || "The control plane returned an unexpected error. Retry the view or return to the overview."}
            </p>
            {error.digest && <p className="mono text-[10px] text-[var(--text-faint)]">reference {error.digest}</p>}
            <div className="empty-actions">
              <Button variant="primary" icon="refresh" onClick={reset}>Try again</Button>
              <Link href="/dashboard" className="btn btn-secondary">Back to overview</Link>
            </div>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
