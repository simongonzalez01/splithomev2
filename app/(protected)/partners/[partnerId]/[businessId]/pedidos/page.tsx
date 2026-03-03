'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, X, ChevronDown, ChevronUp,
  Package, Truck, CheckCircle2, XCircle, Clock,
  Upload, FileText, Trash2, Edit3, Building2,
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const fmtDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

const STATUS_CFG = {
  pendiente:   { label: 'Pendiente',  color: 'text-amber-600',   bg: 'bg-amber-50',   Icon: Clock        },
  'en camino': { label: 'En camino',  color: 'text-blue-600',    bg: 'bg-blue-50',    Icon: Truck        },
  recibido:    { label: 'Recibido',   color: 'text-emerald-600', bg: 'bg-emerald-50', Icon: CheckCircle2 },
  cancelado:   { label: 'Cancelado',  color: 'text-red-500',     bg: 'bg-red-50',     Icon: XCircle      },
} as const
type StatusKey = keyof typeof STATUS_CFG

// ── types ─────────────────────────────────────────────────────────────────────
type Supplier = {
  id: string; name: string; country: string | null
  contact_name: string | null; contact_info: string | null
  currency: string; notes: string | null; is_active: boolean
}
type OrderItem = {
  id: string; order_id: string; description: string
  quantity: number; unit_cost: number
}
type OrderDoc = {
  id: string; order_id: string; title: string
  file_url: string; file_type: string | null; created_at: string
}
type Order = {
  id: string; title: string; description: string | null
  supplier_id: string | null
  supplier?: Pick<Supplier, 'id' | 'name' | 'country' | 'currency'> | null
  total_cost: number | null; amount_paid: number; currency: string
  order_date: string | null; expected_delivery: string | null
  actual_delivery: string | null; status: StatusKey
  notes: string | null; created_by: string | null; created_at: string
  items?: OrderItem[]; documents?: OrderDoc[]
}

// ── component ─────────────────────────────────────────────────────────────────
export default function PedidosPage() {
  const { partnerId, businessId } = useParams<{ partnerId: string; businessId: string }>()
  const router  = useRouter()
  const supabase = createClient()

  // ── core state ────────────────────────────────────────────────────────────
  const [loading,       setLoading]       = useState(true)
  const [userId,        setUserId]        = useState('')
  const [businessName,  setBusinessName]  = useState('')
  const [businessColor, setBusinessColor] = useState('#6366f1')

  const [tab,          setTab]          = useState<'pedidos' | 'proveedores'>('pedidos')
  const [statusFilter, setStatusFilter] = useState<'todos' | StatusKey>('todos')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  const [orders,    setOrders]    = useState<Order[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // ── order form state ──────────────────────────────────────────────────────
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [editOrder,     setEditOrder]     = useState<Order | null>(null)
  const [oTitle,        setOTitle]        = useState('')
  const [oDesc,         setODesc]         = useState('')
  const [oSupplier,     setOSupplier]     = useState('')
  const [oStatus,       setOStatus]       = useState<StatusKey>('pendiente')
  const [oTotal,        setOTotal]        = useState('')
  const [oPaid,         setOPaid]         = useState('0')
  const [oCurrency,     setOCurrency]     = useState('USD')
  const [oOrderDate,    setOOrderDate]    = useState(today())
  const [oExpected,     setOExpected]     = useState('')
  const [oActual,       setOActual]       = useState('')
  const [oNotes,        setONotes]        = useState('')
  const [oItems,        setOItems]        = useState([{ description: '', quantity: '1', unit_cost: '0' }])
  const [oError,        setOError]        = useState('')
  const [oSaving,       setOSaving]       = useState(false)

  // ── supplier form state ───────────────────────────────────────────────────
  const [showSupForm, setShowSupForm] = useState(false)
  const [editSup,     setEditSup]     = useState<Supplier | null>(null)
  const [sName,       setSName]       = useState('')
  const [sCountry,    setSCountry]    = useState('')
  const [sContact,    setSContact]    = useState('')
  const [sPhone,      setSPhone]      = useState('')
  const [sCurrency,   setSCurrency]   = useState('USD')
  const [sNotes,      setSNotes]      = useState('')
  const [sError,      setSError]      = useState('')
  const [sSaving,     setSSaving]     = useState(false)

  // ── doc upload ────────────────────────────────────────────────────────────
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadOrderId, setPendingUploadOrderId] = useState<string | null>(null)

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [businessId])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: biz } = await supabase
      .from('businesses').select('name,color').eq('id', businessId).single()
    if (biz) { setBusinessName(biz.name); setBusinessColor(biz.color || '#6366f1') }

    await Promise.all([loadOrders(), loadSuppliers()])
    setLoading(false)
  }

  async function loadOrders() {
    const { data } = await supabase
      .from('business_orders')
      .select('*, supplier:business_suppliers(id,name,country,currency)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    if (data) setOrders(data as Order[])
  }

  async function loadSuppliers() {
    const { data } = await supabase
      .from('business_suppliers')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name')
    if (data) setSuppliers(data as Supplier[])
  }

  async function loadOrderDetail(orderId: string) {
    const [{ data: items }, { data: docs }] = await Promise.all([
      supabase.from('business_order_items').select('*').eq('order_id', orderId).order('created_at'),
      supabase.from('business_order_documents').select('*').eq('order_id', orderId).order('created_at'),
    ])
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, items: items ?? [], documents: docs ?? [] } : o
    ))
  }

  // ── expand / collapse ─────────────────────────────────────────────────────
  async function toggleExpand(orderId: string) {
    if (expandedId === orderId) { setExpandedId(null); return }
    setExpandedId(orderId)
    const order = orders.find(o => o.id === orderId)
    if (!order?.items) await loadOrderDetail(orderId)
  }

  // ── order status ──────────────────────────────────────────────────────────
  async function updateStatus(orderId: string, status: StatusKey) {
    const extra = status === 'recibido' ? { actual_delivery: today() } : {}
    await supabase.from('business_orders').update({ status, ...extra }).eq('id', orderId)
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status, ...(status === 'recibido' ? { actual_delivery: today() } : {}) } : o
    ))
  }

  // ── order form ────────────────────────────────────────────────────────────
  function openOrderForm(order?: Order) {
    if (order) {
      setEditOrder(order)
      setOTitle(order.title)
      setODesc(order.description ?? '')
      setOSupplier(order.supplier_id ?? '')
      setOStatus(order.status)
      setOTotal(String(order.total_cost ?? ''))
      setOPaid(String(order.amount_paid))
      setOCurrency(order.currency)
      setOOrderDate(order.order_date ?? today())
      setOExpected(order.expected_delivery ?? '')
      setOActual(order.actual_delivery ?? '')
      setONotes(order.notes ?? '')
      setOItems(
        order.items?.length
          ? order.items.map(i => ({
              description: i.description,
              quantity: String(i.quantity),
              unit_cost: String(i.unit_cost),
            }))
          : [{ description: '', quantity: '1', unit_cost: '0' }]
      )
    } else {
      setEditOrder(null)
      setOTitle(''); setODesc(''); setOSupplier(''); setOStatus('pendiente')
      setOTotal(''); setOPaid('0'); setOCurrency('USD')
      setOOrderDate(today()); setOExpected(''); setOActual(''); setONotes('')
      setOItems([{ description: '', quantity: '1', unit_cost: '0' }])
    }
    setOError('')
    setShowOrderForm(true)
  }

  async function saveOrder() {
    if (!oTitle.trim()) { setOError('Título requerido'); return }
    setOSaving(true); setOError('')

    const validItems = oItems.filter(i => i.description.trim())
    const itemsTotal = validItems.reduce(
      (s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_cost) || 0), 0
    )
    const finalTotal = itemsTotal > 0 ? itemsTotal : (parseFloat(oTotal) || null)

    const payload = {
      business_id:       businessId,
      created_by:        userId,
      supplier_id:       oSupplier  || null,
      title:             oTitle.trim(),
      description:       oDesc.trim()  || null,
      status:            oStatus,
      total_cost:        finalTotal,
      amount_paid:       parseFloat(oPaid) || 0,
      currency:          oCurrency,
      order_date:        oOrderDate   || null,
      expected_delivery: oExpected    || null,
      actual_delivery:   oActual      || null,
      notes:             oNotes.trim() || null,
    }

    let orderId = editOrder?.id
    if (editOrder) {
      await supabase.from('business_orders').update(payload).eq('id', editOrder.id)
    } else {
      const { data } = await supabase.from('business_orders').insert(payload).select().single()
      orderId = data?.id
    }

    // items
    if (orderId && validItems.length > 0) {
      if (editOrder) {
        await supabase.from('business_order_items').delete().eq('order_id', orderId)
      }
      await supabase.from('business_order_items').insert(
        validItems.map(i => ({
          order_id:    orderId!,
          description: i.description.trim(),
          quantity:    parseFloat(i.quantity)   || 1,
          unit_cost:   parseFloat(i.unit_cost)  || 0,
        }))
      )
    }

    await loadOrders()
    if (orderId) await loadOrderDetail(orderId)
    setShowOrderForm(false)
    setExpandedId(orderId ?? null)
    setOSaving(false)
  }

  async function deleteOrder(orderId: string) {
    if (!confirm('¿Eliminar este pedido y todos sus datos?')) return
    await supabase.from('business_orders').delete().eq('id', orderId)
    setOrders(prev => prev.filter(o => o.id !== orderId))
    if (expandedId === orderId) setExpandedId(null)
  }

  // ── supplier form ─────────────────────────────────────────────────────────
  function openSupForm(sup?: Supplier) {
    if (sup) {
      setEditSup(sup); setSName(sup.name); setSCountry(sup.country ?? '')
      setSContact(sup.contact_name ?? ''); setSPhone(sup.contact_info ?? '')
      setSCurrency(sup.currency); setSNotes(sup.notes ?? '')
    } else {
      setEditSup(null); setSName(''); setSCountry('')
      setSContact(''); setSPhone(''); setSCurrency('USD'); setSNotes('')
    }
    setSError('')
    setShowSupForm(true)
  }

  async function saveSup() {
    if (!sName.trim()) { setSError('Nombre requerido'); return }
    setSSaving(true); setSError('')
    const payload = {
      business_id:  businessId, created_by: userId,
      name:         sName.trim(),    country:      sCountry.trim()  || null,
      contact_name: sContact.trim() || null, contact_info: sPhone.trim()   || null,
      currency: sCurrency, notes: sNotes.trim() || null,
    }
    if (editSup) {
      await supabase.from('business_suppliers').update(payload).eq('id', editSup.id)
    } else {
      await supabase.from('business_suppliers').insert(payload)
    }
    await loadSuppliers()
    setShowSupForm(false)
    setSSaving(false)
  }

  async function deleteSup(supId: string) {
    if (!confirm('¿Eliminar proveedor?')) return
    await supabase.from('business_suppliers').update({ is_active: false }).eq('id', supId)
    setSuppliers(prev => prev.filter(s => s.id !== supId))
  }

  // ── document upload ───────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingUploadOrderId) return
    await uploadDoc(pendingUploadOrderId, file)
    e.target.value = ''
  }

  async function uploadDoc(orderId: string, file: File) {
    setUploadingId(orderId)
    const ext  = file.name.split('.').pop()
    const path = `order-docs/${businessId}/${orderId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('receipts').upload(path, file)
    if (error) { alert('Error al subir'); setUploadingId(null); return }
    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
    await supabase.from('business_order_documents').insert({
      order_id:    orderId,
      business_id: businessId,
      uploaded_by: userId,
      title:       file.name,
      file_url:    publicUrl,
      file_type:   file.type.startsWith('image') ? 'image' : 'document',
    })
    await loadOrderDetail(orderId)
    setUploadingId(null)
    setPendingUploadOrderId(null)
  }

  async function deleteDoc(docId: string, orderId: string) {
    await supabase.from('business_order_documents').delete().eq('id', docId)
    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, documents: o.documents?.filter(d => d.id !== docId) }
        : o
    ))
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const filteredOrders = orders.filter(o =>
    statusFilter === 'todos' || o.status === statusFilter
  )
  const totalInvested = filteredOrders.reduce((s, o) => s + (o.total_cost ?? 0), 0)
  const totalPaid     = filteredOrders.reduce((s, o) => s + o.amount_paid, 0)

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* hidden file input for doc upload */}
      <input
        ref={docInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div>
            <p className="text-xs text-gray-400">{businessName}</p>
            <h1 className="font-bold text-gray-900 text-[17px]">Pedidos & Proveedores</h1>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
          {(['pedidos', 'proveedores'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}
            >
              {t === 'pedidos' ? '📦' : '🏭'} {t === 'pedidos' ? 'Pedidos' : 'Proveedores'}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════ PEDIDOS TAB ══════════════════════════════════ */}
      {tab === 'pedidos' && (
        <div className="px-4 pt-4 space-y-3">

          {/* Status filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {(['todos', 'pendiente', 'en camino', 'recibido', 'cancelado'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  statusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                {s === 'todos' ? 'Todos' : STATUS_CFG[s].label}
              </button>
            ))}
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl p-3 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400">Pedidos</p>
              <p className="font-bold text-gray-900 text-[15px]">{filteredOrders.length}</p>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400">Total</p>
              <p className="font-bold text-gray-900 text-[12px]">{fmt(totalInvested)}</p>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400">Pagado</p>
              <p className="font-bold text-emerald-600 text-[12px]">{fmt(totalPaid)}</p>
            </div>
          </div>

          {/* Order list */}
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-gray-100">
              <Package size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm font-medium">
                {statusFilter === 'todos' ? 'Sin pedidos aún' : `Sin pedidos "${STATUS_CFG[statusFilter].label}"`}
              </p>
              <p className="text-gray-300 text-xs mt-1">Tocá + para crear uno</p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const cfg       = STATUS_CFG[order.status]
              const StatusIcon = cfg.Icon
              const isExpanded = expandedId === order.id
              const paid       = order.amount_paid
              const total      = order.total_cost ?? 0
              const paidPct    = total > 0 ? Math.min(100, (paid / total) * 100) : 0

              return (
                <div key={order.id} className="bg-white rounded-3xl border border-gray-100 overflow-hidden">

                  {/* ── Order card header ────────────────────────────────── */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                        <StatusIcon size={18} className={cfg.color} strokeWidth={1.8} />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title + badge */}
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-gray-900 truncate leading-tight">{order.title}</p>
                          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>

                        {/* Supplier */}
                        {order.supplier && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            🏭 {order.supplier.name}
                          </p>
                        )}

                        {/* Dates */}
                        <div className="flex gap-3 mt-1.5 flex-wrap">
                          {order.order_date && (
                            <span className="text-[11px] text-gray-400">📅 {fmtDate(order.order_date)}</span>
                          )}
                          {order.expected_delivery && (
                            <span className="text-[11px] text-amber-500">🚚 {fmtDate(order.expected_delivery)}</span>
                          )}
                          {order.actual_delivery && (
                            <span className="text-[11px] text-emerald-500">✅ {fmtDate(order.actual_delivery)}</span>
                          )}
                        </div>

                        {/* Payment bar */}
                        {total > 0 && (
                          <div className="mt-2.5">
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-gray-400">Pago</span>
                              <span className="font-semibold text-gray-700">
                                {fmt(paid)} / {fmt(total)} {order.currency}
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 rounded-full transition-all"
                                style={{ width: `${paidPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons row */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                      {/* Quick status advance */}
                      {order.status === 'pendiente' && (
                        <button
                          onClick={() => updateStatus(order.id, 'en camino')}
                          className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold"
                        >
                          → En camino
                        </button>
                      )}
                      {order.status === 'en camino' && (
                        <button
                          onClick={() => updateStatus(order.id, 'recibido')}
                          className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold"
                        >
                          ✓ Marcar recibido
                        </button>
                      )}
                      {(order.status === 'recibido' || order.status === 'cancelado') && (
                        <div className="flex-1" />
                      )}
                      <button
                        onClick={() => { loadOrderDetail(order.id); openOrderForm(order) }}
                        className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
                      >
                        <Edit3 size={15} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => toggleExpand(order.id)}
                        className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
                      >
                        {isExpanded
                          ? <ChevronUp size={15} className="text-gray-500" />
                          : <ChevronDown size={15} className="text-gray-500" />}
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded detail ───────────────────────────────────── */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/60 p-4 space-y-4">

                      {/* Description / notes */}
                      {order.description && (
                        <p className="text-sm text-gray-700">{order.description}</p>
                      )}
                      {order.notes && (
                        <p className="text-xs text-gray-400 italic">💬 {order.notes}</p>
                      )}

                      {/* Items */}
                      {order.items && order.items.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase mb-2 tracking-wide">Items</p>
                          <div className="space-y-1.5">
                            {order.items.map(item => (
                              <div key={item.id} className="flex justify-between items-center bg-white rounded-2xl px-3 py-2.5 border border-gray-100">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">{item.description}</p>
                                  <p className="text-xs text-gray-400">{item.quantity} × {fmt(item.unit_cost)}</p>
                                </div>
                                <p className="text-sm font-bold text-gray-900">{fmt(item.quantity * item.unit_cost)}</p>
                              </div>
                            ))}
                            {/* Items total */}
                            <div className="flex justify-between px-3 py-1">
                              <span className="text-xs text-gray-500 font-bold">Total items</span>
                              <span className="text-sm font-bold text-gray-900">
                                {fmt(order.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0))}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Documents */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Documentos</p>
                          <button
                            onClick={() => { setPendingUploadOrderId(order.id); docInputRef.current?.click() }}
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-600"
                          >
                            {uploadingId === order.id
                              ? <span className="animate-pulse text-[11px]">Subiendo…</span>
                              : <><Upload size={12} /> Subir</>
                            }
                          </button>
                        </div>

                        {(!order.documents || order.documents.length === 0) ? (
                          <p className="text-xs text-gray-400">Sin documentos</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {order.documents.map(doc => (
                              <div key={doc.id} className="relative group">
                                {doc.file_type === 'image' ? (
                                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={doc.file_url}
                                      alt={doc.title}
                                      className="w-full aspect-square object-cover rounded-2xl"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={doc.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full aspect-square bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center gap-1 px-1"
                                  >
                                    <FileText size={20} className="text-gray-400" />
                                    <span className="text-[9px] text-gray-400 text-center truncate w-full px-1">{doc.title}</span>
                                  </a>
                                )}
                                <button
                                  onClick={() => deleteDoc(doc.id, order.id)}
                                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X size={10} className="text-white" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => deleteOrder(order.id)}
                        className="w-full py-2.5 rounded-2xl bg-red-50 text-red-500 text-xs font-bold"
                      >
                        Eliminar pedido
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ══════════════════════ PROVEEDORES TAB ══════════════════════════════ */}
      {tab === 'proveedores' && (
        <div className="px-4 pt-4 space-y-3">
          {suppliers.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-gray-100">
              <Building2 size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm font-medium">Sin proveedores</p>
              <p className="text-gray-300 text-xs mt-1">Tocá + para agregar uno</p>
            </div>
          ) : (
            suppliers.map(sup => (
              <div key={sup.id} className="bg-white rounded-3xl p-4 border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} className="text-purple-500" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900">{sup.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {sup.country      && <span className="text-xs text-gray-400">🌍 {sup.country}</span>}
                      {sup.contact_name && <span className="text-xs text-gray-400">👤 {sup.contact_name}</span>}
                      {sup.contact_info && <span className="text-xs text-gray-400">📞 {sup.contact_info}</span>}
                      <span className="text-xs text-gray-400">💵 {sup.currency}</span>
                    </div>
                    {sup.notes && <p className="text-xs text-gray-400 mt-1.5 italic">{sup.notes}</p>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openSupForm(sup)}
                      className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
                    >
                      <Edit3 size={14} className="text-gray-500" />
                    </button>
                    <button
                      onClick={() => deleteSup(sup.id)}
                      className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── FAB ──────────────────────────────────────────────────────────── */}
      <button
        onClick={() => tab === 'pedidos' ? openOrderForm() : openSupForm()}
        className="fixed bottom-8 right-5 w-14 h-14 rounded-2xl text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{ backgroundColor: businessColor }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ══════════════════════ ORDER FORM MODAL ══════════════════════════════ */}
      {showOrderForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[92vh] overflow-y-auto">

            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-900">{editOrder ? 'Editar pedido' : 'Nuevo pedido'}</h3>
              <button
                onClick={() => setShowOrderForm(false)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4 pb-12">
              {oError && (
                <p className="text-red-500 text-xs bg-red-50 p-3 rounded-2xl">{oError}</p>
              )}

              {/* Título */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Título *</label>
                <input
                  value={oTitle} onChange={e => setOTitle(e.target.value)}
                  placeholder="Ej: Repuestos cosechadora Marzo"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              {/* Estado + Proveedor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Estado</label>
                  <select
                    value={oStatus} onChange={e => setOStatus(e.target.value as StatusKey)}
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  >
                    <option value="pendiente">⏳ Pendiente</option>
                    <option value="en camino">🚚 En camino</option>
                    <option value="recibido">✅ Recibido</option>
                    <option value="cancelado">❌ Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Proveedor</label>
                  <select
                    value={oSupplier} onChange={e => setOSupplier(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Items */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Items del pedido</label>
                <div className="space-y-2">
                  {oItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        value={item.description}
                        onChange={e => setOItems(p => p.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))}
                        placeholder="Descripción"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                      />
                      <input
                        value={item.quantity} type="number" placeholder="Qty"
                        onChange={e => setOItems(p => p.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                        className="w-14 border border-gray-200 rounded-xl px-2 py-2.5 text-sm focus:outline-none text-center"
                      />
                      <input
                        value={item.unit_cost} type="number" placeholder="$"
                        onChange={e => setOItems(p => p.map((it, i) => i === idx ? { ...it, unit_cost: e.target.value } : it))}
                        className="w-20 border border-gray-200 rounded-xl px-2 py-2.5 text-sm focus:outline-none"
                      />
                      {oItems.length > 1 && (
                        <button
                          onClick={() => setOItems(p => p.filter((_, i) => i !== idx))}
                          className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0"
                        >
                          <X size={13} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setOItems(p => [...p, { description: '', quantity: '1', unit_cost: '0' }])}
                  className="mt-2 w-full py-2 rounded-xl border border-dashed border-gray-300 text-xs text-gray-400 font-semibold"
                >
                  + Agregar item
                </button>
                {oItems.some(i => i.description.trim()) && (
                  <p className="text-xs text-right text-gray-600 mt-1 font-bold">
                    Total items: {fmt(oItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_cost) || 0), 0))}
                  </p>
                )}
              </div>

              {/* Total manual + moneda */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Total general (si no hay items)</label>
                  <input
                    value={oTotal} onChange={e => setOTotal(e.target.value)} type="number" placeholder="0.00"
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Moneda</label>
                  <select
                    value={oCurrency} onChange={e => setOCurrency(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-2 py-3 text-sm focus:outline-none"
                  >
                    <option>USD</option><option>ARS</option><option>EUR</option>
                  </select>
                </div>
              </div>

              {/* Monto pagado */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Monto ya pagado</label>
                <input
                  value={oPaid} onChange={e => setOPaid(e.target.value)} type="number" placeholder="0.00"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none"
                />
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Fecha pedido</label>
                  <input
                    value={oOrderDate} onChange={e => setOOrderDate(e.target.value)} type="date"
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Entrega estimada</label>
                  <input
                    value={oExpected} onChange={e => setOExpected(e.target.value)} type="date"
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  />
                </div>
              </div>

              {oStatus === 'recibido' && (
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Fecha de llegada</label>
                  <input
                    value={oActual} onChange={e => setOActual(e.target.value)} type="date"
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  />
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Descripción / Notas</label>
                <textarea
                  value={oNotes} onChange={e => setONotes(e.target.value)}
                  rows={2} placeholder="Notas adicionales..."
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none"
                />
              </div>

              <button
                onClick={saveOrder}
                disabled={oSaving}
                className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                style={{ backgroundColor: businessColor }}
              >
                {oSaving ? 'Guardando…' : editOrder ? 'Actualizar pedido' : 'Crear pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ SUPPLIER FORM MODAL ══════════════════════════ */}
      {showSupForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">

            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-900">{editSup ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
              <button
                onClick={() => setShowSupForm(false)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4 pb-12">
              {sError && <p className="text-red-500 text-xs bg-red-50 p-3 rounded-2xl">{sError}</p>}

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Nombre *</label>
                <input
                  value={sName} onChange={e => setSName(e.target.value)} placeholder="Ej: Agro Repuestos SA"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">País</label>
                  <input
                    value={sCountry} onChange={e => setSCountry(e.target.value)} placeholder="Ej: Argentina"
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Moneda</label>
                  <select
                    value={sCurrency} onChange={e => setSCurrency(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  >
                    <option>USD</option><option>ARS</option><option>EUR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Nombre de contacto</label>
                <input
                  value={sContact} onChange={e => setSContact(e.target.value)} placeholder="Ej: Juan García"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Tel / WhatsApp / Email</label>
                <input
                  value={sPhone} onChange={e => setSPhone(e.target.value)} placeholder="+54 11 1234-5678"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Notas</label>
                <textarea
                  value={sNotes} onChange={e => setSNotes(e.target.value)}
                  rows={2} placeholder="Ej: Pago por transferencia, 30 días plazo"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none"
                />
              </div>

              <button
                onClick={saveSup}
                disabled={sSaving}
                className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                style={{ backgroundColor: businessColor }}
              >
                {sSaving ? 'Guardando…' : editSup ? 'Actualizar proveedor' : 'Guardar proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
