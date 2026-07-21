# Provisional Admin Events Stream Contract

Issue #159 proposes replacing interval-only admin event polling with a resilient real-time layer. This document is a frontend proposal for `guildpass-core`; it does not assume the endpoint already exists in live deployments.

## Proposed endpoint

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| `GET` | `/v1/admin/events/stream` | Bearer SIWE admin token | `text/event-stream` |

Each SSE message should include one `data:` payload containing a JSON `WebhookEventLog` object matching the existing `/v1/admin/events` item shape. Comments/heartbeats may be sent to keep proxies from closing idle connections.

## Frontend behavior

- Mock mode simulates the stream and prepends events without polling.
- Live mode attempts `/v1/admin/events/stream` first.
- If the stream cannot be established or closes with an error, the admin page silently falls back to polling the existing `GET /v1/admin/events` snapshot endpoint every 15 seconds.
- Authentication failures still expire the admin SIWE session and prompt re-authentication.

## Rationale

Server-Sent Events keep the transport HTTP-only and one-way, which fits the admin feed while avoiding unnecessary empty polling requests and reducing event visibility latency.
