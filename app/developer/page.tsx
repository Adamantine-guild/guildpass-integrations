'use client'

import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { config } from '@/lib/config'
import { resetMockData, applyMockScenario, getApi } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

type Scenario = 
  | 'active-member' 
  | 'expired-member' 
  | 'denied-resource' 
  | 'admin-session-expired' 
  | 'no-roles'

const SCENARIOS: { id: Scenario; label: string; description: string }[] = [
  { id: 'active-member', label: 'Active Member', description: 'Active standard tier member with access to Alpha Docs' },
  { id: 'expired-member', label: 'Expired Member', description: 'Inactive member with expired membership' },
  { id: 'denied-resource', label: 'Denied Resource', description: 'Free tier member denied access to Alpha Docs' },
  { id: 'admin-session-expired', label: 'Admin Session Expired', description: 'Admin user to test expired SIWE session' },
  { id: 'no-roles', label: 'No Roles', description: 'Member with no roles assigned' },
]

export default function DeveloperPage() {
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const [customAddress, setCustomAddress] = useState(address ?? '0x1234567890123456789012345678901234567890')

  if (config.apiMode !== 'mock') {
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Developer Controls</h1>
          <p className="text-muted-foreground">Only available in mock mode</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Developer controls are only available when NEXT_PUBLIC_MOCK_MODE=true.
              Switch to mock mode to use these tools.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleReset = async () => {
    resetMockData()
    await queryClient.invalidateQueries({ queryKey: queryKeys.session.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.walletVerification.all })
  }

  const handleApplyScenario = async (scenario: Scenario) => {
    applyMockScenario(scenario, customAddress)
    await queryClient.invalidateQueries({ queryKey: queryKeys.session.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.walletVerification.all })
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Developer Controls</h1>
        <p className="text-muted-foreground">Mock-only tools for testing scenarios</p>
        <Badge variant="outline" className="mt-2">Mock Mode Active</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reset Mock Data</CardTitle>
          <CardDescription>Reset all mock data to initial state</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleReset}>Reset All Data</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scenario Presets</CardTitle>
          <CardDescription>Apply predefined testing scenarios</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="address">Wallet Address</Label>
            <Input
              id="address"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className="grid gap-3">
            {SCENARIOS.map((scenario) => (
              <div key={scenario.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{scenario.label}</div>
                  <div className="text-sm text-muted-foreground">{scenario.description}</div>
                </div>
                <Button variant="outline" onClick={() => handleApplyScenario(scenario.id)}>
                  Apply
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}