// lib/config.ts validates env at module-import time and throws in live mode
// without NEXT_PUBLIC_CORE_API_URL. Test files that (transitively) import it
// must import this module FIRST so the process defaults to mock mode.
if (!process.env.NEXT_PUBLIC_MOCK_MODE && !process.env.NEXT_PUBLIC_CORE_API_URL) {
  process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
}

import Module from 'module'
import path from 'path'

const originalResolve = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any,
) {
  if (request.startsWith('@/')) {
    const relativePath = request.slice(2)
    const resolvedPath = path.resolve(__dirname, '..', relativePath)
    return originalResolve.call(this, resolvedPath, parent, isMain, options)
  }
  if (request === 'next/navigation') {
    try {
      return originalResolve.call(this, request, parent, isMain, options)
    } catch {
      return {
        useParams: () => ({ communitySlug: 'guildpass-demo' }),
        useRouter: () => ({ push: () => {}, replace: () => {} }),
        usePathname: () => '/admin',
        useSearchParams: () => new URLSearchParams(),
      }
    }
  }
  return originalResolve.call(this, request, parent, isMain, options)
}

// Pre-register require cache entry for next/navigation if missing/failing
try {
  require('next/navigation')
} catch {
  const dummyPath = path.resolve(__dirname, '../node_modules/next/navigation.js')
  require.cache[dummyPath] = {
    id: dummyPath,
    filename: dummyPath,
    loaded: true,
    exports: {
      useParams: () => ({ communitySlug: 'guildpass-demo' }),
      useRouter: () => ({ push: () => {}, replace: () => {} }),
      usePathname: () => '/admin',
      useSearchParams: () => new URLSearchParams(),
    },
  } as any
}
