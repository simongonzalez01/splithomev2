'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Download, ChevronDown, ChevronUp, TrendingUp, Users, Check, BarChart3 } from 'lucide-react'
import { getCategoryLabel } from '@/lib/categories'

type Snapshot = {
  id: string
  month: string          // 'YYYY-MM-DD' (first of month)
  total_spent: number
  summary: Record<string, unknown>
  created_at: string
}
type LiveExpense = {
  id: string; title: string; amount: number; date: string; category: string; paid_by: string
}
type Member = { user_id: string; display_name: string | null }

function monthLabel(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleString('default', { month: 'long', year: 'numeric' })
}
function monthFirst(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset)
  return d.toISOString().split('T')[0]
}
function monthLast(first: string) {
  const d = new Date(first + 'T12:00:00')
  d.setMonth(d.getMonth() + 1); d.setDate(0)
  return d.toISOString().split('T')[0]
}
function memberName(members: Member[], uid: string) {
  return members.find(m => m.user_id === uid)?.display_name ?? uid.slice(0, 8)
}
function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function HistoryPage() {
  const supabase = createClient()
  const [userId,       setUserId]       = useState<string | null>(null)
  const [familyId,     setFamilyId]     = useState<string | null>(null)
  const [members,      setMembers]      = useState<Member[]>([])
  const [snapshots,    setSnapshots]    = useState<Snapshot[]>([])
  const [liveExpenses, setLiveExpenses] = useState<LiveExpense[]>([])
  const [loading,      setLoading]      = useState(true)
  const [noFamily,     setNoFamily]     = useState(false)
  const [closing,      setClosing]      = useState(false)
  const [closeError,   setCloseError]   = useState('')
  const [alreadyClosed,setAlreadyClosed]= useState(false)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  const loadSnapshots = useCallback(async (fid: string) => {
    const { data } = await supabase
      .from('monthly_snapshots').select('*').eq('family_id', fid)
      .order('month', { ascending: false })
    setSnapshots(data ?? [])
    setAlreadyClosed((data ?? []).some(s => s.month === monthFirst()))
  }, [supabase])

  const loadLive = useCallback(async (fid: string) => {
    const first = monthFirst(), last = monthLast(first)
    const { data } = await supabase
      .from('expenses')
      .select('id, title, amount, date, category, paid_by')
      .eq('family_id', fid).gte('date', first).lte('date', last)
      .order('date', { ascending: false })
    setLiveExpenses(data ?? [])
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase
        .from('profiles').select('family_id').eq('user_id', user.id).single()
      if (!profile?.family_id) { setNoFamily(true); setLoading(false); return }
      setFamilyId(profile.family_id)
      const { data: mems } = await supabase
        .from('profiles').select('user_id, display_name').eq('family_id', profile.family_id)
      setMembers(mems ?? [])
      await Promise.all([loadSnapshots(profile.family_id), loadLive(profile.family_id)])
      setLoading(false)
    }
    init()
  }, [supabase, loadSnapshots, loadLive])

  async function handleCloseMonth() {
    if (!familyId || !userId) return
    setCloseError(''); setClosing(true)
    const first = monthFirst(), last = monthLast(first)
    const { data: expenses, error: expErr } = await supabase
      .from('expenses').select('amount, category, paid_by')
      .eq('family_id', familyId).gte('date', first).lte('date', last)
    if (expErr) { setCloseError(expErr.message); setClosing(false); return }
    const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0)
    const byCategory: Record<string, number> = {}
    const byMember:   Record<string, number> = {}
    for (const e of expenses ?? []) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount)
      byMember[e.paid_by]    = (byMember[e.paid_by]    ?? 0) + Number(e.amount)
    }
    const { error: insertErr } = await supabase.from('monthly_snapshots').insert({
      family_id: familyId, month: first, total_spent: total,
      summary: { byCategory, byMember, expenseCount: (expenses ?? []).length },
      created_by: userId,
    })
    if (insertErr) {
      setCloseError(insertErr.code === '23505' ? 'Este mes ya fue cerrado.' : insertErr.message)
      setClosing(false); return
    }
    await loadSnapshots(familyId)
    setClosing(false)
  }

  // ── Live month computations ───────────────────────────────────────────────
  const liveTotal    = liveExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const liveByCat:    Record<string, number> = {}
  const liveByMember: Record<string, number> = {}
  for (const e of liveExpenses) {
    liveByCat[e.category]    = (liveByCat[e.category]    ?? 0) + Number(e.amount)
    liveByMember[e.paid_by]  = (liveByMember[e.paid_by]  ?? 0) + Number(e.amount)
  }
  const numMembers = members.length || 1
  const fairShare  = liveTotal / numMembers
  const topLiveCats = Object.entries(liveByCat).sort((a, b) => b[1] - a[1]).slice(0, 4)

  function handleExportLive() {
    const rows = liveExpenses.map(e => [
      e.date, e.title, Number(e.amount).toFixed(2),
      getCategoryLabel(e.category), memberName(members, e.paid_by),
    ])
    exportCSV(`gastos_${monthFirst()}.csv`, ['Fecha', 'Descripción', 'Monto', 'Categoría', 'Pagó'], rows)
  }

  function handleExportSnapshot(snap: Snapshot) {
    const s = snap.summary as { byCategory?: Record<string, number> }
    const rows = Object.entries(s.byCategory ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => [getCategoryLabel(cat), Number(amt).toFixed(2)])
    exportCSV(`resumen_${snap.month}.csv`, ['Categoría', 'Total'], rows)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )
  if (noFamily) return (
    <div className="px-4 py-12 text-center">
      <p className="text-gray-500 mb-3">Necesitas unirte a una familia primero.</p>
      <a href="/family" className="text-blue-600 underline font-medium">Ir a Familia →</a>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto">

      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Historial</h1>
        <p className="text-sm text-gray-400 mt-0.5 capitalize">{monthLabel(monthFirst())}</p>
      </div>

      {/* ── Live current month card ──────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Totals row */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <TrendingUp size={16} className="text-blue-500" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Mes actual</p>
                  <p className="text-[11px] text-gray-400">{liveExpenses.length} gastos</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-gray-900">${liveTotal.toFixed(2)}</p>
                {liveExpenses.length > 0 && (
                  <button onClick={handleExportLive}
                    className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold mt-0.5 ml-auto active:opacity-70">
                    <Download size={10} strokeWidth={2.5} /> Exportar CSV
                  </button>
                )}
              </div>
            </div>

            {/* Member balance */}
            {members.length > 1 && liveTotal > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 mb-1.5">
                  <Users size={9} /> Balance
                </p>
                <div className="space-y-1.5">
                  {members.map(m => {
                    const paid    = liveByMember[m.user_id] ?? 0
                    const balance = paid - fairShare
                    return (
                      <div key={m.user_id} className="flex items-center justify-between">
                        <span className="text-xs text-gray-700 font-medium">
                          {m.display_name ?? m.user_id.slice(0, 8)}
                          {m.user_id === userId && <span className="text-gray-400 font-normal"> (yo)</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">${paid.toFixed(2)} pagado</span>
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-lg ${
                            balance >= 0
                              ? 'text-green-700 bg-green-50'
                              : 'text-red-600 bg-red-50'
                          }`}>
                            {balance >= 0 ? `+$${balance.toFixed(2)}` : `-$${Math.abs(balance).toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Top categories */}
            {topLiveCats.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Por categoría</p>
                <div className="space-y-1.5">
                  {topLiveCats.map(([cat, amt]) => (
                    <div key={cat} className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full transition-all"
                          style={{ width: `${Math.min((amt / liveTotal) * 100, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-28 truncate text-right">{getCategoryLabel(cat)}</span>
                      <span className="text-[10px] font-bold text-gray-700 w-14 text-right">${Number(amt).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Close month button */}
          <div className="border-t border-gray-50 px-4 py-3">
            {closeError && (
              <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-xl mb-2">{closeError}</p>
            )}
            <button
              onClick={handleCloseMonth}
              disabled={closing || alreadyClosed}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm active:opacity-90"
            >
              {alreadyClosed
                ? <><Check size={14} strokeWidth={2.5} /> Mes ya cerrado</>
                : closing
                  ? 'Guardando…'
                  : 'Cerrar mes y guardar resumen →'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Snapshot list ────────────────────────────────────────────────── */}
      <div className="px-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Meses anteriores</p>

        {snapshots.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <BarChart3 size={40} className="mx-auto mb-3 opacity-25" strokeWidth={1.2} />
            <p className="text-sm">Sin meses cerrados aún.</p>
            <p className="text-xs mt-1">Cierra el mes actual para empezar el historial.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-6">
            {snapshots.map(snap => {
              const summary = snap.summary as {
                byCategory?: Record<string, number>
                byMember?:   Record<string, number>
                expenseCount?: number
              }
              const isExpanded   = expandedId === snap.id
              const topCats      = Object.entries(summary.byCategory ?? {}).sort((a, b) => b[1] - a[1])
              const snapMembers  = Object.entries(summary.byMember ?? {})
              const snapTotal    = Number(snap.total_spent)
              const snapFair     = snapTotal / (snapMembers.length || 1)

              return (
                <div key={snap.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                  {/* Collapsible header */}
                  <button
                    className="w-full px-4 py-4 flex items-center justify-between text-left active:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                  >
                    <div>
                      <p className="font-bold text-gray-900 capitalize">{monthLabel(snap.month)}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {summary.expenseCount ?? 0} gastos ·{' '}
                        {new Date(snap.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-black text-gray-900">${snapTotal.toFixed(2)}</p>
                      {isExpanded
                        ? <ChevronUp size={16} className="text-gray-400" strokeWidth={2} />
                        : <ChevronDown size={16} className="text-gray-400" strokeWidth={2} />}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-gray-50 px-4 py-4 space-y-4">

                      {/* Member balance */}
                      {snapMembers.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                            <Users size={9} /> Balance
                          </p>
                          <div className="space-y-1.5">
                            {snapMembers.map(([uid, amt]) => {
                              const balance = Number(amt) - snapFair
                              return (
                                <div key={uid} className="flex items-center justify-between">
                                  <span className="text-xs text-gray-700 font-medium">
                                    {memberName(members, uid)}
                                    {uid === userId && <span className="text-gray-400 font-normal"> (yo)</span>}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">${Number(amt).toFixed(2)}</span>
                                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-lg ${
                                      balance >= 0
                                        ? 'text-green-700 bg-green-50'
                                        : 'text-red-600 bg-red-50'
                                    }`}>
                                      {balance >= 0 ? `+$${balance.toFixed(2)}` : `-$${Math.abs(balance).toFixed(2)}`}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Categories with bars */}
                      {topCats.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Por categoría</p>
                          <div className="space-y-2">
                            {topCats.map(([cat, amt]) => (
                              <div key={cat}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs text-gray-600">{getCategoryLabel(cat)}</span>
                                  <span className="text-xs font-semibold text-gray-700">${Number(amt).toFixed(2)}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-400 rounded-full"
                                    style={{ width: `${Math.min((amt / snapTotal) * 100, 100)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Export CSV */}
                      <button onClick={() => handleExportSnapshot(snap)}
                        className="flex items-center justify-center gap-2 w-full text-xs text-blue-600 font-semibold bg-blue-50 rounded-xl px-3 py-2.5 active:bg-blue-100">
                        <Download size={13} strokeWidth={2} /> Exportar CSV
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Link to expenses */}
      <div className="px-4 py-4">
        <Link href="/expenses"
          className="flex items-center justify-center gap-2 text-sm text-blue-600 font-medium">
          Ver gastos del mes actual →
        </Link>
      </div>
    </div>
  )
}
