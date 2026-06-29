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
import { isWalletAddress, normalizeAddress } from '@/lib/wallet/address'

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
  
  const normalizedAddr = normalizeAddress(addr)
  const isValidAddress = isWalletAddress(normalizedAddr)

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
                className={!isValidAddress && addr.trim() ? 'border-destructive' : ''}
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
                onClick={() => mutate({ address: normalizedAddr, role })}
                disabled={!isValidAddress || isPending}
              >
                {isPending ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
            {!isValidAddress && addr.trim() && (
              <div className="text-sm text-destructive" role="alert">
                Please enter a valid wallet address (0x followed by 40 hexadecimal characters)
              </div>
            )}
            {successAssignment && (
              <div className="text-sm text-green-700 dark:text-green-400" role="status">
                Role "{successAssignment.role}" saved for{' '}
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
                {members.map((m) => (
                  <div
                    key={m.address}
                    className="flex items-center justify-between border rounded-md p-2"
                  >
                    <AddressText address={m.address} className="text-sm" />
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
