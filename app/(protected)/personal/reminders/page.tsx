'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Bell, Pencil, Trash2, X, Check, CreditCard, RefreshCw, BellOff } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Account = { id: string; name: string; color: string }
type Card    = { id: string; account_id: string; name: string; last_four: string | null; color: string }

type Reminder = {
  id: string
  title: string
  amount: number | null
  type: 'tarjeta' | 'recurrente'
  account_id: string | null
  card_id: string | null
  due_day: number
  notes: string | null
  color: string
  is_active: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  '#F59E0B', '#EF4444', '#3B82F6', '#22C55E', '#A855F7',
  '#F97316', '#EC4899', '#14B8A6', '#6366F1', '#0EA5E9',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntilDue(dueDay: number): number {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const currentDay = today.getDate()
  const dueDate    = new Date(today.getFullYear(), today.getMonth() + (dueDay >= currentDay ? 0 : 1), dueDay)
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
}

function dueBadge(days: number) {
  if (days === 0) return { label: '¡Hoy!',           cls: 'bg-red-100 text-red-600' }
  if (days === 1) return { label: 'Mañana',          cls: 'bg-orange-100 text-orange-600' }
  if (days <= 7)  return { label: `En ${days} días`, cls: 'bg-yellow-100 text-yellow-700' }
  return              { label: `Día ${days}°`,       cls: 'bg-gray-100 text-gray-500' }
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const supabase = createClient()

  const [userId,    setUserId]    = useState<string | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [cards,     setCards]     = useState<Card[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  // Form
  const [showForm,    setShowForm]    = useState(false)
  const [editId,      setEditId]      = useState<string | null>(null)
  const [rTitle,      setRTitle]      = useState('')
  const [rAmount,     setRAmount]     = useState('')
  const [rType,       setRType]       = useState<'tarjeta' | 'recurrente'>('recurrente')
  const [rAccountId,  setRAccountId]  = useState('')
  const [rCardId,     setRCardId]     = useState('')
  const [rDueDay,     setRDueDay]     = useState('')
  const [rNotes,      setRNotes]      = useState('')
  const [rColor,      setRColor]      = useState(COLORS[0])
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: rems }, { data: accs }, { data: cds }] = await Promise.all([
      supabase.from('personal_reminders')
        .select('*').eq('user_id', user.id).order('due_day', { ascending: true }),
      supabase.from('savings_accounts')
        .select('id, name, color').eq('user_id', user.id).eq('is_archived', false),
      supabase.from('savings_credit_cards')
        .select('id, account_id, name, last_four, color').eq('user_id', user.id).eq('is_active', true),
    ])

    setReminders(rems ?? [])
    setAccounts(accs ?? [])
    setCards(cds ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditId(null); setRTitle(''); setRAmount(''); setRType('recurrente')
    setRAccountId(''); setRCardId(''); setRDueDay(''); setRNotes('')
    setRColor(COLORS[0]); setFormError(''); setShowForm(true)
  }

  function openEdit(r: Reminder) {
    setEditId(r.id); setRTitle(r.title); setRAmount(r.amount ? String(r.amount) : '')
    setRType(r.type); setRAccountId(r.account_id ?? ''); setRCardId(r.card_id ?? '')
    setRDueDay(String(r.due_day)); setRNotes(r.notes ?? '')
    setRColor(r.color); setFormError(''); setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    if (!rTitle.trim())   { setFormError('El nombre es requerido'); return }
    const dueDay = parseInt(rDueDay)
    if (!rDueDay || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      setFormError('Día del mes inválido (1-31)'); return
    }
    const amt = rAmount ? parseFloat(rAmount) : null
    if (rAmount && (isNaN(amt!) || amt! <= 0)) { setFormError('Monto inválido'); return }

    setSaving(true)
    const payload = {
      title: rTitle.trim(),
      amount: amt,
      type: rType,
      account_id: rAccountId || null,
      card_id: rType === 'tarjeta' && rCardId ? rCardId : null,
      due_day: dueDay,
      notes: rNotes.trim() || null,
      color: rColor,
    }

    if (editId) {
      const { error } = await supabase.from('personal_reminders').update(payload).eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('personal_reminders')
        .insert({ ...payload, user_id: userId, is_active: true })
      if (error) { setFormError(error.message); setSaving(false); return }
    }

    setSaving(false); setShowForm(false); await load()
  }

  async function toggleActive(r: Reminder) {
    await supabase.from('personal_reminders').update({ is_active: !r.is_active }).eq('id', r.id)
    await load()
  }

  async function deleteReminder(r: Reminder) {
    if (!confirm(`¿Eliminar recordatorio "${r.title}"?`)) return
    await supabase.from('personal_reminders').delete().eq('id', r.id)
    await load()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const visible    = reminders.filter(r => showInactive ? !r.is_active : r.is_active)
  const hasInactive = reminders.some(r => !r.is_active)

  // Filtered cards for the selected account in the form
  const availableCards = rAccountId
    ? cards.filter(c => c.account_id === rAccountId)
    : cards

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  return (
    <div className="max-w-lg mx-auto pb-6">

      {/* ── Encabezado ───────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recordatorios</h1>
          <p className="text-xs text-gray-400 mt-0.5">Pagos y fechas importantes</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 bg-amber-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} /> Nuevo
        </button>
      </div>

      {/* Toggle inactivos */}
      {hasInactive && (
        <div className="px-4 mb-3">
          <button onClick={() => setShowInactive(v => !v)}
            className="text-xs font-semibold text-gray-400 active:text-gray-600 flex items-center gap-1"
          >
            {showInactive
              ? <><Bell size={12} /> Ver activos</>
              : <><BellOff size={12} /> Ver pausados ({reminders.filter(r => !r.is_active).length})</>
            }
          </button>
        </div>
      )}

      {/* ── Lista ─────────────────────────────────────── */}
      <div className="px-4 space-y-3">
        {visible.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Bell size={28} className="text-amber-400" strokeWidth={1.5} />
            </div>
            <h3 className="font-bold text-gray-700 text-base mb-2">
              {showInactive ? 'No hay recordatorios pausados' : 'Sin recordatorios aún'}
            </h3>
            {!showInactive && (
              <p className="text-sm text-gray-400 mb-5 max-w-xs mx-auto">
                Crea alertas para vencimientos de tarjetas, cuotas de préstamos y pagos recurrentes.
              </p>
            )}
            {!showInactive && (
              <button onClick={openAdd}
                className="inline-flex items-center gap-2 bg-amber-500 text-white font-semibold px-6 py-3 rounded-2xl text-sm active:opacity-80 shadow-md"
              >
                <Plus size={16} strokeWidth={2.5} /> Crear recordatorio
              </button>
            )}
          </div>
        ) : (
          visible.map(r => {
            const days  = daysUntilDue(r.due_day)
            const badge = dueBadge(days)
            const linkedCard = r.card_id ? cards.find(c => c.id === r.card_id) : null
            const linkedAcc  = r.account_id ? accounts.find(a => a.id === r.account_id) : null

            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3.5 flex items-start gap-3">
                  {/* Icono */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: r.color + '22' }}
                  >
                    {r.type === 'tarjeta'
                      ? <CreditCard size={18} style={{ color: r.color }} strokeWidth={1.8} />
                      : <RefreshCw  size={18} style={{ color: r.color }} strokeWidth={1.8} />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-[15px]">{r.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {r.amount && (
                      <p className="text-sm font-bold text-gray-700 mt-0.5">{fmt(r.amount)}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] text-gray-400">Día {r.due_day} de cada mes</span>
                      {linkedCard && (
                        <span className="text-[11px] text-indigo-500 flex items-center gap-0.5">
                          <CreditCard size={10} /> {linkedCard.name}{linkedCard.last_four ? ` ···${linkedCard.last_four}` : ''}
                        </span>
                      )}
                      {linkedAcc && !linkedCard && (
                        <span className="text-[11px] text-gray-400">{linkedAcc.name}</span>
                      )}
                    </div>
                    {r.notes && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{r.notes}</p>}
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(r)} className="text-gray-300 active:text-blue-500 p-1">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleActive(r)}
                      className={`p-1 ${r.is_active ? 'text-gray-300 active:text-orange-500' : 'text-orange-400 active:text-orange-600'}`}
                    >
                      {r.is_active ? <BellOff size={14} /> : <Bell size={14} />}
                    </button>
                    <button onClick={() => deleteReminder(r)} className="text-gray-300 active:text-red-500 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Barra de urgencia */}
                <div className={`h-1 ${
                  days === 0 ? 'bg-red-400' :
                  days <= 3  ? 'bg-orange-400' :
                  days <= 7  ? 'bg-yellow-400' : 'bg-gray-100'
                }`} />
              </div>
            )
          })
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BOTTOM SHEET — Formulario
      ════════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editId ? 'Editar recordatorio' : 'Nuevo recordatorio'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>

            <form id="reminder-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 space-y-5 pt-2 pb-4">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}

              {/* Tipo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { v: 'recurrente', emoji: '🔄', label: 'Recurrente',  desc: 'Cuota, préstamo, servicio…' },
                    { v: 'tarjeta',    emoji: '💳', label: 'Tarjeta',     desc: 'Pago de tarjeta de crédito' },
                  ] as const).map(({ v, emoji, label, desc }) => (
                    <button key={v} type="button" onClick={() => setRType(v)}
                      className={`px-3 py-3 rounded-2xl border-2 text-left transition-all active:scale-95 ${
                        rType === v ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                      }`}
                    >
                      <p className="text-base mb-0.5">{emoji}</p>
                      <p className={`font-semibold text-sm ${rType === v ? 'text-amber-700' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Nombre del recordatorio
                </label>
                <input type="text" required placeholder="Ej: Cuota del carro, Visa Platino…"
                  value={rTitle} onChange={e => setRTitle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Monto + día */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Monto <span className="font-normal normal-case">(opcional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold pointer-events-none">$</span>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={rAmount} onChange={e => setRAmount(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-7 pr-3 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Día de pago
                  </label>
                  <input type="number" required min="1" max="31" inputMode="numeric" placeholder="Ej: 15"
                    value={rDueDay} onChange={e => setRDueDay(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Día del mes</p>
                </div>
              </div>

              {/* Cuenta vinculada */}
              {accounts.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Cuenta vinculada <span className="font-normal normal-case">(opcional)</span>
                  </label>
                  <select value={rAccountId} onChange={e => { setRAccountId(e.target.value); setRCardId('') }}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— Sin cuenta —</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tarjeta vinculada (solo tipo tarjeta) */}
              {rType === 'tarjeta' && availableCards.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Tarjeta <span className="font-normal normal-case">(opcional)</span>
                  </label>
                  <select value={rCardId} onChange={e => setRCardId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— Sin tarjeta específica —</option>
                    {availableCards.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.last_four ? ` ···${c.last_four}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Notas <span className="font-normal normal-case">(opcional)</span>
                </label>
                <textarea rows={2} placeholder="Ej: Pago mínimo $150, número de cuenta…"
                  value={rNotes} onChange={e => setRNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setRColor(c)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                        rColor === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {rColor === c && <Check size={14} className="text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <button type="button" onClick={() => setShowForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0"
              >
                Cancelar
              </button>
              <button form="reminder-form" type="submit" disabled={saving}
                className="flex-1 bg-amber-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90"
              >
                {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Crear recordatorio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
