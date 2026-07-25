'use client'

import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { config } from '@/lib/config'
import { resetMockData, applyMockScenario, setMockRoleMutationFailure, setMockMetaVersion } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { SiweDebugPanel } from '@/components/developer/siwe-debug-panel'
type Scenario = 
  | 'active-member' 
  | 'expired-member' 
  | 'denied-resource' 
  | 'admin-session-expired' 
  | 'no-roles'
  | 'multiple-communities'

const SCENARIOS: { id: Scenario; label: string; description: string }[] = [
  { id: 'active-member', label: 'Active Member', description: 'Active standard tier member with access to Alpha Docs' },
  { id: 'expired-member', label: 'Expired Member', description: 'Inactive member with expired membership' },
  { id: 'denied-resource', label: 'Denied Resource', description: 'Free tier member denied access to Alpha Docs' },
  { id: 'admin-session-expired', label: 'Admin Session Expired', description: 'Admin user to test expired SIWE session' },
  { id: 'no-roles', label: 'No Roles', description: 'Member with no roles assigned' },
  { id: 'multiple-communities', label: 'Multiple Communities', description: 'Member active across several communities' },
]

export default function DeveloperPage() {
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const [customAddress, setCustomAddress] = useState<string>(address ?? '0x1234567890123456789012345678901234567890')
  const [roleMutationFailureEnabled, setRoleMutationFailureEnabled] = useState(false)
  const [metaVersionOverride, setMetaVersionOverride] = useState<string>('')
  const [metaVersionActive, setMetaVersionActive] = useState(false)

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
        <SiweDebugPanel />
      </div>
    )
  }

  const handleReset = async () => {
    await resetMockData()
    setRoleMutationFailureEnabled(false)
    await queryClient.invalidateQueries()
  }

  const handleApplyScenario = async (scenario: Scenario) => {
    await applyMockScenario(scenario, customAddress)
    await queryClient.invalidateQueries()
  }

  const handleToggleRoleMutationFailure = () => {
    const next = !roleMutationFailureEnabled
    setMockRoleMutationFailure(next)
    setRoleMutationFailureEnabled(next)
  }

  const handleSetMetaVersion = () => {
    if (metaVersionOverride.trim()) {
      setMockMetaVersion(metaVersionOverride.trim())
      setMetaVersionActive(true)
    }
  }

  const handleClearMetaVersion = () => {
    setMockMetaVersion(null)
    setMetaVersionOverride('')
    setMetaVersionActive(false)
    queryClient.invalidateQueries()
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

      <Card>
        <CardHeader>
          <CardTitle>Simulate Role Mutation Failure</CardTitle>
          <CardDescription>
            Forces the next assign/remove-role call on the Members page to fail
            with a generic server error, so the optimistic-update rollback and
            error toast can be exercised without a session-expiry scenario (#243).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            variant={roleMutationFailureEnabled ? 'destructive' : 'outline'}
            onClick={handleToggleRoleMutationFailure}
          >
            {roleMutationFailureEnabled ? 'Disable failure simulation' : 'Enable failure simulation'}
          </Button>
          {roleMutationFailureEnabled && <Badge variant="destructive">Active</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulate Backend Version Mismatch</CardTitle>
          <CardDescription>
            Override the mock backend's advertised API version to test the
            &quot;backend version mismatch&quot; warning UI.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="metaVersion">Mock Backend Version (semver)</Label>
            <div className="flex gap-3">
              <Input
                id="metaVersion"
                value={metaVersionOverride}
                onChange={(e) => setMetaVersionOverride(e.target.value)}
                placeholder="e.g. 2.0.0"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSetMetaVersion}>
                Set
              </Button>
            </div>
          </div>
          {metaVersionActive && (
            <div className="flex items-center gap-3">
              <Badge variant="destructive">
                Backend version set to {metaVersionOverride}
              </Badge>
              <Button variant="ghost" size="sm" onClick={handleClearMetaVersion}>
                Reset to default
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Set the version to a different major (e.g. 2.0.0) to trigger the
            mismatch warning. Reload the app after setting to see the warning UI.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}