'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Receipt, CalendarClock, ShoppingCart, CircleUser, TrendingUp,
  LayoutDashboard, Wallet, ArrowLeftRight, Store, Bell,
} from 'lucide-react'
import { useAppMode } from '@/contexts/AppModeContext'

const HOME_NAV = [
  { href: '/',         label: 'Inicio',     Icon: Home          },
  { href: '/expenses', label: 'Gastos',     Icon: Receipt       },
  { href: '/incomes',  label: 'Ingresos',   Icon: TrendingUp    },
  { href: '/fixed',    label: 'Fijos',      Icon: CalendarClock },
  { href: '/shopping', label: 'Lista',      Icon: ShoppingCart  },
  { href: '/profile',  label: 'Perfil',     Icon: CircleUser    },
]

const PERSONAL_NAV = [
  { href: '/personal',              label: 'Resumen',        Icon: LayoutDashboard },
  { href: '/personal/accounts',     label: 'Cuentas',        Icon: Wallet          },
  { href: '/personal/transactions', label: 'Movimientos',    Icon: ArrowLeftRight  },
  { href: '/personal/reminders',    label: 'Recordatorios',  Icon: Bell            },
]

const BUSINESS_NAV = [
  { href: '/business', label: 'Negocios', Icon: Store      },
  { href: '/profile',  label: 'Perfil',   Icon: CircleUser },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { mode } = useAppMode()

  const nav = mode === 'personal' ? PERSONAL_NAV
            : mode === 'business' ? BUSINESS_NAV
            : HOME_NAV

  const activeBg   = mode === 'personal' ? 'bg-emerald-50'
                   : mode === 'business' ? 'bg-orange-50'
                   : 'bg-blue-50'
  const activeText = mode === 'personal' ? 'text-emerald-600'
                   : mode === 'business' ? 'text-orange-600'
                   : 'text-blue-600'

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch max-w-screen-sm mx-auto">
        {nav.map(({ href, label, Icon }) => {
          const active = href === '/' || href === '/personal' || href === '/business'
            ? pathname === href
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center py-2 min-h-[58px]"
            >
              <div className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all ${
                active ? activeBg : ''
              }`}>
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.6}
                  className={active ? activeText : 'text-gray-400'}
                />
                <span className={`text-[10px] font-semibold leading-none ${
                  active ? activeText : 'text-gray-400'
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
