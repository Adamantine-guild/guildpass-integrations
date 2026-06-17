'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AdminGuard } from '@/components/admin-guard'

export default function AdminHome() {
  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview and quick links.</p>
        <div className="flex items-center gap-2">
          <Link href="/admin/members" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:opacity-90 h-9 px-3 py-2">
            Members
          </Link>
          <Link href="/admin/policies" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 py-2">
            Access Policies
          </Link>
          <Link href="/admin/settings" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 py-2">
            Settings
          </Link>
        </div>
        <div className="rounded-md border p-4">
          <div className="text-sm text-muted-foreground">Community overview placeholder with metrics.</div>
        </div>
      </div>
    </AdminGuard>
  )
}
