import { config } from '@/lib/config';
import { OfflineError } from '@/lib/api/errors';

let _online: boolean = true;
const listeners: Array<(online: boolean) => void> = [];

/** Reactive flag for backend status */
export const backendOnline = {
  get: () => _online,
  set: (value: boolean) => {
    if (_online !== value) {
      _online = value;
      listeners.forEach((cb) => cb(_online));
    }
  },
  subscribe: (cb: (online: boolean) => void) => {
    listeners.push(cb);
    // Return unsubscribe function
    return () => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },
};

/**
 * Perform a lightweight health‑check against the core API. Throws {@link OfflineError}
 * if the backend is unreachable or returns a non‑OK status. Updates the
 * {@link backendOnline} flag accordingly.
 */
export async function ensureOnline(): Promise<void> {
  // Fast‑path: if we already think it's online, still verify in case of stale state.
  try {
    const res = await fetch(`${config.apiUrl}/healthz`, { method: 'GET' });
    if (res.ok) {
      backendOnline.set(true);
      return;
    }
  } catch {
    // ignore – handled below
  }
  backendOnline.set(false);
  throw new OfflineError();
}
