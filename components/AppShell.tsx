'use client'

import { Home } from 'lucide-react'
import { AppModeProvider, useAppMode } from '@/contexts/AppModeContext'
import BottomNav from '@/components/BottomNav'
import FAB from '@/components/FAB'
import ModeSwitch from '@/components/ModeSwitch'

function ShellInner({ children }: { children: React.ReactNode }) {
  const { mode } = useAppMode()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f6fa' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 h-12 flex items-center justify-between sticky top-0 z-40 shadow-[0_1px_0_0_#f0f0f0]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Home size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-gray-900 text-[15px] tracking-tight">SplitHome</span>
        </div>
        <ModeSwitch />
      </header>

      {/* Contenido principal */}
      <main className="pb-28">
        {children}
      </main>

      <BottomNav />
      {/* FAB solo en modo Hogar */}
      {mode === 'home' && <FAB />}
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppModeProvider>
      <ShellInner>{children}</ShellInner>
    </AppModeProvider>
  )
}
