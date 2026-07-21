// test/setup-alias.ts — Register a CJS hook to resolve the `@/*` path alias
// (defined in tsconfig.json's `paths`) at runtime. Required by tests that
// transitively import modules using `@/lib/...` because Node has no native
// understanding of TypeScript's `paths` mapping.
//
// We resolve to the `test-dist/` build output (not the source `lib/`) so
// every `@/...` and relative require hits the same compiled module. This
// keeps class identity stable across `require.cache` lookups — e.g. the
// `ConfigError` class loaded statically by the test must be the same
// instance thrown by `lib/wallet/config.ts` for `instanceof` checks.
//
// IMPORTANT: This file lives at `test/setup-alias.ts` and is compiled to
// `test-dist/test/setup-alias.js`, so `__dirname` at runtime is
// `<repo>/test-dist/test/`. The actual `test-dist` directory is the *parent*
// of `__dirname`.
import Module from 'node:module'
import path from 'node:path'

const TEST_DIST = path.resolve(__dirname, '..')

const origResolve = (Module as unknown as { _resolveFilename: (req: string, ...args: unknown[]) => string })._resolveFilename

;(Module as unknown as { _resolveFilename: (req: string, ...args: unknown[]) => string })._resolveFilename = function (
  request: string,
  ...rest: unknown[]
) {
  if (request.startsWith('@/')) {
    const rel = request.slice(2)
    // Resolve `@/lib/...` to the test-dist build output. The `path.join` keeps
    // the result absolute so the CJS resolver will auto-append `.js`.
    const abs = path.join(TEST_DIST, rel)
    return origResolve.call(this, abs, ...rest)
  }
  return origResolve.call(this, request, ...rest)
}
