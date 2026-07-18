// lib/config.ts validates env at module-import time and throws in live mode
// without NEXT_PUBLIC_CORE_API_URL. Test files that (transitively) import it
// must import this module FIRST so the process defaults to mock mode.
if (!process.env.NEXT_PUBLIC_MOCK_MODE && !process.env.NEXT_PUBLIC_CORE_API_URL) {
  process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
}
