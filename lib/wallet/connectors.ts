/**
 * lib/wallet/connectors.ts
 *
 * Parsing and validation for NEXT_PUBLIC_WALLET_CONNECTORS, kept free of
 * wagmi imports so it can be unit tested. lib/wallet/config.ts maps the
 * validated names to actual wagmi connector factories.
 *
 * To add support for a new connector (e.g. walletConnect):
 *   1. Add its name to SUPPORTED_CONNECTOR_NAMES below.
 *   2. Handle it in buildConnectors() in lib/wallet/config.ts.
 *   3. Document it in README.md ("Wallet connectors") and .env.example.
 */

export {
  CONNECTOR_DOCS_URL,
  SUPPORTED_CONNECTOR_NAMES,
  parseConnectorNames,
  unsupportedConnectorMessage,
} from './validation.js'
export type { WalletConnectorName } from './validation.js'
