'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApi, type ModerationReport, type ModerationState, type PenaltyType } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { AdminGuard } from '@/components/admin-guard';
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AddressText } from '@/components/wallet/address-text';
import {
  ShieldAlert,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  FileText,
  Search,
  ArrowRight,
  UserMinus,
  RefreshCw,
  Scale
} from 'lucide-react';
import Link from 'next/link';

export default function AdminModerationPage() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Action fields
  const [adminNotes, setAdminNotes] = useState('');
  const [penaltyType, setPenaltyType] = useState<PenaltyType>('warning');
  const [appealNotes, setAppealNotes] = useState('');

  // Query reports
  const {
    data: reports = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.moderationReports.all,
    queryFn: ({ signal }) => getApi(address).listReports(signal),
    enabled: !!address,
  });

  // Mutation for updating report state
  const updateReportMutation = useMutation({
    mutationFn: ({
      id,
      state,
      updates,
    }: {
      id: string;
      state: ModerationState;
      updates?: Partial<ModerationReport>;
    }) => getApi(address).updateReportState(id, state, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.moderationReports.all });
      // Reset action states
      setAdminNotes('');
      setAppealNotes('');
    },
  });

  const selectedReport = reports.find((r) => r.id === selectedReportId);

  const getStatusBadge = (state: ModerationState) => {
    switch (state) {
      case 'report_submitted':
        return <Badge className="bg-red-500 hover:bg-red-600 text-white">Submitted</Badge>;
      case 'under_review':
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Under Review</Badge>;
      case 'action_taken':
        return <Badge className="bg-purple-500 hover:bg-purple-600 text-white">Action Taken</Badge>;
      case 'dismissed':
        return <Badge variant="outline">Dismissed</Badge>;
      case 'appeal_submitted':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white animate-pulse">Appeal Pending</Badge>;
      case 'appeal_reviewed_reinstated':
        return <Badge className="bg-green-500 hover:bg-green-600 text-white">Reinstated</Badge>;
      case 'appeal_reviewed_upheld':
        return <Badge className="bg-slate-700 hover:bg-slate-800 text-white">Upheld</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const filteredReports = reports.filter((r) => {
    // Search filter
    const matchesSearch =
      r.reportedAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reporterAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'active') {
      return (
        matchesSearch &&
        ['report_submitted', 'under_review', 'appeal_submitted'].includes(r.state)
      );
    }
    if (statusFilter === 'closed') {
      return (
        matchesSearch &&
        ['dismissed', 'action_taken', 'appeal_reviewed_reinstated', 'appeal_reviewed_upheld'].includes(
          r.state
        )
      );
    }
    return matchesSearch && r.state === statusFilter;
  });

  return (
    <AdminGuard>
      <div className="space-y-6 max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
              <Scale className="h-8 w-8 text-indigo-500" />
              Moderation Queue
            </h1>
            <p className="text-muted-foreground text-sm">
              Review filed member reports, enforce code of conduct, and process reinstatement appeals.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="self-start md:self-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Queue
          </Button>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue & Search Column */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold">Filed Reports</CardTitle>
                <CardDescription>Select a report from the queue below to review details.</CardDescription>
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by address or reason..."
                      className="pl-9 text-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    {(['all', 'active', 'closed'] as const).map((filter) => (
                      <Button
                        key={filter}
                        variant={statusFilter === filter ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter(filter)}
                      >
                        {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Closed'}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-0">
                {isLoading ? (
                  <LoadingState message="Loading reports..." />
                ) : isError ? (
                  <ErrorState title="Error" message={safeErrorMessage(error)} onRetry={refetch} />
                ) : filteredReports.length === 0 ? (
                  <EmptyState title="Queue Empty" message="No reports matching the selected filters were found." />
                ) : (
                  <div className="divide-y divide-border">
                    {filteredReports.map((report) => (
                      <div
                        key={report.id}
                        onClick={() => setSelectedReportId(report.id)}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-secondary/40 transition-colors border-l-4 ${
                          selectedReportId === report.id
                            ? 'border-indigo-500 bg-secondary/20'
                            : report.state === 'report_submitted'
                            ? 'border-red-500'
                            : report.state === 'appeal_submitted'
                            ? 'border-blue-500'
                            : 'border-transparent'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">Report #{report.id}</span>
                            {getStatusBadge(report.state)}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{new Date(report.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm font-medium text-foreground truncate">{report.reason}</p>
                          <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>Reported:</span>
                            <AddressText address={report.reportedAddress} />
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Details & Action Panel Column */}
          <div className="lg:col-span-1">
            {selectedReport ? (
              <Card className="shadow-lg border-indigo-500/20 sticky top-4">
                <CardHeader className="bg-indigo-500/5 border-b border-border pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold">Report Details</CardTitle>
                    {getStatusBadge(selectedReport.state)}
                  </div>
                  <CardDescription className="font-mono text-xs">ID: {selectedReport.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                  {/* Addresses */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reporter</p>
                      <div className="font-mono text-xs bg-secondary/50 p-2 rounded border border-border">
                        <AddressText address={selectedReport.reporterAddress} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reported Member</p>
                      <div className="font-mono text-xs bg-secondary/50 p-2 rounded border border-border flex justify-between items-center">
                        <AddressText address={selectedReport.reportedAddress} />
                        <Link
                          href={`/members/${selectedReport.reportedAddress}`}
                          className="text-xs text-indigo-500 hover:underline"
                        >
                          Profile
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Incident */}
                  <div className="space-y-2 border-t border-border pt-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Reason & Incident Details
                    </h3>
                    <p className="text-sm font-semibold">{selectedReport.reason}</p>
                    {selectedReport.details && (
                      <p className="text-xs text-muted-foreground bg-secondary/30 p-2 rounded whitespace-pre-wrap">
                        {selectedReport.details}
                      </p>
                    )}
                  </div>

                  {/* Penalty details if action taken */}
                  {selectedReport.penaltyApplied && (
                    <div className="space-y-2 border-t border-border pt-4 bg-purple-500/5 p-3 rounded border border-purple-500/10">
                      <h3 className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
                        Enforced Penalty
                      </h3>
                      <p className="text-sm font-bold capitalize text-purple-900">{selectedReport.penaltyApplied}</p>
                      {selectedReport.adminNotes && (
                        <p className="text-xs text-purple-800 italic">Notes: &ldquo;{selectedReport.adminNotes}&rdquo;</p>
                      )}
                    </div>
                  )}

                  {/* Appeal Info */}
                  {selectedReport.appealNotes && (
                    <div className="space-y-2 border-t border-border pt-4 bg-blue-500/5 p-3 rounded border border-blue-500/10">
                      <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                        Reinstatement Appeal
                      </h3>
                      <p className="text-xs text-blue-900 bg-white p-2 rounded border border-blue-100 italic">
                        &ldquo;{selectedReport.appealNotes}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Lifecycle State Actions */}
                  <div className="border-t border-border pt-4 space-y-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <ShieldAlert className="h-4 w-4 text-indigo-500" />
                      Workflow Actions
                    </h3>

                    {/* State: report_submitted */}
                    {selectedReport.state === 'report_submitted' && (
                      <Button
                        className="w-full"
                        onClick={() =>
                          updateReportMutation.mutate({
                            id: selectedReport.id,
                            state: 'under_review',
                          })
                        }
                        disabled={updateReportMutation.isPending}
                      >
                        Start Reviewing Report
                      </Button>
                    )}

                    {/* State: under_review */}
                    {selectedReport.state === 'under_review' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Enforcement Penalty</label>
                          <div className="flex gap-2">
                            {(['warning', 'suspension', 'permanent_ban'] as PenaltyType[]).map((t) => (
                              <Button
                                key={t}
                                variant={penaltyType === t ? 'default' : 'outline'}
                                size="sm"
                                className="flex-1 text-xs capitalize"
                                onClick={() => setPenaltyType(t)}
                              >
                                {t.replace('_', ' ')}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Admin Decision Notes</label>
                          <Input
                            placeholder="Add documentation context..."
                            className="text-xs"
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            variant="default"
                            onClick={() =>
                              updateReportMutation.mutate({
                                id: selectedReport.id,
                                state: 'action_taken',
                                updates: { penaltyApplied: penaltyType, adminNotes },
                              })
                            }
                            disabled={updateReportMutation.isPending}
                          >
                            Enforce Action
                          </Button>
                          <Button
                            className="flex-1"
                            variant="outline"
                            onClick={() =>
                              updateReportMutation.mutate({
                                id: selectedReport.id,
                                state: 'dismissed',
                                updates: { adminNotes },
                              })
                            }
                            disabled={updateReportMutation.isPending}
                          >
                            Dismiss Report
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* State: action_taken (Enable testing/appeal demo) */}
                    {selectedReport.state === 'action_taken' && (
                      <div className="space-y-3 p-3 bg-secondary/50 rounded border border-border">
                        <p className="text-xs font-bold text-muted-foreground">Demo / Simulate Member Appeal</p>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                          To drive the report through the reinstatement lifecycle, simulate a member appealing this action.
                        </p>
                        <Input
                          placeholder="Reason for appeal..."
                          className="text-xs"
                          value={appealNotes}
                          onChange={(e) => setAppealNotes(e.target.value)}
                        />
                        <Button
                          className="w-full"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            updateReportMutation.mutate({
                              id: selectedReport.id,
                              state: 'appeal_submitted',
                              updates: { appealNotes },
                            })
                          }
                          disabled={!appealNotes || updateReportMutation.isPending}
                        >
                          Submit Appeal
                        </Button>
                      </div>
                    )}

                    {/* State: appeal_submitted */}
                    {selectedReport.state === 'appeal_submitted' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Reinstatement Notes</label>
                          <Input
                            placeholder="Add appeal decision comment..."
                            className="text-xs"
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() =>
                              updateReportMutation.mutate({
                                id: selectedReport.id,
                                state: 'appeal_reviewed_reinstated',
                                updates: { adminNotes },
                              })
                            }
                            disabled={updateReportMutation.isPending}
                          >
                            Approve Appeal
                          </Button>
                          <Button
                            className="flex-1"
                            variant="destructive"
                            onClick={() =>
                              updateReportMutation.mutate({
                                id: selectedReport.id,
                                state: 'appeal_reviewed_upheld',
                                updates: { adminNotes },
                              })
                            }
                            disabled={updateReportMutation.isPending}
                          >
                            Reject & Upheld
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Closed state placeholder */}
                    {['dismissed', 'appeal_reviewed_reinstated', 'appeal_reviewed_upheld'].includes(
                      selectedReport.state
                    ) && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-secondary/50 p-3 rounded">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>This report has been resolved and closed.</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="h-64 flex items-center justify-center text-center text-muted-foreground shadow">
                <CardContent className="p-4 space-y-2">
                  <FileText className="h-10 w-10 mx-auto opacity-40" />
                  <p className="text-sm font-semibold">No Report Selected</p>
                  <p className="text-xs">Click any card on the left list to review report incident data and execute workflow actions.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
