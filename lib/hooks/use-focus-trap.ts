/**
 * Focus Trap Hook
 *
 * Traps Tab/Shift+Tab keyboard focus within a container element.
 * Restores focus to the previously active element when the trap is
 * torn down.  Designed for modal dialogs, popovers, and side panels.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null)
 *   useFocusTrap(ref, { isActive: open })
 *   return <div ref={ref}>…</div>
 */

import { useEffect, useRef } from 'react'

interface UseFocusTrapOptions {
  /** Whether the trap is currently active. Default true. */
  isActive?: boolean
  /**
   * Called when the Escape key is pressed while the trap is active.
   * If omitted, Escape is ignored (no default behaviour).
   */
  onEscape?: () => void
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'area[href]',
  'summary',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  return Array.from(elements).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === container,
  )
}

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  { isActive = true, onEscape }: UseFocusTrapOptions = {},
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    // Store the currently focused element so we can restore it later
    previousFocusRef.current = document.activeElement as HTMLElement | null

    // Move focus into the container
    const focusable = getFocusableElements(container)
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      // If nothing is focusable, focus the container itself
      container.setAttribute('tabindex', '-1')
      container.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation()
        onEscape()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // Also catch focusout events as a Safari safety net — Safari sometimes
    // processes Tab internally before our keydown handler can intercept it,
    // so focus can escape the container.  The focusout handler redirects
    // focus back to the first focusable element.
    function handleFocusOut(e: FocusEvent) {
      // Only intercept if the trap is still mounted and the new target
      // is outside the container.
      if (
        !container.contains(e.relatedTarget as Node) &&
        !container.contains(e.target as Node)
      ) {
        const focusable = getFocusableElements(container)
        if (focusable.length > 0) {
          focusable[0].focus()
        }
      }
    }
    container.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      container.removeEventListener('focusout', handleFocusOut)

      // Restore focus to the element that had it before the trap opened
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isActive, onEscape, containerRef])
}