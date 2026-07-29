import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'

const repoRoot = path.resolve(__dirname, '..', '..')
const scriptPath = path.join(repoRoot, 'scripts/check-env.js')

function runCheckEnv(contents: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'guildpass-check-env-'))
  const envFile = path.join(dir, '.env.local')
  writeFileSync(envFile, contents)

  try {
    return spawnSync(process.execPath, [scriptPath, '--file', envFile], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
      },
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('scripts/check-env.js', () => {
  test('passes against a valid .env.local', () => {
    const result = runCheckEnv(`
NEXT_PUBLIC_MOCK_MODE=true
NEXT_PUBLIC_CORE_API_URL=http://localhost:4000
NEXT_PUBLIC_SIWE_STATEMENT="Sign in to GuildPass Admin"
NEXT_PUBLIC_WALLET_CHAINS=mainnet,base,sepolia
NEXT_PUBLIC_WALLET_CONNECTORS=injected
NEXT_PUBLIC_WALLET_RPC_MAINNET=https://mainnet.example.test/rpc
`)

    assert.equal(result.status, 0)
    assert.match(result.stdout, /OK\s+NEXT_PUBLIC_CORE_API_URL\s+valid URL/)
    assert.match(result.stdout, /OK\s+NEXT_PUBLIC_WALLET_CHAINS\s+mainnet, base, sepolia/)
    assert.match(result.stdout, /Environment check passed\./)
  })

  test('flags app ConfigError cases with non-zero exit', () => {
    const result = runCheckEnv(`
NEXT_PUBLIC_MOCK_MODE=false
NEXT_PUBLIC_CORE_API_URL=not-a-url
NEXT_PUBLIC_SIWE_STATEMENT="Line one\\nLine two"
NEXT_PUBLIC_WALLET_CHAINS=mainnet
NEXT_PUBLIC_WALLET_CONNECTORS=injected
`)

    assert.notEqual(result.status, 0)
    assert.match(result.stdout, /FAIL\s+NEXT_PUBLIC_CORE_API_URL\s+NEXT_PUBLIC_CORE_API_URL must be a valid URL/)
    assert.match(result.stdout, /FAIL\s+NEXT_PUBLIC_SIWE_STATEMENT\s+NEXT_PUBLIC_SIWE_STATEMENT must be a single line/)
    assert.match(result.stdout, /Environment check failed\./)
  })

  test('flags wallet ConfigError cases with non-zero exit', () => {
    const result = runCheckEnv(`
NEXT_PUBLIC_MOCK_MODE=true
NEXT_PUBLIC_WALLET_CHAINS=mainnet,optimism
NEXT_PUBLIC_WALLET_CONNECTORS=walletconnect
NEXT_PUBLIC_WALLET_RPC_MAINNET=ftp://mainnet.example.test/rpc
`)

    assert.notEqual(result.status, 0)
    assert.match(result.stdout, /FAIL\s+NEXT_PUBLIC_WALLET_CHAINS\s+NEXT_PUBLIC_WALLET_CHAINS contains unsupported chain "optimism"/)
    assert.match(result.stdout, /FAIL\s+NEXT_PUBLIC_WALLET_CONNECTORS\s+NEXT_PUBLIC_WALLET_CONNECTORS contains unsupported connector "walletconnect"/)
  })

  test('flags malformed RPC URLs for enabled wallet chains', () => {
    const result = runCheckEnv(`
NEXT_PUBLIC_MOCK_MODE=true
NEXT_PUBLIC_WALLET_CHAINS=mainnet
NEXT_PUBLIC_WALLET_CONNECTORS=injected
NEXT_PUBLIC_WALLET_RPC_MAINNET=ftp://mainnet.example.test/rpc
`)

    assert.notEqual(result.status, 0)
    assert.match(result.stdout, /FAIL\s+NEXT_PUBLIC_WALLET_RPC_MAINNET\s+NEXT_PUBLIC_WALLET_RPC_MAINNET must use http:\/\/ or https:\/\//)
  })
})
