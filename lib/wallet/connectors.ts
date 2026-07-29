/**
 * lib/wallet/connectors.ts
 *
 * Re-exports from the compiled validation layer (validation.js).
 * TypeScript types are resolved via validation.d.ts.
 *
 * To add support for a new connector (e.g. walletConnect):
 *   1. Add its name to SUPPORTED_CONNECTOR_NAMES in validation.js and validation.d.ts.
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