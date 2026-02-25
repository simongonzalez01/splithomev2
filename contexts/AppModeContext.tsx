'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type AppMode = 'home' | 'personal' | 'business'

interface AppModeContextType {
  mode: AppMode
  setMode: (mode: AppMode) => void
}

const AppModeContext = createContext<AppModeContextType>({
  mode: 'home',
  setMode: () => {},
})

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('home')

  useEffect(() => {
    const saved = localStorage.getItem('splitHome_appMode') as AppMode | null
    if (saved && ['home', 'personal', 'business'].includes(saved)) {
      setModeState(saved)
    }
  }, [])

  const setMode = (newMode: AppMode) => {
    setModeState(newMode)
    localStorage.setItem('splitHome_appMode', newMode)
  }

  return (
    <AppModeContext.Provider value={{ mode, setMode }}>
      {children}
    </AppModeContext.Provider>
  )
}

export const useAppMode = () => useContext(AppModeContext)
