'use client';

import { useEffect } from 'react';

/**
 * Admin-route error boundary (Next.js App Router convention).
 *
 * Catches rendering errors thrown by any component within the admin
 * segment (members, policies, settings, analytics) and displays a
 * scoped, on-brand fallback instead of a blank crash page.
 *
 * The boundary lives *inside* the admin layout, so the site nav and
 * root providers remain functional when a widget crashes.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Preserve full error visibility in development console/logs.
    console.error('[Admin route error]', error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-6 space-y-3"
    >
      <div>
        <h2 className="text-sm font-medium text-destructive">
          Admin section unavailable
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An unexpected error occurred while rendering this admin section.
          You can try reloading it — if the problem persists, please contact
          support.
        </p>
      </div>

      <button
        onClick={reset}
        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Reload this section
      </button>
    </div>
  );
}
