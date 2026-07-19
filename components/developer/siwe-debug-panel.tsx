'use client'

import { useState, useSyncExternalStore } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  getSiweDebugSnapshot,
  subscribeSiweDebug,
  type SiweDebugEntry,
} from '@/lib/api/siwe-debug'

/** Server snapshot: nothing is captured during SSR, so the panel starts empty. */
function getServerSnapshot(): SiweDebugEntry | null {
  return null
}

/** Live-subscribe to the dev-only SIWE debug store. */
function useSiweDebug(): SiweDebugEntry | null {
  return useSyncExternalStore(
    subscribeSiweDebug,
    getSiweDebugSnapshot,
    getServerSnapshot,
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="break-all font-mono text-sm">{value}</div>
    </div>
  )
}

export function SiweDebugPanel() {
  const entry = useSiweDebug()
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!entry) return
    try {
      await navigator.clipboard.writeText(entry.message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable (e.g. insecure origin). Fail quietly —
      // this is a dev tool and the raw message is still visible on screen.
      setCopied(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="grid gap-1">
            <CardTitle>SIWE Debug</CardTitle>
            <CardDescription>
              Last constructed sign-in message, nonce, token, and expiry
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="grid gap-4">
          {entry === null ? (
            <p className="text-sm text-muted-foreground">
              No sign-in captured yet. Trigger a SIWE sign-in to populate this
              panel.
            </p>
          ) : (
            <>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Raw message
                  </div>
                  <Button variant="outline" onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy message'}
                  </Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted p-3 font-mono text-sm">
                  {entry.message}
                </pre>
              </div>

              <Field label="Nonce" value={entry.nonce} />
              <Field label="Token" value={entry.token} />
              <Field label="Expires at" value={entry.expiresAt} />
              <Field label="Captured at" value={entry.capturedAt} />
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}