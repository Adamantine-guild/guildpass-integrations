import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome to GuildPass</h1>
      <p className="text-muted-foreground">
        Membership and access control for your community. This is a minimal landing area. Use the navigation to explore the app.
      </p>
      <Link href="/dashboard" className={buttonVariants()}>Go to Dashboard</Link>
    </div>
  )
}
