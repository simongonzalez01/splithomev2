'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, CreditCard, Plus, X, Check, TrendingUp, TrendingDown,
  Image as ImageIcon, Camera, Eye, ChevronDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Card = {
  id: string
  account_id: string
  name: string
  last_four: string | null
  credit_limit: number
  initial_balance: number
  billing_cycle_day: number | null
  due_day: number | null
  color: string
}

type Tx = {
  id: string
  type: 'cargo' | 'pago'
  amount: number
  description: string | null
  category: string | null
  date: string
  receipt_url: string | null
  notes: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARGO_CATS  = ['Supermercado', 'Restaurante', 'Gasolina', 'Ropa', 'Entretenimiento', 'Salud', 'Viajes', 'Servicios', 'Otro']
const PAGO_CATS   = ['Pago mínimo', 'Pago total', 'Pago parcial']

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysUntilDue(dueDay: number): number {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const currentDay = today.getDate()
  const dueDate    = new Date(today.getFullYear(), today.getMonth() + (dueDay >= currentDay ? 0 : 1), dueDay)
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CardDetailPage() {
  const supabase = createClient()
  const params   = useParams()
  const router   = useRouter()
  const cardId   = params.id as string

  const [userId,   setUserId]   = useState<string | null>(null)
  const [card,     setCard]     = useState<Card | null>(null)
  const [txs,      setTxs]      = useState<Tx[]>([])
  const [loading,  setLoading]  = useState(true)
  const [month,    setMonth]    = useState(() => new Date().toISOString().slice(0, 7))

  // Form
  const [showForm,   setShowForm]   = useState(false)
  const [txType,     setTxType]     = useState<'cargo' | 'pago'>('cargo')
  const [amount,     setAmount]     = useState('')
  const [desc,       setDesc]       = useState('')
  const [category,   setCategory]   = useState('')
  const [date,       setDate]       = useState(() => new Date().toISOString().slice(0, 10))
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  // Receipt
  const [receiptFile,   setReceiptFile]   = useState<File | null>(null)
  const [receiptPreview,setReceiptPreview] = useState<string | null>(null)
  const [viewingUrl,    setViewingUrl]    = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: cardData }, { data: txData }] = await Promise.all([
      supabase.from('savings_credit_cards').select('*').eq('id', cardId).single(),
      supabase.from('savings_credit_card_transactions')
        .select('*').eq('card_id', cardId)
        .gte('date', month + '-01').lte('date', month + '-31')
        .order('date', { ascending: false }),
    ])

    setCard(cardData)
    setTxs(txData ?? [])
    setLoading(false)
  }, [supabase, cardId, month])

  useEffect(() => { load() }, [load])

  // ── Totals ────────────────────────────────────────────────────────────────

  const allCargos = txs.filter(t => t.type === 'cargo').reduce((s, t) => s + Number(t.amount), 0)
  const allPagos  = txs.filter(t => t.type === 'pago').reduce((s, t) => s + Number(t.amount), 0)

  // Balance total (all time, not filtered by month)
  const [totalBalance, setTotalBalance] = useState(0)
  useEffect(() => {
    if (!card) return
    supabase.from('savings_credit_card_transactions')
      .select('type, amount').eq('card_id', cardId)
      .then(({ data }) => {
        const cargos = (data ?? []).filter(t => t.type === 'cargo').reduce((s, t) => s + Number(t.amount), 0)
        const pagos  = (data ?? []).filter(t => t.type === 'pago').reduce((s, t) => s + Number(t.amount), 0)
        setTotalBalance(Number(card.initial_balance) + cargos - pagos)
      })
  }, [card, supabase, cardId, txs])

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openAdd(type: 'cargo' | 'pago' = 'cargo') {
    setTxType(type)
    setAmount(''); setDesc(''); setCategory(''); setNotes('')
    setDate(new Date().toISOString().slice(0, 10))
    setReceiptFile(null); setReceiptPreview(null)
    setFormError(''); setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setFormError('Monto inválido'); return }
    setSaving(true)

    let receipt_url: string | null = null
    if (receiptFile && userId) {
      const ext  = receiptFile.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, receiptFile)
      if (!upErr) receipt_url = path
    }

    const { error } = await supabase.from('savings_credit_card_transactions').insert({
      card_id: cardId, user_id: userId,
      type: txType, amount: amt,
      description: desc.trim() || null,
      category: category || null,
      date, notes: notes.trim() || null,
      receipt_url,
    })

    if (error) { setFormError(error.message); setSaving(false); return }
    setSaving(false); setShowForm(false); await load()
  }

  function pickFile(camera: boolean) {
    if (!fileRef.current) return
    if (camera) {
      fileRef.current.setAttribute('capture', 'environment')
      setTimeout(() => fileRef.current?.removeAttribute('capture'), 500)
    } else {
      fileRef.current.removeAttribute('capture')
    }
    fileRef.current.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setReceiptFile(file)
    const reader = new FileReader()
    reader.onload = ev => setReceiptPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function viewReceipt(path: string) {
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
    if (data?.signedUrl) setViewingUrl(data.signedUrl)
  }

  // ── Month picker helpers ──────────────────────────────────────────────────

  function prevMonth() {
    const d = new Date(month + '-01'); d.setMonth(d.getMonth() - 1)
    setMonth(d.toISOString().slice(0, 7))
  }
  function nextMonth() {
    const d = new Date(month + '-01'); d.setMonth(d.getMonth() + 1)
    if (d <= new Date()) setMonth(d.toISOString().slice(0, 7))
  }
  const [mYear, mMonthIdx] = month.split('-').map(Number)
  const monthLabel = `${MONTHS[mMonthIdx - 1]} ${mYear}`

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )
  if (!card) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-gray-400 text-sm">Tarjeta no encontrada.</p>
      <button onClick={() => router.back()} className="text-emerald-600 text-sm font-semibold">Volver</button>
    </div>
  )

  const available = Math.max(0, Number(card.credit_limit) - totalBalance)
  const usedPct   = card.credit_limit > 0 ? Math.min(totalBalance / Number(card.credit_limit), 1) : 0
  const days      = card.due_day ? daysUntilDue(card.due_day) : null
  const cats      = txType === 'cargo' ? CARGO_CATS : PAGO_CATS

  return (
    <div className="max-w-lg mx-auto pb-6">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 active:text-gray-600">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: card.color + '22' }}>
            <CreditCard size={16} style={{ color: card.color }} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate text-[17px]">{card.name}</p>
            {card.last_four && <p className="text-xs text-gray-400">···{card.last_four}</p>}
          </div>
        </div>
      </div>

      {/* ── Card resumen ─────────────────────────────────── */}
      <div className="mx-4 mb-4 rounded-3xl p-5 text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}
      >
        <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-1">Saldo adeudado</p>
        <p className="text-3xl font-bold">{fmt(totalBalance)}</p>

        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-white/70 transition-all" style={{ width: `${usedPct * 100}%` }} />
        </div>

        <div className="flex justify-between mt-2 text-xs text-white/70">
          <span>Disponible: {fmt(available)}</span>
          <span>Límite: {fmt(Number(card.credit_limit))}</span>
        </div>

        {days !== null && (
          <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
            days <= 3 ? 'bg-red-500/30 text-red-100' :
            days <= 7 ? 'bg-orange-400/30 text-orange-100' :
                        'bg-white/20 text-white/80'
          }`}>
            {days === 0 ? '¡Vence hoy!' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`}
            {card.billing_cycle_day && ` · Corte día ${card.billing_cycle_day}`}
          </div>
        )}
      </div>

      {/* ── Acciones rápidas ─────────────────────────────── */}
      <div className="px-4 flex gap-2 mb-4">
        <button onClick={() => openAdd('cargo')}
          className="flex-1 bg-red-50 border border-red-100 rounded-2xl py-3 flex flex-col items-center gap-1 active:bg-red-100"
        >
          <TrendingUp size={18} className="text-red-500" />
          <span className="text-xs font-bold text-red-600">Cargo</span>
        </button>
        <button onClick={() => openAdd('pago')}
          className="flex-1 bg-emerald-50 border border-emerald-100 rounded-2xl py-3 flex flex-col items-center gap-1 active:bg-emerald-100"
        >
          <TrendingDown size={18} className="text-emerald-500" />
          <span className="text-xs font-bold text-emerald-600">Pago</span>
        </button>
      </div>

      {/* ── Mes + resumen ─────────────────────────────────── */}
      <div className="px-4 mb-3 flex items-center justify-between">
        <button onClick={prevMonth} className="text-gray-400 active:text-gray-600 px-2 py-1">‹</button>
        <span className="text-sm font-bold text-gray-700 capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="text-gray-400 active:text-gray-600 px-2 py-1">›</button>
      </div>

      {(allCargos > 0 || allPagos > 0) && (
        <div className="px-4 mb-3 grid grid-cols-2 gap-2">
          <div className="bg-red-50 rounded-2xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-0.5">Cargos</p>
            <p className="text-red-600 font-bold text-base">{fmt(allCargos)}</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl px-3 py-2.5">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide mb-0.5">Pagos</p>
            <p className="text-emerald-600 font-bold text-base">{fmt(allPagos)}</p>
          </div>
        </div>
      )}

      {/* ── Lista transacciones ────────────────────────────── */}
      <div className="px-4 space-y-2">
        {txs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CreditCard size={32} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
            <p className="text-sm">Sin movimientos este mes.</p>
            <button onClick={() => openAdd('cargo')}
              className="mt-4 text-xs font-semibold text-indigo-500 active:opacity-70"
            >
              Registrar un cargo
            </button>
          </div>
        ) : (
          txs.map(tx => (
            <div key={tx.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                tx.type === 'cargo' ? 'bg-red-50' : 'bg-emerald-50'
              }`}>
                {tx.type === 'cargo'
                  ? <TrendingUp size={16} className="text-red-500" />
                  : <TrendingDown size={16} className="text-emerald-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-[14px] truncate">
                  {tx.description || tx.category || (tx.type === 'cargo' ? 'Cargo' : 'Pago')}
                </p>
                {tx.category && tx.description && (
                  <p className="text-xs text-gray-400 truncate">{tx.category}</p>
                )}
                <p className="text-xs text-gray-400">{new Date(tx.date + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-bold text-[15px] ${tx.type === 'cargo' ? 'text-red-500' : 'text-emerald-600'}`}>
                  {tx.type === 'cargo' ? '+' : '-'}{fmt(Number(tx.amount))}
                </p>
                {tx.receipt_url && (
                  <button onClick={() => viewReceipt(tx.receipt_url!)}
                    className="text-[10px] text-indigo-400 active:text-indigo-600 flex items-center gap-0.5 ml-auto mt-0.5"
                  >
                    <Eye size={10} /> Ver
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── FAB ───────────────────────────────────────────── */}
      <button
        onClick={() => openAdd('cargo')}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ backgroundColor: card.color }}
      >
        <Plus size={22} className="text-white" strokeWidth={2.5} />
      </button>

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
                <h2 className="text-lg font-bold text-gray-900">Nuevo movimiento</h2>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>

            <form id="card-tx-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 space-y-5 pt-2 pb-4">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}

              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {(['cargo', 'pago'] as const).map(t => (
                  <button key={t} type="button" onClick={() => { setTxType(t); setCategory('') }}
                    className={`py-3 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95 ${
                      txType === t
                        ? t === 'cargo' ? 'border-red-400 bg-red-50 text-red-600' : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 text-gray-400'
                    }`}
                  >
                    {t === 'cargo' ? '📤 Cargo' : '📥 Pago'}
                  </button>
                ))}
              </div>

              {/* Monto */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Monto</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg pointer-events-none">$</span>
                  <input type="number" required min="0.01" step="0.01" placeholder="0.00" value={amount}
                    onChange={e => setAmount(e.target.value)} autoFocus
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-8 pr-3 py-3.5 text-[20px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input type="text" placeholder={txType === 'cargo' ? 'Ej: Cena en restaurante' : 'Ej: Pago mínimo agosto'}
                  value={desc} onChange={e => setDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Fecha */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Categoría</label>
                <div className="flex flex-wrap gap-2">
                  {cats.map(c => (
                    <button key={c} type="button" onClick={() => setCategory(category === c ? '' : c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                        category === c
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Notas <span className="font-normal normal-case">(opcional)</span>
                </label>
                <textarea rows={2} placeholder="Notas adicionales…" value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Recibo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Foto del recibo <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                {receiptPreview ? (
                  <div className="relative">
                    <img src={receiptPreview} alt="Recibo" className="w-full h-36 object-cover rounded-2xl" />
                    <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null) }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => pickFile(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 active:border-indigo-300 active:text-indigo-500"
                    >
                      <ImageIcon size={14} /> Galería
                    </button>
                    <button type="button" onClick={() => pickFile(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 active:border-indigo-300 active:text-indigo-500"
                    >
                      <Camera size={14} /> Cámara
                    </button>
                  </div>
                )}
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
              <button form="card-tx-form" type="submit" disabled={saving}
                className="flex-1 bg-indigo-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90"
              >
                {saving ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox recibo */}
      {viewingUrl && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
          onClick={() => setViewingUrl(null)}
        >
          <img src={viewingUrl} alt="Recibo" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button onClick={() => setViewingUrl(null)}
            className="absolute top-4 right-4 bg-white/10 text-white rounded-full p-2"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  )
}
