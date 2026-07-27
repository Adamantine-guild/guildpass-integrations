# Observability: integration gateway request logging

The three `/api/integration/*` route handlers (`health`, `membership`,
`verify`) emit one structured JSON log line per request via
`logGatewayRequest()` in `lib/observability/request-log.ts`. This document
covers the log format, the redaction rule for wallet addresses, and
retention.

## Log format

Each request produces exactly one `console.log(JSON.stringify(...))` call,
regardless of which code path the request took — the success path, every
early-return (missing/invalid address, rate-limit rejection, CSRF
rejection), and every mapped gateway error all log through the same
`finally` block in the route handler, so a request is never silently
unlogged.

```json
{
  "ts": "2026-07-27T04:50:24.717Z",
  "correlationId": "ef4f2d53-8218-4a64-a16d-a236891be6ad",
  "method": "GET",
  "path": "/api/integration/membership",
  "status": 200,
  "durationMs": 1,
  "rateLimit": "allowed",
  "address": "0x1234…5678"
}
```

| Field | Type | Notes |
|---|---|---|
| `ts` | string | ISO 8601 timestamp of the log line |
| `correlationId` | string | `crypto.randomUUID()`, generated once at the top of the handler |
| `method` | string | HTTP method (`GET` for all three routes today) |
| `path` | string | Route pathname, e.g. `/api/integration/verify` |
| `status` | number | HTTP status code actually returned |
| `durationMs` | number | Wall-clock time from the top of the handler to the response, covering CSRF and rate-limit early-returns |
| `rateLimit` | `'allowed' \| 'limited' \| 'not_applicable'` | Real outcome of `rateLimitRequest()`. `'not_applicable'` only for `health`, which has no rate limiter |
| `address` | string, optional | **Omitted entirely** (not `null`/empty) for routes that don't take a wallet address. Always redacted — see below |
| `errorMessage` | string, optional | Present only when the gateway call threw. See "Error redaction" below |

`correlationId` is also returned to the caller as `requestId` in every
**error** response body (400/429/502/503), so a caller reporting "my wallet
gets 429s" can hand you the exact `requestId` to grep for in logs. 200
success response bodies are unchanged and do not include `requestId`.

## Wallet address redaction

Any wallet address that reaches the log passes through `redactAddress()`
(`lib/wallet/address.ts`) first:

- A syntactically valid address (`0x` + 40 hex chars) is shown as
  `0x1234…5678` (first 6 chars, `…`, last 4 chars) — enough to recognize a
  wallet across log lines without exposing the full address.
- Anything that is **not** a valid address — missing, empty, too short,
  non-hex, or an oversized/malformed value from an unvalidated early-return
  (e.g. a request rejected for `Invalid address format.`) — is logged as the
  fixed placeholder `[redacted-address]`. No part of the raw input is ever
  echoed back, regardless of length or content, because at that point in the
  request the value hasn't been validated and may be attacker-controlled.

This is a deliberately different (and stricter) behavior than the existing
UI helper `formatAddress()`, which falls back to echoing the raw input for
invalid addresses — that helper is for display, not logging, and must not be
reused for log redaction.

## Error redaction

When the gateway call throws, only `error.message` (or the raw string, for
a non-`Error` throw) is logged as `errorMessage`. The raw error object,
its stack trace, and any custom properties it carries are never logged.

What you lose with this trade-off:
- The stack trace — pinpointing the exact call site from logs alone isn't
  possible; reproduce locally or attach a dedicated APM/error tracker if
  deeper visibility is needed.
- Any custom properties an upstream error might carry (e.g. from the
  optional `@guildpass/integration-client` dependency) — only `.message` is
  trusted enough to log as-is.

`status` (502 vs 503) still tells you which of the four known failure modes
occurred (misconfigured / dependency missing / method unsupported / generic
upstream error), so most triage doesn't need the stack.

## Retention

These are plain `console.log` lines — retention is whatever your deployment
platform's log pipeline retains for stdout (e.g. your hosting provider's
default log retention window). This module does not persist logs anywhere
itself and has no built-in retention/rotation policy. If you need longer
retention or searchability, ship stdout to your log aggregator of choice; no
change to this module is required since it already emits one JSON object
per line.
