'use client';
import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { getApi, type MemberProfile, type SocialLink } from '@/lib/api';
import { AuthError } from '@/lib/api/live';
import { isApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query';
import { applyOptimisticProfile } from '@/lib/api/optimistic';
import { validateProfile, type ProfileValidationErrors } from '@/lib/validation/profile';
import {
  clearProfileDraft,
  loadProfileDraft,
  storeProfileDraft,
} from '@/lib/profile-drafts';
import { useSiweAuth } from '@/lib/wallet/providers';
import { features } from '@/lib/features';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState, ErrorState, safeErrorMessage } from '@/components/ui/api-states';

function SignInToEditButton() {
  const { signIn, isSigningIn } = useSiweAuth();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={signIn}
      disabled={isSigningIn}
      aria-busy={isSigningIn}
    >
      {isSigningIn ? 'Signing…' : 'Sign In to Edit Profile'}
    </Button>
  );
}

function SocialLinksEditor({
  links,
  onChange,
  disabled,
  groupLabelId,
}: {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  disabled: boolean;
  groupLabelId: string;
}) {
  const updateLink = (index: number, patch: Partial<SocialLink>) => {
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  };
  const removeLink = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  return (
    <div role="group" aria-labelledby={groupLabelId} className="space-y-2">
      {links.map((link, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={link.platform}
            onChange={(e) => updateLink(index, { platform: e.target.value })}
            placeholder="Platform (e.g. twitter)"
            disabled={disabled}
            aria-label={`Social link ${index + 1} platform`}
            className="sm:w-1/3"
          />
          <Input
            value={link.url}
            onChange={(e) => updateLink(index, { url: e.target.value })}
            placeholder="https://…"
            disabled={disabled}
            aria-label={`Social link ${index + 1} URL`}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => removeLink(index)}
            disabled={disabled}
            aria-label={`Remove social link ${index + 1}`}
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...links, { platform: '', url: '' }])}
        disabled={disabled}
      >
        + Add link
      </Button>
    </div>
  );
}

export function ProfileForm({
  address,
  initial,
  onSave,
  onCancel,
  disabled,
  errors,
}: {
  address: string;
  initial: MemberProfile | null;
  onSave: (profile: MemberProfile) => void;
  onCancel: () => void;
  disabled: boolean;
  errors: ProfileValidationErrors;
}) {
  const formId = useId();
  const draft = loadProfileDraft(address);
  const [displayName, setDisplayName] = useState(draft?.displayName ?? initial?.displayName ?? '');
  const [bio, setBio] = useState(draft?.bio ?? initial?.bio ?? '');
  const [avatar, setAvatar] = useState(draft?.avatar ?? initial?.avatar ?? '');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(
    draft?.socialLinks ?? initial?.socialLinks ?? [],
  );

  useEffect(() => {
    storeProfileDraft(address, { displayName, bio, avatar, socialLinks });
  }, [address, displayName, bio, avatar, socialLinks]);

  const displayNameId = `${formId}-display-name`;
  const bioId = `${formId}-bio`;
  const avatarId = `${formId}-avatar`;
  const socialLinksLabelId = `${formId}-social-links`;

  const handleSubmit = () => {
    onSave({
      address,
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      avatar: avatar.trim() || undefined,
      socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
      // badges are system-assigned; carried through only for the type, never
      // actually applied server-side (mock/live both preserve the existing value).
      badges: initial?.badges ?? [],
    });
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <label htmlFor={displayNameId} className="mb-1 block text-xs font-medium text-muted-foreground">
          Display Name
        </label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={disabled}
          maxLength={200}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={errors.displayName ? `${displayNameId}-error` : undefined}
        />
        {errors.displayName && (
          <p id={`${displayNameId}-error`} className="mt-1 text-xs text-destructive" role="alert">
            {errors.displayName}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={bioId} className="mb-1 block text-xs font-medium text-muted-foreground">
          Bio
        </label>
        <textarea
          id={bioId}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          disabled={disabled}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          aria-invalid={errors.bio ? true : undefined}
          aria-describedby={errors.bio ? `${bioId}-error` : undefined}
        />
        {errors.bio && (
          <p id={`${bioId}-error`} className="mt-1 text-xs text-destructive" role="alert">
            {errors.bio}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={avatarId} className="mb-1 block text-xs font-medium text-muted-foreground">
          Avatar URL
        </label>
        <Input
          id={avatarId}
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          disabled={disabled}
          placeholder="https://…"
          aria-invalid={errors.avatar ? true : undefined}
          aria-describedby={errors.avatar ? `${avatarId}-error` : undefined}
        />
        {errors.avatar && (
          <p id={`${avatarId}-error`} className="mt-1 text-xs text-destructive" role="alert">
            {errors.avatar}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          className="mt-2"
          title="Avatar upload is not available yet — paste an image URL above instead."
        >
          Upload image (coming soon)
        </Button>
      </div>

      <div>
        <div id={socialLinksLabelId} className="mb-1 text-xs font-medium text-muted-foreground">
          Social Links
        </div>
        <SocialLinksEditor
          links={socialLinks}
          onChange={setSocialLinks}
          disabled={disabled}
          groupLabelId={socialLinksLabelId}
        />
        {errors.socialLinks && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {errors.socialLinks}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSubmit} disabled={disabled}>
          Save Profile
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            clearProfileDraft(address);
            onCancel();
          }}
          disabled={disabled}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ProfileEditor({ address }: { address: string }) {
  const { authSession, sessionStatus, markExpired } = useSiweAuth();
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [errors, setErrors] = useState<ProfileValidationErrors>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [rollbackMessage, setRollbackMessage] = useState('');

  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<MemberProfile | null>({
    queryKey: queryKeys.profile.byAddress(address),
    queryFn: ({ signal }) => getApi(address).getProfile(address, signal),
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === 'aborted') return false;
      return failureCount < 1;
    },
  });

  const { mutate, isPending } = useMutation<
    void,
    unknown,
    MemberProfile,
    { previous: MemberProfile | null | undefined }
  >({
    mutationFn: (next) => getApi(address, authSession?.token).updateProfile(next),

    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: queryKeys.profile.byAddress(address) });
      const previous = qc.getQueryData<MemberProfile | null>(queryKeys.profile.byAddress(address));

      setSuccessMessage('');
      setRollbackMessage('');

      qc.setQueryData<MemberProfile | null>(queryKeys.profile.byAddress(address), (current) =>
        applyOptimisticProfile(current, next),
      );

      return { previous };
    },

    onSuccess: () => {
      setSuccessMessage('Profile saved.');
      setErrors({});
      clearProfileDraft(address);
      setIsEditing(false);
    },

    onError: (err, _next, context) => {
      qc.setQueryData(queryKeys.profile.byAddress(address), context?.previous);
      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`);
      if (err instanceof AuthError) markExpired();
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile.byAddress(address) });
    },
  });

  const handleSave = (next: MemberProfile) => {
    const result = validateProfile(next);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    mutate(result.value);
  };

  if (isLoading) return <LoadingState />;

  if (isError) {
    return (
      <ErrorState
        title="Failed to load profile"
        message={safeErrorMessage(error)}
        onRetry={() => refetch()}
      />
    );
  }

  const displayName = profile?.displayName?.trim() || 'Unnamed member';

  return (
    <div className="space-y-3">
      {isEditing ? (
        <ProfileForm
          address={address}
          initial={profile ?? null}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
          disabled={isPending}
          errors={errors}
        />
      ) : (
        <>
          <div className="space-y-1">
            <div className="text-sm font-medium">{displayName}</div>
            <p className="text-sm text-muted-foreground">
              {profile?.bio || <span className="italic">No bio yet.</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sessionStatus === 'authenticated' ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                Edit Profile
              </Button>
            ) : (
              <SignInToEditButton />
            )}
            {features.profiles && (
              <Link
                href={`/members/${address}`}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                View public profile →
              </Link>
            )}
          </div>
        </>
      )}

      {successMessage && (
        <div className="text-sm text-green-700 dark:text-green-400" role="status">
          {successMessage}
        </div>
      )}
      {rollbackMessage && (
        <div className="text-sm text-destructive" role="alert">
          {rollbackMessage}
        </div>
      )}
    </div>
  );
}
