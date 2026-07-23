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

