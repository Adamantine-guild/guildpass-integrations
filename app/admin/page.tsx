'use client';

import { useState, useCallback, useEffect, Fragment } from 'react';
import { useAccount } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApi, replayMockEvent } from '@/lib/api';
import { config } from '@/lib/config';
import { isApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query';
import { EmptyState, ErrorState, LoadingState, safeErrorMessage } from '@/components/ui/api-states';
import { AddressText } from '@/components/wallet/address-text';
import { AdminGuard } from '@/components/admin-guard';
import { useSiweAuth } from '@/lib/wallet/providers';
import { Button } from '@/components/ui/button';
import { Select } from "@/components/ui/select";
import type { WebhookEventLog } from '@/lib/api/types';

function SessionExpiredState() {
  const { signIn, isSigningIn } = useSiweAuth();

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
  );
}

/** Pretty-print a JSON value as a collapsible tree fragment. */
function JsonView({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground italic">null</span>
  if (typeof data === 'string') return <span className="text-green-600 dark:text-green-400">"{data}"</span>
  if (typeof data === 'number' || typeof data === 'boolean') return <span className="text-blue-600 dark:text-blue-400">{String(data)}</span>
  if (Array.isArray(data)) {
    return (
      <span>
        <span className="text-muted-foreground">[</span>
        <div className="pl-4 border-l border-border ml-1">
          {data.map((item, i) => (
            <div key={i} className="py-0.5">
              <JsonView data={item} />
              {i < data.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
        <span className="text-muted-foreground">]</span>
      </span>
    )
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    return (
      <span>
        <span className="text-muted-foreground">{'{'}</span>
        <div className="pl-4 border-l border-border ml-1">
          {entries.map(([key, val], i) => (
            <div key={key} className="py-0.5">
              <span className="text-purple-600 dark:text-purple-400 font-medium">"{key}"</span>
              <span className="text-muted-foreground">: </span>
              <JsonView data={val} />
              {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
        <span className="text-muted-foreground">{'}'}</span>
      </span>
    )
  }
  return <span>{String(data)}</span>
}

/** Expandable row showing full event payload details. */
function EventDetailRow({ event }: { event: WebhookEventLog }) {
  return (
    <div className="bg-muted/30 px-6 py-4 border-t border-border">
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Event ID
          </h4>
          <code className="text-xs font-mono text-foreground break-all">{event.id}</code>
        </div>

        {event.fullPayload ? (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Full Payload
            </h4>
            <div className="bg-card border border-border rounded-md p-3 overflow-x-auto max-h-80 overflow-y-auto">
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                <JsonView data={event.fullPayload} />
              </pre>
            </div>
          </div>
        ) : (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Payload Summary
            </h4>
            <div className="bg-card border border-border rounded-md p-3 overflow-x-auto">
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                <JsonView data={event.payloadSummary} />
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WebhookLogsContent() {
  const { address } = useAccount();
  const { authSession, markExpired, sessionStatus } = useSiweAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [streamAvailable, setStreamAvailable] = useState(true);

  const isMockMode = config.apiMode === 'mock';

  const {
    data: events = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [...queryKeys.webhookEvents.all, address, authSession?.token ?? 'anonymous'],
    queryFn: async ({ signal }) => {
      try {
        return await getApi(address, authSession?.token).listWebhookEvents(signal);
      } catch (err) {
        if (isApiError(err) && err.code === 'aborted') throw err;
        if (isApiError(err) && err.code === 'unauthorized') {
          markExpired();
        }
        throw err;
      }
    },
    enabled: !!address && sessionStatus === 'authenticated',
    refetchInterval: streamAvailable ? false : 15000,
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === 'aborted') return false;
      if (isApiError(err) && err.code === 'unauthorized') return false;
      return failureCount < 1;
    },
  });


  useEffect(() => {
    if (!address || sessionStatus !== 'authenticated') return undefined;

    setStreamAvailable(true);
    const api = getApi(address, authSession?.token);
    return api.subscribeWebhookEvents(
      (event) => {
        queryClient.setQueryData<WebhookEventLog[]>(
          [...queryKeys.webhookEvents.all, address, authSession?.token ?? 'anonymous'],
          (current = []) => [event, ...current.filter((existing) => existing.id !== event.id)],
        );
      },
      (err) => {
        if (isApiError(err) && err.code === 'unauthorized') {
          markExpired();
          return;
        }
        setStreamAvailable(false);
        void queryClient.invalidateQueries({
          queryKey: [...queryKeys.webhookEvents.all, address, authSession?.token ?? 'anonymous'],
        });
      },
    );
  }, [address, authSession?.token, markExpired, queryClient, sessionStatus]);

  const handleReplay = useCallback(async (eventId: string) => {
    setReplayingId(eventId);
    try {
      await replayMockEvent(eventId);
      // Invalidate the query so the feed refreshes and shows the replayed entry
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.webhookEvents.all, address, authSession?.token ?? 'anonymous'],
      });
    } catch {
      // Error already handled by the replay function throwing
    } finally {
      setReplayingId(null);
    }
  }, [queryClient, address, authSession?.token]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const filteredEvents = events.filter((evt) => {
    const matchStatus = statusFilter === 'all' || evt.status === statusFilter;
    const matchType = typeFilter === 'all' || evt.eventType === typeFilter;
    return matchStatus && matchType;
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Ecosystem Webhook Logs
        </h1>
        <p className="text-sm text-muted-foreground">
          Operational telemetry stream for community subscription events, upgrades, and access
          switches. {streamAvailable ? 'Live stream connected.' : 'Streaming unavailable; polling every 15 seconds.'}
        </p>
      </div>

      <hr className="border-border" />

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex flex-col gap-1">
          <label htmlFor="event-type-filter" className="text-xs font-medium text-muted-foreground">
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

      {sessionStatus === 'expired' ? (
        <SessionExpiredState />
      ) : isLoading ? (
        <LoadingState message="Ingesting latest system events..." />
      ) : isError && !(isApiError(error) && error.code === 'aborted') ? (
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
                  <th className="px-6 py-3 w-8"></th>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Event Type</th>
                  <th className="px-6 py-3">Target Address/Resource</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Payload Summary</th>
                  {isMockMode && <th className="px-6 py-3 w-24">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-transparent text-card-foreground">
                {filteredEvents.map((evt) => (
                  <Fragment key={evt.id}>
                    <tr
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(evt.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        <span className="inline-block transition-transform duration-200"
                          style={{ transform: expandedId === evt.id ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                          ▶
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                        {new Date(evt.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-semibold font-mono text-xs text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{evt.eventType}</span>
                          {evt.isReplay && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              Replay
                            </span>
                          )}
                        </div>
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
                            evt.status === 'success'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : evt.status === 'failed'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}
                        >
                          {evt.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs max-w-xs truncate font-mono">
                        {JSON.stringify(evt.payloadSummary)}
                      </td>
                      {isMockMode && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={replayingId === evt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReplay(evt.id);
                            }}
                            className="text-xs"
                          >
                            {replayingId === evt.id ? 'Replaying…' : 'Replay'}
                          </Button>
                        </td>
                      )}
                    </tr>
                    {expandedId === evt.id && (
                      <tr key={`${evt.id}-detail`}>
                        <td colSpan={isMockMode ? 7 : 6} className="p-0">
                          <EventDetailRow event={evt} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
  );
}
