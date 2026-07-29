import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

export default function UpgradePage({
  params,
  searchParams,
}: {
  params: { communitySlug: string }
  searchParams: { resourceId?: string }
}) {
  const communitySlug = params.communitySlug
  const resourceId = searchParams?.resourceId

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Upgrade or Renew Membership</h1>
        <p className="text-muted-foreground mt-1">
          Access to community resources can depend on three things: whether your
          membership is active, your membership tier, and any roles assigned to
          your account.
        </p>
      </div>

      {resourceId && (
        <p className="text-sm text-muted-foreground">
          You were trying to access: <span className="font-medium">{resourceId}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What you can do</CardTitle>
          <CardDescription>General next steps for regaining access</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
            <li>Renew an expired or inactive membership through your community admin.</li>
            <li>Upgrade your membership tier to unlock higher-tier resources.</li>
            <li>Ask a community admin to grant a required role (e.g., moderator) if a resource needs one.</li>
          </ul>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100 p-4 text-sm">
        Purchasing or renewing a membership is not yet available in this demo.
        This page is a placeholder for the upcoming upgrade and renewal flow.
      </div>

      <Link href={`/${communitySlug}/dashboard`} className={buttonVariants()}>
        Back to Dashboard
      </Link>
    </div>
  )
}
