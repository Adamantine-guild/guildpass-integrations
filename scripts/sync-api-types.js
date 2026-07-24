const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../test/fixtures/openapi.json');
const TARGET_PATH = path.join(__dirname, '../lib/api/types.ts');

const STATIC_SUFFIX = `
export type WebhookEventStatus = 'success' | 'failed' | 'pending';

export type WebhookEventType = 
  | 'membership.created' 
  | 'membership.renewed' 
  | 'membership.expired' 
  | 'tier.upgraded' 
  | 'policy.updated';

export interface WebhookEventLog {
  id: string;
  eventType: WebhookEventType;
  status: WebhookEventStatus;
  timestamp: string;
  affectedIdentifier: string; // Wallet address or Resource ID
  payloadSummary: {
    network?: string;
    txHash?: string;
    tier?: string;
    reason?: string;
  };
}

export interface WalletVerification {
  verified: boolean
  method?: string
  checkedAt: string
}

export interface ApiErrorBody {
  code?: string
  error?: string
  message?: string
  details?: Record<string, unknown>
}

// ── Access Decision (cached per wallet + resource) ───────────────────────────

/**
 * Result of an access check for a specific resource.
 * This is the value stored in the route-level access cache.
 * Only safe display metadata is included — never sensitive tokens.
 */
export interface AccessDecision {
  /** Whether access is granted */
  allowed: boolean
  /** Human-readable reason for the decision (safe for display) */
  reason: string
  /** ISO timestamp of when the check was performed */
  checkedAt: string
}

// ── Client-side State Types ──────────────────────────────────────────────────

/**
 * Distinct states of the admin authentication session.
 *
 * - disconnected   — no wallet connected
 * - connected      — wallet connected, but SIWE sign-in not yet performed
 * - authenticating — SIWE signing flow is in-flight
 * - authenticated  — valid, non-expired session token is held
 * - expired        — a session was held but the token has since expired (or
 *                    the backend rejected it with 401); re-auth is required
 */
export type AdminSessionStatus =
  | 'disconnected'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'expired'

/**
 * Union of authenticated / unauthenticated states for the SIWE context.
 */
export type SiweAuthState =
  | SiweAuthSession
  | { isAuthenticated: false }

// ── Backend raw types (guildpass-core response shapes) ───────────────────────
// These are the shapes returned by /v1/* endpoints. The live API client maps
// them into the frontend types above. Fields are optional because backend
// versions may use snake_case or camelCase, and this mapping handles both.

export interface BackendMember {
  address?: string
  wallet_address?: string
  tier?: MembershipTier
  membership_tier?: MembershipTier
  active?: boolean
  is_active?: boolean
  expiresAt?: string
  expires_at?: string
  roles?: Role[]
  // Profile fields (returned by /v1/members/:address/profile)
  displayName?: string
  display_name?: string
  username?: string
  bio?: string
  badges?: string[]
}

export interface BackendResource {
  id: string
  title?: string
  name?: string
  description?: string
  minTier?: MembershipTier
  min_tier?: MembershipTier
  roles?: Role[]
  content?: ResourceContentBlock[]
}

export interface BackendPolicy {
  resourceId?: string
  resource_id?: string
  minTier?: MembershipTier
  min_tier?: MembershipTier
  roles?: Role[]
  rule?: AccessRule
}

export interface BackendSession {
  address?: string
  wallet_address?: string
  roles?: Role[]
  membership?: Partial<BackendMember>
  community?: {
    id: string
    name: string
    description?: string
    tiers?: MembershipTier[]
  }
}

// ── API Interface ─────────────────────────────────────────────────────────────

/**
 * Read-only member and resource queries.
 * No SIWE token is required for these operations.
 */
export interface MemberAccessApi {
  // ── Read-only (no auth token required) ──────────────────────────────────
  getSession(): Promise<Session>
  getCommunity(): Promise<Community>
  getMembership(address: string): Promise<Membership | null>
  verifyWallet(address: string): Promise<WalletVerification>
  getProfile(address: string): Promise<MemberProfile | null>
  listMembers(): Promise<MemberRow[]>
  listResources(): Promise<Resource[]>
  listPolicies(): Promise<AccessPolicy[]>
  getResource(id: string): Promise<Resource | null>
  getPolicy(resourceId: string): Promise<AccessPolicy | null>
  // NOTE: ownership/auth enforcement for this mutation is not yet decided
  // (tracked with the #254 profile-customization work) — placed here to
  // match the read-only getProfile() it pairs with, pending that decision.
  updateProfile(profile: MemberProfile): Promise<void>
}

/**
 * Authenticated admin queries and mutations.
 * These methods require a valid SIWE token context.
 */
export interface AdminAccessApi {
  // ── Admin queries & mutations (require a valid SIWE token context) ────────
  listWebhookEvents(): Promise<WebhookEventLog[]>
  assignRole(address: string, role: Role): Promise<void>
  removeRole(address: string, role: Role): Promise<void>
  updatePolicy(policy: AccessPolicy): Promise<void>
}

/**
 * SIWE authentication endpoints.
 */
export interface SiweAuthApi {
  // ── SIWE authentication endpoints ────────────────────────────────────────
  /** Fetch a one-time nonce for the given address to include in the SIWE message. */
  getNonce(address: string): Promise<string>
  /**
   * Submit a signed EIP-4361 message and receive an authenticated session
   * token. The backend verifies the signature and returns a short-lived token.
   */
  siweVerify(message: string, signature: string): Promise<SiweAuthSession>
  /** Invalidate the current server-side session (no-op for stateless JWTs). */
  siweLogout(token: string): Promise<void>
  verifyWallet(address: string): Promise<WalletVerification>
}

/**
 * Composed client-side API contract.
 *
 * Built from {@link MemberAccessApi}, {@link AdminAccessApi}, and
 * {@link SiweAuthApi} so each surface has a single, unambiguous responsibility
 * and implementations cannot drift between duplicated declarations.
 */
export type AccessApi = MemberAccessApi & AdminAccessApi & SiweAuthApi
`;

function getTsType(propSchema) {
  if (propSchema.$ref) {
    return propSchema.$ref.split('/').pop();
  }

  if (propSchema.enum) {
    return propSchema.enum
      .map((val) => (typeof val === 'string' ? `'${val}'` : val))
      .join(' | ');
  }

  if (propSchema.additionalProperties) {
    return 'Record<string, unknown>';
  }

  switch (propSchema.type) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'number':
      return 'number';
    case 'array':
      return `${getTsType(propSchema.items)}[]`;
    case 'object':
      if (propSchema.properties) {
        const props = Object.entries(propSchema.properties).map(([name, schema]) => {
          const isRequired =
            propSchema.required && propSchema.required.includes(name);
          return `${name}${isRequired ? '' : '?'}: ${getTsType(schema)}`;
        });
        return `{ ${props.join('; ')} }`;
      }
      return 'Record<string, unknown>';
    default:
      if (propSchema.type !== undefined) {
        throw new Error(`Unsupported OpenAPI schema type: ${propSchema.type}`);
      }
      return 'any';
  }
}

function getZodType(propSchema) {
  if (propSchema.$ref) {
    const refName = propSchema.$ref.split('/').pop();
    return `${refName}Schema`;
  }

  if (propSchema.enum) {
    if (propSchema.enum.length === 1 && propSchema.enum[0] === true) {
      return `z.literal(true)`;
    }
    const vals = propSchema.enum
      .map((val) => (typeof val === 'string' ? `'${val}'` : val))
      .join(', ');
    return `z.enum([${vals}])`;
  }

  if (propSchema.additionalProperties) {
    return 'z.record(z.unknown())';
  }

  switch (propSchema.type) {
    case 'string':
      return 'z.string()';
    case 'boolean':
      return 'z.boolean()';
    case 'integer':
    case 'number':
      return 'z.number()';
    case 'array':
      return `z.array(${getZodType(propSchema.items)})`;
    case 'object':
      if (propSchema.properties) {
        const props = Object.entries(propSchema.properties).map(([name, schema]) => {
          const isRequired =
            propSchema.required && propSchema.required.includes(name);
          const zType = getZodType(schema);
          return `${name}: ${zType}${isRequired ? '' : '.optional()'}`;
        });
        return `z.object({ ${props.join(', ')} })`;
      }
      return 'z.record(z.unknown())';
    default:
      return 'z.any()';
  }
}

// Schemas whose canonical definition lives in STATIC_SUFFIX rather than openapi.json.
const STATIC_SCHEMA_NAMES = new Set([
  'ApiErrorBody',
  'WalletVerification',
  'WebhookEventLog',
  'WebhookEventStatus',
  'WebhookEventType',
  'WebhookPayloadSummary',
]);

function generateTypes(schema) {
  if (!schema) {
    const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    schema = JSON.parse(rawSchema);
  }
  const schemasObj = schema.components.schemas;

  let output = `/**
 * This file was auto-generated from the OpenAPI schema.
 * DO NOT EDIT THIS FILE DIRECTLY.
 * To update these types, edit test/fixtures/openapi.json and run:
 *   npm run sync-types
 */

import { z } from 'zod';

`;

  for (const [schemaName, schemaVal] of Object.entries(schemasObj)) {
    if (!STATIC_SCHEMA_NAMES.has(schemaName)) {
      if (schemaVal.enum) {
        const enumVals = schemaVal.enum
          .map((v) => (typeof v === 'string' ? `'${v}'` : v))
          .join(' | ');
        output += `export type ${schemaName} = ${enumVals}\n\n`;
      } else if (schemaVal.oneOf) {
        const variants = schemaVal.oneOf.map((variant) => getTsType(variant));
        output += `export type ${schemaName} =\n  | ${variants.join('\n  | ')}\n\n`;
      } else if (schemaVal.type === 'object') {
        output += `export interface ${schemaName} {\n`;
        const props = schemaVal.properties || {};
        for (const [propName, propVal] of Object.entries(props)) {
          const isRequired =
            schemaVal.required && schemaVal.required.includes(propName);
          const tsType = getTsType(propVal);
          output += `  ${propName}${isRequired ? '' : '?'}: ${tsType}\n`;
        }
        output += `}\n\n`;
      }
    }

    if (schemaVal.enum) {
      if (schemaVal.enum.length === 1 && schemaVal.enum[0] === true) {
        output += `export const ${schemaName}Schema = z.literal(true)\n\n`;
      } else {
        const enumVals = schemaVal.enum
          .map((v) => (typeof v === 'string' ? `'${v}'` : v))
          .join(', ');
        output += `export const ${schemaName}Schema = z.enum([${enumVals}])\n\n`;
      }
    } else if (schemaVal.oneOf) {
      // z.lazy so union schemas may reference themselves recursively (e.g.
      // AccessRule's and/or variants contain nested AccessRule arrays).
      const variants = schemaVal.oneOf.map((variant) => getZodType(variant));
      output += `export const ${schemaName}Schema: z.ZodType<${schemaName}> = z.lazy(() =>\n  z.union([\n    ${variants.join(',\n    ')},\n  ]),\n)\n\n`;
    } else if (schemaVal.type === 'object') {
      output += `export const ${schemaName}Schema = z.object({\n`;
      const props = schemaVal.properties || {};
      for (const [propName, propVal] of Object.entries(props)) {
        const isRequired =
          schemaVal.required && schemaVal.required.includes(propName);
        const zType = getZodType(propVal);
        output += `  ${propName}: ${zType}${isRequired ? '' : '.optional()'},\n`;
      }
      output += `})\n\n`;
    }
  }

  output += STATIC_SUFFIX.trim() + '\n';
  return output;
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isWrite = args.includes('--write');

  if (!isCheck && !isWrite) {
    console.error('Usage: node scripts/sync-api-types.js [--write | --check]');
    process.exit(1);
  }

  const generated = generateTypes();

  if (isCheck) {
    if (!fs.existsSync(TARGET_PATH)) {
      console.error(`Error: Target file ${TARGET_PATH} does not exist.`);
      process.exit(1);
    }
    const current = fs.readFileSync(TARGET_PATH, 'utf8');
    const normGen = generated.replace(/\r\n/g, '\n').trim();
    const normCur = current.replace(/\r\n/g, '\n').trim();

    if (normGen !== normCur) {
      console.error('FAIL: Type drift detected! Frontend API types do not match openapi.json schemas.');
      console.error('Please run: npm run sync-types to update.');
      process.exit(1);
    }
    console.log('SUCCESS: Frontend API types are in sync with openapi.json.');
    process.exit(0);
  }

  if (isWrite) {
    fs.writeFileSync(TARGET_PATH, generated, 'utf8');
    console.log('SUCCESS: Generated frontend API types successfully written to lib/api/types.ts.');
    process.exit(0);
  }
}

module.exports = { getTsType, generateTypes };

if (require.main === module) {
  main();
}
