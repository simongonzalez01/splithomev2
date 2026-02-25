'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home, Wallet, Store, ChevronDown } from 'lucide-react'
import { useAppMode, type AppMode } from '@/contexts/AppModeContext'

const MODES = [
  {
    value: 'home' as AppMode,
    label: 'Hogar',
    Icon: Home,
    href: '/',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    ringColor: 'ring-blue-200',
    dot: 'bg-blue-600',
  },
  {
    value: 'personal' as AppMode,
    label: 'Personal',
    Icon: Wallet,
    href: '/personal',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    ringColor: 'ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  {
    value: 'business' as AppMode,
    label: 'Negocios',
    Icon: Store,
    href: '/business',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    ringColor: 'ring-orange-200',
    dot: 'bg-orange-500',
  },
]

export default function ModeSwitch() {
  const { mode, setMode } = useAppMode()
  const [open, setOpen]   = useState(false)
  const router            = useRouter()

  const current = MODES.find(m => m.value === mode) ?? MODES[0]
  const CurIcon = current.Icon

  const handleSelect = (m: typeof MODES[0]) => {
    if ((m as { disabled?: boolean }).disabled) return
    setMode(m.value)
    setOpen(false)
    router.push(m.href)
  }

  return (
    <div className="relative">
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Botón principal — muestra el modo activo */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold
          border transition-all active:scale-95 select-none
          ${current.bg} ${current.color} border-current/10`}
      >
        <CurIcon size={13} strokeWidth={2.3} />
        {current.label}
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown con los otros modos */}
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 w-44">
          {MODES.map(m => {
            const Icon     = m.Icon
            const isActive = m.value === mode
            return (
              <button
                key={m.value}
                onClick={() => handleSelect(m)}
                        className={`
                  w-full flex items-center gap-3 px-4 py-3 text-sm font-medium
                  transition-colors text-left
                  ${isActive ? `${m.bg} ${m.color} font-semibold` : 'text-gray-700 hover:bg-gray-50'}
                  active:scale-[0.97]
                `}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className={isActive ? m.color : 'text-gray-400'}
                />
                <span className="flex-1">{m.label}</span>
                {isActive && !(m as { disabled?: boolean }).disabled && (
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
