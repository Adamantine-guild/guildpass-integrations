import { useState } from 'react'
import { Role } from '@/lib/api'
import { Button } from './button'
import { Card, CardContent } from './card'
import { Badge } from './badge'

export type BulkResultItem = {
  address: string
  status: 'fulfilled' | 'rejected' | 'skipped_circuit_open'
  error?: any
}

interface BulkActionToolbarProps {
  selectedAddresses: string[]
  onClearSelection: () => void
  onAssignRole: (role: Role) => Promise<void>
  isProcessing: boolean
  results: BulkResultItem[] | null
  onRetryFailed: () => Promise<void>
  onClearResults: () => void
}

export function BulkActionToolbar({
  selectedAddresses,
  onClearSelection,
  onAssignRole,
  isProcessing,
  results,
  onRetryFailed,
  onClearResults
}: BulkActionToolbarProps) {
  const [selectedRole, setSelectedRole] = useState<Role>('member')

  if (selectedAddresses.length === 0 && !results) {
    return null;
  }

  return (
    <Card className="mb-4 bg-muted/50">
      <CardContent className="p-4 space-y-4">
        {!results ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedAddresses.length} member(s) selected
            </span>
            <div className="flex items-center gap-2">
              <select
                className="border rounded-md h-9 px-2 text-sm"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as Role)}
                disabled={isProcessing}
              >
                <option value="member">member</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
              </select>
              <Button
                size="sm"
                onClick={() => onAssignRole(selectedRole)}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Assign Role'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onClearSelection}
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Bulk Assignment Results</h3>
              <div className="flex items-center gap-2">
                {results.some(r => r.status !== 'fulfilled') && (
                  <Button size="sm" onClick={onRetryFailed} disabled={isProcessing}>
                    {isProcessing ? 'Retrying...' : 'Retry Failed/Skipped'}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={onClearResults} disabled={isProcessing}>
                  Dismiss
                </Button>
              </div>
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-2 text-sm bg-background">
              {results.map((r, i) => (
                <div key={`${r.address}-${i}`} className="flex justify-between items-center p-2 border-b last:border-0">
                  <span className="font-mono text-xs">{r.address}</span>
                  {r.status === 'fulfilled' && <Badge className="bg-green-600 text-white hover:bg-green-600">OK</Badge>}
                  {r.status === 'rejected' && <Badge variant="destructive">Error</Badge>}
                  {r.status === 'skipped_circuit_open' && <Badge variant="warning">Skipped (Circuit Open)</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
