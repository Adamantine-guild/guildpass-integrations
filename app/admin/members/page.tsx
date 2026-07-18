'use client'

import { useAccount } from 'wagmi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApi, type MemberRow, type Role } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useState, useMemo, useEffect } from 'react'
import { AdminGuard } from '@/components/admin-guard'
import { useSiweAuth } from '@/lib/wallet/providers'
import { AuthError } from '@/lib/api/live'
import { LoadingState, ErrorState, EmptyState, DeniedState, safeErrorMessage } from '@/components/ui/api-states'
import { applyOptimisticRole } from '@/lib/api/optimistic'

type AssignRoleInput = {
  address: string
  role: Role
}

type AssignRoleRollback = {
  previousMembers?: MemberRow[]
}

const TIERS: Array<MemberRow['tier'] | 'all'> = ['all', 'free', 'standard', 'pro']
const ROLES: Array<Role | 'all'> = ['all', 'member', 'moderator', 'admin']

function SessionExpiredBanner() {
  const { signIn, isSigningIn } = useSiweAuth()
  return (
    <div id="session-expired-banner">
      <DeniedState
        title="Admin session expired"
        message="Your admin session has expired."
        actions={
      <Button
        id="session-reauth-btn"
        size="sm"
        variant="outline"
        onClick={signIn}
        disabled={isSigningIn}
        className="ml-4 shrink-0"
      >
        {isSigningIn ? 'Signing…' : 'Re-authenticate'}
      </Button>
        }
      />
    </div>
  )
}

export default function MembersPage() {
  const { address } = useAccount()
  const { authSession, markExpired } = useSiweAuth()
  const qc = useQueryClient()
  const [sessionExpired, setSessionExpired] = useState(false)

  const { data: members, isLoading, isError, error, refetch } = useQuery<MemberRow[]>({
    queryKey: ['members'],
    queryFn: () => getApi(address).listMembers(),
    retry: 1
  })

  const [addr, setAddr] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [pendingAssignment, setPendingAssignment] = useState<AssignRoleInput | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [rollbackMessage, setRollbackMessage] = useState('')

  // Search / filter state for the member list
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<MemberRow['tier'] | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput), 250)
    return () => clearTimeout(id)
  }, [searchInput])

  // Client-side filter over the already-fetched members — no extra network requests.
  const filteredMembers = useMemo(() => {
    if (!members) return members
    const needle = debouncedSearch.trim().toLowerCase()
    return members.filter((m) => {
      const matchesAddress = !needle || m.address.toLowerCase().includes(needle)
      const matchesTier = tierFilter === 'all' || m.tier === tierFilter
      const matchesRole = roleFilter === 'all' || m.roles.includes(roleFilter)
      return matchesAddress && matchesTier && matchesRole
    })
  }, [members, debouncedSearch, tierFilter, roleFilter])

  const {
    mutate,
    isPending,
    isError: mutateError,
    error: mutateErrorValue,
    reset: resetMutation
  } = useMutation<void, unknown, AssignRoleInput, AssignRoleRollback>({
    mutationFn: (input) =>
      getApi(address, authSession?.token).assignRole(input.address, input.role),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['members'] })
      const previousMembers = qc.getQueryData<MemberRow[]>(['members'])

      setPendingAssignment(input)
      setSuccessMessage('')
      setRollbackMessage('')
      setSessionExpired(false)

      qc.setQueryData<MemberRow[]>(['members'], (currentMembers) =>
        applyOptimisticRole(currentMembers, input.address, input.role),
      )

      return { previousMembers }
    },
    onSuccess: (_data, input) => {
      setSuccessMessage(`Role "${input.role}" saved for ${input.address}.`)
      setAddr('')
      resetMutation()
    },
    onError: (err: unknown, _input, context) => {
      qc.setQueryData(['members'], context?.previousMembers)
      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`)
      if (err instanceof AuthError) {
        setSessionExpired(true)
        markExpired()
      }
    },
    onSettled: () => {
      setPendingAssignment(null)
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Members</h1>

        {sessionExpired && <SessionExpiredBanner />}

        <Card>
          <CardHeader><CardTitle>Assign Role</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                id="assign-role-address"
                placeholder="0x…"
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
              />
              <select
                id="assign-role-select"
                className="border rounded-md h-9 px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="member">member</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
              </select>
              <Button
                id="assign-role-btn"
                onClick={() => mutate({ address: addr, role })}
                disabled={!addr || isPending}
              >
                {isPending ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
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
            {mutateError && (
              <ErrorState
                title="Failed to assign role"
                message={safeErrorMessage(mutateErrorValue)}
                onRetry={() => mutate({ address: addr, role })}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Member List</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Input
                id="member-search"
                placeholder="Search by address…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="max-w-xs"
              />
              <select
                id="member-tier-filter"
                className="border rounded-md h-9 px-2 text-sm"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as MemberRow['tier'] | 'all')}
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'all' ? 'All tiers' : t}
                  </option>
                ))}
              </select>
              <select
                id="member-role-filter"
                className="border rounded-md h-9 px-2 text-sm"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r === 'all' ? 'All roles' : r}
                  </option>
                ))}
              </select>
              {(searchInput || tierFilter !== 'all' || roleFilter !== 'all') && (
                <Button
                  id="member-clear-filters"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchInput('')
                    setDebouncedSearch('')
                    setTierFilter('all')
                    setRoleFilter('all')
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            {isLoading ? (
              <LoadingState message="Loading members…" />
            ) : isError ? (
              <ErrorState
                title="Failed to load members"
                message={safeErrorMessage(error)}
                onRetry={() => refetch()}
              />
            ) : !filteredMembers?.length ? (
              <EmptyState
                title={members?.length ? 'No matching members' : 'No members yet'}
                message={
                  members?.length
                    ? 'No members match the current search or filters.'
                    : 'No members have been added to this community.'
                }
              />
            ) : (
              <div className="space-y-2">
                {filteredMembers.map((m) => (
                  <div
                    key={m.address}
                    className="flex items-center justify-between border rounded-md p-2"
                  >
                    <div className="text-sm">{m.address}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Tier: {m.tier} • Roles: {m.roles.join(', ')}</span>
                      {pendingAssignment?.address.toLowerCase() === m.address.toLowerCase() && (
                        <Badge variant="warning">Saving</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
