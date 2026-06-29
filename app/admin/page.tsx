"use client";

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { isApiError } from '@/lib/api/errors'
import { queryKeys } from '@/lib/query'
import { EmptyState, ErrorState, LoadingState, safeErrorMessage } from "@/components/ui/api-states"
import { AddressText } from '@/components/wallet/address-text'
import { AdminGuard } from '@/components/admin-guard'
import { useSiweAuth } from '@/lib/wallet/providers'
import { Button } from '@/components/ui/button'

function SessionExpiredState() {
  const { signIn, isSigningIn } = useSiweAuth()

  return (
    <EmptyState
      title="Admin session expired"
      message="Your admin session has expired. Re-authenticate with your wallet to load webhook logs again."
      actions={
        <Button
          id="webhook-events-reauth-btn"
          size="sm"
          variant="outline"
          onClick={signIn}
          disabled={isSigningIn}
        >
          {isSigningIn ? 'Signing…' : 'Re-authenticate'}
        </Button>
      }
    />
  )
}

function WebhookLogsContent() {
  const { address } = useAccount()
  const { authSession, markExpired, sessionStatus } = useSiweAuth()
  const [sessionExpired, setSessionExpired] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const {
    data: events = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [...queryKeys.webhookEvents.all, address, authSession?.token ?? 'anonymous'],
    queryFn: async () => {
      try {
        return await getApi(address, authSession?.token).listWebhookEvents()
      } catch (err) {
        if (isApiError(err) && err.code === 'unauthorized') {
          setSessionExpired(true)
          markExpired()
        }
        throw err
      }
    },
    enabled: !!address && sessionStatus === 'authenticated',
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === 'unauthorized') return false
      return failureCount < 1
    },
  });

  const filteredEvents = events.filter((evt) => {
    const matchStatus = statusFilter === "all" || evt.status === statusFilter;
    const matchType = typeFilter === "all" || evt.eventType === typeFilter;
    return matchStatus && matchType;
  });

  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="Error loading log feed" message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Ecosystem Webhook Logs
        </h1>
        <p className="text-sm text-muted-foreground">
          Operational telemetry stream for community subscription events,
          upgrades, and access switches.
        </p>
      </div>

      <hr className="border-border" />

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="event-type-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Filter by Action
          </label>
          <Select
            id="event-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Actions</option>
            <option value="membership.created">membership.created</option>
            <option value="membership.renewed">membership.renewed</option>
            <option value="membership.expired">membership.expired</option>
            <option value="tier.upgraded">tier.upgraded</option>
            <option value="policy.updated">policy.updated</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="event-status-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Filter by Telemetry Status
          </label>
          <Select
            id="event-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All States</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </Select>
        </div>
      </div>

      {sessionExpired ? (
        <SessionExpiredState />
      ) : isLoading ? (
        <LoadingState message="Ingesting latest system events..." />
      ) : isError ? (
        <ErrorState
          title="Error loading log feed"
          message={safeErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          title="No event records found"
          message="No recent logs match the active event filters or system records are blank."
        />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold tracking-wider">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Event Type</th>
                  <th className="px-6 py-3">Target Address/Resource</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Payload Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent text-card-foreground">
                {filteredEvents.map((evt) => (
                  <tr
                    key={evt.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                      {new Date(evt.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-semibold font-mono text-xs text-foreground">
                      {evt.eventType}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                      <AddressText
                        address={evt.affectedIdentifier}
                        label="Target address or resource"
                        announceInvalid={false}
                        className="text-muted-foreground"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase ${
                          evt.status === "success"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : evt.status === "failed"
                              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs max-w-xs truncate font-mono">
                      {JSON.stringify(evt.payloadSummary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminEventsPage() {
  return (
    <AdminGuard>
      <WebhookLogsContent />
    </AdminGuard>
  )
}
