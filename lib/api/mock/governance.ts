/**
 * lib/api/mock/governance.ts
 *
 * Governance domain of the mock API: proposals and weighted voting.
 * Extracted from lib/api/mock.ts.
 */
import { ApiError } from '../errors'
import { MOCK_SESSION_STATE, throwMockUnauthorized } from './session'
import {
  getCommunityState,
  initPromise,
  schedulePersist,
  type MockApiContext,
} from './state'
import type {
  MembershipTier,
  Proposal,
  ProposalStatus,
  ProposalType,
  Role,
  Vote,
  VoteChoice,
} from '../types'

export async function mockListProposals(
  ctx: MockApiContext,
  params?: { filter?: ProposalStatus | ProposalType; limit?: number; cursor?: string },
  _signal?: AbortSignal,
): Promise<Proposal[]> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  let proposals = Object.values(state.proposals)

  if (params?.filter) {
    // Filter by status or type
    const isStatus = ['draft', 'active', 'closed', 'resolved'].includes(params.filter)
    if (isStatus) {
      proposals = proposals.filter(p => p.status === params.filter)
    } else {
      proposals = proposals.filter(p => p.type === params.filter)
    }
  }

  // Sort by creation date, newest first
  proposals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const limit = params?.limit ?? 20
  const cursor = params?.cursor ? parseInt(params.cursor, 10) : 0
  return proposals.slice(cursor, cursor + limit)
}

export async function mockGetProposal(
  ctx: MockApiContext,
  id: string,
  _signal?: AbortSignal,
): Promise<Proposal | null> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  return state.proposals[id] ?? null
}

export async function mockGetMemberVote(
  ctx: MockApiContext,
  proposalId: string,
  _signal?: AbortSignal,
): Promise<Vote | null> {
  await initPromise
  if (!ctx.address) return null

  const state = getCommunityState(ctx.communityId)
  const vote = Object.values(state.votes).find(
    v => v.proposalId === proposalId && v.voter.toLowerCase() === ctx.address!.toLowerCase()
  )
  return vote ?? null
}

export async function mockListProposalVotes(
  ctx: MockApiContext,
  proposalId: string,
  params?: { limit?: number; cursor?: string },
  _signal?: AbortSignal,
): Promise<Vote[]> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  let votes = Object.values(state.votes).filter(v => v.proposalId === proposalId)

  // Sort by vote time, newest first
  votes.sort((a, b) => new Date(b.votedAt).getTime() - new Date(a.votedAt).getTime())

  const limit = params?.limit ?? 20
  const cursor = params?.cursor ? parseInt(params.cursor, 10) : 0
  return votes.slice(cursor, cursor + limit)
}

export async function mockCastVote(
  ctx: MockApiContext,
  proposalId: string,
  choice: VoteChoice,
): Promise<Vote> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
  if (!ctx.address) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'Must be authenticated to vote.',
    })
  }

  const state = getCommunityState(ctx.communityId)
  const proposal = state.proposals[proposalId]

  if (!proposal) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: 'Proposal not found.',
    })
  }

  if (proposal.status !== 'active') {
    throw new ApiError({
      status: 400,
      code: 'invalid_state',
      safeMessage: 'Voting is not currently open for this proposal.',
    })
  }

  // Check if already voted
  const existingVoteId = Object.entries(state.votes).find(
    ([_, v]) => v.proposalId === proposalId && v.voter.toLowerCase() === ctx.address!.toLowerCase()
  )?.[0]

  // Get voter's weight based on tier/role
  const memberData = state.memberStore[ctx.address]
  const tier = memberData?.membership.tier ?? 'free'
  const role = memberData?.roles[0] ?? 'member'

  // Simple weight: free=1, standard=2, pro=3 (tier) × member=1, moderator=2, admin=3 (role)
  const tierWeight: Record<MembershipTier, number> = { free: 1, standard: 2, pro: 3 }
  const roleMultiplier: Record<Role, number> = { member: 1, moderator: 2, admin: 3 }
  const weight = tierWeight[tier] * roleMultiplier[role]

  const vote: Vote = {
    id: existingVoteId || `vote_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    proposalId,
    voter: ctx.address,
    choice,
    weight,
    voterContext: { tier, role },
    votedAt: new Date().toISOString(),
  }

  // Update proposal vote summary
  if (existingVoteId) {
    const oldVote = state.votes[existingVoteId]
    // Remove old vote from summary
    proposal.votesSummary.totalVotes--
    proposal.votesSummary.weightsFor -= oldVote.choice === 'for' ? oldVote.weight : 0
    proposal.votesSummary.weightsAgainst -= oldVote.choice === 'against' ? oldVote.weight : 0
    proposal.votesSummary.weightsAbstain -= oldVote.choice === 'abstain' ? oldVote.weight : 0
  }

  // Add new vote to summary
  proposal.votesSummary.totalVotes++
  if (choice === 'for') proposal.votesSummary.weightsFor += weight
  else if (choice === 'against') proposal.votesSummary.weightsAgainst += weight
  else proposal.votesSummary.weightsAbstain += weight

  // Recalculate percentages
  if (proposal.totalWeight > 0) {
    proposal.votesSummary.percentFor = Math.round((proposal.votesSummary.weightsFor / proposal.totalWeight) * 100)
    proposal.votesSummary.percentAgainst = Math.round((proposal.votesSummary.weightsAgainst / proposal.totalWeight) * 100)
  }

  state.votes[vote.id] = vote
  schedulePersist()

  return vote
}

export async function mockCreateProposal(
  ctx: MockApiContext,
  proposal: Omit<Proposal, 'id' | 'createdAt' | 'status' | 'communityId' | 'votesSummary' | 'totalWeight'>,
): Promise<Proposal> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()

  // Check if user is admin
  if (!ctx.address || !getCommunityState(ctx.communityId).memberStore[ctx.address]?.roles.includes('admin')) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'Only admins can create proposals.',
    })
  }

  const state = getCommunityState(ctx.communityId)

  // Calculate total weight (sum of all member weights)
  let totalWeight = 0
  Object.values(state.memberStore).forEach(member => {
    const tierWeight: Record<MembershipTier, number> = { free: 1, standard: 2, pro: 3 }
    const roleMultiplier: Record<Role, number> = { member: 1, moderator: 2, admin: 3 }
    const weight = tierWeight[member.membership.tier] * roleMultiplier[member.roles[0] ?? 'member']
    totalWeight += weight
  })

  const newProposal: Proposal = {
    id: `prop_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    communityId: ctx.communityId,
    ...proposal,
    status: 'draft',
    createdAt: new Date().toISOString(),
    votesSummary: {
      totalVotes: 0,
      weightsFor: 0,
      weightsAgainst: 0,
      weightsAbstain: 0,
    },
    totalWeight,
  }

  state.proposals[newProposal.id] = newProposal
  schedulePersist()

  return newProposal
}

export async function mockUpdateProposal(
  ctx: MockApiContext,
  id: string,
  updates: Partial<Omit<Proposal, 'id' | 'status' | 'proposer' | 'createdAt' | 'votesSummary' | 'totalWeight'>>,
): Promise<Proposal> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()

  if (!ctx.address || !getCommunityState(ctx.communityId).memberStore[ctx.address]?.roles.includes('admin')) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'Only admins can update proposals.',
    })
  }

  const state = getCommunityState(ctx.communityId)
  const proposal = state.proposals[id]

  if (!proposal) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: 'Proposal not found.',
    })
  }

  if (proposal.status === 'active' || proposal.status === 'resolved') {
    throw new ApiError({
      status: 400,
      code: 'invalid_state',
      safeMessage: 'Cannot update an active or resolved proposal.',
    })
  }

  Object.assign(proposal, updates)
  schedulePersist()

  return proposal
}

export async function mockPublishProposal(ctx: MockApiContext, id: string): Promise<Proposal> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()

  if (!ctx.address || !getCommunityState(ctx.communityId).memberStore[ctx.address]?.roles.includes('admin')) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'Only admins can publish proposals.',
    })
  }

  const state = getCommunityState(ctx.communityId)
  const proposal = state.proposals[id]

  if (!proposal) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: 'Proposal not found.',
    })
  }

  if (proposal.status !== 'draft') {
    throw new ApiError({
      status: 400,
      code: 'invalid_state',
      safeMessage: 'Only draft proposals can be published.',
    })
  }

  proposal.status = 'active'
  schedulePersist()

  return proposal
}

export async function mockCloseProposalVoting(ctx: MockApiContext, id: string): Promise<Proposal> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()

  if (!ctx.address || !getCommunityState(ctx.communityId).memberStore[ctx.address]?.roles.includes('admin')) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'Only admins can close voting.',
    })
  }

  const state = getCommunityState(ctx.communityId)
  const proposal = state.proposals[id]

  if (!proposal) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: 'Proposal not found.',
    })
  }

  if (proposal.status !== 'active') {
    throw new ApiError({
      status: 400,
      code: 'invalid_state',
      safeMessage: 'Only active proposals can be closed.',
    })
  }

  proposal.status = 'closed'
  schedulePersist()

  return proposal
}

export async function mockResolveProposal(ctx: MockApiContext, id: string, outcome: string): Promise<Proposal> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()

  if (!ctx.address || !getCommunityState(ctx.communityId).memberStore[ctx.address]?.roles.includes('admin')) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'Only admins can resolve proposals.',
    })
  }

  const state = getCommunityState(ctx.communityId)
  const proposal = state.proposals[id]

  if (!proposal) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: 'Proposal not found.',
    })
  }

  proposal.status = 'resolved'
  proposal.payload = { ...proposal.payload, outcome, resolvedAt: new Date().toISOString() }
  schedulePersist()

  return proposal
}

export async function mockDeleteProposal(ctx: MockApiContext, id: string): Promise<void> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()

  if (!ctx.address || !getCommunityState(ctx.communityId).memberStore[ctx.address]?.roles.includes('admin')) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'Only admins can delete proposals.',
    })
  }

  const state = getCommunityState(ctx.communityId)
  const proposal = state.proposals[id]

  if (!proposal) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: 'Proposal not found.',
    })
  }

  if (proposal.status !== 'draft') {
    throw new ApiError({
      status: 400,
      code: 'invalid_state',
      safeMessage: 'Only draft proposals can be deleted.',
    })
  }

  delete state.proposals[id]
  // Also delete any votes on this proposal
  Object.keys(state.votes).forEach(voteId => {
    if (state.votes[voteId].proposalId === id) {
      delete state.votes[voteId]
    }
  })
  schedulePersist()
}