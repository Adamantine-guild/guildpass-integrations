# Accessibility Audit

## Introduction
This document contains the results of an accessibility audit of the GuildPass integrations frontend, performed against WCAG 2.1 AA standards.

## Audit Findings

| Component / Flow               | Issue Description                                                                 | Severity | Status       |
|----------------------------------|---------------------------------------------------------------------------------|----------|--------------|
| Wallet Connect Button           | Uses Button component with aria-busy, aria-label for disconnect, status badges with role="status" | ✅ Fixed |
| Admin Guard                    | Missing sr-only style (fixed to use Tailwind's `sr-only` class, uses Button component with focus styles | ✅ Fixed |
| Gated Content / Denied State      | Uses ApiStates with proper role and aria-live attributes | ✅ OK |
| Membership Expiry Badge       | Has aria-label, icon with aria-hidden | ✅ OK |
| Sync Status Banner            | Proper aria-live and aria-label, role="status"/"alert" | ✅ OK |
| UI Buttons                  | focus-visible:ring styles, proper ARIA attributes | ✅ OK |
| Bulk Action Toolbar            | Missing live region for selection count, missing aria-disabled/aria-busy on buttons, missing live region for action results | Medium | ✅ Fixed |
| Scenario Selector              | Missing explicit control label, missing region landmark, missing aria-busy/aria-disabled on action buttons, missing live region on status feedback | Medium | ✅ Fixed |
| SIWE Debug Panel               | Missing aria-controls on toggle button, missing role="status" and aria-live="polite" on dynamic debug store updates | Medium | ✅ Fixed |
| PolicyConflictDialog           | Missing aria-modal, focus trap, Escape key handler, and focus restoration | High | ✅ Fixed |

## WCAG 2.1 AA Checks

### 2.4.7 Focus Visible (Level AA)
All interactive elements (buttons, inputs) have visible focus indicators using Tailwind focus-visible utilities ✅

### 2.5.3 Label in Name (Level A)
Buttons have visible labels, aria-labels if needed ✅

### 1.1.1 Non-text Content (Level A)
Icons marked aria-hidden="true", badges have text labels ✅

### 3.2.1 On Focus (Level A)
No unexpected changes on focus ✅

## Automated Checks
Automated accessibility checks can be run via `npm run test:accessibility`

## Remediated Issues

### 1. Admin Guard: Missing sr-only utility
**Before:** `style={srOnly}` (srOnly not defined)
**After:** `className="sr-only"` (Tailwind's built-in sr-only utility)
**File:** components/admin-guard.tsx
**Severity:** High

### 2. Admin Guard: Raw Buttons not using Button component
**Before:** Raw `<button>` without focus styles
**After:** Uses Button component with focus-visible styles and aria-busy
**File:** components/admin-guard.tsx
**Severity:** High

### 3. Bulk Action Toolbar: Missing Live Regions & ARIA State Attributes (Issue #302)
**Before:** Selection count badge lacked live region attributes (`role="status"`, `aria-live="polite"`), action buttons lacked `aria-disabled` and `aria-busy`, and result outputs were not announced.
**After:** Added `role="status"` and `aria-live="polite"` to selection count badge and results container; added `aria-disabled` and `aria-busy` to action buttons.
**File:** components/ui/bulk-action-toolbar.tsx
**Severity:** Medium

### 4. Scenario Selector: Missing Explicit Control Label & ARIA Attributes (Issue #302)
**Before:** `<Select>` control had no explicit `<label>` or `aria-label`, container lacked `role="region"`, buttons lacked `aria-disabled`/`aria-busy`, and status messages were not announced to live regions.
**After:** Linked `<label htmlFor={selectId}>` with `<Select id={selectId} aria-label="...">`, added `role="region"` and `aria-label` to container, added `aria-disabled` and `aria-busy` to buttons, and wrapped feedback message with `role="status"` and `aria-live="polite"`.
**File:** components/developer/scenario-selector.tsx
**Severity:** Medium

### 5. SIWE Debug Panel: Missing Collapsible ARIA Linkage & Dynamic Update Announcement (Issue #302)
**Before:** Toggle button lacked `aria-controls`, card content lacked `role="status"` and `aria-live="polite"` for dynamic SIWE debug updates.
**After:** Added `aria-controls="siwe-debug-content"` and descriptive `aria-label` to toggle button, and added `id="siwe-debug-content"`, `role="status"`, `aria-live="polite"` to `CardContent`.
**File:** components/developer/siwe-debug-panel.tsx
**Severity:** Medium

### 6. PolicyConflictDialog: Missing Modal Dialog Accessibility (Issue #297)
**Before:** The conflict dialog had `role="dialog"` but lacked `aria-modal="true"`, a focus trap, an Escape key handler, auto-focus on mount, and focus restoration on close.
**After:** Added `aria-modal="true"`, integrated the existing `useFocusTrap` hook for Tab/Shift+Tab wrapping, Escape key handling, initial focus on mount, and focus restoration when the dialog closes.
**File:** components/ui/policy-conflict-dialog.tsx
**Severity:** High


