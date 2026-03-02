import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ArrowLeft, Receipt, TrendingUp } from 'lucide-react'

function currency(n: number) { return `$${Math.abs(n).toFixed(2)}` }
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Entry = {
  id: string
  date: string
  type: 'expense' | 'income' | 'settlement'
  title: string
  amount: number
  paidBy?: string
  receivedBy?: string
  fromUser?: string
  toUser?: string
  splitMode?: string
  note?: string
  effect: Record<string, number>
}

export default async function BalancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('display_name, family_id').eq('user_id', user.id).single()
  if (!profile?.family_id) redirect('/family')

  const familyId = profile.family_id

  const [
    { data: members },
    { data: allExpenses },
    { data: allIncomes },
    { data: allSettlements },
  ] = await Promise.all([
    supabase.from('profiles').select('user_id, display_name').eq('family_id', familyId),
    supabase.from('expenses')
      .select('id, title, amount, date, paid_by, split_mode')
      .eq('family_id', familyId)
      .order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('incomes')
      .select('id, title, amount, date, received_by, split_mode, for_member')
      .eq('family_id', familyId)
      .order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('settlements')
      .select('id, from_user, to_user, amount, date, note')
      .eq('family_id', familyId)
      .order('date', { ascending: false }).order('created_at', { ascending: false }),
  ])

  const memberList  = members ?? []
  const memberCount = memberList.length || 1
  const memberName  = (uid: string) => memberList.find(m => m.user_id === uid)?.display_name || 'Miembro'

  // ── Balance (idéntico al dashboard) ────────────────────
  const balance: Record<string, number> = {}
  for (const m of memberList) balance[m.user_id] = 0

  for (const e of allExpenses ?? []) {
    const amt  = Number(e.amount)
    const mode = e.split_mode ?? '50/50'
    const other = memberList.find(m => m.user_id !== e.paid_by)?.user_id
    if (!other) continue
    if (mode === '50/50') {
      balance[e.paid_by] = (balance[e.paid_by] ?? 0) + amt / 2
      balance[other]     = (balance[other]     ?? 0) - amt / 2
    } else if (mode === 'para_otro') {
      balance[e.paid_by] = (balance[e.paid_by] ?? 0) + amt
      balance[other]     = (balance[other]     ?? 0) - amt
    }
  }
  for (const inc of allIncomes ?? []) {
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
  }
  for (const s of allSettlements ?? []) {
    balance[s.from_user] = (balance[s.from_user] ?? 0) + Number(s.amount)
    balance[s.to_user]   = (balance[s.to_user]   ?? 0) - Number(s.amount)
  }

  const sorted   = memberList.map(m => ({ ...m, bal: balance[m.user_id] ?? 0 })).sort((a, b) => a.bal - b.bal)
  const debtor   = sorted[0]
  const creditor = sorted[sorted.length - 1]
  const diff     = sorted.length >= 2 ? Math.abs(debtor?.bal ?? 0) : 0
  const isEven   = diff < 0.01

  // ── Construir timeline ─────────────────────────────────
  const entries: Entry[] = []

  for (const e of allExpenses ?? []) {
    const amt  = Number(e.amount)
    const mode = e.split_mode ?? '50/50'
    if (mode === 'personal') continue
    const other = memberList.find(m => m.user_id !== e.paid_by)?.user_id
    if (!other) continue
    const effect: Record<string, number> = {}
    if (mode === '50/50') {
      effect[e.paid_by] = amt / 2
      effect[other]     = -amt / 2
    } else if (mode === 'para_otro') {
      effect[e.paid_by] = amt
      effect[other]     = -amt
    }
    entries.push({ id: e.id, date: e.date, type: 'expense', title: e.title, amount: amt, paidBy: e.paid_by, splitMode: mode, effect })
  }

  for (const inc of allIncomes ?? []) {
    const amt = Number(inc.amount)
    if (inc.split_mode === 'personal') continue
    const effect: Record<string, number> = {}
    if (inc.split_mode === '50/50') {
      const share = amt / memberCount
      for (const m of memberList) {
        effect[m.user_id] = m.user_id === inc.received_by ? -(amt - share) : share
      }
      entries.push({ id: inc.id, date: inc.date, type: 'income', title: inc.title, amount: amt, receivedBy: inc.received_by, splitMode: inc.split_mode, effect })
    } else if (inc.split_mode === 'para_otro' && inc.for_member) {
      effect[inc.received_by] = -amt
      effect[inc.for_member]  = amt
      entries.push({ id: inc.id, date: inc.date, type: 'income', title: inc.title, amount: amt, receivedBy: inc.received_by, splitMode: inc.split_mode, effect })
    }
  }

  for (const s of allSettlements ?? []) {
    const amt = Number(s.amount)
    entries.push({
      id: s.id, date: s.date, type: 'settlement',
      title: s.note ? s.note : 'Liquidación',
      amount: amt, fromUser: s.from_user, toUser: s.to_user,
      effect: { [s.from_user]: amt, [s.to_user]: -amt },
    })
  }

  // Orden cronológico inverso
  entries.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/" className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:opacity-70">
          <ArrowLeft size={18} className="text-gray-600" strokeWidth={2} />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Detalle del balance</h1>
      </div>

      {/* Balance card */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white shadow-md mb-5">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-2">Balance acumulado</p>
        {isEven ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black">¡Todo cuadrado!</span>
            <span className="text-xl">✅</span>
          </div>
        ) : (
          <>
            <p className="text-sm opacity-75 mb-1">
              {memberName(debtor?.user_id)} le debe a {memberName(creditor?.user_id)}
            </p>
            <p className="text-4xl font-black tracking-tight leading-none">{currency(diff)}</p>
            <p className="text-xs opacity-50 mt-2">
              Acumulado de {entries.length} movimientos · solo se salda con una liquidación
            </p>
          </>
        )}

        {/* Balance por miembro */}
        {memberList.length >= 2 && (
          <div className="mt-4 pt-3 border-t border-blue-500/40 flex gap-4">
            {memberList.map(m => {
              const bal = balance[m.user_id] ?? 0
              return (
                <div key={m.user_id} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {(m.display_name ?? '?')[0].toUpperCase()}
                    </div>
                    <span className="text-[11px] opacity-70 truncate">{m.display_name ?? 'Miembro'}</span>
                  </div>
                  <p className={`text-lg font-black leading-none ${Math.abs(bal) < 0.01 ? 'opacity-60' : bal > 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {Math.abs(bal) < 0.01 ? 'Par ✓' : bal > 0 ? `+${currency(bal)}` : `-${currency(bal)}`}
                  </p>
                  <p className="text-[10px] opacity-50 mt-0.5">{bal > 0 ? 'le deben' : bal < 0 ? 'debe' : 'equilibrado'}</p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Timeline */}
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
        Movimientos compartidos ({entries.length})
      </p>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Sin movimientos compartidos aún.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <div key={`${entry.type}-${entry.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start gap-3">

                {/* Icono */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  entry.type === 'settlement' ? 'bg-green-50'
                  : entry.type === 'income'   ? 'bg-emerald-50'
                  : 'bg-blue-50'
                }`}>
                  {entry.type === 'settlement'
                    ? <span className="text-base">🤝</span>
                    : entry.type === 'income'
                      ? <TrendingUp size={15} className="text-emerald-500" strokeWidth={1.8} />
                      : <Receipt size={15} className="text-blue-500" strokeWidth={1.8} />
                  }
                </div>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{entry.title}</p>
                    <p className="text-sm font-bold text-gray-900 flex-shrink-0">${entry.amount.toFixed(2)}</p>
                  </div>

                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtDate(entry.date)}
                    {entry.paidBy    && ` · Pagó ${memberName(entry.paidBy)}`}
                    {entry.receivedBy && ` · Recibió ${memberName(entry.receivedBy)}`}
                    {entry.fromUser  && ` · ${memberName(entry.fromUser)} → ${memberName(entry.toUser!)}`}
                    {entry.splitMode === '50/50'    && ' · 50/50'}
                    {entry.splitMode === 'para_otro' && ' · Para el otro'}
                  </p>

                  {/* Efecto por miembro */}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {memberList.map(m => {
                      const eff = entry.effect[m.user_id]
                      if (!eff || Math.abs(eff) < 0.01) return null
                      return (
                        <span key={m.user_id} className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                          eff > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                        }`}>
                          {m.display_name ?? 'Miembro'} {eff > 0 ? `+${currency(eff)}` : `-${currency(eff)}`}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
