/**
 * Test suite for `lib/wallet/config.ts` — see issue #134.
 *
 * `lib/wallet/config.ts` builds a wagmi chain/transport/connector bundle from
 * NEXT_PUBLIC_WALLET_CHAINS, NEXT_PUBLIC_WALLET_RPC_*, and
 * NEXT_PUBLIC_WALLET_CONNECTORS. Validation rules (per README) are:
 *
 *   1. NEXT_PUBLIC_WALLET_CHAINS — invalid chain name → ConfigError
 *   2. NEXT_PUBLIC_WALLET_CHAINS — empty chain list → ConfigError
 *   3. NEXT_PUBLIC_WALLET_CONNECTORS — unsupported connector → ConfigError
 *   4. NEXT_PUBLIC_WALLET_RPC_<CHAIN> — malformed RPC URL → ConfigError
 *
 *   + Default fallback: with no env vars set, in mock mode the bundle resolves
 *     to { mainnet, base, sepolia } with one `injected` connector.
 *
 * Because `walletConfig` is built at module-import time, each test must clear
 * the require cache for `lib/config.ts` and `lib/wallet/config.ts` after
 * mutating process.env so the next require re-runs `buildWalletConfig()`.
 *
 * NOTE: We deliberately avoid the static `import` of `lib/wallet/config` to
 * sidestep an unrelated `ox` (viem dep) typecheck error that propagates through
 * the test tsconfig. Dynamic `require` works because the file is already
 * compiled to JS by `tsc -p test/tsconfig.json` regardless of static
 * resolution.
 */
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
// IMPORTANT: configure env *before* importing `lib/config.ts`. We override
// `setup-env.ts` here (instead of importing it) so the first `lib/config.ts`
// load — triggered by the static `ConfigError` import below — happens in
// live mode with a placeholder core API URL. This gives us a single frozen
// `appConfig` instance for the entire suite whose `apiMode === 'live'`,
// which is required for `buildWalletConfig` to propagate ConfigErrors
// instead of falling back to the documented mock-mode defaults.
if (!process.env.NEXT_PUBLIC_CORE_API_URL) {
  process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
}
delete process.env.NEXT_PUBLIC_MOCK_MODE
import './setup-alias'

// Static import of `ConfigError` is safe because lib/config.ts has no `ox`
// transitive dependency.
import { ConfigError } from '../lib/config'

// Static type import only (erased at runtime) — keeps the test file
// self-documenting without forcing tsc to walk the `ox` graph.
import type { WalletRuntimeConfig } from '../lib/wallet/config'

function clearWalletConfigCache(): void {
  // We deliberately do NOT clear `lib/config.ts` from the require cache: the
  // `ConfigError` class loaded statically by this test file would diverge
  // from the one thrown by `lib/wallet/config.ts` on a re-load (Node creates
  // a fresh class object per module instance), breaking `instanceof` checks.
  // Instead, we mutate `process.env` *before* requiring `lib/wallet/config`
  // and let it import the same cached `lib/config.ts` instance the test uses.
  delete require.cache[require.resolve('../lib/wallet/config')]
}

function setEnv(overrides: Record<string, string | undefined>): void {
  // Reset every NEXT_PUBLIC_WALLET_* we touch so leftovers can't leak.
  const walletKeys = [
    'NEXT_PUBLIC_WALLET_CHAINS',
    'NEXT_PUBLIC_WALLET_CONNECTORS',
    'NEXT_PUBLIC_WALLET_RPC_MAINNET',
    'NEXT_PUBLIC_WALLET_RPC_BASE',
    'NEXT_PUBLIC_WALLET_RPC_SEPOLIA',
  ]
  for (const key of walletKeys) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

/**
 * Force live API mode for the next config rebuild.
 *
 * `buildWalletConfig` in `lib/wallet/config.ts` catches every config error
 * and returns the documented default (mainnet + base + sepolia, single
 * `injected` connector) when `apiMode === 'mock'`. That fallback exists so the
 * app keeps running in offline demos, but it also swallows exactly the
 * ConfigErrors we want to test. Switching to live mode — with a placeholder
 * core API URL — makes the validation failures propagate, which is the
 * behaviour a real production deployment would see.
 */
function useLiveApiMode(): void {
  delete process.env.NEXT_PUBLIC_MOCK_MODE
  process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
}

function loadWalletConfig(): WalletRuntimeConfig {
  clearWalletConfigCache()
  return require('../lib/wallet/config').walletConfig as WalletRuntimeConfig
}

/**
 * Run a function and assert that it throws a `ConfigError` whose message
 * matches the given pattern or substring. Clears the `lib/wallet/config`
 * cache before the call so the env mutation from `setEnv` is observed by
 * `buildWalletConfig` on the next import.
 */
function expectConfigError(load: () => unknown, matcher: RegExp | string): void {
  assert.throws(load, (err: Error) => {
    assert.equal(err.name, 'ConfigError')
    assert.ok(err instanceof ConfigError)
    if (matcher instanceof RegExp) {
      assert.match(err.message, matcher)
    } else {
      assert.ok(err.message.includes(matcher))
    }
    return true
  })
}

beforeEach(() => {
  // Restore live mode (set at module import time) and drop every wallet env
  // var before each case so leftover state cannot leak across tests.
  process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
  delete process.env.NEXT_PUBLIC_MOCK_MODE
  setEnv({})
})

// ── Failure mode #1: invalid chain name ──────────────────────────────────────
describe('NEXT_PUBLIC_WALLET_CHAINS — invalid chain name', () => {
  test('rejects an unsupported chain name with a ConfigError naming the value', () => {
    setEnv({ NEXT_PUBLIC_WALLET_CHAINS: 'mainnet,ethereum' })
    expectConfigError(
      () => loadWalletConfig(),
      /NEXT_PUBLIC_WALLET_CHAINS contains unsupported chain "ethereum"/,
    )
  })

  test('error message lists every supported chain name', () => {
    setEnv({ NEXT_PUBLIC_WALLET_CHAINS: 'optimism' })
    try {
      loadWalletConfig()
      assert.fail('expected a ConfigError')
    } catch (err) {
      const message = (err as Error).message
      assert.match(message, /Supported values: mainnet, base, sepolia/)
    }
  })
})

// ── Failure mode #2: empty chain list ─────────────────────────────────────────
//
// `splitCsv` filters out empty / whitespace-only CSV fragments and falls back
// to `DEFAULT_CHAIN_NAMES` when the result is empty, so a user-supplied value
// of ` , , ` is observationally identical to "unset". The empty-list guard
// in `parseChains` is therefore unreachable from the public surface. The
// meaningful empty-input case is "no value provided at all" which falls back
// to the documented defaults — covered by the "default fallback" suite below.
describe('NEXT_PUBLIC_WALLET_CHAINS — empty chain list', () => {
  test('a whitespace-only CSV is treated the same as an unset value', () => {
    setEnv({ NEXT_PUBLIC_WALLET_CHAINS: ' , , ' })
    // No throw — should fall back to the documented default.
    const config = loadWalletConfig()
    assert.equal(config.chains.length, 3)
  })
})

// ── Failure mode #3: unsupported connector ───────────────────────────────────
describe('NEXT_PUBLIC_WALLET_CONNECTORS — unsupported connector', () => {
  test('rejects an unsupported connector name with a ConfigError', () => {
    setEnv({ NEXT_PUBLIC_WALLET_CONNECTORS: 'walletconnect' })
    expectConfigError(
      () => loadWalletConfig(),
      /NEXT_PUBLIC_WALLET_CONNECTORS contains unsupported connector "walletconnect"/,
    )
  })

  test('rejects even a single bad value in an otherwise-valid list', () => {
    setEnv({ NEXT_PUBLIC_WALLET_CONNECTORS: 'injected,coinbase' })
    expectConfigError(
      () => loadWalletConfig(),
      /unsupported connector "coinbase"/,
    )
  })
})

// ── Failure mode #4: malformed RPC URL ───────────────────────────────────────
describe('NEXT_PUBLIC_WALLET_RPC_<CHAIN> — malformed RPC URL', () => {
  test('rejects an RPC value that is not a URL', () => {
    setEnv({
      NEXT_PUBLIC_WALLET_CHAINS: 'mainnet',
      NEXT_PUBLIC_WALLET_RPC_MAINNET: 'not-a-url',
    })
    expectConfigError(
      () => loadWalletConfig(),
      /NEXT_PUBLIC_WALLET_RPC_MAINNET must be a valid absolute RPC URL, got "not-a-url"/,
    )
  })

  test('rejects an RPC value with a non-http(s) protocol', () => {
    setEnv({
      NEXT_PUBLIC_WALLET_CHAINS: 'base',
      NEXT_PUBLIC_WALLET_RPC_BASE: 'ftp://example.com',
    })
    expectConfigError(
      () => loadWalletConfig(),
      /NEXT_PUBLIC_WALLET_RPC_BASE must use http:\/\/ or https:\/\//,
    )
  })

  test('accepts a well-formed https URL for the configured chain', () => {
    setEnv({
      NEXT_PUBLIC_WALLET_CHAINS: 'sepolia',
      NEXT_PUBLIC_WALLET_RPC_SEPOLIA: 'https://sepolia.example.io/rpc',
    })
    const config = loadWalletConfig()
    assert.equal(config.chains.length, 1)
    // sepolia chain id is 11155111
    assert.equal(config.chains[0].id, 11155111)
  })
})

// ── Default fallback: documented mock-mode defaults ─────────────────────────
describe('default fallback (no wallet env vars set)', () => {
  test('resolves to mainnet, base, sepolia when NEXT_PUBLIC_WALLET_CHAINS is unset', () => {
    setEnv({}) // unset everything
    const config = loadWalletConfig()
    assert.equal(config.chains.length, 3)
    // mainnet=1, base=8453, sepolia=11155111
    assert.equal(config.chains[0].id, 1)
    assert.equal(config.chains[1].id, 8453)
    assert.equal(config.chains[2].id, 11155111)
  })

  test('falls back to a single "injected" connector when NEXT_PUBLIC_WALLET_CONNECTORS is unset', () => {
    setEnv({})
    const config = loadWalletConfig()
    assert.deepEqual(config.connectorNames, ['injected'])
    assert.equal(config.connectors.length, 1)
  })

  test('builds a transport for every chain even when no RPC URLs are set', () => {
    setEnv({})
    const config = loadWalletConfig()
    for (const chain of config.chains) {
      assert.ok(
        config.transports[chain.id],
        `transport missing for chain id ${chain.id}`,
      )
    }
  })
})

// ── Env cleanup guard ───────────────────────────────────────────────────────
describe('env var cleanup between cases', () => {
  test('NEXT_PUBLIC_WALLET_CHAINS set in one case does not leak into the next', () => {
    // Set a value, load once (we don't care about the outcome — it must not
    // leave a polluted module state for the next test).
    setEnv({ NEXT_PUBLIC_WALLET_CHAINS: 'mainnet' })
    loadWalletConfig()

    // Now reset and confirm the next load returns to the default.
    setEnv({})
    const config = loadWalletConfig()
    assert.equal(config.chains.length, 3)
  })

  test('NEXT_PUBLIC_WALLET_RPC_MAINNET set in one case does not leak into the next', () => {
    setEnv({
      NEXT_PUBLIC_WALLET_CHAINS: 'mainnet',
      NEXT_PUBLIC_WALLET_RPC_MAINNET: 'https://custom.example.com',
    })
    loadWalletConfig()

    setEnv({})
    const config = loadWalletConfig()
    // After reset, mainnet is still present (it is part of the documented
    // default) and a transport is built for it.
    assert.equal(config.chains[0].id, 1)
    assert.ok(config.transports[1])
  })
})
