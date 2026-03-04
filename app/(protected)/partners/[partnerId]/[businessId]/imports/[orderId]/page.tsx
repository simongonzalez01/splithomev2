'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, Trash2, FileText, Check, X,
  ChevronRight, ChevronDown, ChevronUp, Pencil,
} from 'lucide-react'

// ─── Stages ───────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'proforma',       label: 'Proforma',    icon: '📄', desc: 'Proforma recibida' },
  { key: 'aprobada',       label: 'Aprobada',    icon: '✅', desc: 'Aprobada por agente de carga' },
  { key: 'deposito',       label: 'Depósito',    icon: '💰', desc: 'Depósito pagado al proveedor' },
  { key: 'produccion',     label: 'Producción',  icon: '🏭', desc: 'En producción' },
  { key: 'pago_final',     label: 'Pago final',  icon: '💳', desc: 'Pago final al proveedor' },
  { key: 'enviado_agente', label: 'Al agente',   icon: '📦', desc: 'Enviado al agente de carga' },
  { key: 'en_transito',    label: 'En tránsito', icon: '✈️', desc: 'En tránsito internacional' },
  { key: 'recibido',       label: 'Recibido',    icon: '📥', desc: 'Recibido en destino' },
  { key: 'verificando',    label: 'Verificando', icon: '🔍', desc: 'Verificando carga' },
  { key: 'cerrado',        label: 'Cerrado',     icon: '🎉', desc: 'Pedido cerrado' },
] as const

type StageKey = typeof STAGES[number]['key']

// ─── Types ─────────────────────────────────────────────────────────────────────
type Order = {
  id: string
  business_id: string
  title: string
  supplier_name: string | null
  proforma_url:  string | null
  proforma_name: string | null
  status: string
  supplier_total: number | null
  freight_total:  number | null
  currency: string
  production_eta: string | null
  arrival_eta:    string | null
  notes: string | null
  created_at: string
}

type Payment = {
  id: string
  recipient: 'supplier' | 'freight'
  amount: number
  currency: string
  paid_at: string
  receipt_url:  string | null
  receipt_name: string | null
  notes: string | null
}

type OrderItem = {
  id: string
  description: string
  qty_ordered: number
  qty_received: number | null
  unit_price: number | null
  condition: 'ok' | 'damaged' | 'missing' | null
  notes: string | null
  sort_order: number
}

type ImportEvent = {
  id: string
  stage: string
  note: string | null
  created_at: string
}

type Verification = {
  id: string
  boxes_expected: number | null
  boxes_received: number | null
  photo_urls: string[]
  result: 'ok' | 'discrepancy' | null
  notes: string | null
}

// ─── Helper components ─────────────────────────────────────────────────────────
function Section({ title, children, action }: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── PaymentSection ────────────────────────────────────────────────────────────
function PaymentSection({
  title, payments, total, paid, currency, color, onAdd, onDelete, fmtAmt, fmtDt, disabled,
}: {
  title: string
  payments: Payment[]
  total: number | null
  paid: number
  currency: string
  color: string
  onAdd: () => void
  onDelete: (id: string) => void
  fmtAmt: (n: number) => string
  fmtDt: (d: string) => string
  disabled?: boolean
}) {
  const percent = total && total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : null
  const pending = total !== null ? Math.max(0, total - paid) : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
        {!disabled && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl text-white shadow-sm active:opacity-80"
            style={{ backgroundColor: color }}
          >
            <Plus size={12} /> Pago
          </button>
        )}
      </div>

      {total !== null && (
        <>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Total acordado</p>
              <p className="font-bold text-gray-900 text-sm">{currency} {fmtAmt(total)}</p>
            </div>
            {pending !== null && (
              <div className="text-right">
                <p className="text-[10px] text-gray-400 mb-0.5">Pendiente</p>
                <p className={`font-bold text-sm ${pending === 0 ? 'text-emerald-500' : 'text-gray-700'}`}>
                  {currency} {fmtAmt(pending)}
                </p>
              </div>
            )}
          </div>
          <div className="h-2 bg-gray-100 rounded-full mb-1.5 overflow-hidden">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${percent ?? 0}%`, backgroundColor: color }}
            />
          </div>
          {percent !== null && (
            <p className="text-[10px] text-gray-400 mb-3">
              {currency} {fmtAmt(paid)} pagado · {percent}%
            </p>
          )}
        </>
      )}

      {payments.length === 0 ? (
        <p className="text-xs text-gray-300 text-center py-4">Sin pagos registrados</p>
      ) : (
        <div className="space-y-0">
          {payments.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-gray-900">{currency} {fmtAmt(p.amount)}</p>
                  {p.receipt_url && (
                    <a
                      href={p.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full"
                    >
                      <FileText size={9} /> Ver
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {fmtDt(p.paid_at)}{p.notes ? ` · ${p.notes}` : ''}
                </p>
              </div>
              {!disabled && (
                <button
                  onClick={() => onDelete(p.id)}
                  className="p-1.5 text-gray-200 active:text-red-500 rounded-lg active:bg-red-50 flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ImportDetailPage() {
  const { partnerId, businessId, orderId } = useParams<{
    partnerId: string; businessId: string; orderId: string
  }>()
  const router   = useRouter()
  const supabase = createClient()
  const fileRef    = useRef<HTMLInputElement>(null)

  // Data
  const [order,        setOrder]        = useState<Order | null>(null)
  const [payments,     setPayments]     = useState<Payment[]>([])
  const [items,        setItems]        = useState<OrderItem[]>([])
  const [events,       setEvents]       = useState<ImportEvent[]>([])
  const [verification, setVerification] = useState<Verification | null>(null)
  const [bizColor,     setBizColor]     = useState('#F97316')
  const [loading,      setLoading]      = useState(true)
  const [userId,       setUserId]       = useState('')

  // UI
  const [showAdvance,      setShowAdvance]      = useState(false)
  const [advancing,        setAdvancing]        = useState(false)
  const [showPayModal,     setShowPayModal]     = useState<'supplier' | 'freight' | null>(null)
  const [showTimeline,     setShowTimeline]     = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [savingVer,        setSavingVer]        = useState(false)
  const [editingEta,       setEditingEta]       = useState<'production' | 'arrival' | null>(null)
  const [etaValue,         setEtaValue]         = useState('')
  const [toast,            setToast]            = useState<{ msg: string; ok?: boolean } | null>(null)

  // Payment form
  const [payAmount,    setPayAmount]    = useState('')
  const [payDate,      setPayDate]      = useState(new Date().toISOString().split('T')[0])
  const [payNotes,     setPayNotes]     = useState('')
  const [payFile,      setPayFile]      = useState<File | null>(null)
  const [payUploading, setPayUploading] = useState(false)

  // Verification form
  const [verBoxesExp, setVerBoxesExp] = useState('')
  const [verBoxesRec, setVerBoxesRec] = useState('')
  const [verNotes,    setVerNotes]    = useState('')
  const [verItems,    setVerItems]    = useState<{ id: string; qty: string; condition: string }[]>([])

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const { data: biz } = await supabase
      .from('businesses').select('color').eq('id', businessId).single()
    if (biz) setBizColor(biz.color || '#F97316')

    const [
      { data: orderData },
      { data: payData },
      { data: itemData },
      { data: evData },
      { data: verData },
    ] = await Promise.all([
      supabase.from('import_orders').select('*').eq('id', orderId).single(),
      supabase.from('import_payments').select('*').eq('order_id', orderId).order('paid_at'),
      supabase.from('import_order_items').select('*').eq('order_id', orderId).order('sort_order'),
      supabase.from('import_events').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.from('import_verification').select('*').eq('order_id', orderId).maybeSingle(),
    ])

    if (orderData) setOrder(orderData as Order)
    if (payData)   setPayments(payData as Payment[])
    if (itemData) {
      const loaded = itemData as OrderItem[]
      setItems(loaded)
      setVerItems(loaded.map(i => ({
        id: i.id,
        qty: i.qty_received?.toString() ?? '',
        condition: i.condition ?? 'ok',
      })))
    }
    if (evData)  setEvents(evData as ImportEvent[])
    if (verData) {
      const v = verData as Verification
      setVerification(v)
      setVerBoxesExp(v.boxes_expected?.toString() ?? '')
      setVerBoxesRec(v.boxes_received?.toString() ?? '')
      setVerNotes(v.notes ?? '')
    }

    setLoading(false)
  }, [orderId, businessId, supabase])

  useEffect(() => { load() }, [load])

  // ── Toast ─────────────────────────────────────────────────────────────────────
  function showToast(msg: string, ok = false) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Computed ──────────────────────────────────────────────────────────────────
  const stageIdx    = STAGES.findIndex(s => s.key === order?.status)
  const nextStage   = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null
  const isClosed    = order?.status === 'cerrado'
  const isVerifiable = ['recibido', 'verificando'].includes(order?.status ?? '')

  const paidSupplier = payments.filter(p => p.recipient === 'supplier').reduce((s, p) => s + p.amount, 0)
  const paidFreight  = payments.filter(p => p.recipient === 'freight').reduce((s, p) => s + p.amount, 0)

  const fmtAmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

  // ── Advance stage ─────────────────────────────────────────────────────────────
  async function advanceStage() {
    if (!order || !nextStage) return
    setAdvancing(true)
    const newStatus = nextStage.key as StageKey

    const { error } = await supabase
      .from('import_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (!error) {
      await supabase.from('import_events').insert({
        order_id: orderId,
        stage: newStatus,
        note: nextStage.desc,
        created_by: userId,
      })
      setOrder(prev => prev ? { ...prev, status: newStatus } : prev)
      await load()
      showToast(`${nextStage.icon} ${nextStage.label}`, true)
    } else {
      showToast('No se pudo avanzar la etapa')
    }

    setAdvancing(false)
    setShowAdvance(false)
  }

  // ── ETA ───────────────────────────────────────────────────────────────────────
  async function saveEta() {
    if (!editingEta || !order) return
    const field = editingEta === 'production' ? 'production_eta' : 'arrival_eta'
    await supabase.from('import_orders').update({ [field]: etaValue || null }).eq('id', orderId)
    setOrder(prev => prev ? { ...prev, [field]: etaValue || null } : prev)
    setEditingEta(null)
    showToast('Fecha actualizada', true)
  }

  // ── Payments ──────────────────────────────────────────────────────────────────
  function openPayModal(recipient: 'supplier' | 'freight') {
    setPayAmount('')
    setPayDate(new Date().toISOString().split('T')[0])
    setPayNotes('')
    setPayFile(null)
    setShowPayModal(recipient)
  }

  async function addPayment() {
    if (!showPayModal || !payAmount || parseFloat(payAmount) <= 0) return
    setPayUploading(true)

    let receiptUrl: string | null = null
    let receiptName: string | null = null

    if (payFile) {
      const ext  = payFile.name.split('.').pop()
      const path = `imports/${orderId}/pay_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('receipts').upload(path, payFile)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
        receiptUrl  = publicUrl
        receiptName = payFile.name
      }
    }

    const { error } = await supabase.from('import_payments').insert({
      order_id:     orderId,
      recipient:    showPayModal,
      amount:       parseFloat(payAmount),
      currency:     order?.currency ?? 'USD',
      paid_at:      payDate,
      receipt_url:  receiptUrl,
      receipt_name: receiptName,
      notes:        payNotes || null,
      created_by:   userId,
    })

    setPayUploading(false)
    if (!error) {
      setShowPayModal(null)
      await load()
      showToast('Pago registrado ✓', true)
    } else {
      showToast('No se pudo registrar el pago')
    }
  }

  async function deletePayment(id: string) {
    if (!confirm('¿Eliminar este pago?')) return
    await supabase.from('import_payments').delete().eq('id', id)
    setPayments(prev => prev.filter(p => p.id !== id))
    showToast('Pago eliminado', true)
  }

  // ── Verification ──────────────────────────────────────────────────────────────
  async function saveVerification(result: 'ok' | 'discrepancy') {
    setSavingVer(true)

    // Update item conditions
    for (const vi of verItems) {
      const item = items.find(i => i.id === vi.id)
      if (!item) continue
      const qtyRec   = vi.qty ? parseInt(vi.qty) : null
      const cond     = vi.condition as 'ok' | 'damaged' | 'missing'
      const changed  = qtyRec !== item.qty_received || cond !== item.condition
      if (changed) {
        await supabase.from('import_order_items')
          .update({ qty_received: qtyRec, condition: cond })
          .eq('id', vi.id)
      }
    }

    const verPayload = {
      order_id:       orderId,
      boxes_expected: verBoxesExp ? parseInt(verBoxesExp) : null,
      boxes_received: verBoxesRec ? parseInt(verBoxesRec) : null,
      notes:          verNotes || null,
      result,
      verified_by:    userId,
      verified_at:    new Date().toISOString(),
    }

    if (verification) {
      await supabase.from('import_verification').update(verPayload).eq('id', verification.id)
    } else {
      await supabase.from('import_verification').insert(verPayload)
    }

    // Advance status accordingly
    if (order?.status === 'recibido') {
      const newStatus = result === 'ok' ? 'cerrado' : 'verificando'
      await supabase.from('import_orders').update({ status: newStatus }).eq('id', orderId)
      await supabase.from('import_events').insert({
        order_id:   orderId,
        stage:      newStatus,
        note:       result === 'ok' ? 'Verificación OK — pedido cerrado' : 'Verificación iniciada — hay diferencias',
        created_by: userId,
      })
    } else if (order?.status === 'verificando' && result === 'ok') {
      await supabase.from('import_orders').update({ status: 'cerrado' }).eq('id', orderId)
      await supabase.from('import_events').insert({
        order_id:   orderId,
        stage:      'cerrado',
        note:       'Verificación completada — Todo OK',
        created_by: userId,
      })
    }

    setSavingVer(false)
    await load()
    showToast(result === 'ok' ? '🎉 Pedido cerrado' : 'Verificación guardada', true)
    setShowVerification(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-orange-500 animate-spin" />
    </div>
  )

  if (!order) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8 text-center">
      <p className="text-gray-400 font-semibold">Pedido no encontrado</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-orange-500 font-semibold">
        Volver
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold flex items-center gap-2 transition-all ${
          toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.ok ? <Check size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div
        className="px-4 pt-12 pb-4 flex items-center gap-3"
        style={{ backgroundColor: bizColor + '12', borderBottom: `3px solid ${bizColor}25` }}
      >
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center shadow-sm flex-shrink-0"
        >
          <ArrowLeft size={18} className="text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{order.title}</h1>
          {order.supplier_name && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{order.supplier_name}</p>
          )}
        </div>
        {order.proforma_url && (
          <a
            href={order.proforma_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center shadow-sm flex-shrink-0"
            title="Ver proforma"
          >
            <FileText size={16} style={{ color: bizColor }} />
          </a>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ── Status stepper ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Estado actual</p>
              <p className="font-bold text-gray-900 text-sm">
                {STAGES[stageIdx]?.icon} {STAGES[stageIdx]?.label}
              </p>
            </div>
            {nextStage && !isClosed ? (
              <button
                onClick={() => setShowAdvance(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold shadow-sm active:opacity-80"
                style={{ backgroundColor: bizColor }}
              >
                Avanzar <ChevronRight size={13} />
              </button>
            ) : isClosed ? (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl">
                <Check size={13} /> Cerrado
              </span>
            ) : null}
          </div>

          {/* Scrollable stepper pills */}
          <div
            className="flex gap-1.5 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {STAGES.map((s, i) => (
              <div
                key={s.key}
                className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all ${
                  i === stageIdx ? 'text-white shadow-md'
                  : i < stageIdx ? 'bg-gray-100 text-gray-500'
                                 : 'bg-gray-50 text-gray-300'
                }`}
                style={i === stageIdx ? { backgroundColor: bizColor } : {}}
              >
                <span className="text-sm leading-none">
                  {i < stageIdx ? '✓' : s.icon}
                </span>
                <span className={`text-[9px] font-bold leading-tight max-w-[46px] text-center ${
                  i === stageIdx ? 'text-white' : i < stageIdx ? 'text-gray-500' : 'text-gray-300'
                }`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ETAs ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">📅 Fechas estimadas</p>

          {/* Production ETA */}
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <div>
              <p className="text-xs font-semibold text-gray-600">Producción lista</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {order.production_eta
                  ? fmtDt(order.production_eta)
                  : <span className="text-gray-300 font-normal text-xs">Sin fecha</span>}
              </p>
            </div>
            {editingEta === 'production' ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={etaValue}
                  onChange={e => setEtaValue(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-400"
                />
                <button onClick={saveEta} className="p-1.5 bg-emerald-500 rounded-lg">
                  <Check size={12} className="text-white" />
                </button>
                <button onClick={() => setEditingEta(null)} className="p-1.5 bg-gray-100 rounded-lg">
                  <X size={12} className="text-gray-500" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditingEta('production'); setEtaValue(order.production_eta ?? '') }}
                className="p-2 text-gray-300 active:text-blue-500 rounded-xl active:bg-blue-50"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>

          {/* Arrival ETA */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-xs font-semibold text-gray-600">Llegada estimada</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {order.arrival_eta
                  ? fmtDt(order.arrival_eta)
                  : <span className="text-gray-300 font-normal text-xs">Sin fecha</span>}
              </p>
            </div>
            {editingEta === 'arrival' ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={etaValue}
                  onChange={e => setEtaValue(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-400"
                />
                <button onClick={saveEta} className="p-1.5 bg-emerald-500 rounded-lg">
                  <Check size={12} className="text-white" />
                </button>
                <button onClick={() => setEditingEta(null)} className="p-1.5 bg-gray-100 rounded-lg">
                  <X size={12} className="text-gray-500" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditingEta('arrival'); setEtaValue(order.arrival_eta ?? '') }}
                className="p-2 text-gray-300 active:text-blue-500 rounded-xl active:bg-blue-50"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Supplier payments ───────────────────────────────────────────── */}
        <PaymentSection
          title="💰 Proveedor"
          payments={payments.filter(p => p.recipient === 'supplier')}
          total={order.supplier_total}
          paid={paidSupplier}
          currency={order.currency}
          color={bizColor}
          onAdd={() => openPayModal('supplier')}
          onDelete={deletePayment}
          fmtAmt={fmtAmt}
          fmtDt={fmtDt}
          disabled={isClosed}
        />

        {/* ── Freight payments ────────────────────────────────────────────── */}
        <PaymentSection
          title="🚢 Agente de carga"
          payments={payments.filter(p => p.recipient === 'freight')}
          total={order.freight_total}
          paid={paidFreight}
          currency={order.currency}
          color={bizColor}
          onAdd={() => openPayModal('freight')}
          onDelete={deletePayment}
          fmtAmt={fmtAmt}
          fmtDt={fmtDt}
          disabled={isClosed}
        />

        {/* ── Products ────────────────────────────────────────────────────── */}
        {items.length > 0 && (
          <Section title={`📦 Productos (${items.length})`}>
            <div className="space-y-0">
              {items.map(item => (
                <div
                  key={item.id}
                  className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.description}</p>
                    {item.unit_price !== null && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {order.currency} {fmtAmt(item.unit_price)} c/u
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-bold text-gray-900">{item.qty_ordered} uds</p>
                    {item.qty_received !== null && (
                      <p className={`text-[10px] font-bold mt-0.5 ${
                        item.condition === 'ok'      ? 'text-emerald-500'
                        : item.condition === 'damaged' ? 'text-orange-500'
                                                       : 'text-red-500'
                      }`}>
                        {item.condition === 'ok' ? '✓' : item.condition === 'damaged' ? '⚠' : '✗'}&nbsp;
                        {item.qty_received} rec.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Verification section ────────────────────────────────────────── */}
        {isVerifiable && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowVerification(!showVerification)}
              className="w-full px-4 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🔍</span>
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-900">Verificación de carga</p>
                  {verification?.result && (
                    <p className={`text-xs font-semibold mt-0.5 ${
                      verification.result === 'ok' ? 'text-emerald-500' : 'text-orange-500'
                    }`}>
                      {verification.result === 'ok' ? '✓ Todo OK' : '⚠ Con diferencias'}
                    </p>
                  )}
                  {!verification && (
                    <p className="text-xs text-gray-400 mt-0.5">Tap para verificar la carga recibida</p>
                  )}
                </div>
              </div>
              {showVerification
                ? <ChevronUp size={16} className="text-gray-400" />
                : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {showVerification && (
              <div className="px-4 pb-5 border-t border-gray-50 space-y-4 pt-4">

                {/* Boxes */}
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">Bultos</p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-400 block mb-1">Esperados</label>
                      <input
                        type="number"
                        value={verBoxesExp}
                        onChange={e => setVerBoxesExp(e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-400 block mb-1">Recibidos</label>
                      <input
                        type="number"
                        value={verBoxesRec}
                        onChange={e => setVerBoxesRec(e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Items check */}
                {items.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-2">Revisión por producto</p>
                    <div className="space-y-2">
                      {items.map((item, idx) => {
                        const vi = verItems[idx] ?? { id: item.id, qty: '', condition: 'ok' }
                        return (
                          <div key={item.id} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs font-bold text-gray-700 mb-1.5">{item.description}</p>
                            <p className="text-[10px] text-gray-400 mb-2">Pedido: {item.qty_ordered} uds</p>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={vi.qty}
                                onChange={e => setVerItems(prev =>
                                  prev.map((v, i) => i === idx ? { ...v, qty: e.target.value } : v)
                                )}
                                placeholder="Recibido"
                                className="w-24 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-400 bg-white"
                              />
                              <select
                                value={vi.condition}
                                onChange={e => setVerItems(prev =>
                                  prev.map((v, i) => i === idx ? { ...v, condition: e.target.value } : v)
                                )}
                                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-400 bg-white"
                              >
                                <option value="ok">✅ OK</option>
                                <option value="damaged">⚠️ Dañado</option>
                                <option value="missing">❌ Faltante</option>
                              </select>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1.5">Observaciones</label>
                  <textarea
                    value={verNotes}
                    onChange={e => setVerNotes(e.target.value)}
                    placeholder="Notas sobre el estado de la carga..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-orange-400"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveVerification('discrepancy')}
                    disabled={savingVer}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-orange-400 text-orange-500 active:bg-orange-50 disabled:opacity-40"
                  >
                    ⚠️ Hay diferencias
                  </button>
                  <button
                    onClick={() => saveVerification('ok')}
                    disabled={savingVer}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-emerald-500 active:opacity-80 disabled:opacity-40"
                  >
                    ✅ Todo OK
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Notes ──────────────────────────────────────────────────────── */}
        {order.notes && (
          <Section title="📝 Notas">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{order.notes}</p>
          </Section>
        )}

        {/* ── Timeline ───────────────────────────────────────────────────── */}
        {events.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="w-full px-4 py-3.5 flex items-center justify-between"
            >
              <p className="text-sm font-bold text-gray-900">📋 Historial ({events.length})</p>
              {showTimeline
                ? <ChevronUp size={16} className="text-gray-400" />
                : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {showTimeline && (
              <div className="px-4 pb-4 border-t border-gray-50">
                <div className="space-y-3 pt-3">
                  {events.map(ev => {
                    const st = STAGES.find(s => s.key === ev.stage)
                    return (
                      <div key={ev.id} className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                          {st?.icon ?? '•'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800">{st?.label ?? ev.stage}</p>
                          {ev.note && ev.note !== st?.label && (
                            <p className="text-[10px] text-gray-500 mt-0.5">{ev.note}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {new Date(ev.created_at).toLocaleString('es', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Advance Stage Modal ──────────────────────────────────────────── */}
      {showAdvance && nextStage && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 max-w-lg mx-auto safe-area-pb">
            <h3 className="font-bold text-gray-900 text-lg mb-1">Avanzar etapa</h3>
            <p className="text-gray-500 text-sm mb-6">
              ¿Confirmar que el pedido avanzó a{' '}
              <strong className="text-gray-800">{nextStage.icon} {nextStage.label}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAdvance(false)}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm active:opacity-70"
              >
                Cancelar
              </button>
              <button
                onClick={advanceStage}
                disabled={advancing}
                className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm active:opacity-80 shadow-sm disabled:opacity-50"
                style={{ backgroundColor: bizColor }}
              >
                {advancing ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ────────────────────────────────────────────────── */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 max-w-lg mx-auto safe-area-pb">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 text-lg">
                Registrar pago — {showPayModal === 'supplier' ? '💰 Proveedor' : '🚢 Agente'}
              </h3>
              <button
                onClick={() => setShowPayModal(null)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">
                  Monto ({order.currency})
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm font-semibold focus:outline-none focus:border-orange-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Fecha</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Notas</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="Ej: Depósito 50%, Cuota 2..."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">
                  Comprobante (opcional)
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => setPayFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-xl px-4 py-3 text-sm text-center font-semibold transition-all ${
                    payFile
                      ? 'border-emerald-400 text-emerald-600 bg-emerald-50'
                      : 'border-gray-200 text-gray-400 active:border-orange-300'
                  }`}
                >
                  {payFile ? `✓ ${payFile.name}` : '📎 Adjuntar comprobante'}
                </button>
              </div>

              <button
                onClick={addPayment}
                disabled={!payAmount || parseFloat(payAmount) <= 0 || payUploading}
                className="w-full py-4 rounded-2xl text-white font-bold text-sm active:opacity-80 disabled:opacity-40 shadow-sm mt-2"
                style={{ backgroundColor: bizColor }}
              >
                {payUploading ? 'Subiendo comprobante...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
