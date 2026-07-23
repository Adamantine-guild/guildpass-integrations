# SIWE Client-Side Security Hardening

This document describes the client-side security hardening implemented to protect against SIWE (Sign-In with Ethereum) phishing attacks and domain/chain mismatch vulnerabilities.

---

## Overview

EIP-4361 (SIWE) messages embed `domain` and `chainId` fields specifically to prevent signed messages from being replayed against a different site or chain. This implementation adds runtime validation to ensure these protections are effective on the client side.

---

## Threat Model

### 1. Domain Mismatch Attack

**Description:** A phishing site presents a SIWE message whose `domain` field doesn't match the site the user is actually on. The user signs the message believing they're authenticating with a legitimate service, but the signature can be replayed against the legitimate site's backend.

**Example Attack Flow:**
1. Attacker creates `evil-site.com` that looks identical to `app.example.com`
2. Attacker configures `NEXT_PUBLIC_SIWE_DOMAIN=app.example.com` on their phishing site
3. User visits `evil-site.com` and initiates sign-in
4. SIWE message is constructed with `domain: app.example.com` (mismatching actual origin)
5. User signs the message
6. Attacker replays the signature to `app.example.com` backend
7. Backend validates domain matches expected value and accepts the signature
8. Attacker gains authenticated access to victim's account

**Defense:** Runtime validation compares `NEXT_PUBLIC_SIWE_DOMAIN` against `window.location.host` at message-construction time. If they diverge, sign-in is blocked with a security-framed error message.

### 2. Chain Switch Replay Attack

**Description:** A user starts the sign-in flow on one chain, then switches their wallet to a different chain before signing. The signature could be replayed on the original chain if the backend doesn't validate chainId consistency.

**Example Attack Flow:**
1. User connects wallet to Ethereum Mainnet (chainId: 1)
2. User initiates sign-in on legitimate site
3. SIWE message is constructed with `chainId: 1`
4. Attacker convinces user to switch wallet to Base (chainId: 8453)
5. User signs the message while on Base
6. If client doesn't re-validate, signature might be accepted for Mainnet
7. Signature replay across chains could enable cross-chain exploitation

**Defense:** ChainId is validated immediately before signature request (not just at flow start). This detects mid-flow chain switches and blocks signature with a security-framed error.

### 3. Stale Configuration After Domain Migration

**Description:** After a domain migration (e.g., `old-domain.com` → `new-domain.com`), if `NEXT_PUBLIC_SIWE_DOMAIN` is not updated, the application will silently produce messages that don't match the actual serving domain. This is exactly the failure mode EIP-4361's domain-binding is meant to prevent.

**Defense:** Runtime validation detects this misconfiguration at sign-in time and blocks authentication with a clear error message indicating a configuration issue.

---

## Implementation Details

### Domain Validation

**Location:** `lib/wallet/providers.tsx` → `validateSiweDomain()`

**Validation Logic:**
```typescript
const configuredDomain = config.siwe.domain;
const actualHost = window.location.host;

// Normalize both for comparison (handle protocol/port)
const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "");
const normalizedConfigured = normalizeDomain(configuredDomain);
const normalizedActual = normalizeDomain(actualHost);

if (normalizedConfigured !== normalizedActual) {
  throw new Error("🔒 Security Error: Domain Mismatch...");
}
```

**Key Properties:**
- Case-insensitive comparison
- Protocol-agnostic (strips `https://` and `http://`)
- Port-sensitive (localhost:3000 ≠ localhost:8080)
- Skips validation on server-side (typeof window check)
- Called at message-construction time, before nonce fetch

### ChainId Validation

**Location:** `lib/wallet/providers.tsx` → `validateChainId()`

**Validation Logic:**
```typescript
const currentChainId = chainId; // From wagmi useAccount()
if (currentChainId === undefined) {
  throw new Error("🔒 Security Error: Unable to determine wallet chain");
}

if (currentChainId !== messageChainId) {
  throw new Error("🔒 Security Error: Chain Mismatch...");
}
```

**Key Properties:**
- Re-checks immediately before signature request (not just at flow start)
- Detects mid-session chain switches
- Validates against live wallet state via wagmi's `useAccount().chainId`
- Called after message construction but before `signMessageAsync()`

### Security-Framed Error Messages

Both validation failures produce distinct, clearly security-framed error messages:

**Domain Mismatch:**
```
🔒 Security Error: Domain Mismatch

The configured SIWE domain (evil-site.com) does not match the current site (legitimate-site.com).

This indicates either:
  • A misconfiguration (NEXT_PUBLIC_SIWE_DOMAIN is stale or incorrect)
  • A phishing attempt or proxying scenario

For your security, sign-in is blocked. Please contact the site administrator if this persists.
```

**Chain Mismatch:**
```
🔒 Security Error: Chain Mismatch

Your wallet is connected to chain 8453, but the sign-in request is for chain 1.

This prevents signature replay across different chains.
Please switch your wallet to the correct chain and try again.
```

**Design Principles:**
- Lock emoji (🔒) for immediate visual security cue
- Explicit "Security Error" prefix
- No generic error language
- Clear explanation of the threat
- Actionable guidance for users
- Distinguishes between misconfiguration vs. phishing

---

## Defense-in-Depth Context

### Client-Side Checks Are Not Sufficient

These client-side validations are a **defense-in-depth layer**, not a substitute for backend verification:

1. **Backend nonce/domain verification is still required:** The backend must validate that the signed message's `domain` field matches the server's expected domain. Client-side checks can be bypassed by a determined attacker with browser DevTools or script injection.

2. **XSS vulnerability negates client-side protections:** If an attacker can execute arbitrary JavaScript in the origin (via XSS), they can bypass these validations by directly calling the backend API with a crafted signature.

3. **Environment variable tampering:** In development environments, `NEXT_PUBLIC_SIWE_DOMAIN` can be modified locally. Production deployments should use immutable infrastructure configuration.

### Backend Responsibilities (Not Implemented Here)

The backend (`guildpass-core`) must implement:

1. **Domain validation:** Verify that the `domain` field in the signed SIWE message matches the server's expected domain for the application.

2. **Nonce validation:** Ensure nonces are single-use and have a short TTL (currently 5 minutes).

3. **ChainId validation:** Verify that the `chainId` in the message matches the chain where the signature was verified.

4. **URI validation:** Verify that the `uri` field matches the expected origin.

See `docs/security/siwe-threat-model.md` for the complete threat model including backend responsibilities.

---

## Testing

### Test Coverage

Security tests are located in `test/siwe-security-validation.test.ts`:

1. **Domain validation tests:**
   - Matching domain/host allows sign-in
   - Mismatched domain/host blocks sign-in
   - Protocol normalization (https:// vs http://)
   - Port handling
   - Stale configuration detection

2. **ChainId validation tests:**
   - Matching chainId allows sign-in
   - Mismatched chainId blocks sign-in
   - Undefined chainId handling
   - Mid-flow chain switch detection

3. **Error message tests:**
   - Security-framed vs. generic error distinction
   - Actionable guidance presence
   - Lock emoji and "Security Error" prefix

4. **Integration tests:**
   - Legitimate flow with matching domain/chain unaffected

### Running Tests

```bash
npm test -- siwe-security-validation.test.ts
```

---

## Configuration

### Environment Variables

**NEXT_PUBLIC_SIWE_DOMAIN** (required in production)
- The domain field included in the EIP-4361 message
- Must match the origin the frontend is served from
- Default: `localhost:3000` (development only)
- Example: `app.example.com`

**NEXT_PUBLIC_WALLET_CHAINS** (optional)
- Comma-separated list of supported chain names
- Used by wagmi configuration
- Default: `mainnet,base,sepolia`
- Example: `mainnet,base`

### Deployment Checklist

When deploying to production:

1. Set `NEXT_PUBLIC_SIWE_DOMAIN` to the actual production domain
2. Verify the domain matches the serving origin (including protocol and port if non-standard)
3. Ensure backend is configured to expect the same domain
4. Test sign-in flow in production environment
5. Monitor for domain mismatch errors (indicates misconfiguration)

---

## Limitations and Known Issues

### 1. Client-Side Bypass

A sophisticated attacker with browser DevTools access can:
- Modify `window.location.host` via proxying
- Patch the validation functions in the runtime
- Directly call backend APIs with crafted signatures

**Mitigation:** Backend validation is the authoritative check. Client-side checks are for user safety and defense-in-depth.

### 2. Subdomain Wildcards

The current implementation requires exact domain match. It does not support:
- Wildcard domains (e.g., `*.example.com`)
- Subdomain variations (e.g., `app.example.com` vs `admin.example.com`)

**Future Enhancement:** Add configurable domain matching patterns if multi-subdomain deployments are needed.

### 3. Port Sensitivity

The validation is port-sensitive: `localhost:3000` ≠ `localhost:8080`. This is intentional for security, but may require configuration in environments with dynamic ports.

### 4. Server-Side Rendering

Validation is skipped on server-side (`typeof window === "undefined"` check). This is correct behavior since server-side rendering doesn't have access to the runtime origin.

---

## Related Documentation

- **SIWE Threat Model:** `docs/security/siwe-threat-model.md` - Complete threat analysis including backend responsibilities
- **HTTP-Only Cookie Migration:** `docs/http-only-cookie-migration.md` - Planned architecture to replace client-side token storage
- **Security Policy:** `SECURITY.md` - Repository security policy and vulnerability disclosure

---

## Change History

- **2026-07-23:** Initial implementation of domain and chainId validation
  - Added `validateSiweDomain()` function
  - Added `validateChainId()` function
  - Integrated validation into sign-in flow
  - Added security-framed error messages
  - Created comprehensive test suite
  - Documented threat model and limitations
