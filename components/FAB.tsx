'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X, Receipt, CalendarClock, ShoppingCart, Calendar } from 'lucide-react'

const ACTIONS = [
  { href: '/expenses', label: 'Nuevo gasto',   Icon: Receipt,       bg: 'bg-blue-600'   },
  { href: '/fixed',    label: 'Gasto fijo',    Icon: CalendarClock, bg: 'bg-orange-500' },
  { href: '/shopping', label: 'Lista compras', Icon: ShoppingCart,  bg: 'bg-green-600'  },
  { href: '/events',   label: 'Evento',        Icon: Calendar,      bg: 'bg-purple-600' },
]

export default function FAB() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Backdrop para cerrar */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Contenedor FAB */}
      <div
        className="fixed right-4 z-50 flex flex-col-reverse items-end gap-3"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      >
        {/* Botón principal */}
        <button
          onClick={() => setOpen(o => !o)}
          className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 ${
            open ? 'bg-gray-700 rotate-45' : 'bg-blue-600'
          }`}
        >
          <Plus size={26} className="text-white" strokeWidth={2.5} />
        </button>

        {/* Speed-dial opciones */}
        {open && ACTIONS.map(({ href, label, Icon, bg }, i) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 ${bg} text-white pl-4 pr-5 h-11 rounded-full shadow-md text-sm font-semibold active:opacity-80`}
            style={{
              opacity: open ? 1 : 0,
              transform: open ? 'translateY(0)' : 'translateY(12px)',
              transition: `opacity 150ms ${i * 40}ms, transform 150ms ${i * 40}ms`,
            }}
          >
            <Icon size={15} strokeWidth={2.2} />
            {label}
          </Link>
        ))}
      </div>
    </>
  )
}
