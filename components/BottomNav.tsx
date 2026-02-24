'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Receipt, CalendarClock, ShoppingCart, Calendar, CircleUser, TrendingUp } from 'lucide-react'

const NAV = [
  { href: '/',         label: 'Inicio',    Icon: Home         },
  { href: '/expenses', label: 'Gastos',    Icon: Receipt      },
  { href: '/incomes',  label: 'Ingresos',  Icon: TrendingUp   },
  { href: '/fixed',    label: 'Fijos',     Icon: CalendarClock },
  { href: '/shopping', label: 'Lista',     Icon: ShoppingCart },
  { href: '/profile',  label: 'Perfil',    Icon: CircleUser   },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch max-w-screen-sm mx-auto">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center py-2 min-h-[58px]"
            >
              <div className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all ${
                active ? 'bg-blue-50' : ''
              }`}>
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.6}
                  className={active ? 'text-blue-600' : 'text-gray-400'}
                />
                <span className={`text-[10px] font-semibold leading-none ${
                  active ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {label}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
