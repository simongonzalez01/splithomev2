'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Snapshot = {
  id: string
  month: string          // 'YYYY-MM-DD' (first of month)
  total_spent: number
  summary: Record<string, unknown>
  created_at: string
}

function monthLabel(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleString('default', {
    month: 'long', year: 'numeric',
  })
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

export default function HistoryPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [noFamily, setNoFamily] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [alreadyClosed, setAlreadyClosed] = useState(false)

  const loadSnapshots = useCallback(async (fid: string) => {
    const { data } = await supabase
      .from('monthly_snapshots')
      .select('*')
      .eq('family_id', fid)
      .order('month', { ascending: false })
    setSnapshots(data ?? [])

    // Check if this month is already closed
    const thisFirst = monthFirst()
    const closed = (data ?? []).some(s => s.month === thisFirst)
    setAlreadyClosed(closed)
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
      await loadSnapshots(profile.family_id)
      setLoading(false)
    }
    init()
  }, [supabase, loadSnapshots])

  async function handleCloseMonth() {
    if (!familyId || !userId) return
    setCloseError('')
    setClosing(true)

    const first = monthFirst()
    const last  = monthLast(first)

    // Fetch this month's expenses
    const { data: expenses, error: expErr } = await supabase
      .from('expenses')
      .select('amount, category, paid_by')
      .eq('family_id', familyId)
      .gte('date', first)
      .lte('date', last)

    if (expErr) { setCloseError(expErr.message); setClosing(false); return }

    const total = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0)

    // Build summary: spent per category + per member
    const byCategory: Record<string, number> = {}
    const byMember:   Record<string, number> = {}
    for (const e of expenses ?? []) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount)
      byMember[e.paid_by]    = (byMember[e.paid_by]    ?? 0) + Number(e.amount)
    }

    const { error: insertErr } = await supabase
      .from('monthly_snapshots')
      .insert({
        family_id: familyId,
        month: first,
        total_spent: total,
        summary: { byCategory, byMember, expenseCount: (expenses ?? []).length },
        created_by: userId,
      })

    if (insertErr) {
      setCloseError(
        insertErr.code === '23505'
          ? 'Este mes ya fue cerrado.'
          : insertErr.message
      )
      setClosing(false); return
    }

    await loadSnapshots(familyId)
    setClosing(false)
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

  const thisMonthLabel = monthLabel(monthFirst())

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Historial de meses</h1>
        <p className="text-sm text-gray-400 mt-0.5">Resúmenes mensuales cerrados</p>
      </div>

      {/* Close current month */}
      <div className="px-4 mb-4">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-blue-800">Cerrar {thisMonthLabel}</p>
            {alreadyClosed && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                ✅ Cerrado
              </span>
            )}
          </div>
          <p className="text-xs text-blue-600 mb-3">
            Guarda un resumen del mes actual con totales y categorías.
          </p>
          {closeError && (
            <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-xl mb-2">{closeError}</p>
          )}
          <button
            onClick={handleCloseMonth}
            disabled={closing || alreadyClosed}
            className="w-full bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm active:opacity-90"
          >
            {closing ? 'Guardando…' : alreadyClosed ? 'Ya cerrado' : 'Cerrar mes →'}
          </button>
        </div>
      </div>

      {/* Snapshot list */}
      {snapshots.length === 0 ? (
        <div className="text-center py-14 text-gray-400 px-4">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm">Sin meses cerrados aún.</p>
          <p className="text-xs mt-1">Cierra el mes actual para empezar tu historial.</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {snapshots.map(snap => {
            const summary = snap.summary as {
              byCategory?: Record<string, number>
              byMember?: Record<string, number>
              expenseCount?: number
            }
            const topCats = Object.entries(summary.byCategory ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
            return (
              <div key={snap.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900">{monthLabel(snap.month)}</p>
                    <p className="text-xs text-gray-400">
                      {summary.expenseCount ?? 0} gastos ·{' '}
                      {new Date(snap.created_at).toLocaleDateString('default', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <p className="text-xl font-black text-gray-900">
                    ${Number(snap.total_spent).toFixed(2)}
                  </p>
                </div>

                {topCats.length > 0 && (
                  <div className="space-y-1.5">
                    {topCats.map(([cat, amt]) => (
                      <div key={cat} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{cat}</span>
                        <span className="text-xs font-semibold text-gray-700">${Number(amt).toFixed(2)}</span>
                      </div>
                    ))}
                    {Object.keys(summary.byCategory ?? {}).length > 3 && (
                      <p className="text-xs text-gray-400">
                        + {Object.keys(summary.byCategory ?? {}).length - 3} categorías más
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Link to expenses */}
      <div className="px-4 py-5">
        <Link href="/expenses"
          className="flex items-center justify-center gap-2 text-sm text-blue-600 font-medium">
          <span>💸</span> Ver gastos del mes actual →
        </Link>
      </div>
    </div>
  )
}
