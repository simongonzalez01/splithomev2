import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCategoryLabel } from '@/lib/categories'

// ── helpers ────────────────────────────────────────────────
function monthRange(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth()
  const first = new Date(y, m, 1).toISOString().split('T')[0]
  const last  = new Date(y, m + 1, 0).toISOString().split('T')[0]
  return { first, last }
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })
}
function currency(n: number) { return `$${Math.abs(n).toFixed(2)}` }

// ── page ───────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Profile + family check
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, family_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.family_id) redirect('/family')

  const familyId = profile.family_id
  const { first, last } = monthRange()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const nextWeekStr = addDays(today, 7).toISOString().split('T')[0]

  // Parallel queries
  const [
    { data: members },
    { data: expenses },
    { data: settlements },
    { data: budgets },
    { data: events },
    { data: fixedExpenses },
    { data: fixedPayments },
    { data: shoppingItems },
  ] = await Promise.all([
    supabase.from('profiles').select('user_id, display_name').eq('family_id', familyId),
    supabase.from('expenses').select('amount, paid_by, category').eq('family_id', familyId).gte('date', first).lte('date', last),
    supabase.from('settlements').select('from_user, to_user, amount').eq('family_id', familyId).gte('date', first).lte('date', last),
    supabase.from('budgets').select('category, amount').eq('family_id', familyId).eq('month', first),
    supabase.from('events').select('id, title, date').eq('family_id', familyId).gte('date', todayStr).lte('date', nextWeekStr).order('date'),
    supabase.from('fixed_expenses').select('id, name, category, amount, due_day, default_paid_by').eq('family_id', familyId).eq('is_active', true).order('due_day'),
    supabase.from('fixed_expense_payments').select('fixed_expense_id').eq('family_id', familyId).eq('month', first),
    supabase.from('shopping_items').select('id, name').eq('family_id', familyId).eq('bought', false).order('created_at', { ascending: false }).limit(4),
  ])

  const memberList = members ?? []
  const expenseList = expenses ?? []
  const settlementList = settlements ?? []
  const budgetList = budgets ?? []
  const eventList = events ?? []
  const fixedList = fixedExpenses ?? []
  const paidFixedIds = new Set((fixedPayments ?? []).map(p => p.fixed_expense_id))
  const shopList = shoppingItems ?? []

  // ── Balance calculation ────────────────────────────────
  const totalSpent = expenseList.reduce((s, e) => s + Number(e.amount), 0)
  const memberCount = memberList.length || 1
  const equalShare = totalSpent / memberCount

  const paidMap: Record<string, number> = {}
  for (const e of expenseList) {
    paidMap[e.paid_by] = (paidMap[e.paid_by] ?? 0) + Number(e.amount)
  }
  // balance > 0 means overpaid (owed), < 0 means underpaid (owes)
  const balance: Record<string, number> = {}
  for (const m of memberList) {
    balance[m.user_id] = (paidMap[m.user_id] ?? 0) - equalShare
  }
  // Apply settlements
  for (const s of settlementList) {
    balance[s.from_user] = (balance[s.from_user] ?? 0) + Number(s.amount)
    balance[s.to_user]   = (balance[s.to_user]   ?? 0) - Number(s.amount)
  }

  const memberName = (uid: string) =>
    memberList.find(m => m.user_id === uid)?.display_name || 'Member'

  // Who owes whom (simplified for 2-person family)
  const sorted = memberList
    .map(m => ({ ...m, bal: balance[m.user_id] ?? 0 }))
    .sort((a, b) => a.bal - b.bal)

  let owesText = '✅ Even!'
  if (sorted.length >= 2) {
    const debtor   = sorted[0]  // most negative
    const creditor = sorted[sorted.length - 1]
    const diff = Math.abs(debtor.bal)
    if (diff >= 0.01) {
      owesText = `${memberName(debtor.user_id)} owes ${memberName(creditor.user_id)} ${currency(diff)}`
    }
  }

  // ── Top 3 categories ──────────────────────────────────
  const catMap: Record<string, number> = {}
  for (const e of expenseList) {
    catMap[e.category] = (catMap[e.category] ?? 0) + Number(e.amount)
  }
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  // ── Budget usage ──────────────────────────────────────
  const budgetUsage = budgetList.map(b => {
    const spent = catMap[b.category] ?? 0
    const pct = b.amount > 0 ? (spent / Number(b.amount)) * 100 : 0
    return { category: b.category, budget: Number(b.amount), spent, pct }
  }).sort((a, b) => b.pct - a.pct).slice(0, 4)

  // ── Fixed expenses status ─────────────────────────────
  const unpaidFixed = fixedList.filter(f => !paidFixedIds.has(f.id))
  const paidFixed   = fixedList.filter(f => paidFixedIds.has(f.id))

  const monthLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' })
  const firstName  = profile.display_name?.split(' ')[0] ?? user.email?.split('@')[0] ?? 'there'

  return (
    <div className="px-4 pt-5 pb-6 space-y-4 max-w-lg mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hi, {firstName} 👋</h1>
        <p className="text-sm text-gray-400 mt-0.5">{monthLabel}</p>
      </div>

      {/* ── Card: Who owes whom ─────────────────────────── */}
      <section className="bg-blue-600 rounded-2xl p-5 text-white shadow-md">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-75 mb-1">Balance del Mes</p>
        <p className="text-xl font-bold">{owesText}</p>
        <div className="mt-3 pt-3 border-t border-blue-500 flex gap-4">
          {memberList.map(m => (
            <div key={m.user_id} className="flex-1">
              <p className="text-xs opacity-70">{memberName(m.user_id)}</p>
              <p className="font-bold text-lg">{currency(paidMap[m.user_id] ?? 0)}</p>
              <p className="text-[11px] opacity-60">
                {(balance[m.user_id] ?? 0) >= 0
                  ? `+${currency(balance[m.user_id] ?? 0)} owed`
                  : `${currency(balance[m.user_id] ?? 0)} owes`}
              </p>
            </div>
          ))}
        </div>
        <Link href="/expenses" className="mt-3 flex items-center gap-1 text-xs opacity-70">
          Total gastado: <span className="font-bold">${totalSpent.toFixed(2)}</span>
          <span className="ml-1">→</span>
        </Link>
      </section>

      {/* ── Card: Top categories ────────────────────────── */}
      {topCats.length > 0 && (
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800">Top categorías</p>
            <Link href="/expenses" className="text-xs text-blue-500">Ver todo →</Link>
          </div>
          <div className="space-y-2">
            {topCats.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{getCategoryLabel(cat)}</span>
                <span className="text-sm font-semibold text-gray-900">${amt.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Card: Budget overview ───────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-800">Presupuestos</p>
          <Link href="/budgets" className="text-xs text-blue-500">Gestionar →</Link>
        </div>
        {budgetUsage.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">
            Sin presupuestos. <Link href="/budgets" className="text-blue-500 underline">Agrega uno →</Link>
          </p>
        ) : (
          <div className="space-y-3">
            {budgetUsage.map(b => {
              const color = b.pct > 100 ? 'bg-red-500' : b.pct > 80 ? 'bg-yellow-400' : 'bg-green-500'
              const textColor = b.pct > 100 ? 'text-red-600' : b.pct > 80 ? 'text-yellow-600' : 'text-green-600'
              return (
                <div key={b.category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 font-medium">{getCategoryLabel(b.category)}</span>
                    <span className={`font-semibold ${textColor}`}>
                      {b.pct > 100
                        ? `Over by $${(b.spent - b.budget).toFixed(2)}`
                        : `${b.pct.toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${color}`}
                      style={{ width: `${Math.min(b.pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    ${b.spent.toFixed(2)} / ${b.budget.toFixed(2)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Card: Fixed expenses ────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-800">Gastos Fijos</p>
          <Link href="/fixed" className="text-xs text-blue-500">Ver todo →</Link>
        </div>
        {fixedList.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">
            <Link href="/fixed" className="text-blue-500 underline">Agrega tus fijos →</Link>
          </p>
        ) : (
          <div className="space-y-2">
            {unpaidFixed.slice(0, 3).map(f => (
              <div key={f.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 flex-1">{f.name}</span>
                <span className="text-xs text-gray-400">día {f.due_day}</span>
                <span className="text-sm font-semibold text-gray-900">${Number(f.amount).toFixed(2)}</span>
              </div>
            ))}
            {paidFixed.slice(0, 2).map(f => (
              <div key={f.id} className="flex items-center gap-2 opacity-50">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-500 line-through flex-1">{f.name}</span>
                <span className="text-[11px] text-green-600 font-medium">Pagado</span>
              </div>
            ))}
            {unpaidFixed.length === 0 && paidFixed.length > 0 && (
              <p className="text-xs text-green-600 font-medium text-center">✅ Todos los fijos pagados</p>
            )}
          </div>
        )}
      </section>

      {/* ── Card: Upcoming events ───────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-800">Próximos eventos</p>
          <Link href="/events" className="text-xs text-blue-500">Ver todo →</Link>
        </div>
        {eventList.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">
            Sin eventos esta semana. <Link href="/events" className="text-blue-500 underline">Agrega →</Link>
          </p>
        ) : (
          <div className="space-y-2">
            {eventList.slice(0, 4).map(e => (
              <div key={e.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">📅</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
                  <p className="text-xs text-gray-400">{fmtDate(e.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Card: Shopping list ─────────────────────────── */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-800">Lista de Mercado</p>
          <Link href="/shopping" className="text-xs text-blue-500">Ver todo →</Link>
        </div>
        {shopList.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">
            Lista vacía. <Link href="/shopping" className="text-blue-500 underline">Agrega →</Link>
          </p>
        ) : (
          <div className="space-y-2">
            {shopList.map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="text-sm text-gray-700">{item.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Quick actions ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Link href="/expenses" className="bg-blue-600 text-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:opacity-90">
          <span className="text-2xl">💸</span>
          <span className="font-semibold text-sm">Nuevo gasto</span>
        </Link>
        <Link href="/history" className="bg-white text-gray-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm border border-gray-100 active:opacity-90">
          <span className="text-2xl">📊</span>
          <span className="font-semibold text-sm">Historial</span>
        </Link>
      </div>
    </div>
  )
}
