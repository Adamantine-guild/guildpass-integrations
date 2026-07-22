'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'guildpass-theme'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  mounted: boolean
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // The inline script in RootLayout applies the saved or system theme before
    // paint. Read that result after hydration to keep React state in sync.
    setThemeState(
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    )
    setMounted(true)
  }, [])

  const setTheme = useCallback((nextTheme: Theme) => {
    applyTheme(nextTheme)
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    setThemeState(nextTheme)
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, mounted }),
    [mounted, setTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
