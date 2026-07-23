import * as React from 'react'
import {
  formatAddress,
  isWalletAddress,
  normalizeAddress,
  type FormatAddressOptions,
} from '../../lib/wallet/address'

export type AddressTextProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  address?: string | null
  options?: FormatAddressOptions
  label?: string
  announceInvalid?: boolean
  showFullAddressTitle?: boolean
}

function joinClassNames(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function AddressText({
  address,
  options,
  className,
  label = 'Wallet address',
  announceInvalid = true,
  showFullAddressTitle = true,
  title,
  'aria-label': ariaLabel,
  ...props
}: AddressTextProps) {
  const rawAddress = normalizeAddress(address)
  const displayAddress = formatAddress(rawAddress, options)
  const validAddress = isWalletAddress(rawAddress)
  const fullTitle = title ?? (showFullAddressTitle && rawAddress ? rawAddress : undefined)
  const accessibleLabel =
    ariaLabel ??
    (rawAddress
      ? `${label}: ${rawAddress}${!validAddress && announceInvalid ? ' (unverified format)' : ''}`
      : `${label} unavailable`)

  return (
    <span
      {...props}
      className={joinClassNames('font-mono tabular-nums', className)}
      title={fullTitle}
      aria-label={accessibleLabel}
      data-address={rawAddress || undefined}
    >
      {displayAddress}
    </span>
  )
}
