'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Wallet, Users, ArrowRight, TrendingUp, TrendingDown,
  Bell, CreditCard, RefreshCw, ChevronRight,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Account = {
  id: string; name: string; type: 'savings' | 'person'
  initial_balance: number; color: string; person_name: string | null
  is_archived: boolean
}

type TxSummary = { account_id: string; type: 'ingreso' | 'gasto'; amount: number }

type CardInfo = {
  id: string; name: string; last_four: string | null
  credit_limit: number; initial_balance: number; due_day: number | null; color: string
}
type CardTxSummary = { card_id: string; type: 'cargo' | 'pago'; amount: number }

type Reminder = {
  id: string; title: string; amount: number | null
  type: 'tarjeta' | 'recurrente'; due_day: number; color: string
  card_id: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcBalance(acc: Account, txs: TxSummary[]) {
  const mine     = txs.filter(t => t.account_id === acc.id)
  const ingresos = mine.filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0)
  const gastos   = mine.filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0)
  return Number(acc.initial_balance) + ingresos - gastos
}

function calcCardBalance(card: CardInfo, cardTxs: CardTxSummary[]) {
  const mine   = cardTxs.filter(t => t.card_id === card.id)
  const cargos = mine.filter(t => t.type === 'cargo').reduce((s, t) => s + Number(t.amount), 0)
  const pagos  = mine.filter(t => t.type === 'pago').reduce((s, t) => s + Number(t.amount), 0)
  return Number(card.initial_balance) + cargos - pagos
}

function fmt(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}$${abs}`
}

function daysUntilDue(dueDay: number): number {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const currentDay = today.getDate()
  const dueDate    = new Date(today.getFullYear(), today.getMonth() + (dueDay >= currentDay ? 0 : 1), dueDay)
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
}

// ── Upcoming payment item (cards + reminders merged) ─────────────────────────

type UpcomingItem = {
  key: string
  label: string
  sub?: string
  amount?: number
  days: number
  color: string
  href?: string
  type: 'card' | 'reminder'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PersonalPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [txs,          setTxs]          = useState<TxSummary[]>([])
  const [cards,        setCards]        = useState<CardInfo[]>([])
  const [cardTxs,      setCardTxs]      = useState<CardTxSummary[]>([])
  const [reminders,    setReminders]    = useState<Reminder[]>([])
  const [loading,      setLoading]      = useState(true)
  const [monthIncome,  setMonthIncome]  = useState(0)
  const [monthExpense, setMonthExpense] = useState(0)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const monthStr = new Date().toISOString().slice(0, 7)

    const [
      { data: accs },
      { data: allTxs },
      { data: monthTxs },
      { data: allCards },
      { data: allCardTxs },
      { data: rems },
    ] = await Promise.all([
      supabase.from('savings_accounts')
        .select('*').eq('user_id', user.id).eq('is_archived', false)
        .order('created_at', { ascending: true }),
      supabase.from('savings_transactions')
        .select('account_id, type, amount').eq('user_id', user.id),
      supabase.from('savings_transactions')
        .select('type, amount').eq('user_id', user.id)
        .gte('date', monthStr + '-01').lte('date', monthStr + '-31'),
      supabase.from('savings_credit_cards')
        .select('id, name, last_four, credit_limit, initial_balance, due_day, color')
        .eq('user_id', user.id).eq('is_active', true),
      supabase.from('savings_credit_card_transactions')
        .select('card_id, type, amount').eq('user_id', user.id),
      supabase.from('personal_reminders')
        .select('id, title, amount, type, due_day, color, card_id')
        .eq('user_id', user.id).eq('is_active', true),
    ])

    setAccounts(accs ?? [])
    setTxs(allTxs ?? [])
    setCards(allCards ?? [])
    setCardTxs(allCardTxs ?? [])
    setReminders(rems ?? [])

    const inc = (monthTxs ?? []).filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0)
    const exp = (monthTxs ?? []).filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0)
    setMonthIncome(inc)
    setMonthExpense(exp)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Derived ───────────────────────────────────────────────────────────────

  const savingsAccounts = accounts.filter(a => a.type === 'savings')
  const personAccounts  = accounts.filter(a => a.type === 'person')
  const totalSavings    = savingsAccounts.reduce((s, a) => s + calcBalance(a, txs), 0)
  const nowLabel        = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' })

  // Build upcoming payments list (cards with balance + all active reminders)
  const upcoming: UpcomingItem[] = []

  cards.forEach(card => {
    if (!card.due_day) return
    const bal = calcCardBalance(card, cardTxs)
    if (bal <= 0) return  // nada que pagar
    upcoming.push({
      key:    'card-' + card.id,
      label:  card.name + (card.last_four ? ` ···${card.last_four}` : ''),
      sub:    `Saldo: ${fmt(bal)}`,
      amount: bal,
      days:   daysUntilDue(card.due_day),
      color:  card.color,
      href:   `/personal/cards/${card.id}`,
      type:   'card',
    })
  })

  reminders.forEach(r => {
    // Avoid duplicating if reminder is linked to a card already listed
    const alreadyListed = r.card_id && upcoming.some(u => u.key === 'card-' + r.card_id)
    if (alreadyListed) return
    upcoming.push({
      key:    'rem-' + r.id,
      label:  r.title,
      amount: r.amount ?? undefined,
      days:   daysUntilDue(r.due_day),
      color:  r.color,
      href:   '/personal/reminders',
      type:   'reminder',
    })
  })

  upcoming.sort((a, b) => a.days - b.days)
  const soonItems = upcoming.filter(u => u.days <= 10)
  const showUpcoming = upcoming.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-6">

      {/* ── Balance total ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-3xl p-6 mb-4 shadow-lg">
        <p className="text-emerald-100 text-xs font-medium mb-1 uppercase tracking-widest">Total ahorros</p>
        <p className="text-white text-4xl font-bold tracking-tight leading-none">{fmt(totalSavings)}</p>
        <p className="text-emerald-200 text-xs mt-2">
          {savingsAccounts.length} cuenta{savingsAccounts.length !== 1 ? 's' : ''} activa{savingsAccounts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Próximos pagos ────────────────────────────────── */}
      {showUpcoming && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell size={13} className={soonItems.length > 0 ? 'text-red-400' : 'text-amber-400'} />
              <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Próximos pagos</h2>
            </div>
            <Link href="/personal/reminders" className="text-[11px] text-amber-600 font-semibold">Ver todos</Link>
          </div>

          <div className="space-y-2">
            {(soonItems.length > 0 ? soonItems : upcoming.slice(0, 3)).map(item => {
              const urgency = item.days === 0 ? 'bg-red-50 border-red-200' :
                              item.days <= 3  ? 'bg-orange-50 border-orange-200' :
                              item.days <= 7  ? 'bg-yellow-50 border-yellow-200' :
                                                'bg-white border-gray-100'
              const dayLabel = item.days === 0 ? '¡Hoy!'
                             : item.days === 1 ? 'Mañana'
                             : `${item.days}d`
              const dayColor = item.days === 0 ? 'text-red-600 bg-red-100'
                             : item.days <= 3  ? 'text-orange-600 bg-orange-100'
                             : item.days <= 7  ? 'text-yellow-700 bg-yellow-100'
                             :                   'text-gray-500 bg-gray-100'

              const content = (
                <div className={`rounded-2xl border px-3.5 py-3 flex items-center gap-3 ${urgency} active:opacity-80`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: item.color + '22' }}
                  >
                    {item.type === 'card'
                      ? <CreditCard size={17} style={{ color: item.color }} strokeWidth={1.8} />
                      : <RefreshCw  size={17} style={{ color: item.color }} strokeWidth={1.8} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-[14px] truncate">{item.label}</p>
                    {item.sub && <p className="text-xs text-gray-500">{item.sub}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.amount && (
                      <p className="font-bold text-[14px] text-gray-800">{fmt(item.amount)}</p>
                    )}
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${dayColor}`}>
                      {dayLabel}
                    </span>
                    <ChevronRight size={13} className="text-gray-300" />
                  </div>
                </div>
              )

              return item.href ? (
                <Link key={item.key} href={item.href}>{content}</Link>
              ) : (
                <div key={item.key}>{content}</div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Resumen del mes ───────────────────────────────── */}
      {(monthIncome > 0 || monthExpense > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-emerald-500" strokeWidth={2} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ingresos</span>
            </div>
            <p className="text-emerald-600 font-bold text-lg">{fmt(monthIncome)}</p>
            <p className="text-[10px] text-gray-400 capitalize">{nowLabel}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={14} className="text-red-400" strokeWidth={2} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Gastos</span>
            </div>
            <p className="text-red-500 font-bold text-lg">{fmt(monthExpense)}</p>
            <p className="text-[10px] text-gray-400 capitalize">{nowLabel}</p>
          </div>
        </div>
      )}

      {/* ── Acciones rápidas ─────────────────────────────── */}
      <div className="flex gap-3 mb-6">
        <Link href="/personal/transactions?new=1"
          className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:bg-gray-50"
        >
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Plus size={18} className="text-emerald-600" strokeWidth={2.5} />
          </div>
          <span className="text-xs font-semibold text-gray-700 text-center">Nuevo movimiento</span>
        </Link>
        <Link href="/personal/accounts?new=1"
          className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:bg-gray-50"
        >
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Wallet size={17} className="text-blue-600" strokeWidth={2} />
          </div>
          <span className="text-xs font-semibold text-gray-700 text-center">Nueva cuenta</span>
        </Link>
        <Link href="/personal/reminders"
          className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:bg-gray-50"
        >
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
            <Bell size={17} className="text-amber-600" strokeWidth={2} />
          </div>
          <span className="text-xs font-semibold text-gray-700 text-center">Recordatorios</span>
        </Link>
      </div>

      {/* ── Mis cuentas de ahorro ────────────────────────── */}
      {savingsAccounts.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Mis cuentas</h2>
            <Link href="/personal/accounts" className="text-[11px] text-emerald-600 font-semibold">Ver todas</Link>
          </div>
          <div className="space-y-3">
            {savingsAccounts.map(acc => {
              const bal = calcBalance(acc, txs)
              return (
                <Link key={acc.id} href={`/personal/transactions?account=${acc.id}`}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: acc.color + '22' }}
                  >
                    <Wallet size={20} style={{ color: acc.color }} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-[15px]">{acc.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-lg ${bal < 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmt(bal)}</p>
                  </div>
                  <ArrowRight size={15} className="text-gray-300 flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Cuentas con personas ─────────────────────────── */}
      {personAccounts.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Con personas</h2>
            <Link href="/personal/accounts" className="text-[11px] text-emerald-600 font-semibold">Ver todas</Link>
          </div>
          <div className="space-y-3">
            {personAccounts.map(acc => {
              const bal = calcBalance(acc, txs)
              return (
                <Link key={acc.id} href={`/personal/transactions?account=${acc.id}`}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: acc.color + '22' }}
                  >
                    <Users size={20} style={{ color: acc.color }} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-[15px]">{acc.name}</p>
                    {acc.person_name && <p className="text-xs text-gray-400 truncate">{acc.person_name}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-lg ${bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {fmt(Math.abs(bal))}
                    </p>
                    <p className="text-[10px] text-gray-400 leading-none">
                      {bal > 0 ? 'te deben' : bal < 0 ? 'debes' : 'al día ✓'}
                    </p>
                  </div>
                  <ArrowRight size={15} className="text-gray-300 flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Estado vacío ─────────────────────────────────── */}
      {accounts.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Wallet size={28} className="text-emerald-400" strokeWidth={1.5} />
          </div>
          <h3 className="font-bold text-gray-800 text-lg mb-2">Tus finanzas personales</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
            Crea tu primera cuenta de ahorro y empieza a registrar tus movimientos.
          </p>
          <Link href="/personal/accounts?new=1"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-6 py-3.5 rounded-2xl active:opacity-80 shadow-md text-sm"
          >
            <Plus size={18} strokeWidth={2.5} /> Crear primera cuenta
          </Link>
        </div>
      )}
    </div>
  )
}
