import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ArrowRight, Receipt, CalendarClock, ShoppingCart, Plus, TrendingUp } from 'lucide-react'
import { getCategoryLabel } from '@/lib/categories'

// ── helpers ────────────────────────────────────────────────
function monthRange(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth()
  const first = new Date(y, m, 1).toISOString().split('T')[0]
  const last  = new Date(y, m + 1, 0).toISOString().split('T')[0]
  return { first, last }
}
function currency(n: number) { return `$${Math.abs(n).toFixed(2)}` }
function fmtShort(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

// ── page ───────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('display_name, family_id').eq('user_id', user.id).single()
  if (!profile?.family_id) redirect('/family')

  const familyId = profile.family_id
  const { first, last } = monthRange()
  const today = new Date()

  const [
    { data: members },
    { data: expenses },
    { data: settlements },
    { data: fixedExpenses },
    { data: fixedPayments },
    { data: shopItems },
    { data: incomes },
    { data: allExpenses },
    { data: allIncomes },
  ] = await Promise.all([
    supabase.from('profiles').select('user_id, display_name').eq('family_id', familyId),
    // Current month — for display stats and recent activity
    supabase.from('expenses')
      .select('id, title, amount, date, category, paid_by')
      .eq('family_id', familyId).gte('date', first).lte('date', last)
      .order('date', { ascending: false }).order('created_at', { ascending: false }),
    // All time — settlements never expire until explicitly registered
    supabase.from('settlements').select('from_user, to_user, amount')
      .eq('family_id', familyId),
    supabase.from('fixed_expenses').select('id, name, amount, due_day')
      .eq('family_id', familyId).eq('is_active', true),
    supabase.from('fixed_expense_payments').select('fixed_expense_id')
      .eq('family_id', familyId).eq('month', first),
    supabase.from('shopping_items').select('id')
      .eq('family_id', familyId).eq('bought', false),
    // Current month — for display stats
    supabase.from('incomes')
      .select('id, title, amount, date, received_by, split_mode, for_member')
      .eq('family_id', familyId).gte('date', first).lte('date', last),
    // All time — for cumulative balance calculation
    supabase.from('expenses')
      .select('amount, paid_by, split_mode')
      .eq('family_id', familyId),
    supabase.from('incomes')
      .select('amount, received_by, split_mode, for_member')
      .eq('family_id', familyId),
  ])

  const memberList      = members ?? []
  const expenseList     = expenses ?? []
  const settlList       = settlements ?? []
  const fixedList       = fixedExpenses ?? []
  const incomeList      = incomes ?? []
  const allExpenseList  = allExpenses ?? []
  const allIncomeList   = allIncomes ?? []
  const paidFixedIds    = new Set((fixedPayments ?? []).map(p => p.fixed_expense_id))
  const shopCount       = (shopItems ?? []).length

  // ── Stats del mes actual (para display) ───────────────
  const totalSpent  = expenseList.reduce((s, e) => s + Number(e.amount), 0)
  const totalIncome = incomeList.reduce((s, i) => s + Number(i.amount), 0)
  const memberCount = memberList.length || 1

  const paidMap: Record<string, number> = {}
  for (const e of expenseList) {
    paidMap[e.paid_by] = (paidMap[e.paid_by] ?? 0) + Number(e.amount)
  }

  // ── Balance acumulado (todos los tiempos, hasta el último settlement) ──
  // La deuda no se resetea al cambiar de mes — solo se salda con una liquidación.
  const balance: Record<string, number> = {}
  for (const m of memberList) balance[m.user_id] = 0

  // Gastos (respetando split_mode)
  for (const e of allExpenseList) {
    const amt   = Number(e.amount)
    const mode  = (e.split_mode ?? '50/50') as string
    const other = memberList.find(m => m.user_id !== e.paid_by)?.user_id
    if (!other) continue
    if (mode === '50/50') {
      balance[e.paid_by] = (balance[e.paid_by] ?? 0) + amt / 2
      balance[other]     = (balance[other]     ?? 0) - amt / 2
    } else if (mode === 'para_otro') {
      balance[e.paid_by] = (balance[e.paid_by] ?? 0) + amt
      balance[other]     = (balance[other]     ?? 0) - amt
    }
    // 'personal': no afecta el balance compartido
  }

  // Ingresos (lógica: quien RECIBIÓ lo tiene físicamente)
  for (const inc of allIncomeList) {
    const amt = Number(inc.amount)
    if (inc.split_mode === '50/50') {
      const share = amt / memberCount
      for (const m of memberList) {
        if (m.user_id === inc.received_by) {
          balance[m.user_id] = (balance[m.user_id] ?? 0) - (amt - share)
        } else {
          balance[m.user_id] = (balance[m.user_id] ?? 0) + share
        }
      }
    } else if (inc.split_mode === 'para_otro' && inc.for_member) {
      balance[inc.received_by] = (balance[inc.received_by] ?? 0) - amt
      balance[inc.for_member]  = (balance[inc.for_member]  ?? 0) + amt
    }
    // 'personal': no afecta deudas compartidas
  }

  // Liquidaciones acumuladas (todas, no solo del mes)
  for (const s of settlList) {
    balance[s.from_user] = (balance[s.from_user] ?? 0) + Number(s.amount)
    balance[s.to_user]   = (balance[s.to_user]   ?? 0) - Number(s.amount)
  }

  const memberName = (uid: string) =>
    memberList.find(m => m.user_id === uid)?.display_name || 'Miembro'

  const sorted = memberList
    .map(m => ({ ...m, bal: balance[m.user_id] ?? 0 }))
    .sort((a, b) => a.bal - b.bal)

  const debtor   = sorted[0]
  const creditor = sorted[sorted.length - 1]
  const diff     = sorted.length >= 2 ? Math.abs(debtor?.bal ?? 0) : 0
  const isEven   = diff < 0.01

  const unpaidFixed = fixedList.filter(f => !paidFixedIds.has(f.id))
  const recentExp   = expenseList.slice(0, 3)
  const firstName   = profile.display_name?.split(' ')[0] ?? user.email?.split('@')[0] ?? 'ahí'
  const monthLabel  = today.toLocaleString('es', { month: 'long', year: 'numeric' })

  return (
    <div className="px-4 pt-5 pb-6 space-y-3 max-w-lg mx-auto">

      {/* ── Saludo ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hola, {firstName} 👋</h1>
          <p className="text-sm text-gray-400 mt-0.5 capitalize">{monthLabel}</p>
        </div>
      </div>

      {/* ── A) Balance Card ───────────────────────────── */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white shadow-md">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-2">Balance actual</p>

        {isEven ? (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-black">¡Todo cuadrado!</span>
            <span className="text-xl">✅</span>
          </div>
        ) : (
          <Link href="/balance" className="block active:opacity-80">
            <p className="text-sm opacity-75 mb-0.5">
              {memberName(debtor?.user_id)} le debe a {memberName(creditor?.user_id)}
            </p>
            <div className="flex items-end gap-2 mb-1">
              <p className="text-4xl font-black tracking-tight leading-none">{currency(diff)}</p>
              <p className="text-xs opacity-50 mb-1">Ver detalle →</p>
            </div>
          </Link>
        )}

        {/* Por miembro */}
        {memberList.length > 0 && (
          <div className="mt-4 pt-3 border-t border-blue-500/40 flex gap-4">
            {memberList.map(m => {
              const paid = paidMap[m.user_id] ?? 0
              const pct  = totalSpent > 0 ? Math.round((paid / totalSpent) * 100) : 0
              return (
                <div key={m.user_id} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {(m.display_name ?? '?')[0].toUpperCase()}
                    </div>
                    <span className="text-[11px] opacity-70 truncate">{m.display_name ?? 'Miembro'}</span>
                  </div>
                  <p className="text-xl font-black leading-none">{currency(paid)}</p>
                  <p className="text-[10px] opacity-50 mt-0.5">{pct}% del total</p>
                </div>
              )
            })}
          </div>
        )}

        <Link href="/expenses"
          className="mt-3 flex items-center gap-1 text-[11px] opacity-50 hover:opacity-80">
          Total gastado: <span className="font-bold ml-0.5">${totalSpent.toFixed(2)}</span>
          <ArrowRight size={11} className="ml-0.5" />
        </Link>
      </section>

      {/* ── B) Mini stats ─────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Gastado',   value: `$${totalSpent < 1000 ? totalSpent.toFixed(0) : (totalSpent/1000).toFixed(1)+'k'}`,   sub: 'este mes',   Icon: Receipt,      href: '/expenses', color: 'text-blue-500'    },
          { label: 'Ingresos',  value: `$${totalIncome < 1000 ? totalIncome.toFixed(0) : (totalIncome/1000).toFixed(1)+'k'}`, sub: 'este mes',   Icon: TrendingUp,   href: '/incomes',  color: 'text-emerald-500' },
          { label: 'Fijos',     value: String(unpaidFixed.length), sub: 'por pagar',    Icon: CalendarClock, href: '/fixed',    color: 'text-blue-500'    },
          { label: 'Lista',     value: String(shopCount),          sub: 'pendientes',   Icon: ShoppingCart,  href: '/shopping', color: 'text-blue-500'    },
        ].map(({ label, value, sub, Icon, href, color }) => (
          <Link key={label} href={href}
            className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm flex flex-col items-center text-center active:opacity-80">
            <Icon size={15} className={`${color} mb-1.5`} strokeWidth={1.8} />
            <p className="text-[16px] font-black text-gray-900 leading-none">{value}</p>
            <p className="text-[9px] text-gray-400 mt-1 font-semibold leading-tight uppercase tracking-wide">{label}</p>
            <p className="text-[9px] text-gray-300 leading-tight">{sub}</p>
          </Link>
        ))}
      </div>

      {/* ── C) Actividad reciente ─────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-gray-900">Actividad reciente</p>
          <Link href="/expenses"
            className="flex items-center gap-0.5 text-xs text-blue-500 font-semibold">
            Ver todos <ArrowRight size={12} />
          </Link>
        </div>

        {recentExp.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-gray-400 text-sm mb-2">Sin gastos este mes.</p>
            <Link href="/expenses"
              className="inline-flex items-center gap-1 text-blue-500 text-sm font-semibold">
              <Plus size={14} /> Agrega el primero
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentExp.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Receipt size={15} className="text-blue-500" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{e.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtShort(e.date)} · {getCategoryLabel(e.category)} · {memberName(e.paid_by)}
                  </p>
                </div>
                <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                  ${Number(e.amount).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── D) Gasto por persona ─────────────────────── */}
      {memberList.length >= 2 && totalSpent > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm font-bold text-gray-900 mb-3">Gasto por persona</p>
          <div className="space-y-3">
            {memberList.map(m => {
              const paid = paidMap[m.user_id] ?? 0
              const pct  = totalSpent > 0 ? (paid / totalSpent) * 100 : 0
              const isMe = m.user_id === user.id
              return (
                <div key={m.user_id} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    isMe ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {(m.display_name ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-semibold text-gray-800 flex items-center gap-1">
                        {m.display_name ?? 'Miembro'}
                        {isMe && <span className="text-[10px] text-gray-400 font-normal">(yo)</span>}
                      </span>
                      <span className="font-bold text-gray-900">${paid.toFixed(2)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isMe ? 'bg-blue-500' : 'bg-gray-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
