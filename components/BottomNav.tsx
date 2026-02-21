'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/',         label: 'Home',    icon: '🏠' },
  { href: '/expenses', label: 'Gastos',  icon: '💸' },
  { href: '/fixed',    label: 'Fijos',   icon: '📌' },
  { href: '/shopping', label: 'Lista',   icon: '🛒' },
  { href: '/events',   label: 'Eventos', icon: '📅' },
  { href: '/profile',  label: 'Perfil',  icon: '👤' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch">
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 min-h-[54px] transition-colors ${
                active ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />
              )}
              <span className="text-[19px] leading-none">{item.icon}</span>
              <span className={`text-[10px] mt-0.5 font-semibold tracking-tight ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
