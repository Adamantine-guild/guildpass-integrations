"use client"

import { useState, useEffect } from 'react'
import { WebhookEventLog, WebhookEventStatus, WebhookEventType } from '@/lib/api/types'
import { MockAccessApi } from '@/lib/api/mock' // Swappable depending on context instantiation
import { EmptyState } from "@/components/ui/api-states"

export default function AdminEventsPage() {
  const [events, setEvents] = useState<WebhookEventLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filtering States
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    // Replace with standard global useApi() or contextual resolution if passing session tokens
    const api = new MockAccessApi()
    
    api.listWebhookEvents()
      .then((data) => {
        setEvents(data)
        setError(null)
      })
      .catch((err) => {
        setError(err.message || "Failed to load webhook events feed.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const filteredEvents = events.filter((evt) => {
    const matchStatus = statusFilter === 'all' || evt.status === statusFilter
    const matchType = typeFilter === 'all' || evt.eventType === typeFilter
    return matchStatus && matchType
  })

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          title="Error loading log feed"
          message={error}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Ecosystem Webhook Logs</h1>
        <p className="text-sm text-muted-foreground">
          Operational telemetry stream for community subscription events, upgrades, and access switches.
        </p>
      </div>

      <hr className="border-border" />

      {/* Control Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Filter by Action</label>
          <select 
            className="border border-input rounded-md px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Actions</option>
            <option value="membership.created">membership.created</option>
            <option value="membership.renewed">membership.renewed</option>
            <option value="membership.expired">membership.expired</option>
            <option value="tier.upgraded">tier.upgraded</option>
            <option value="policy.updated">policy.updated</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Filter by Telemetry Status</label>
          <select 
            className="border border-input rounded-md px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All States</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Main Data Render Window */}
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
          Ingesting latest system events...
        </div>
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
                  <tr key={evt.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                      {new Date(evt.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-semibold font-mono text-xs text-foreground">
                      {evt.eventType}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                      {evt.affectedIdentifier}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase ${
                        evt.status === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        evt.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
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
  )
}