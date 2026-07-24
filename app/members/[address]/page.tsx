'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getApi, type SocialLink } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { FeatureGate } from '@/components/feature-gate';
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AddressText } from '@/components/wallet/address-text';
import { buttonVariants } from '@/components/ui/button';
import { features } from '@/lib/features';
import { isWalletAddress } from '@/lib/wallet/address';

function Avatar({ src, displayName }: { src?: string; displayName: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const initial = displayName.trim().charAt(0).toUpperCase() || '?';
    return (
      <div
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground"
      >
        {initial}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are arbitrary member-supplied values, not known at build time
    <img
      src={src}
      alt=""
      className="h-16 w-16 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function SocialLinkList({ links }: { links: SocialLink[] }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {links.map((link) => (
        <li key={link.platform}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {link.platform}
          </a>
        </li>
      ))}
    </ul>
  );
}

function MemberProfileView() {
  const { address } = useParams() as { address: string };
  const addressValid = isWalletAddress(address);

  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.profile.byAddress(address),
    queryFn: ({ signal }) => getApi().getProfile(address, signal),
    enabled: addressValid,
    retry: 1,
  });

  if (!addressValid) {
    return (
      <EmptyState
        title="Invalid profile link"
        message="This URL does not contain a valid wallet address."
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Loading profile…" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load profile"
        message={safeErrorMessage(error)}
        onRetry={() => refetch()}
      />
    );
  }

  if (!profile) {
    return (
      <EmptyState
        title="Member not found"
        message="No profile exists for this address."
      />
    );
  }

  const displayName = profile.displayName?.trim() || 'Unnamed member';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar src={profile.avatar} displayName={displayName} />
          <div className="space-y-1">
            <CardTitle>{displayName}</CardTitle>
            <AddressText address={profile.address} className="text-sm text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Bio</h2>
            {profile.bio ? (
              <p className="whitespace-pre-wrap text-sm">{profile.bio}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">This member hasn&apos;t added a bio yet.</p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Badges</h2>
            {profile.badges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.badges.map((badge) => (
                  <Badge key={badge}>{badge}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">No badges yet.</p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Links</h2>
            {profile.socialLinks && profile.socialLinks.length > 0 ? (
              <SocialLinkList links={profile.socialLinks} />
            ) : (
              <p className="text-sm italic text-muted-foreground">No links shared yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
        Back to Dashboard
      </Link>
    </div>
  );
}

export default function MemberProfilePage() {
  return (
    <FeatureGate enabled={features.profiles} name="Member Profiles">
      <MemberProfileView />
    </FeatureGate>
  );
}
