'use client'

/**
 * SwRegistrar
 *
 * Invisible component whose only job is to register the service worker once
 * the root layout has mounted in the browser. Kept as a separate component so
 * the server-rendered layout tree does not need to become a client component.
 */

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/offline/register-sw'

export function SwRegistrar() {
  useEffect(() => {
    registerServiceWorker()
  }, [])

  return null
}
