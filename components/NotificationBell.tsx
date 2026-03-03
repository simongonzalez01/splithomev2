'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, X, AlertCircle, CheckSquare, Clock, ShieldAlert } from 'lucide-react'

type NotifItem = {
  id: string
  type: 'reminder' | 'todo' | 'verify'
  title: string
  subtitle: string
  href: string
  urgency: 'red' | 'amber' | 'blue'
}

function daysUntilDay(dueDay: number): number {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const currentDay = today.getDate()
  const dueDate    = new Date(today.getFullYear(), today.getMonth() + (dueDay >= currentDay ? 0 : 1), dueDay)
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
}

function isOverdue(due: string | null): boolean {
  return !!due && new Date(due + 'T23:59:59') < new Date()
}

export default function NotificationBell() {
  const router   = useRouter()
  const supabase = createClient()
  const panelRef = useRef<HTMLDivElement>(null)

  const [open,   setOpen]   = useState(false)
  const [items,  setItems]  = useState<NotifItem[]>([])
  const [userId, setUserId] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadNotifications()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function loadNotifications() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const notifications: NotifItem[] = []

    // ── 1. Recordatorios próximos (≤3 días) ──────────────────────────────────
    const { data: reminders } = await supabase
      .from('personal_reminders')
      .select('id, title, due_day, color')
      .eq('user_id', user.id)
      .eq('is_active', true)

    for (const r of (reminders ?? [])) {
      const days = daysUntilDay(r.due_day)
      if (days <= 3) {
        notifications.push({
          id:       `rem-${r.id}`,
          type:     'reminder',
          title:    r.title,
          subtitle: days === 0 ? '¡Vence hoy!' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`,
          href:     '/personal/reminders',
          urgency:  days === 0 ? 'red' : days === 1 ? 'amber' : 'amber',
        })
      }
    }

    // ── 2. Tareas vencidas ────────────────────────────────────────────────────
    const { data: todos } = await supabase
      .from('business_todos')
      .select('id, title, due_date, business_id, assigned_to, created_by')
      .eq('is_done', false)
      .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)

    for (const t of (todos ?? [])) {
      if (isOverdue(t.due_date)) {
        // Find partnerId for this business
        const { data: biz } = await supabase
          .from('businesses').select('user_id').eq('id', t.business_id).single()
        const { data: member } = await supabase
          .from('business_members').select('user_id')
          .eq('business_id', t.business_id)
          .neq('user_id', user.id).limit(1).single()
        const partnerId = biz?.user_id === user.id ? member?.user_id : biz?.user_id

        notifications.push({
          id:       `todo-${t.id}`,
          type:     'todo',
          title:    t.title,
          subtitle: '⚠ Tarea vencida',
          href:     partnerId ? `/partners/${partnerId}/${t.business_id}/todos` : '/partners',
          urgency:  'red',
        })
      }
    }

    // ── 3. Transacciones sin verificar del socio ──────────────────────────────
    const { data: unverified } = await supabase
      .from('business_transactions')
      .select('id, type, total, business_id, created_by')
      .is('verified_at', null)
      .neq('created_by', user.id)

    // Get unique business IDs to look up partner IDs
    const bizIds = [...new Set((unverified ?? []).map(t => t.business_id))]

    for (const bizId of bizIds) {
      const txsForBiz = (unverified ?? []).filter(t => t.business_id === bizId)
      const { data: biz } = await supabase
        .from('businesses').select('user_id, name').eq('id', bizId).single()

      // Only include if user is a member
      const { data: member } = await supabase
        .from('business_members').select('user_id')
        .eq('business_id', bizId).eq('user_id', user.id).limit(1).single()
      const isOwner  = biz?.user_id === user.id
      const isMember = !!member

      if (!isOwner && !isMember) continue

      const partnerId = biz?.user_id === user.id
        ? txsForBiz[0]?.created_by
        : biz?.user_id

      if (!partnerId) continue

      notifications.push({
        id:       `verify-${bizId}`,
        type:     'verify',
        title:    `${txsForBiz.length} movimiento${txsForBiz.length > 1 ? 's' : ''} sin verificar`,
        subtitle: biz?.name ?? 'Negocio compartido',
        href:     `/partners/${partnerId}/${bizId}?tab=movimientos`,
        urgency:  'blue',
      })
    }

    setItems(notifications)
    setLoaded(true)
  }

  const urgencyConfig = {
    red:   { bg: 'bg-red-50',   border: 'border-red-100',   icon: 'text-red-500',   dot: 'bg-red-500'   },
    amber: { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'text-amber-500', dot: 'bg-amber-500' },
    blue:  { bg: 'bg-blue-50',  border: 'border-blue-100',  icon: 'text-blue-500',  dot: 'bg-blue-500'  },
  }

  const TypeIcon = {
    reminder: Clock,
    todo:     CheckSquare,
    verify:   ShieldAlert,
  }

  const count = items.length

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) loadNotifications() }}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell
          size={20}
          className={count > 0 ? 'text-gray-700' : 'text-gray-400'}
          strokeWidth={count > 0 ? 2.2 : 1.6}
        />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white rounded-3xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <p className="font-bold text-gray-900 text-sm">
              {count > 0 ? `${count} notificación${count > 1 ? 'es' : ''}` : 'Sin notificaciones'}
            </p>
            <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
              <X size={13} className="text-gray-500" />
            </button>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Todo en orden ✓</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {items.map(item => {
                  const cfg  = urgencyConfig[item.urgency]
                  const Icon = TypeIcon[item.type]
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setOpen(false); router.push(item.href) }}
                      className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-all active:scale-98 ${cfg.bg} ${cfg.border}`}
                    >
                      <div className={`w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0`}>
                        <Icon size={15} className={cfg.icon} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-50">
              <button
                onClick={() => { setItems([]); setOpen(false) }}
                className="text-xs text-gray-400 font-semibold w-full text-center"
              >
                Limpiar todo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
