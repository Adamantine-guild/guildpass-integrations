export type FormatAddressOptions = {
  start?: number
  end?: number
  separator?: string
  fallback?: string
  invalidFallback?: string
  full?: boolean
}

const DEFAULT_START = 6
const DEFAULT_END = 4
const DEFAULT_SEPARATOR = '...'
const DEFAULT_FALLBACK = '-'
const WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/

export function isWalletAddress(address: unknown): address is string {
  return typeof address === 'string' && WALLET_ADDRESS_PATTERN.test(address.trim())
}

export function normalizeAddress(address: unknown): string {
  return typeof address === 'string' ? address.trim() : ''
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback
}

export function formatAddress(address: unknown, options: FormatAddressOptions = {}): string {
  const value = normalizeAddress(address)

  if (!value) {
    return options.fallback ?? DEFAULT_FALLBACK
  }

  if (!isWalletAddress(value)) {
    return options.invalidFallback ?? value
  }

  if (options.full) {
    return value
  }

  const start = positiveIntegerOrDefault(options.start, DEFAULT_START)
  const end = positiveIntegerOrDefault(options.end, DEFAULT_END)
  const separator = options.separator ?? DEFAULT_SEPARATOR

  if (value.length <= start + end) {
    return value
  }

  return `${value.slice(0, start)}${separator}${value.slice(-end)}`
}
