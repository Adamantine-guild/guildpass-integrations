'use client'

import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi, WebhookEvent, Paginated } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminGuard } from '@/components/admin-guard'
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const EVENT_TYPES = [
  'member.joined',
  'member.left',
  'subscription.updated',
  'subscription.canceled',
  'role.assigned',
  'role.revoked'
]

export default function AdminEventsPage() {
  const { address } = useAccount()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [types, setTypes] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  useEffect(() => {
    const t = searchParams.getAll('types')
    setTypes(t)
    setStartDate(searchParams.get('startDate') || '')
    setEndDate(searchParams.get('endDate') || '')
    setPage(parseInt(searchParams.get('page') || '1', 10))
  }, [searchParams])

  const updateFilters = (newTypes: string[], newStart: string, newEnd: string, newPage: number) => {
    const params = new URLSearchParams()
    newTypes.forEach(t => params.append('types', t))
    if (newStart) params.append('startDate', newStart)
    if (newEnd) params.append('endDate', newEnd)
    params.append('page', newPage.toString())
    
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleTypeToggle = (type: string) => {
    const newTypes = types.includes(type) ? types.filter(t => t !== type) : [...types, type]
    updateFilters(newTypes, startDate, endDate, 1)
  }

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters(types, e.target.value, endDate, 1)
  }

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters(types, startDate, e.target.value, 1)
  }

  const handlePageChange = (newPage: number) => {
    updateFilters(types, startDate, endDate, newPage)
  }

  const { data, isLoading, isError, error, refetch } = useQuery<Paginated<WebhookEvent>>({
    queryKey: ['adminEvents', address, types, startDate, endDate, page],
    queryFn: () => getApi(address).listAdminEvents({
      types: types.length > 0 ? types : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page,
      limit
    }),
    retry: 1
  })

  const events = data?.data || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit)

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Webhook Events</h1>
        
        <Card>
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">Start Date</label>
                <Input type="date" value={startDate} onChange={handleStartDateChange} className="w-[160px]" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">End Date</label>
                <Input type="date" value={endDate} onChange={handleEndDateChange} className="w-[160px]" />
              </div>
              <div className="space-y-1 flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-muted-foreground">Event Types</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {EVENT_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => handleTypeToggle(t)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${types.includes(t) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-accent'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Event Feed</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingState message="Loading events..." />
            ) : isError ? (
              <ErrorState title="Failed to load events" message={safeErrorMessage(error)} onRetry={() => refetch()} />
            ) : events.length === 0 ? (
              <EmptyState message="No events found matching your filters." />
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  {events.map(event => (
                    <div key={event.id} className="flex flex-col sm:flex-row justify-between border rounded-md p-3 gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{event.type}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${event.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success/10 text-success border-success/20'}`}>
                            {event.status || 'unknown'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ID: {event.id}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono bg-accent/50 p-1.5 rounded truncate max-w-full">
                          {JSON.stringify(event.payload)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {events.length} of {total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>
                      Previous
                    </Button>
                    <span className="text-sm px-2">Page {page} of {totalPages || 1}</span>
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
