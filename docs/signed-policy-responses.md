# Signed Access-Policy Responses

**Status:** Proposal  
**Difficulty:** Expert  
**Area:** Security / Architecture  
**Author:** GuildPass Engineering  

---

## 1. Problem Statement

Access decisions currently flow as plain JSON from `guildpass-core`'s `/v1/policies*` and `/v1/members/*` endpoints (or their mock equivalents) and are trusted at face value by `components/gated.tsx`. There is **no documented integrity mechanism** protecting these responses in transit or at rest beyond standard TLS.

### Threat Model

A compromised network intermediary, a misconfigured or compromised CDN, or a browser extension performing response-tampering could alter an access-denial response into an access-grant (or vice versa) without the client having any way to detect the tampering, since there is no cryptographic binding between the policy the backend actually computed and what the client renders.

**Specific threat scenarios:**

| Threat | Impact |
|--------|--------|
| Compromised CDN edge replays stale or modified policy | Gated content exposed without authorization |
| Malicious browser extension intercepts and mutates JSON responses | Grant/deny decision inverted |
| DNS spoofing + TLS termination proxy | Complete bypass of access controls |
| Internal attacker with network access modifies responses in transit | Unauthorized access or denial of service |

---

## 2. Design

### 2.1 Envelope Format

`guildpass-core` wraps sensitive responses in a signed envelope:

```json
{
  "data": { /* original response body */ },
  "signature": {
    "payload": "<canonical-payload>",
    "value": "<base64-encoded-signature>",
    "algorithm": "ed25519",
    "key_id": "2025-07"
  }
}
```

### 2.2 Canonical Payload

The payload is a deterministic JSON string with the following fields, serialized with **sorted keys and no whitespace**:

```
{
  "path": "<endpoint-path>",
  "timestamp": "<ISO-8601>",
  "body": { <response-body> }
}
```

- `path` — the request path (e.g. `/v1/policies/alpha`)
- `timestamp` — ISO-8601 UTC timestamp of when the response was generated
- `body` — the complete response body, recursively key-sorted

The canonical string is `JSON.stringify(canonicalPayload)` with keys sorted lexicographically at every nesting level, produced by a deterministic serialization routine (`canonicalize()`).

### 2.3 Signing Algorithm

**Ed25519** is the required algorithm. Rationale:

- Small signatures (64 bytes) and fast verification
- Well-audited implementations available via `@noble/curves` (already a transitive dependency of viem)
- Constant-time verification by default
- No legacy compatibility baggage

### 2.4 Key Management

#### Backend (guildpass-core)

- Generate a new Ed25519 key pair for signing responses
- Expose the public key via `/.well-known/signing-key.json`:

```json
{
  "key_id": "2025-07",
  "algorithm": "ed25519",
  "public_key": "<base64-encoded-public-key>",
  "activated_at": "2025-07-01T00:00:00Z"
}
```

- Serve this from the same origin (TLS-protected) so it shares the same trust root as the API
- Rotate keys periodically (quarterly recommended); keep the previous key available during overlap windows for grace-period verification

#### Client

- The client fetches the public key from `/.well-known/signing-key.json` on startup (or at first policy access) and caches it for the session
- In mock/dev mode, a hardcoded key pair is used (see `lib/api/verify.ts` — **clearly marked non-production**)

### 2.5 Endpoints to Sign

Initially:

- `GET /v1/policies` — list all policies
- `GET /v1/policies/:resourceId` — single policy
- `GET /v1/session` — current session + membership
- `GET /v1/members/:address` — membership details

Additional endpoints (resources, community) may be added in future iterations.

### 2.6 Verification Flow

```
Client                          guildpass-core
  |                                   |
  |── GET /v1/policies/alpha ────────>|
  |<── signed envelope ───────────────|
  |                                   |
  |── GET /.well-known/signing-key ──>|
  |<── public key ────────────────────|
  |                                   |
  ├─ canonicalize(payload) ──────────┤
  ├─ ed25519.verify(sig, canon, pk) ─┤
  ├─ check timestamp freshness ──────┤
  ├─ reject if signature invalid ────┤
  └─ render decision ────────────────┘
```

---

## 3. Client-Side Implementation

### 3.1 Verification Module (`lib/api/verify.ts`)

```
lib/api/verify.ts
├── canonicalize()        — deterministic JSON serialization
├── signPayload()         — Ed25519 sign (mock usage only)
├── verifySignature()     — Ed25519 verify
├── verifySignedResponse()— full verification pipeline
├── SignedResponse<T>     — envelope type
├── VerificationMode      — 'off' | 'warn' | 'enforce'
└── MOCK_KEYS             — non-production test keys
```

### 3.2 Configurable Enforcement

Controlled by `NEXT_PUBLIC_RESPONSE_VERIFICATION`:

| Mode | Behavior |
|------|----------|
| `off` (default) | No verification. Responses processed as-is. |
| `warn` | Verify signatures. Log warnings on failure but still process the response. Safe for rollout before backend support lands. |
| `enforce` | Verify signatures. **Refuse to render gated content** (default to deny) on verification failure. |

**Default is `off`** until guildpass-core's signed response support is confirmed.

### 3.3 Gated Component Changes

The `Gated` component uses React Query's `queryFn` to fetch data. The API layer (`live.ts`) already handles verification transparently by:

1. Extracting the signed envelope from the response
2. Canonicalizing and verifying before returning typed data
3. Throwing a `VerificationError` (subclass of `ApiError`) if verification fails in `enforce` mode

The `Gated` component's existing error path (`!session`, `isError`, `!decision.allowed`) handles verification failures naturally — they surface as errors with retry or as denied access.

### 3.4 Mock Mode

`MockAccessApi` generates real Ed25519 signatures using a hardcoded mock key pair. This makes the entire verification path testable without any backend changes.

The mock key pair is:
- **Clearly documented** as `MOCK_SIGNING_KEY` / `MOCK_VERIFYING_KEY`
- **Marked** with `// ⚠️ MOCK KEY — DO NOT USE IN PRODUCTION`
- **Never used** by `LiveAccessApi`

---

## 4. Backend Implementation Guide (for guildpass-core)

### Required Changes

1. **Generate an Ed25519 key pair** for signing
2. **Add `/.well-known/signing-key.json`** endpoint serving the public key
3. **Wrap signed responses** in the envelope format
4. **Use the canonicalization algorithm** (JSON.stringify with sorted keys) to produce the payload string before signing

### Code Sketch (Node.js / TypeScript)

```typescript
import { ed25519 } from '@noble/curves/ed25519'

function canonicalize(obj: unknown): string {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return JSON.stringify(obj)
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  const pairs = keys.map(k => `"${k}":${canonicalize((obj as Record<string, unknown>)[k])}`)
  return `{${pairs.join(',')}}`
}

function signResponse(path: string, body: unknown, secretKey: Uint8Array) {
  const payload = canonicalize({
    path,
    timestamp: new Date().toISOString(),
    body,
  })
  const signature = ed25519.sign(Buffer.from(payload, 'utf-8'), secretKey)
  return {
    data: body,
    signature: {
      payload,
      value: Buffer.from(signature).toString('base64'),
      algorithm: 'ed25519',
      key_id: process.env.SIGNING_KEY_ID ?? '2025-07',
    },
  }
}
```

### Endpoint Contract (per signed endpoint)

**Request:**
```
GET /v1/policies/alpha
```

**Response (200):**
```json
{
  "data": {
    "resource_id": "alpha",
    "min_tier": "standard",
    "roles": ["member"]
  },
  "signature": {
    "payload": "{\"path\":\"/v1/policies/alpha\",\"timestamp\":\"2025-07-17T12:00:00Z\",\"body\":{\"min_tier\":\"standard\",\"resource_id\":\"alpha\",\"roles\":[\"member\"]}}",
    "value": "6qX8y9z...base64-encoded-signature...",
    "algorithm": "ed25519",
    "key_id": "2025-07"
  }
}
```

### Rollout

1. Deploy the public key endpoint first (separate from signed responses)
2. Enable signed responses on the backend behind a feature flag
3. Once verified, enable permanently

---

## 5. Residual Limitations

### 5.1 Key Compromise

If the signing key is compromised, an attacker can sign arbitrary policy responses until the key is rotated and the client trust store is updated. Mitigations:

- Short-lived key rotation (quarterly)
- Key stored in HSM or secrets manager (not on the application filesystem)
- Key ID in the envelope allows seamless rotation transparent to clients

### 5.2 Trust-on-First-Use (TOFU)

The client fetches the public key via `/.well-known/signing-key.json` over TLS. If TLS is compromised at initial fetch, the attacker could substitute their own public key. Mitigations:

- The well-known endpoint must share the same origin as the API (same TLS certificate)
- Publish the key fingerprint via a secondary channel (e.g., DNS-based or blockchain-based) for out-of-band verification
- Consider a future enhancement: public key discovery via ENS or on-chain registry

### 5.3 Replay Attacks

A signed response could be replayed at a later time. Mitigations:

- The `timestamp` field allows a configurable freshness window (default: 5 minutes)
- In `enforce` mode, responses older than the freshness window are rejected
- Future enhancement: include a nonce or sequence number

### 5.4 Payload Size

The signed envelope adds overhead (signature: ~88 bytes base64, payload string, timestamp). For policy responses this is negligible (~200-500 bytes total).

### 5.5 Clock Skew

Timestamp verification requires the client clock to be reasonably accurate. A 30-second tolerance window is recommended.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `lib/api/verify.ts` | **New** — Verification core |
| `lib/api/types.ts` | Add `SignedResponse<T>` and related types |
| `lib/api/mock.ts` | Sign responses in mock mode |
| `lib/api/live.ts` | Verify responses from guildpass-core |
| `lib/api/index.ts` | Export verify module |
| `lib/config.ts` | Add `responseVerification` config |
| `components/gated.tsx` | Default to deny on verification failure |
| `test/verify.test.ts` | **New** — Full verification tests |
| `test/tsconfig.json` | Include verify.ts |
| `.env.example` | Document `NEXT_PUBLIC_RESPONSE_VERIFICATION` |
| `docs/signed-policy-responses.md` | This document |

---

## 7. Acceptance Criteria Checklist

- [x] Written proposal doc specifying exact signed-payload format
- [x] Mock mode fully implements signing; client fully implements verification
- [x] Tampered mock response is demonstrably rejected (test asserts deny on tampered grant)
- [x] Configurable enforcement mode (`off` / `warn` / `enforce`) with safe default
- [x] Threat model and residual limitations documented
