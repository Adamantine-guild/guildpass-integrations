# Mock scenario presets

The `/developer` page can reset mock data and apply scenario presets from `lib/api/mock.ts`. Each preset calls `resetMockData()` first, so the default community, resources, policies, webhook events, and synthetic member store are restored before the selected member state is seeded.

Unless a caller passes a different address, every preset writes to `0x1234567890123456789012345678901234567890`.

## Default mock data shared by every preset

After reset, the active community is `guildpass-demo` with `free`, `standard`, and `pro` tiers. The resource catalogue includes:

| Resource | Minimum tier | Notes |
| --- | --- | --- |
| `alpha` / Alpha Docs | `standard` | Internal docs with text, callout, markdown, and link content. |
| `pro-reports` / Pro Reports | `pro` | Advanced report content with text, video, and file entries. |
| `mem-updates` / Member Updates | `free` | Community update surface. |
| `mod-lounge` policy | `standard` plus `moderator` role | Composable `and` rule demo. |
| `insider-hub` policy | `pro` or `Early Member` badge | Composable `or` rule demo. |

The reset also restores the seeded webhook event log and the synthetic member store used for large-list testing.

## Preset reference

| Preset | Membership | Roles | Profile badges | Resource or policy effect | Use when testing |
| --- | --- | --- | --- | --- | --- |
| Active Member | `standard`, `active: true` | `member` | `Early Member`, `Standard Tier` | Uses default policies unchanged. | Standard member access, happy-path gated content, and baseline profile UI. |
| Expired Member | `standard`, `active: false`, `expiresAt` one day in the past | `member` | `Former Member` | Uses default policies unchanged. | Renewal prompts, inactive-member warnings, and denied access caused by expired membership. |
| Denied Resource | `free`, `active: true` | `member` | `Free Tier` | Ensures the `alpha` policy requires `standard`. | Upgrade prompts and free-tier denial for Alpha Docs. |
| Admin Session Expired | `pro`, `active: true` | `admin`, `member` | `Admin`, `Pro Tier` | Uses default policies unchanged; combine with `NEXT_PUBLIC_MOCK_SESSION_STATE=expired` to exercise expired SIWE handling. | Admin screens, privileged navigation, and expired-token recovery flows. |
| No Roles | `free`, `active: true` | none (`[]`) | `New User` | Uses default policies unchanged. | Empty-role states, role assignment UI, and access checks that depend on explicit roles. |
| Multiple Communities | `standard`, `active: true` | `member` | `GuildPass Demo Community`, `Builders Collective`, `Design Guild` | Replaces the active community with `guildpass-hub` / `GuildPass Hub (Multi-Community)`. | Multi-community copy, hub-style membership summaries, and badge rendering. |
| Customized Profile | `standard`, `active: true` | `member` | `Early Member`, `Standard Tier` | Uses default policies unchanged. Seeds `bio`, `avatar`, and three `socialLinks` entries in addition to `displayName`/`badges`. | The public profile view and editor pre-fill (#254) against a fully-populated profile, as opposed to the sparse defaults every other preset seeds. |

## Adding a new scenario preset

1. Add the new literal to the `MockScenario` union in `lib/api/mock.ts`.
2. Add a `case` in `applyMockScenario()` after the existing presets.
3. Let `resetMockData()` run first unless the preset intentionally layers on top of another state.
4. Seed the target address with a full `memberStore[address]` entry containing `membership`, `roles`, and `profile`.
5. Update `community`, `resources`, or `policies` only when the scenario specifically needs those changes.
6. Keep display names and badges descriptive enough for screenshots and tests.
7. Add or update UI tests for the route that consumes the new preset.
8. Update this document and the `/developer` UI label so contributors can discover the new state.

## Verification checklist

Before opening a preset PR, confirm:

- The preset is selectable from `/developer` in mock mode.
- The seeded address, tier, activity flag, roles, badges, and policy/resource changes match this document.
- Resetting mock data clears the scenario-specific changes.
- The scenario does not require live API credentials, wallet signatures, or real backend state.