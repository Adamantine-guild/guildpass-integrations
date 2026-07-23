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
  return originalResolve.call(this, request, parent, isMain, options)
}
