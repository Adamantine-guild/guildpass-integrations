import { ed25519 } from '@noble/curves/ed25519'
import { ApiError } from './errors'
import type { SignatureEnvelope, SignedResponse, VerificationMode } from './types'

export class VerifyError extends ApiError {
  constructor(message: string, cause?: unknown) {
    super({
      code: 'validation_error',
      safeMessage: message,
      retryable: false,
      cause,
    })
    this.name = 'VerifyError'
  }
}

function isSignedResponse(obj: unknown): obj is SignedResponse<unknown> {
  if (typeof obj !== 'object' || obj === null) return false
  const maybe = obj as Record<string, unknown>
  return (
    'data' in maybe &&
    'signature' in maybe &&
    typeof maybe.signature === 'object' &&
    maybe.signature !== null &&
    typeof (maybe.signature as Record<string, unknown>).payload === 'string' &&
    typeof (maybe.signature as Record<string, unknown>).value === 'string'
  )
}

function keySort(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(keySort)
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort()
    const result: Record<string, unknown> = {}
    for (const k of keys) {
      result[k] = keySort((obj as Record<string, unknown>)[k])
    }
    return result
  }
  return obj
}

export function canonicalize(obj: unknown): string {
  return JSON.stringify(keySort(obj))
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return globalThis.btoa(bin)
}

export function signPayload(payload: string, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(new TextEncoder().encode(payload), privateKey)
}

export function verifySignature(
  payload: string,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, new TextEncoder().encode(payload), publicKey)
  } catch {
    return false
  }
}

export function verifySignedResponseRaw(
  raw: unknown,
  publicKey: Uint8Array,
  mode: VerificationMode,
): unknown {
  if (!isSignedResponse(raw)) {
    if (mode === 'enforce') {
      throw new VerifyError('Response is not a valid signed envelope. Refusing to process.')
    }
    if (mode === 'warn') {
      console.warn(
        '[guildpass-verify] Response is not a signed envelope; processing without verification.',
      )
    }
    return raw
  }

  const signed = raw as SignedResponse<unknown>
  const { payload, value, algorithm } = signed.signature

  if (algorithm !== 'ed25519') {
    if (mode === 'enforce') {
      throw new VerifyError(
        `Unsupported signing algorithm "${algorithm}". Expected "ed25519".`,
      )
    }
    if (mode === 'warn') {
      console.warn(`[guildpass-verify] Unknown algorithm "${algorithm}"; processing without verification.`)
    }
    return signed.data
  }

  let signatureBytes: Uint8Array
  try {
    signatureBytes = base64ToBytes(value)
  } catch {
    if (mode === 'enforce') {
      throw new VerifyError('Signature value is not valid base64.')
    }
    if (mode === 'warn') {
      console.warn('[guildpass-verify] Signature is not valid base64; processing without verification.')
    }
    return signed.data
  }

  const valid = verifySignature(payload, signatureBytes, publicKey)

  if (!valid) {
    if (mode === 'enforce') {
      throw new VerifyError(
        'Signature verification failed. The response may have been tampered with.',
      )
    }
    if (mode === 'warn') {
      console.warn(
        '[guildpass-verify] Signature verification FAILED. The response may have been tampered with.',
      )
    }
    return signed.data
  }

  const parsedPayload = JSON.parse(payload)
  const bodyInPayload = parsedPayload.body
  const recomputedBodyCanonical = canonicalize(signed.data)
  const expectedBodyCanonical = canonicalize(bodyInPayload)

  if (recomputedBodyCanonical !== expectedBodyCanonical) {
    if (mode === 'enforce') {
      throw new VerifyError(
        'Response body does not match signed payload. The data may have been tampered with.',
      )
    }
    if (mode === 'warn') {
      console.warn(
        '[guildpass-verify] Response body does not match signed payload. The data may have been tampered with.',
      )
    }
  }

  return signed.data
}

export function verifySignedResponse<T>(
  raw: unknown,
  publicKey: Uint8Array,
  mode: VerificationMode,
): T {
  const result = verifySignedResponseRaw(raw, publicKey, mode)
  return result as T
}

export function wrapInSignedEnvelope<T>(
  data: T,
  path: string,
  privateKey: Uint8Array,
): SignedResponse<T> {
  const payload = canonicalize({
    path,
    timestamp: new Date().toISOString(),
    body: data,
  })
  const signatureBytes = signPayload(payload, privateKey)
  const value = bytesToBase64(signatureBytes)

  return {
    data,
    signature: {
      payload,
      value,
      algorithm: 'ed25519',
      key_id: 'mock-dev',
    },
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  ⚠️  MOCK KEY — DO NOT USE IN PRODUCTION            ║
 * ║  This keypair is hardcoded for local development    ║
 * ║  and testing only. Production deployments must      ║
 * ║  fetch the public key from the backend's            ║
 * ║  /.well-known/signing-key.json endpoint.             ║
 * ╚══════════════════════════════════════════════════════╝
 */
export const MOCK_PRIVATE_KEY: Uint8Array = hexToBytes(
  '1080d5330a3f70ad6f76085ca1ec13b99649c0086ce701d02322b419980f6960',
)
export const MOCK_PUBLIC_KEY: Uint8Array = hexToBytes(
  'b06f421c96c7a343f1b9d1ffff7f8520f81b2109d89d9854de6e9692d74d8363',
)
