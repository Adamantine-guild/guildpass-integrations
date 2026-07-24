'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { getApi, type SocialLink } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { FeatureGate } from '@/components/feature-gate';
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AddressText } from '@/components/wallet/address-text';
import { Button, buttonVariants } from '@/components/ui/button';
import { features } from '@/lib/features';
import { isWalletAddress } from '@/lib/wallet/address';
import {
  UserPlus,
  UserCheck,
  UserMinus,
  Ban,
  Unlock,
  Shield,
  ShieldAlert,
  Globe,
  Lock,
  Users,
  EyeOff,
} from 'lucide-react';

function Avatar({ src, displayName }: { src?: string; displayName: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const initial = displayName.trim().charAt(0).toUpperCase() || '?';
    return (
      <div
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold text-white shadow-md"
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
      className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-indigo-500/20"
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
            className="inline-flex items-center text-xs bg-secondary/50 text-secondary-foreground px-2.5 py-1 rounded-md border border-border hover:bg-secondary transition-all"
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
  const { address: viewerAddress } = useAccount();
  const queryClient = useQueryClient();

  const isOwner = viewerAddress?.toLowerCase() === address.toLowerCase();

  // Queries
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: queryKeys.profile.byAddress(address),
    queryFn: ({ signal }) => getApi(viewerAddress).getProfile(address, signal),
    enabled: addressValid,
    retry: 1,
  });

  const {
    data: connections = [],
    isLoading: isConnectionsLoading,
    refetch: refetchConnections,
  } = useQuery({
    queryKey: queryKeys.connections.byAddress(address),
    queryFn: ({ signal }) => getApi(viewerAddress).getConnections(address, signal),
    enabled: addressValid,
  });

  const {
    data: viewerConnections = [],
  } = useQuery({
    queryKey: queryKeys.connections.byAddress(viewerAddress || ''),
    queryFn: ({ signal }) => getApi(viewerAddress).getConnections(viewerAddress!, signal),
    enabled: !!viewerAddress,
  });

  const {
    data: privacySettings,
    isLoading: isPrivacyLoading,
    refetch: refetchPrivacy,
  } = useQuery({
    queryKey: queryKeys.privacySettings.byAddress(address),
    queryFn: ({ signal }) => getApi(viewerAddress).getPrivacySettings(address, signal),
    enabled: addressValid,
  });

  // Check if viewer has blocked target or target has blocked viewer
  const viewerBlockedTarget = viewerConnections.some(
    (c) => c.status === 'blocked' && c.toAddress.toLowerCase() === address.toLowerCase()
  );
  const targetBlockedViewer = viewerConnections.some(
    (c) => c.status === 'blocked' && c.fromAddress.toLowerCase() === address.toLowerCase()
  );
  const isBlocked = viewerBlockedTarget || targetBlockedViewer;

  // Connection status between viewer and target
  const connectionRecord = viewerConnections.find(
    (c) =>
      c.status !== 'blocked' &&
      ((c.fromAddress.toLowerCase() === viewerAddress?.toLowerCase() &&
        c.toAddress.toLowerCase() === address.toLowerCase()) ||
        (c.toAddress.toLowerCase() === viewerAddress?.toLowerCase() &&
          c.fromAddress.toLowerCase() === address.toLowerCase()))
  );

  const connectionStatus = connectionRecord?.status;
  const isIncoming =
    connectionRecord?.toAddress.toLowerCase() === viewerAddress?.toLowerCase() &&
    connectionStatus === 'pending';
  const isOutgoing =
    connectionRecord?.fromAddress.toLowerCase() === viewerAddress?.toLowerCase() &&
    connectionStatus === 'pending';

  // Mutations
  const connectMutation = useMutation({
    mutationFn: () => getApi(viewerAddress).createConnectionRequest(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(address) });
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(viewerAddress!) });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => getApi(viewerAddress).acceptConnectionRequest(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(address) });
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(viewerAddress!) });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => getApi(viewerAddress).rejectConnectionRequest(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(address) });
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(viewerAddress!) });
    },
  });

  const blockMutation = useMutation({
    mutationFn: () => getApi(viewerAddress).blockMember(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(address) });
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(viewerAddress!) });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () => getApi(viewerAddress).unblockMember(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(address) });
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.byAddress(viewerAddress!) });
    },
  });

  const updatePrivacyMutation = useMutation({
    mutationFn: (setting: 'public' | 'mutual-only' | 'private') =>
      getApi(viewerAddress).updatePrivacySettings(address, {
        address,
        connectionVisibility: setting,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.privacySettings.byAddress(address) });
    },
  });

  if (!addressValid) {
    return (
      <EmptyState
        title="Invalid profile link"
        message="This URL does not contain a valid wallet address."
      />
    );
  }

  if (isProfileLoading || isConnectionsLoading || isPrivacyLoading) {
    return <LoadingState message="Loading profile and relationships…" />;
  }

  if (isProfileError) {
    return (
      <ErrorState
        title="Could not load profile"
        message={safeErrorMessage(profileError)}
        onRetry={() => {
          refetchProfile();
          refetchConnections();
          refetchPrivacy();
        }}
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
  const privacySetting = privacySettings?.connectionVisibility || 'public';

  // Determine connections viewability
  const showConnections =
    isOwner ||
    privacySetting === 'public' ||
    (privacySetting === 'mutual-only' && connectionStatus === 'accepted');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Block State Alert */}
      {isBlocked && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4 text-destructive">
            <ShieldAlert className="h-5 w-5 shrink-0 animate-pulse" />
            <div>
              <p className="font-semibold text-sm">Active Block in Effect</p>
              <p className="text-xs opacity-90">
                {viewerBlockedTarget
                  ? 'You have blocked this member. You must unblock them to see profile details and connect.'
                  : 'This member has blocked you. Profile details are hidden.'}
              </p>
            </div>
            {viewerBlockedTarget && (
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                onClick={() => unblockMutation.mutate()}
                disabled={unblockMutation.isPending}
              >
                <Unlock className="mr-1.5 h-3.5 w-3.5" />
                Unblock
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Profile Info Card */}
      {!targetBlockedViewer && (
        <Card className="overflow-hidden shadow-lg border-muted">
          <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 -mt-10 px-6">
            <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
              <Avatar src={profile.avatar} displayName={displayName} />
              <div className="space-y-1">
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  {displayName}
                  {isOwner && <Badge variant="outline">You</Badge>}
                </CardTitle>
                <AddressText address={profile.address} className="text-sm text-muted-foreground font-mono" />
              </div>
            </div>

            {/* Interaction Action Buttons */}
            {viewerAddress && !isOwner && !isBlocked && (
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {connectionStatus === 'accepted' ? (
                  <Button variant="outline" size="sm" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                    <UserMinus className="mr-1.5 h-4 w-4" />
                    Disconnect
                  </Button>
                ) : isOutgoing ? (
                  <Button variant="secondary" size="sm" disabled>
                    <UserCheck className="mr-1.5 h-4 w-4" />
                    Request Pending
                  </Button>
                ) : isIncoming ? (
                  <div className="flex gap-2">
                    <Button variant="default" size="sm" onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                      Accept
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                      Decline
                    </Button>
                  </div>
                ) : (
                  <Button variant="default" size="sm" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Connect
                  </Button>
                )}

                <Button variant="destructive" size="sm" onClick={() => blockMutation.mutate()} disabled={blockMutation.isPending}>
                  <Ban className="mr-1.5 h-4 w-4" />
                  Block
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6 pt-6 px-6">
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bio</h2>
              {profile.bio ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{profile.bio}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">This member hasn&apos;t added a bio yet.</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Badges</h2>
                {profile.badges.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.badges.map((badge) => (
                      <Badge key={badge} variant="outline" className="bg-secondary/20 hover:bg-secondary/40 text-xs py-0.5 transition-colors">
                        {badge}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No badges yet.</p>
                )}
              </div>

              <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Links</h2>
                {profile.socialLinks && profile.socialLinks.length > 0 ? (
                  <SocialLinkList links={profile.socialLinks} />
                ) : (
                  <p className="text-sm italic text-muted-foreground">No links shared yet.</p>
                )}
              </div>
            </div>

            {/* Privacy Settings Control for Owner */}
            {isOwner && (
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  Connection Privacy Settings
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Control who can see your list of connections.
                </p>
                <div className="flex gap-2">
                  {(['public', 'mutual-only', 'private'] as const).map((setting) => (
                    <Button
                      key={setting}
                      variant={privacySetting === setting ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updatePrivacyMutation.mutate(setting)}
                      disabled={updatePrivacyMutation.isPending}
                    >
                      {setting === 'public' && <Globe className="mr-1.5 h-3.5 w-3.5" />}
                      {setting === 'mutual-only' && <Users className="mr-1.5 h-3.5 w-3.5" />}
                      {setting === 'private' && <Lock className="mr-1.5 h-3.5 w-3.5" />}
                      {setting === 'public' ? 'Public' : setting === 'mutual-only' ? 'Mutual Connections Only' : 'Private'}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Social Graph Connections List Card */}
      {!targetBlockedViewer && (
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              Connections
            </CardTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {privacySetting === 'public' && (
                <>
                  <Globe className="h-3.5 w-3.5" /> Publicly visible
                </>
              )}
              {privacySetting === 'mutual-only' && (
                <>
                  <Users className="h-3.5 w-3.5" /> Mutual connections only
                </>
              )}
              {privacySetting === 'private' && (
                <>
                  <Lock className="h-3.5 w-3.5" /> Private
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {showConnections ? (
              connections.length > 0 ? (
                <div className="divide-y divide-border">
                  {connections.map((conn) => {
                    const otherAddress =
                      conn.fromAddress.toLowerCase() === address.toLowerCase()
                        ? conn.toAddress
                        : conn.fromAddress;
                    return (
                      <div key={conn.id} className="flex items-center justify-between py-3">
                        <div className="flex flex-col">
                          <Link
                            href={`/members/${otherAddress}`}
                            className="font-mono text-sm text-primary hover:underline font-medium"
                          >
                            {otherAddress}
                          </Link>
                          <span className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                            Status: {conn.status}
                          </span>
                        </div>
                        <Link
                          href={`/members/${otherAddress}`}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          View Profile
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground py-4 text-center">
                  No connections yet.
                </p>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <EyeOff className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-semibold">Connections List Hidden</p>
                <p className="text-xs max-w-sm mt-1">
                  This member&apos;s connection list is restricted by their privacy settings.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
          Back to Dashboard
        </Link>
      </div>
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
