'use client'

import { useAccount } from 'wagmi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApi, type MemberRow, type Role } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { AdminGuard } from '@/components/admin-guard'
import { useSiweAuth } from '@/lib/wallet/providers'
import { AuthError } from '@/lib/api/live'
import { queryKeys } from '@/lib/query'
import { LoadingState, ErrorState, EmptyState, DeniedState, safeErrorMessage } from '@/components/ui/api-states'
import { applyOptimisticRole, applyOptimisticRemoveRole } from '@/lib/api/optimistic'
import { AddressText } from '@/components/wallet/address-text'
import { BulkActionToolbar, BulkResultItem } from '@/components/ui/bulk-action-toolbar'
import { runWithConcurrency } from '@/lib/api/batch-runner'
import { isCircuitOpen } from '@/lib/api/live'

type AssignRoleInput = {
  address: string
  role: Role
}

type AssignRoleRollback = {
  previousMembers?: MemberRow[]
}

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
    queryKey: queryKeys.members.all,
    queryFn: () => getApi(address).listMembers(),
    retry: 1
  })

  const [addr, setAddr] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [pendingAssignment, setPendingAssignment] = useState<AssignRoleInput | null>(null)
  const [successAssignment, setSuccessAssignment] = useState<AssignRoleInput | null>(null)
  const [rollbackMessage, setRollbackMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResultItem[] | null>(null)

  const toggleSelection = (address: string) => {
    setSelectedAddresses(prev => 
      prev.includes(address) ? prev.filter(a => a !== address) : [...prev, address]
    )
  }

  const toggleAll = () => {
    if (members && selectedAddresses.length === members.length) {
      setSelectedAddresses([])
    } else if (members) {
      setSelectedAddresses(members.map(m => m.address))
    }
  }

  const executeBulkAssign = async (targetRole: Role, addressesToProcess: string[]) => {
    if (!addressesToProcess.length || bulkProcessing) return
    setBulkProcessing(true)

    // Using a concurrency limit of 5 for bulk operations
    const CONCURRENCY_LIMIT = 5;
    
    // Normalize path to match circuit breaker: /v1/members/:address/roles
    const checkCircuit = () => isCircuitOpen('/v1/members/:address/roles');

    const results = await runWithConcurrency(
      addressesToProcess,
      CONCURRENCY_LIMIT,
      async (address) => {
        const api = getApi(address, authSession?.token)
        await api.assignRole(address, targetRole)
      },
      checkCircuit
    )

    const finalResults = results.map((r, i) => ({
      address: addressesToProcess[i],
      status: r.status,
      error: r.status === 'rejected' ? r.reason : undefined
    }));

    setBulkResults(finalResults)
    setBulkProcessing(false)
    qc.invalidateQueries({ queryKey: queryKeys.members.all })
  }

  const handleRetryFailed = async () => {
    if (!bulkResults) return;
    const failedAddresses = bulkResults
      .filter(r => r.status !== 'fulfilled')
      .map(r => r.address);
    // Use the role from the previous selection
    // In a real app we might store what role we were trying to assign
    // For now, we fall back to selectedRole or just 'member'
    await executeBulkAssign(role, failedAddresses);
  }

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
      await qc.cancelQueries({ queryKey: queryKeys.members.all })
      const previousMembers = qc.getQueryData<MemberRow[]>(queryKeys.members.all)

      setPendingAssignment(input)
      setSuccessAssignment(null)
      setRollbackMessage('')
      setSessionExpired(false)

      qc.setQueryData<MemberRow[]>(queryKeys.members.all, (currentMembers) =>
        applyOptimisticRole(currentMembers, input.address, input.role),
      )

      return { previousMembers }
    },
    onSuccess: (_data, input) => {
      setSuccessAssignment(input)
      setAddr('')
      resetMutation()
    },
    onError: (err: unknown, _input, context) => {
      qc.setQueryData(queryKeys.members.all, context?.previousMembers)
      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`)
      if (err instanceof AuthError) {
        setSessionExpired(true)
        markExpired()
      }
    },
    onSettled: () => {
      setPendingAssignment(null)
      qc.invalidateQueries({ queryKey: queryKeys.members.all })
    },
  })

  const removeRoleMutation = useMutation<
    void,
    unknown,
    AssignRoleInput,
    AssignRoleRollback
  >({
    mutationFn: (input) =>
      getApi(address, authSession?.token).removeRole(input.address, input.role),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: queryKeys.members.all })
      const previousMembers = qc.getQueryData<MemberRow[]>(queryKeys.members.all)
      setPendingAssignment(input)
      setSuccessMessage('')
      setRollbackMessage('')
      setSessionExpired(false)
      qc.setQueryData<MemberRow[]>(queryKeys.members.all, (currentMembers) =>
        applyOptimisticRemoveRole(currentMembers, input.address, input.role),
      )
      return { previousMembers }
    },
    onSuccess: (_data, input) => {
      setSuccessMessage(`Role "${input.role}" removed from ${input.address}.`)
      resetMutation()
    },
    onError: (err: unknown, _input, context) => {
      qc.setQueryData(queryKeys.members.all, context?.previousMembers)
      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`)
      if (err instanceof AuthError) {
        setSessionExpired(true)
        markExpired()
      }
    },
    onSettled: () => {
      setPendingAssignment(null)
      qc.invalidateQueries({ queryKey: queryKeys.members.all })
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
            {successAssignment && (
              <div className="text-sm text-green-700 dark:text-green-400" role="status">
                Role &quot;{successAssignment.role}&quot; saved for{' '}
                <AddressText
                  address={successAssignment.address}
                  className="text-green-700 dark:text-green-400"
                />
                .
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
            <BulkActionToolbar
              selectedAddresses={selectedAddresses}
              onClearSelection={() => {
                setSelectedAddresses([])
                setBulkResults(null)
              }}
              onAssignRole={(r) => executeBulkAssign(r, selectedAddresses)}
              isProcessing={bulkProcessing}
              results={bulkResults}
              onRetryFailed={handleRetryFailed}
              onClearResults={() => {
                setBulkResults(null)
                setSelectedAddresses([])
              }}
            />

            {isLoading ? (
              <LoadingState message="Loading members…" />
            ) : isError ? (
              <ErrorState
                title="Failed to load members"
                message={safeErrorMessage(error)}
                onRetry={() => refetch()}
              />
            ) : !members?.length ? (
              <EmptyState title="No members yet" message="No members have been added to this community." />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2 pb-2 mb-2 border-b">
                  <input 
                    type="checkbox"
                    checked={members.length > 0 && selectedAddresses.length === members.length}
                    onChange={toggleAll}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">Select All</span>
                </div>
                {members.map((m) => (
                  <div
                    key={m.address}
                    className={`flex items-center justify-between border rounded-md p-2 transition-colors ${selectedAddresses.includes(m.address) ? 'bg-muted/30 border-primary' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        checked={selectedAddresses.includes(m.address)}
                        onChange={() => toggleSelection(m.address)}
                        className="h-4 w-4"
                      />
                      <AddressText address={m.address} className="text-sm" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Tier: {m.tier}</span>
                      <div className="flex gap-1">
                        {m.roles.map((r) => (
                          <Badge
                            key={r}
                            variant="default"
                            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() =>
                              removeRoleMutation.mutate({ address: m.address, role: r })
                            }
                            title={`Remove ${r} role`}
                          >
                            {r} ✕
                          </Badge>
                        ))}
                      </div>
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
