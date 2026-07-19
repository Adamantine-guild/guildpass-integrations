/**
 * lib/offline/register-sw.ts
 *
 * Service worker registration — called once from the root client layout.
 * Only runs in browsers that support service workers and only in production
 * builds (or when explicitly opted-in via NEXT_PUBLIC_SW_DEV=true) to avoid
 * confusing cache behaviour during hot-module-reload development.
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  const isDev = process.env.NODE_ENV === 'development'
  const forceInDev = process.env.NEXT_PUBLIC_SW_DEV === 'true'

  if (isDev && !forceInDev) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // SW registration failure is non-fatal — the app works online-only.
        console.warn('[GuildPass SW] Registration failed:', err)
      })
  })
}
