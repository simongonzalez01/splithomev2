'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, getCategoryLabel } from '@/lib/categories'
import { BarChart3, Copy, Check, Save } from 'lucide-react'

type BudgetRow = { category: string; budget: number; spent: number }

function monthFirst(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset)
  return d.toISOString().split('T')[0]
}

export default function BudgetsPage() {
  const supabase = createClient()
  const [userId,   setUserId]   = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [rows,     setRows]     = useState<BudgetRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [noFamily, setNoFamily] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [copying,  setCopying]  = useState(false)
  const [showAll,  setShowAll]  = useState(false)

  const loadData = useCallback(async (fid: string) => {
    const first = monthFirst()
    const last  = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]

    const [{ data: budgets }, { data: expenses }] = await Promise.all([
      supabase.from('budgets').select('category, amount').eq('family_id', fid).eq('month', first),
      supabase.from('expenses').select('category, amount').eq('family_id', fid).gte('date', first).lte('date', last),
    ])

    const spentMap: Record<string, number> = {}
    for (const e of expenses ?? []) {
      spentMap[e.category] = (spentMap[e.category] ?? 0) + Number(e.amount)
    }
    const budgetMap: Record<string, number> = {}
    for (const b of budgets ?? []) {
      budgetMap[b.category] = Number(b.amount)
    }

    const cats = new Set([...Object.keys(budgetMap), ...Object.keys(spentMap)])
    const newRows: BudgetRow[] = CATEGORIES
      .filter(c => cats.has(c.value) || showAll)
      .map(c => ({ category: c.value, budget: budgetMap[c.value] ?? 0, spent: spentMap[c.value] ?? 0 }))

    setRows(newRows)
  }, [supabase, showAll])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('family_id').eq('user_id', user.id).single()
      if (!profile?.family_id) { setNoFamily(true); setLoading(false); return }
      setFamilyId(profile.family_id)
      await loadData(profile.family_id)
      setLoading(false)
    }
    init()
  }, [supabase, loadData])

  useEffect(() => {
    if (familyId) loadData(familyId)
  }, [showAll, familyId, loadData])

  function updateBudget(category: string, value: string) {
    const num = parseFloat(value) || 0
    setRows(prev => prev.map(r => r.category === category ? { ...r, budget: num } : r))
  }

  async function handleSave() {
    setSaving(true)
    const first = monthFirst()
    const toUpsert = rows
      .filter(r => r.budget > 0)
      .map(r => ({ family_id: familyId, category: r.category, month: first, amount: r.budget, created_by: userId }))

    if (toUpsert.length > 0) {
      await supabase.from('budgets').upsert(toUpsert, { onConflict: 'family_id,category,month' })
    }
    const zeroCats = rows.filter(r => r.budget === 0).map(r => r.category)
    if (zeroCats.length > 0) {
      await supabase.from('budgets').delete()
        .eq('family_id', familyId).eq('month', first).in('category', zeroCats)
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function copyFromLastMonth() {
    setCopying(true)
    const prevFirst = monthFirst(-1)
    const { data: prev } = await supabase.from('budgets').select('category, amount')
      .eq('family_id', familyId).eq('month', prevFirst)
    if (prev && prev.length > 0) {
      setRows(current => current.map(r => {
        const match = prev.find(p => p.category === r.category)
        return match ? { ...r, budget: Number(match.amount) } : r
      }))
      const existingCats = new Set(rows.map(r => r.category))
      const newOnes = prev.filter(p => !existingCats.has(p.category))
      if (newOnes.length > 0) {
        setRows(prev2 => [...prev2, ...newOnes.map(p => ({ category: p.category, budget: Number(p.amount), spent: 0 }))])
      }
    }
    setCopying(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  if (noFamily) return (
    <div className="px-4 py-12 text-center">
      <p className="text-gray-500 mb-3">Necesitas unirte a una familia primero.</p>
      <a href="/family" className="text-blue-600 underline font-medium">Ir a Familia →</a>
    </div>
  )

  const now = new Date()
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
  const totalSpent  = rows.reduce((s, r) => s + r.spent,  0)
  const totalPct    = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const totalOver   = totalSpent > totalBudget && totalBudget > 0
  const totalWarn   = totalPct > 80 && !totalOver

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-4 pt-5 pb-2">
        <h1 className="text-xl font-bold text-gray-900">Presupuestos</h1>
        <p className="text-sm text-gray-400 capitalize">{monthLabel}</p>
      </div>

      {/* ── Summary card ─────────────────────────────────────────────────── */}
      {(totalBudget > 0 || totalSpent > 0) && (
        <div className="px-4 mb-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <BarChart3 size={16} className="text-blue-500" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Resumen total</p>
                  <p className="text-[11px] text-gray-400">{rows.filter(r => r.budget > 0).length} categorías presupuestadas</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-gray-900">${totalSpent.toFixed(2)}</p>
                <p className="text-[11px] text-gray-400">de ${totalBudget.toFixed(2)}</p>
              </div>
            </div>
            {totalBudget > 0 && (
              <>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full transition-all ${totalOver ? 'bg-red-500' : totalWarn ? 'bg-yellow-400' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(totalPct, 100)}%` }}
                  />
                </div>
                <p className={`text-[11px] font-semibold ${totalOver ? 'text-red-600' : totalWarn ? 'text-yellow-600' : 'text-green-600'}`}>
                  {totalOver
                    ? `Excedido por $${(totalSpent - totalBudget).toFixed(2)}`
                    : `${totalPct.toFixed(0)}% del presupuesto usado`}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <button onClick={copyFromLastMonth} disabled={copying}
          className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl active:bg-gray-50 disabled:opacity-60">
          <Copy size={14} strokeWidth={2} />
          {copying ? 'Copiando…' : 'Copiar mes anterior'}
        </button>
        <button onClick={() => setShowAll(v => !v)}
          className="border border-gray-200 text-gray-600 text-sm font-medium py-2.5 px-3 rounded-xl active:bg-gray-50">
          {showAll ? 'Solo activas' : 'Todas'}
        </button>
      </div>

      {/* Rows */}
      <div className="px-4 space-y-3">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BarChart3 size={40} className="mx-auto mb-3 opacity-25" strokeWidth={1.2} />
            <p className="text-sm">Sin categorías aún.<br />Toca &quot;Todas&quot; para ver todas las categorías.</p>
          </div>
        ) : (
          rows.map(row => {
            const pct      = row.budget > 0 ? (row.spent / row.budget) * 100 : (row.spent > 0 ? 999 : 0)
            const over     = pct > 100
            const warn     = pct > 80 && pct <= 100
            const barColor = over ? 'bg-red-500' : warn ? 'bg-yellow-400' : 'bg-green-500'
            const textColor = over ? 'text-red-600' : warn ? 'text-yellow-600' : 'text-gray-500'

            return (
              <div key={row.category} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-800">{getCategoryLabel(row.category)}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">$</span>
                    <input
                      type="number" min="0" step="1" placeholder="0"
                      value={row.budget || ''}
                      onChange={e => updateBudget(row.category, e.target.value)}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                </div>
                {(row.budget > 0 || row.spent > 0) ? (
                  <>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-400">
                        Gastado: <span className="font-medium text-gray-600">${row.spent.toFixed(2)}</span>
                      </span>
                      <span className={`font-semibold ${textColor}`}>
                        {over
                          ? `+$${(row.spent - row.budget).toFixed(2)} excedido`
                          : row.budget > 0 ? `${pct.toFixed(0)}% usado` : ''}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      {/* Save button */}
      <div className="px-4 py-5">
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-base active:opacity-90">
          {saved
            ? <><Check size={18} strokeWidth={2.5} /> Guardado</>
            : saving
              ? 'Guardando…'
              : <><Save size={16} strokeWidth={2} /> Guardar presupuestos</>}
        </button>
      </div>
    </div>
  )
}
