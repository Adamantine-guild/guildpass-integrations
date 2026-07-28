'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { VersionCompatibility } from '@/lib/api'

interface BackendVersionMismatchProps {
  /** The compatibility check result. Only rendered when `compatible === false`. */
  compatibility: VersionCompatibility & { compatible: false }
  /** Called when the user clicks the "Reload" button. */
  onReload?: () => void
}

/**
 * Full-page warning displayed when the frontend's expected API contract
 * version does not match the backend's advertised version.
 *
 * This prevents the app from silently proceeding with an incompatible
 * backend, which would produce confusing downstream errors.
 */
export function BackendVersionMismatch({
  compatibility,
  onReload,
}: BackendVersionMismatchProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-lg border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                  Backend Version Mismatch
                </h2>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  The frontend was built against a different API contract
                  version than the backend is currently running.
                </p>
              </div>

              <div className="rounded-md border border-amber-200 bg-white/50 p-3 dark:border-amber-700 dark:bg-white/5">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-amber-600 dark:text-amber-400">
                      Frontend expects
                    </dt>
                    <dd className="font-mono font-medium text-amber-900 dark:text-amber-100">
                      v{compatibility.expectedVersion}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-amber-600 dark:text-amber-400">
                      Backend reports
                    </dt>
                    <dd className="font-mono font-medium text-amber-900 dark:text-amber-100">
                      {compatibility.backendVersion
                        ? `v${compatibility.backendVersion}`
                        : 'unknown'}
                    </dd>
                  </div>
                </dl>
              </div>

              <p className="text-sm text-amber-700 dark:text-amber-300">
                {compatibility.reason}
              </p>

              <p className="text-sm text-amber-600 dark:text-amber-400">
                The compatibility policy requires the major version to match
                (e.g., frontend v1.x and backend v1.y are compatible). Minor
                and patch differences are tolerated.
              </p>

              <div className="flex gap-3 pt-2">
                {onReload && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
                    onClick={onReload}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                )}
                <a
                  href="https://github.com/Adamantine-Guild/guildpass-integrations/blob/main/docs/deployment.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
                >
                  View Deployment Guide
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
