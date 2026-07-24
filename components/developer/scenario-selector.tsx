/**
 * Scenario Selector Component
 * 
 * Developer tool for testing different mock scenarios including
 * concurrent policy editing
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { applyMockScenario, resetMockData } from "@/lib/api/mock";
import { config } from "@/lib/config";

type MockScenario =
  | 'active-member'
  | 'expired-member'
  | 'denied-resource'
  | 'admin-session-expired'
  | 'no-roles'
  | 'multiple-communities'
  | 'concurrent-policy-edit'
  | 'customized-profile';

const SCENARIOS: Record<MockScenario, string> = {
  'active-member': 'Active Standard Member',
  'expired-member': 'Expired Member',
  'denied-resource': 'Free Tier (Denied Access)',
  'admin-session-expired': 'Admin with Expired Session',
  'no-roles': 'Member with No Roles',
  'multiple-communities': 'Multi-Community Member',
  'concurrent-policy-edit': 'Concurrent Policy Edit (Admin)',
  'customized-profile': 'Customized Profile (Avatar, Bio, Links)',
};

export function ScenarioSelector() {
  const [selectedScenario, setSelectedScenario] = useState<MockScenario>('active-member');
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState("");

  // Only show in mock mode
  if (config.apiMode !== 'mock') {
    return null;
  }

  const handleApply = async () => {
    setIsApplying(true);
    setMessage("");
    
    try {
      // Use a demo address
      const demoAddress = '0x1234567890123456789012345678901234567890';
      await applyMockScenario(selectedScenario, demoAddress);
      setMessage(`✓ Applied scenario: ${SCENARIOS[selectedScenario]}`);
      
      // Reload the page to reflect changes
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      setMessage(`✗ Failed to apply scenario: ${error}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleReset = async () => {
    setIsApplying(true);
    setMessage("");
    
    try {
      await resetMockData();
      setMessage("✓ Mock data reset to defaults");
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      setMessage(`✗ Failed to reset: ${error}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">🧪 Mock Scenario Tester</span>
      </div>
      
      <div className="space-y-2">
        <Select
          value={selectedScenario}
          onChange={(e) => setSelectedScenario(e.target.value as MockScenario)}
          disabled={isApplying}
          className="w-full"
        >
          {Object.entries(SCENARIOS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={isApplying}
            className="flex-1"
          >
            {isApplying ? "Applying..." : "Apply Scenario"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleReset}
            disabled={isApplying}
          >
            Reset
          </Button>
        </div>
        
        {message && (
          <p className="text-xs text-muted-foreground">{message}</p>
        )}
      </div>
      
      <div className="text-xs text-muted-foreground">
        <strong>Concurrent Policy Edit:</strong> Sets the "alpha" policy as recently modified
        by another admin, triggering a conflict when you try to save.
      </div>
    </div>
  );
}
