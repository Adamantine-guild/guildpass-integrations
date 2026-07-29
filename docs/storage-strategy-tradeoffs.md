# Storage Strategy Tradeoffs: sessionStorage vs localStorage for SIWE Auth

## Context

The application currently uses `sessionStorage` to persist the SIWE (Sign-In with Ethereum) auth session. The primary reason for choosing `sessionStorage` is security: it is strictly scoped to a single tab and is automatically cleared when the tab or browser is closed. This reduces the risk of privileged admin sessions lingering on shared devices.

However, a strict `sessionStorage` approach creates UX friction:
1. Opening a link in a new tab often results in an unauthenticated state (since `sessionStorage` is not shared across new tabs, though it is copied when duplicating a tab).
2. Logging out in one tab does not automatically clear the session in other open tabs that might have inherited the `sessionStorage` (e.g., duplicated tabs). 

## Implemented Solution: BroadcastChannel alongside sessionStorage

To address the cross-tab logout requirement while preserving the security benefits of `sessionStorage`, we utilize a **`BroadcastChannel`** (named `guildpass:auth`).

### How it works
- **Sign-in / Refresh:** When a tab successfully authenticates or silently refreshes a token, it broadcasts the new session. Peer tabs receive this and update their local `sessionStorage` and React state.
- **Sign-out:** When an explicit logout occurs in any tab (or the token expires), it broadcasts a `signed-out` message. All peer tabs receive this, immediately clear their local `sessionStorage`, and revert to the unauthenticated state.

### Tradeoff Analysis

#### Approach A: `localStorage` + `storage` event listener
- **Pros:** 
  - Natural cross-tab synchronization out-of-the-box via the native `storage` event.
  - New tabs are immediately authenticated because `localStorage` is shared across the entire origin.
- **Cons:** 
  - **Security Risk:** `localStorage` persists across browser restarts. If a user forgets to log out on a public or shared computer, the highly privileged admin session remains active until the token naturally expires.
  - Requires additional mechanisms (like tracking a "session ID" in a cookie or `sessionStorage` and matching it) to mimic the browser-close clearing behavior.

#### Approach B (Chosen): `sessionStorage` + `BroadcastChannel`
- **Pros:** 
  - **Higher Security:** The session is fundamentally ephemeral. Closing the browser or tab guarantees the token is purged from memory and disk.
  - Fixes the stale admin session problem: `BroadcastChannel` effectively propagates the immediate logout to all active tabs.
- **Cons:** 
  - New tabs opened normally (not duplicated) start unauthenticated and will require the user to sign in again (unless they request the session from a peer tab, which could be an enhancement).
  - Slightly more complex client-side logic compared to native `storage` events.

## Conclusion

Given the sensitive nature of the admin functionalities within the GuildPass integrations, security (specifically, mitigating lingering sessions on shared machines) takes precedence over the convenience of persistent login states across fresh tabs. The combination of `sessionStorage` and `BroadcastChannel` strikes the best balance: it strictly scopes token lifetime to the tab/browser lifecycle while fixing the critical security gap of cross-tab logout invalidation.
