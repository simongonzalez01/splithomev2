'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import CategorySelect from '@/components/CategorySelect'
import { DEFAULT_CATEGORY, FIXED_PRESETS } from '@/lib/categories'
import { CalendarClock, Plus, X, Check, Pencil, Trash2, Bell, RefreshCw, Zap } from 'lucide-react'

type FixedExpense = {
  id: string; name: string; amount: number; category: string
  due_day: number; default_paid_by: string | null; is_active: boolean; created_by: string
  start_date: string | null; is_recurring: boolean | null
}

function monthFirst() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().split('T')[0]
}
function monthFirstOf(dateStr: string) {
  return dateStr.slice(0, 7) + '-01'
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function fmtShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntilDue(dueDay: number): number {
  const today    = new Date()
  const todayDay = today.getDate()
  if (dueDay >= todayDay) return dueDay - todayDay
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return (daysInMonth - todayDay) + dueDay
}

export default function FixedPage() {
  const supabase = createClient()
  const [userId,    setUserId]    = useState<string | null>(null)
  const [familyId,  setFamilyId]  = useState<string | null>(null)
  const [members,   setMembers]   = useState<{ user_id: string; display_name: string | null }[]>([])
  const [fixedList, setFixedList] = useState<FixedExpense[]>([])
  const [paidIds,   setPaidIds]   = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)
  const [noFamily,  setNoFamily]  = useState(false)

  // Form state
  const [showForm,      setShowForm]      = useState(false)
  const [showPresets,   setShowPresets]   = useState(false)
  const [editId,        setEditId]        = useState<string | null>(null)
  const [name,          setName]          = useState('')
  const [amount,        setAmount]        = useState('')
  const [category,      setCategory]      = useState(DEFAULT_CATEGORY)
  const [dueDay,        setDueDay]        = useState('1')
  const [defaultPaidBy, setDefaultPaidBy] = useState('')
  const [startDate,     setStartDate]     = useState(todayStr())
  const [isRecurring,   setIsRecurring]   = useState(true)
  const [formError,     setFormError]     = useState('')
  const [saving,        setSaving]        = useState(false)

  // Confirmar pago con fecha
  const [markingId,   setMarkingId]   = useState<string | null>(null)
  const [pendingMark, setPendingMark] = useState<{ fixed: FixedExpense; date: string } | null>(null)

  const memberName = (uid: string | null) =>
    members.find(m => m.user_id === uid)?.display_name || 'Miembro'

  const loadData = useCallback(async (fid: string) => {
    const month = monthFirst()
    const [{ data: fixed }, { data: payments }] = await Promise.all([
      supabase.from('fixed_expenses').select('*').eq('family_id', fid).order('due_day'),
      supabase.from('fixed_expense_payments').select('fixed_expense_id').eq('family_id', fid).eq('month', month),
    ])
    setFixedList(fixed ?? [])
    setPaidIds(new Set((payments ?? []).map(p => p.fixed_expense_id)))
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id); setDefaultPaidBy(user.id)
      const { data: profile } = await supabase.from('profiles').select('family_id').eq('user_id', user.id).single()
      if (!profile?.family_id) { setNoFamily(true); setLoading(false); return }
      setFamilyId(profile.family_id)
      const { data: mems } = await supabase.from('profiles').select('user_id, display_name').eq('family_id', profile.family_id)
      setMembers(mems ?? [])
      await loadData(profile.family_id)
      setLoading(false)
    }
    init()
  }, [supabase, loadData])

  function openAdd(preset?: typeof FIXED_PRESETS[0]) {
    setEditId(null)
    setName(preset?.name ?? ''); setAmount(preset?.amount ? String(preset.amount) : '')
    setCategory(preset?.category ?? DEFAULT_CATEGORY); setDueDay('1')
    setDefaultPaidBy(userId ?? ''); setStartDate(todayStr()); setIsRecurring(true)
    setFormError(''); setShowForm(true); setShowPresets(false)
  }

  function openEdit(f: FixedExpense) {
    setEditId(f.id); setName(f.name); setAmount(String(f.amount))
    setCategory(f.category); setDueDay(String(f.due_day))
    setDefaultPaidBy(f.default_paid_by ?? userId ?? '')
    setStartDate(f.start_date ?? todayStr())
    setIsRecurring(f.is_recurring ?? true)
    setFormError(''); setShowForm(true)
  }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault(); setFormError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt < 0) { setFormError('Monto inválido'); return }
    const day = parseInt(dueDay)
    if (isNaN(day) || day < 1 || day > 31) { setFormError('Día debe ser 1-31'); return }
    setSaving(true)
    const payload = {
      name, amount: amt, category, due_day: day,
      default_paid_by: defaultPaidBy,
      start_date: startDate || null,
      is_recurring: isRecurring,
    }
    if (editId) {
      const { error } = await supabase.from('fixed_expenses').update(payload).eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('fixed_expenses')
        .insert({ family_id: familyId, created_by: userId, ...payload })
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false)
    await loadData(familyId!)
  }

  async function handleMarkPaid(f: FixedExpense, payDate: string) {
    setMarkingId(f.id); setPendingMark(null)
    const month = monthFirstOf(payDate)
    const { data: exp, error: expErr } = await supabase.from('expenses')
      .insert({ family_id: familyId, title: f.name, amount: f.amount, date: payDate, category: f.category, paid_by: f.default_paid_by ?? userId })
      .select().single()
    if (expErr || !exp) { setMarkingId(null); return }
    await supabase.from('fixed_expense_payments')
      .insert({ fixed_expense_id: f.id, family_id: familyId, month, expense_id: exp.id, created_by: userId })
    setPaidIds(prev => new Set([...prev, f.id]))

    // If one-time (not recurring), auto-deactivate after payment
    if (!(f.is_recurring ?? true)) {
      await supabase.from('fixed_expenses').update({ is_active: false }).eq('id', f.id)
      setFixedList(prev => prev.filter(fx => fx.id !== f.id))
    }

    setMarkingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este gasto fijo?')) return
    await supabase.from('fixed_expenses').update({ is_active: false }).eq('id', id)
    setFixedList(prev => prev.filter(f => f.id !== id))
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  if (noFamily) return (
    <div className="px-4 py-12 text-center">
      <p className="text-gray-500 mb-3">Necesitas unirte a una familia primero.</p>
      <a href="/family" className="text-blue-600 underline font-medium">Ir a Familia →</a>
    </div>
  )

  const active = fixedList.filter(f => f.is_active)
  const unpaid = active.filter(f => !paidIds.has(f.id))
  const paid   = active.filter(f => paidIds.has(f.id))
  const soonDue = unpaid.filter(f => daysUntilDue(f.due_day) <= 5)

  return (
    <div className="max-w-lg mx-auto">

      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gastos Fijos</h1>
          <p className="text-xs text-gray-400 mt-0.5">{unpaid.length} pendientes · {paid.length} pagados</p>
        </div>
        <button onClick={() => setShowPresets(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-2xl active:opacity-80">
          <Plus size={15} strokeWidth={2.5} />
          Agregar
        </button>
      </div>

      {/* ── Due-soon reminder banner ──────────────────────────────────────── */}
      {soonDue.length > 0 && (
        <div className="px-4 mb-3">
          <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 flex items-start gap-3">
            <Bell size={16} className="text-orange-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                {soonDue.length === 1 ? 'Pago próximo a vencer' : `${soonDue.length} pagos próximos a vencer`}
              </p>
              <p className="text-xs text-orange-600 mt-0.5 leading-relaxed">
                {soonDue.map(f => {
                  const d = daysUntilDue(f.due_day)
                  return d === 0 ? `${f.name} (hoy!)` : `${f.name} (${d}d)`
                }).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm payment sheet ────────────────────────────────────────── */}
      {pendingMark && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setPendingMark(null)}>
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Confirmar pago</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {pendingMark.fixed.name} · ${Number(pendingMark.fixed.amount).toFixed(2)}
                {!(pendingMark.fixed.is_recurring ?? true) && (
                  <span className="ml-2 text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                    Se eliminará al confirmar
                  </span>
                )}
              </p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                Fecha de pago
              </label>
              <input
                type="date"
                value={pendingMark.date}
                onChange={e => setPendingMark(prev => prev ? { ...prev, date: e.target.value } : null)}
                className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPendingMark(null)}
                className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3.5 rounded-xl">
                Cancelar
              </button>
              <button
                onClick={() => handleMarkPaid(pendingMark.fixed, pendingMark.date)}
                disabled={markingId === pendingMark.fixed.id}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl">
                <Check size={16} strokeWidth={2.5} />
                {markingId ? 'Registrando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Presets sheet ─────────────────────────────────────────────────── */}
      {showPresets && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowPresets(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <h2 className="font-bold text-gray-900 mb-3">Elige un preset o crea uno</h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {FIXED_PRESETS.map(p => (
                <button key={p.name} onClick={() => openAdd(p)}
                  className="border border-gray-200 rounded-xl px-3 py-3 text-left active:bg-blue-50">
                  <p className="font-medium text-sm text-gray-800">{p.name}</p>
                  {p.amount > 0 && <p className="text-xs text-gray-400">${p.amount}/mes</p>}
                </button>
              ))}
            </div>
            <button onClick={() => openAdd()}
              className="w-full border-2 border-dashed border-blue-300 rounded-xl py-3 text-sm text-blue-600 font-medium">
              + Crear personalizado
            </button>
          </div>
        </div>
      )}

      {/* ── Add / Edit form sheet ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full rounded-t-3xl flex flex-col shadow-2xl"
            style={{ maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}>

            {/* Handle + title */}
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{editId ? 'Editar fijo' : 'Nuevo fijo'}</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 p-1">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <form id="fixed-form" onSubmit={handleSave}
              className="flex-1 overflow-y-auto px-5 space-y-4 pt-1 pb-4">

              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}

              {/* Nombre */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Nombre</label>
                <input type="text" required placeholder="Ej. Netflix" value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border border-gray-200 bg-gray-50 focus:bg-white transition-colors rounded-xl px-3 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Monto + Día de vencimiento */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Monto $</label>
                  <input type="number" required step="0.01" min="0" placeholder="0.00"
                    value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full border border-gray-200 bg-gray-50 focus:bg-white transition-colors rounded-xl px-3 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Día vence</label>
                  <input type="number" required min="1" max="31" placeholder="Día 1-31"
                    value={dueDay} onChange={e => setDueDay(e.target.value)}
                    className="w-full border border-gray-200 bg-gray-50 focus:bg-white transition-colors rounded-xl px-3 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Fecha de inicio */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Fecha de inicio
                </label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-gray-200 bg-gray-50 focus:bg-white transition-colors rounded-xl px-3 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Tipo de pago: Mensual / Una vez */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Tipo de pago
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsRecurring(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border-2 transition-all active:scale-95 ${
                      isRecurring
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}>
                    <RefreshCw size={14} strokeWidth={2.5} />
                    Mensual
                  </button>
                  <button type="button" onClick={() => setIsRecurring(false)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border-2 transition-all active:scale-95 ${
                      !isRecurring
                        ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}>
                    <Zap size={14} strokeWidth={2.5} />
                    Una vez
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                  {isRecurring
                    ? 'Se muestra todos los meses hasta desactivarlo'
                    : 'Se elimina automáticamente al marcar como pagado'}
                </p>
              </div>

              {/* Categoría */}
              <CategorySelect value={category} onChange={setCategory} required />

              {/* Quién paga */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Quién paga</label>
                <select value={defaultPaidBy} onChange={e => setDefaultPaidBy(e.target.value)}
                  className="w-full border border-gray-200 bg-gray-50 focus:bg-white transition-colors rounded-xl px-3 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.user_id.slice(0, 8)}{m.user_id === userId ? ' (yo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </form>

            {/* Sticky footer buttons */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0">
                Cancelar
              </button>
              <button form="fixed-form" type="submit" disabled={saving}
                className="flex-1 bg-blue-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90">
                {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className="px-4 space-y-4 pb-6">
        {active.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarClock size={44} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
            <p className="text-sm">Sin gastos fijos. Agrega Netflix, renta, etc.</p>
          </div>
        ) : (
          <>
            {unpaid.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Pendientes ({unpaid.length})
                </p>
                {unpaid.map(f => (
                  <FixedCard key={f.id} fixed={f} paid={false} marking={markingId === f.id}
                    userId={userId!} memberName={memberName}
                    daysUntil={daysUntilDue(f.due_day)}
                    onMarkPaid={() => setPendingMark({ fixed: f, date: todayStr() })}
                    onEdit={() => openEdit(f)}
                    onDelete={() => handleDelete(f.id)}
                  />
                ))}
              </div>
            )}
            {paid.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Pagados este mes ({paid.length})
                </p>
                {paid.map(f => (
                  <FixedCard key={f.id} fixed={f} paid userId={userId!} marking={false}
                    memberName={memberName} daysUntil={null}
                    onMarkPaid={() => {}} onEdit={() => openEdit(f)} onDelete={() => handleDelete(f.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FixedCard({ fixed, paid, marking, userId, memberName, daysUntil, onMarkPaid, onEdit, onDelete }: {
  fixed: FixedExpense; paid: boolean; marking: boolean; userId: string
  memberName: (uid: string | null) => string
  daysUntil: number | null
  onMarkPaid: () => void; onEdit: () => void; onDelete: () => void
}) {
  const recurring = fixed.is_recurring ?? true
  const urgent    = daysUntil !== null && daysUntil <= 2
  const soon      = daysUntil !== null && daysUntil <= 5 && daysUntil > 2

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      paid    ? 'border-green-100 opacity-60'
      : urgent ? 'border-orange-200'
      : soon   ? 'border-amber-100'
      :          'border-gray-100'
    }`}>
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          paid ? 'bg-green-50' : 'bg-orange-50'
        }`}>
          {paid
            ? <Check size={18} className="text-green-500" strokeWidth={2.5} />
            : <CalendarClock size={18} className="text-orange-400" strokeWidth={2} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`font-semibold text-sm ${paid ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {fixed.name}
            </p>
            {/* Due-soon badge */}
            {!paid && daysUntil !== null && daysUntil <= 5 && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                daysUntil === 0
                  ? 'bg-red-100 text-red-600'
                  : daysUntil <= 2
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-amber-50 text-amber-700'
              }`}>
                {daysUntil === 0 ? 'Hoy' : `${daysUntil}d`}
              </span>
            )}
            {/* Recurring / one-time badge */}
            {!paid && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                recurring
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-orange-50 text-orange-600'
              }`}>
                {recurring ? 'Mensual' : 'Una vez'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {fixed.category} · Día {fixed.due_day}
            {fixed.start_date && (
              <> · desde {new Date(fixed.start_date + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</>
            )}
            {' · '}{memberName(fixed.default_paid_by)}
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-bold text-gray-900">${Number(fixed.amount).toFixed(2)}</p>
          {!recurring && !paid && (
            <p className="text-[9px] text-orange-500 font-medium">única vez</p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
        {!paid && (
          <button onClick={onMarkPaid} disabled={marking}
            className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl active:opacity-80">
            {marking ? 'Registrando…' : <><Check size={14} strokeWidth={3} /> Marcar pagado</>}
          </button>
        )}
        {paid && <div className="flex-1" />}
        <button onClick={onEdit} className="text-gray-400 active:text-blue-500 p-2">
          <Pencil size={15} />
        </button>
        <button onClick={onDelete} className="text-gray-400 active:text-red-400 p-2">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
