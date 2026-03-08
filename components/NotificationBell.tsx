'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Bell, X, CheckSquare, Clock, ShieldAlert, MessageCircle,
  Package, TrendingUp, CalendarClock, Settings,
} from 'lucide-react'
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext'

// ── Types ────────────────────────────────────────────────────────
type NotifItem = {
  id:       string
  type:     string
  title:    string
  subtitle: string
  href:     string
  urgency:  'red' | 'amber' | 'blue' | 'green'
  dbId?:    string   // set if it comes from the notifications table
}

// ── Helpers ──────────────────────────────────────────────────────
function daysUntilDay(dueDay: number): number {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const currentDay = today.getDate()
  const dueDate    = new Date(today.getFullYear(), today.getMonth() + (dueDay >= currentDay ? 0 : 1), dueDay)
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000)
}

function isOverdue(due: string | null): boolean {
  return !!due && new Date(due + 'T23:59:59') < new Date()
}

// ── Component ─────────────────────────────────────────────────────
export default function NotificationBell() {
  const router   = useRouter()
  const supabase = createClient()
  const panelRef = useRef<HTMLDivElement>(null)

  const [open,    setOpen]    = useState(false)
  const [items,   setItems]   = useState<NotifItem[]>([])
  const [dbItems, setDbItems] = useState<NotifItem[]>([])
  const [loaded,  setLoaded]  = useState(false)

  const { totalUnread } = useUnreadMessages()

  useEffect(() => { loadAll() }, [])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // ── Load DB notifications (from cron) ────────────────────────
  async function loadDbNotifications(userId: string) {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, read')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(10)

    const iconMap: Record<string, 'red' | 'amber' | 'blue' | 'green'> = {
      daily_expense:  'amber',
      daily_business: 'blue',
      low_stock:      'red',
      budget_alert:   'amber',
      fixed_upcoming: 'blue',
    }

    setDbItems(
      (data ?? []).map(n => ({
        id:       `db-${n.id}`,
        dbId:     n.id,
        type:     n.type,
        title:    n.title,
        subtitle: n.body,
        href:     n.link ?? '/',
        urgency:  iconMap[n.type] ?? 'blue',
      }))
    )
  }

  // ── Load computed notifications ───────────────────────────────
  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // DB-stored (cron) notifications
    await loadDbNotifications(user.id)

    const notifications: NotifItem[] = []

    // 1. Recordatorios próximos (≤3 días)
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
          urgency:  days === 0 ? 'red' : 'amber',
        })
      }
    }

    // 2. Tareas vencidas
    const { data: todos } = await supabase
      .from('business_todos')
      .select('id, title, due_date, business_id, assigned_to, created_by')
      .eq('is_done', false)
      .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)

    for (const t of (todos ?? [])) {
      if (!isOverdue(t.due_date)) continue
      const { data: biz    } = await supabase.from('businesses').select('user_id').eq('id', t.business_id).single()
      const { data: member } = await supabase.from('business_members').select('user_id')
        .eq('business_id', t.business_id).neq('user_id', user.id).limit(1).single()
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

    // 3. Transacciones sin verificar del socio
    const { data: unverified } = await supabase
      .from('business_transactions')
      .select('id, type, total, business_id, created_by')
      .is('verified_at', null)
      .neq('created_by', user.id)

    const bizIds = [...new Set((unverified ?? []).map(t => t.business_id))]
    for (const bizId of bizIds) {
      const txsForBiz = (unverified ?? []).filter(t => t.business_id === bizId)
      const { data: biz    } = await supabase.from('businesses').select('user_id, name').eq('id', bizId).single()
      const { data: member } = await supabase.from('business_members').select('user_id')
        .eq('business_id', bizId).eq('user_id', user.id).limit(1).single()
      const isOwner  = biz?.user_id === user.id
      const isMember = !!member
      if (!isOwner && !isMember) continue
      const partnerId = biz?.user_id === user.id ? txsForBiz[0]?.created_by : biz?.user_id
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

  // ── Mark DB notification as read ─────────────────────────────
  async function markRead(dbId: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', dbId)
    setDbItems(prev => prev.filter(n => n.dbId !== dbId))
  }

  async function markAllRead() {
    const dbIds = dbItems.map(n => n.dbId).filter(Boolean) as string[]
    if (dbIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', dbIds)
    }
    setDbItems([])
    setItems([])
  }

  // ── Merge all items ──────────────────────────────────────────
  const chatItem: NotifItem | null = totalUnread > 0 ? {
    id:       'chat-unread',
    type:     'chat',
    title:    `${totalUnread} mensaje${totalUnread > 1 ? 's' : ''} nuevo${totalUnread > 1 ? 's' : ''}`,
    subtitle: 'Chat de negocios',
    href:     '/business',
    urgency:  'blue',
  } : null

  const allItems = [
    ...dbItems,                              // cron notifications first
    ...(chatItem ? [chatItem] : []),
    ...items,                                // computed notifications
  ]
  const count = allItems.length

  // ── Icon map ─────────────────────────────────────────────────
  const urgencyConfig = {
    red:   { bg: 'bg-red-50',   border: 'border-red-100',   icon: 'text-red-500',   dot: 'bg-red-500'   },
    amber: { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'text-amber-500', dot: 'bg-amber-500' },
    blue:  { bg: 'bg-blue-50',  border: 'border-blue-100',  icon: 'text-blue-500',  dot: 'bg-blue-500'  },
    green: { bg: 'bg-green-50', border: 'border-green-100', icon: 'text-green-500', dot: 'bg-green-500' },
  }

  function TypeIcon({ type }: { type: string }) {
    const cls = 'flex-shrink-0'
    if (type === 'reminder')       return <Clock        size={15} className={cls} strokeWidth={2} />
    if (type === 'todo')           return <CheckSquare  size={15} className={cls} strokeWidth={2} />
    if (type === 'verify')         return <ShieldAlert  size={15} className={cls} strokeWidth={2} />
    if (type === 'chat')           return <MessageCircle size={15} className={cls} strokeWidth={2} />
    if (type === 'low_stock')      return <Package      size={15} className={cls} strokeWidth={2} />
    if (type === 'budget_alert')   return <TrendingUp   size={15} className={cls} strokeWidth={2} />
    if (type === 'fixed_upcoming') return <CalendarClock size={15} className={cls} strokeWidth={2} />
    return <Bell size={15} className={cls} strokeWidth={2} />
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) loadAll() }}
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setOpen(false); router.push('/settings/notifications') }}
                className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                title="Configurar notificaciones"
              >
                <Settings size={12} className="text-gray-500" />
              </button>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                <X size={13} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {allItems.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Todo en orden ✓</p>
                <button
                  onClick={() => { setOpen(false); router.push('/settings/notifications') }}
                  className="mt-3 text-xs text-blue-500 font-semibold"
                >
                  Configurar notificaciones
                </button>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {allItems.map(item => {
                  const cfg = urgencyConfig[item.urgency]
                  return (
                    <div key={item.id} className="relative">
                      <button
                        onClick={() => {
                          if (item.dbId) markRead(item.dbId)
                          setOpen(false)
                          router.push(item.href)
                        }}
                        className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-all active:scale-98 ${cfg.bg} ${cfg.border}`}
                      >
                        <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                          <span className={cfg.icon}>
                            <TypeIcon type={item.type} />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-semibold text-gray-900 leading-snug">{item.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{item.subtitle}</p>
                        </div>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
                      </button>
                      {/* Dismiss DB notification */}
                      {item.dbId && (
                        <button
                          onClick={e => { e.stopPropagation(); markRead(item.dbId!) }}
                          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-white bg-opacity-80 flex items-center justify-center hover:bg-opacity-100"
                        >
                          <X size={10} className="text-gray-400" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {allItems.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-50 flex items-center justify-between">
              <button
                onClick={markAllRead}
                className="text-xs text-gray-400 font-semibold"
              >
                Marcar todas leídas
              </button>
              <button
                onClick={() => { setOpen(false); router.push('/settings/notifications') }}
                className="text-xs text-blue-500 font-semibold flex items-center gap-1"
              >
                <Settings size={10} /> Configurar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
