'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/**
 * Resource-route error boundary (Next.js App Router convention).
 *
 * Catches rendering errors thrown by any component within this resource
 * segment. It does NOT handle recoverable data-fetch failures — those are
 * caught by React Query and rendered inline via ErrorState/refetch in
 * page.tsx and components/gated.tsx. This boundary is a last-resort net for
 * unexpected render-time exceptions.
 */
export default function ResourceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    console.error('[Resource route error]', error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-6 space-y-3"
    >
      <div>
        <h2 className="text-sm font-medium text-destructive">
          This resource couldn&apos;t be displayed
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Something went wrong while rendering this page. You can try again,
          or go back and pick a different resource.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (isResetting) return;
            setIsResetting(true);
            reset();
          }}
          disabled={isResetting}
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {isResetting ? 'Retrying…' : 'Try again'}
        </button>
        <Link href={`/${communitySlug}/dashboard`} className={buttonVariants({ variant: 'outline' })}>
          Back to Dashboard
        </Link>
      </div>

      {process.env.NODE_ENV !== 'production' && (
        <details className="pt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Error details (development only)</summary>
          <p className="mt-1 whitespace-pre-wrap">{error.message}</p>
          {error.digest && <p className="mt-1">Digest: {error.digest}</p>}
        </details>
      )}
    </div>
  );
}
