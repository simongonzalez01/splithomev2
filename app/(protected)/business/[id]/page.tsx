'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, X, Pencil, Trash2, TrendingUp, TrendingDown,
  Package, ShoppingCart, DollarSign, AlertTriangle, Camera,
  Image as ImageIcon, Check, ChevronDown,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Business = { id: string; name: string; description: string | null; color: string }

type Product = {
  id: string; name: string; unit: string
  cost_price: number; sale_price: number
  stock: number; min_stock: number; is_active: boolean
}

type TxItem = { product_id: string; quantity: number; unit_price: number; subtotal: number }

type Transaction = {
  id: string; type: 'venta' | 'compra' | 'gasto' | 'ingreso'
  total: number; description: string | null; date: string
  receipt_url: string | null; notes: string | null; created_at: string
  items?: TxItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function monthStart() { return new Date().toISOString().slice(0, 7) }
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
}

const TX_COLORS: Record<string, string> = {
  venta:   'text-emerald-600',
  compra:  'text-blue-600',
  ingreso: 'text-emerald-500',
  gasto:   'text-red-500',
}
const TX_BG: Record<string, string> = {
  venta: 'bg-emerald-50', compra: 'bg-blue-50', ingreso: 'bg-green-50', gasto: 'bg-red-50',
}
const TX_LABEL: Record<string, string> = {
  venta: 'Venta', compra: 'Compra', ingreso: 'Ingreso', gasto: 'Gasto',
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BusinessDetailPage() {
  const supabase    = createClient()
  const { id }      = useParams<{ id: string }>()
  const router      = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userId,   setUserId]   = useState<string | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [txs,      setTxs]      = useState<Transaction[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'dashboard' | 'inventario' | 'movimientos'>('dashboard')

  // ── Filters for movimientos
  const [filterMonth, setFilterMonth] = useState(monthStart())
  const [filterType,  setFilterType]  = useState('')

  // ── Product form
  const [showProductForm,  setShowProductForm]  = useState(false)
  const [pEditId,          setPEditId]          = useState<string | null>(null)
  const [pName,            setPName]            = useState('')
  const [pUnit,            setPUnit]            = useState('unidad')
  const [pCost,            setPCost]            = useState('')
  const [pSale,            setPSale]            = useState('')
  const [pStock,           setPStock]           = useState('')
  const [pMinStock,        setPMinStock]        = useState('0')
  const [pSaving,          setPSaving]          = useState(false)
  const [pError,           setPError]           = useState('')

  // ── Transaction form
  const [showTxForm,  setShowTxForm]  = useState(false)
  const [txType,      setTxType]      = useState<'venta' | 'compra' | 'gasto' | 'ingreso'>('venta')
  const [txDesc,      setTxDesc]      = useState('')
  const [txDate,      setTxDate]      = useState(todayStr())
  const [txNotes,     setTxNotes]     = useState('')
  const [txItems,     setTxItems]     = useState<{ product_id: string; qty: string; unit_price: string }[]>([])
  const [txAmount,    setTxAmount]    = useState('')   // for gasto/ingreso
  const [txFile,      setTxFile]      = useState<File | null>(null)
  const [txPreview,   setTxPreview]   = useState<string | null>(null)
  const [txSaving,    setTxSaving]    = useState(false)
  const [txError,     setTxError]     = useState('')

  // ── View receipt
  const [viewReceipt, setViewReceipt] = useState<string | null>(null)

  // ─── Load data ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: biz }, { data: prods }, { data: transactions }] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', id).eq('user_id', user.id).single(),
      supabase.from('business_products').select('*').eq('business_id', id).eq('is_active', true).order('name'),
      supabase.from('business_transactions').select('*').eq('business_id', id)
        .order('date', { ascending: false }).order('created_at', { ascending: false }),
    ])

    if (!biz) { router.push('/business'); return }
    setBusiness(biz)
    setProducts(prods ?? [])
    setTxs(transactions ?? [])
    setLoading(false)
  }, [supabase, id, router])

  useEffect(() => { load() }, [load])

  // ─── Dashboard metrics ────────────────────────────────────────────────────
  const { cashBalance, inventoryValue, monthProfit } = useMemo(() => {
    const cashIn  = txs.filter(t => t.type === 'venta' || t.type === 'ingreso').reduce((s, t) => s + Number(t.total), 0)
    const cashOut = txs.filter(t => t.type === 'compra' || t.type === 'gasto').reduce((s, t) => s + Number(t.total), 0)
    const invVal  = products.reduce((s, p) => s + Number(p.stock) * Number(p.cost_price), 0)
    const m       = monthStart()
    const mTxs    = txs.filter(t => t.date.startsWith(m))
    const mIn     = mTxs.filter(t => t.type === 'venta' || t.type === 'ingreso').reduce((s, t) => s + Number(t.total), 0)
    const mOut    = mTxs.filter(t => t.type === 'compra' || t.type === 'gasto').reduce((s, t) => s + Number(t.total), 0)
    return { cashBalance: cashIn - cashOut, inventoryValue: invVal, monthProfit: mIn - mOut }
  }, [txs, products])

  const lowStock = products.filter(p => Number(p.stock) <= Number(p.min_stock) && Number(p.min_stock) > 0)

  // ─── Product handlers ─────────────────────────────────────────────────────
  function openAddProduct() {
    setPEditId(null); setPName(''); setPUnit('unidad'); setPCost(''); setPSale('')
    setPStock('0'); setPMinStock('0'); setPError(''); setShowProductForm(true)
  }
  function openEditProduct(p: Product) {
    setPEditId(p.id); setPName(p.name); setPUnit(p.unit)
    setPCost(String(p.cost_price)); setPSale(String(p.sale_price))
    setPStock(String(p.stock)); setPMinStock(String(p.min_stock))
    setPError(''); setShowProductForm(true)
  }
  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault(); setPError('')
    if (!pName.trim()) { setPError('Nombre requerido'); return }
    setPSaving(true)
    const payload = {
      name: pName.trim(), unit: pUnit,
      cost_price: parseFloat(pCost) || 0,
      sale_price: parseFloat(pSale) || 0,
      stock: parseFloat(pStock) || 0,
      min_stock: parseFloat(pMinStock) || 0,
    }
    if (pEditId) {
      const { error } = await supabase.from('business_products').update(payload).eq('id', pEditId)
      if (error) { setPError(error.message); setPSaving(false); return }
    } else {
      const { error } = await supabase.from('business_products')
        .insert({ ...payload, business_id: id, user_id: userId, is_active: true })
      if (error) { setPError(error.message); setPSaving(false); return }
    }
    setPSaving(false); setShowProductForm(false); await load()
  }
  async function handleDeleteProduct(p: Product) {
    if (!confirm(`¿Desactivar "${p.name}"?`)) return
    await supabase.from('business_products').update({ is_active: false }).eq('id', p.id)
    await load()
  }

  // ─── Transaction handlers ─────────────────────────────────────────────────
  function openAddTx(type: typeof txType = 'venta') {
    setTxType(type); setTxDesc(''); setTxDate(todayStr()); setTxNotes('')
    setTxItems(type === 'venta' || type === 'compra'
      ? [{ product_id: products[0]?.id ?? '', qty: '1', unit_price: '' }]
      : [])
    setTxAmount(''); setTxFile(null); setTxPreview(null)
    setTxError(''); setShowTxForm(true)
  }

  function addTxItem() {
    setTxItems(prev => [...prev, { product_id: products[0]?.id ?? '', qty: '1', unit_price: '' }])
  }
  function updateTxItem(i: number, field: string, value: string) {
    setTxItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      // Auto-fill unit price from product
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod) updated[i].unit_price = String(txType === 'venta' ? prod.sale_price : prod.cost_price)
      }
      return updated
    })
  }
  function removeTxItem(i: number) {
    setTxItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleTxFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setTxFile(file)
    const reader = new FileReader()
    reader.onload = ev => setTxPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadReceipt(file: File, uid: string) {
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${uid}/${Date.now()}_biz.${ext}`
    const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type })
    if (error) return null
    return path
  }

  async function handleSaveTx(e: React.FormEvent) {
    e.preventDefault(); setTxError('')
    const isItemBased = txType === 'venta' || txType === 'compra'

    let total = 0
    let validItems: { product_id: string; quantity: number; unit_price: number; subtotal: number }[] = []

    if (isItemBased) {
      if (txItems.length === 0) { setTxError('Agrega al menos un producto'); return }
      for (const item of txItems) {
        const qty   = parseFloat(item.qty)
        const price = parseFloat(item.unit_price)
        if (!item.product_id || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
          setTxError('Revisa los productos: cantidad y precio deben ser válidos'); return
        }
        validItems.push({ product_id: item.product_id, quantity: qty, unit_price: price, subtotal: qty * price })
        total += qty * price
      }
    } else {
      total = parseFloat(txAmount)
      if (isNaN(total) || total <= 0) { setTxError('Ingresa un monto válido'); return }
    }

    setTxSaving(true)
    let receiptPath: string | null = null
    if (txFile && userId) receiptPath = await uploadReceipt(txFile, userId)

    const { data: newTx, error: txErr } = await supabase.from('business_transactions')
      .insert({
        business_id: id, user_id: userId, type: txType, total,
        description: txDesc.trim() || null, date: txDate,
        notes: txNotes.trim() || null, receipt_url: receiptPath,
      })
      .select('id').single()

    if (txErr || !newTx) { setTxError(txErr?.message ?? 'Error al guardar'); setTxSaving(false); return }

    // Guardar items y actualizar stock
    if (isItemBased && validItems.length > 0) {
      await supabase.from('business_tx_items').insert(
        validItems.map(item => ({ ...item, transaction_id: newTx.id }))
      )
      // Actualizar stock de cada producto
      for (const item of validItems) {
        const prod = products.find(p => p.id === item.product_id)
        if (!prod) continue
        const newStock = txType === 'venta'
          ? Number(prod.stock) - item.quantity     // venta → resta stock
          : Number(prod.stock) + item.quantity      // compra → suma stock
        await supabase.from('business_products').update({ stock: newStock }).eq('id', item.product_id)
      }
    }

    setTxSaving(false); setShowTxForm(false); await load()
  }

  async function handleDeleteTx(t: Transaction) {
    if (!confirm('¿Borrar este movimiento? El stock NO se revertirá automáticamente.')) return
    await supabase.from('business_transactions').delete().eq('id', t.id)
    setTxs(prev => prev.filter(x => x.id !== t.id))
  }

  async function openReceipt(path: string) {
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
    setViewReceipt(data?.signedUrl ?? null)
  }

  // ─── Filtered transactions ────────────────────────────────────────────────
  const filteredTxs = useMemo(() =>
    txs.filter(t =>
      t.date.startsWith(filterMonth) &&
      (!filterType || t.type === filterType)
    ), [txs, filterMonth, filterType])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )
  if (!business) return null

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto">

      {/* Header del negocio */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => router.push('/business')} className="text-gray-400 active:text-gray-600 p-1 -ml-1">
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: business.color + '22' }}
        >
          <Package size={18} style={{ color: business.color }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 text-[16px] truncate">{business.name}</h1>
          {business.description && <p className="text-xs text-gray-400 truncate">{business.description}</p>}
        </div>
      </div>

      {/* Tabs internos */}
      <div className="px-4 mb-4">
        <div className="bg-gray-100 rounded-2xl p-1 flex gap-1">
          {(['dashboard', 'inventario', 'movimientos'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'
              }`}
            >
              {t === 'dashboard' ? 'Resumen' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ══ TAB: DASHBOARD ══════════════════════════════════════════════════ */}
      {tab === 'dashboard' && (
        <div className="px-4 space-y-4">

          {/* Cards principales */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign size={13} className="text-emerald-500" strokeWidth={2} />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Caja total</span>
              </div>
              <p className={`font-bold text-xl ${cashBalance < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                {fmt(cashBalance)}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Package size={13} className="text-blue-500" strokeWidth={2} />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Inventario</span>
              </div>
              <p className="font-bold text-xl text-gray-900">{fmt(inventoryValue)}</p>
            </div>
          </div>

          {/* Utilidad del mes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                Este mes — {new Date().toLocaleDateString('es', { month: 'long' })}
              </span>
            </div>
            <div className="flex items-end gap-1">
              <p className={`font-bold text-2xl ${monthProfit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                {monthProfit < 0 ? '-' : '+'}{fmt(monthProfit)}
              </p>
              <p className="text-xs text-gray-400 mb-1">utilidad</p>
            </div>
          </div>

          {/* Alerta stock bajo */}
          {lowStock.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={15} className="text-amber-500" strokeWidth={2} />
                <span className="text-sm font-bold text-amber-700">Stock bajo ({lowStock.length})</span>
              </div>
              <div className="space-y-1">
                {lowStock.map(p => (
                  <p key={p.id} className="text-xs text-amber-700">
                    • {p.name}: <span className="font-bold">{p.stock} {p.unit}</span> (mín. {p.min_stock})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Acciones rápidas */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setTab('movimientos'); openAddTx('venta') }}
              className="bg-emerald-500 text-white rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:opacity-80"
            >
              <TrendingUp size={20} strokeWidth={2} />
              <span className="text-xs font-bold">Nueva venta</span>
            </button>
            <button
              onClick={() => { setTab('movimientos'); openAddTx('compra') }}
              className="bg-blue-500 text-white rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:opacity-80"
            >
              <ShoppingCart size={20} strokeWidth={2} />
              <span className="text-xs font-bold">Nueva compra</span>
            </button>
            <button
              onClick={() => { setTab('movimientos'); openAddTx('gasto') }}
              className="bg-red-500 text-white rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:opacity-80"
            >
              <TrendingDown size={20} strokeWidth={2} />
              <span className="text-xs font-bold">Gasto</span>
            </button>
            <button
              onClick={() => { setTab('inventario'); openAddProduct() }}
              className="bg-orange-400 text-white rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:opacity-80"
            >
              <Package size={20} strokeWidth={2} />
              <span className="text-xs font-bold">Producto</span>
            </button>
          </div>
        </div>
      )}

      {/* ══ TAB: INVENTARIO ═════════════════════════════════════════════════ */}
      {tab === 'inventario' && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400">{products.length} producto{products.length !== 1 ? 's' : ''}</p>
            <button
              onClick={openAddProduct}
              className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80"
            >
              <Plus size={15} strokeWidth={2.5} /> Producto
            </button>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package size={36} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
              <p className="text-sm">Sin productos. ¡Agrega el primero!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {products.map(p => {
                const isLow = Number(p.min_stock) > 0 && Number(p.stock) <= Number(p.min_stock)
                return (
                  <div key={p.id} className={`bg-white rounded-2xl border shadow-sm ${isLow ? 'border-amber-200' : 'border-gray-100'}`}>
                    <div className="px-4 py-3.5 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isLow ? 'bg-amber-50' : 'bg-orange-50'}`}>
                        <Package size={16} className={isLow ? 'text-amber-500' : 'text-orange-500'} strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-gray-900 truncate text-[14px]">{p.name}</p>
                          {isLow && <AlertTriangle size={11} className="text-amber-500 flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Costo: {fmt(Number(p.cost_price))} · Venta: {fmt(Number(p.sale_price))}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 mr-2">
                        <p className={`font-bold text-lg ${isLow ? 'text-amber-500' : 'text-gray-900'}`}>
                          {p.stock}
                        </p>
                        <p className="text-[10px] text-gray-400">{p.unit}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => openEditProduct(p)} className="text-gray-300 active:text-blue-500 p-1">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteProduct(p)} className="text-gray-300 active:text-red-500 p-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: MOVIMIENTOS ════════════════════════════════════════════════ */}
      {tab === 'movimientos' && (
        <div className="px-4">
          {/* Controles */}
          <div className="flex gap-2 mb-4">
            <input
              type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <select
              value={filterType} onChange={e => setFilterType(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">Todos</option>
              <option value="venta">Ventas</option>
              <option value="compra">Compras</option>
              <option value="gasto">Gastos</option>
              <option value="ingreso">Ingresos</option>
            </select>
          </div>

          {/* Botones agregar */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {(['venta', 'compra', 'gasto', 'ingreso'] as const).map(t => (
              <button
                key={t}
                onClick={() => openAddTx(t)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white active:opacity-80 ${
                  t === 'venta'   ? 'bg-emerald-500' :
                  t === 'compra'  ? 'bg-blue-500'    :
                  t === 'gasto'   ? 'bg-red-500'     : 'bg-green-500'
                }`}
              >
                <Plus size={12} strokeWidth={3} />
                {TX_LABEL[t]}
              </button>
            ))}
          </div>

          {filteredTxs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <DollarSign size={36} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
              <p className="text-sm">Sin movimientos en este período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTxs.map(t => (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${TX_BG[t.type]}`}>
                    {(t.type === 'venta' || t.type === 'ingreso')
                      ? <TrendingUp  size={15} className={TX_COLORS[t.type]} strokeWidth={2} />
                      : <TrendingDown size={15} className={TX_COLORS[t.type]} strokeWidth={2} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${TX_BG[t.type]} ${TX_COLORS[t.type]}`}>
                        {TX_LABEL[t.type]}
                      </span>
                    </div>
                    {t.description && <p className="font-medium text-gray-800 text-sm mt-0.5 truncate">{t.description}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(t.date)}</p>
                    {t.notes && <p className="text-[11px] text-blue-500 italic mt-0.5">"{t.notes}"</p>}
                    {t.receipt_url && (
                      <button onClick={() => openReceipt(t.receipt_url!)}
                        className="mt-1 flex items-center gap-1 text-[11px] text-orange-600 font-semibold active:opacity-60">
                        <Camera size={10} strokeWidth={2} /> Ver recibo
                      </button>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-lg ${TX_COLORS[t.type]}`}>
                      {(t.type === 'venta' || t.type === 'ingreso') ? '+' : '-'}{fmt(Number(t.total))}
                    </p>
                    <button onClick={() => handleDeleteTx(t)} className="text-gray-300 active:text-red-500 mt-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Modal: ver recibo ══════════════════════════════════════════════ */}
      {viewReceipt && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setViewReceipt(null)}>
          <div className="relative max-w-sm w-full">
            <button onClick={() => setViewReceipt(null)}
              className="absolute -top-10 right-0 text-white/70 active:text-white"><X size={24} /></button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewReceipt} alt="Recibo" className="w-full rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* ══ Bottom sheet: PRODUCTO ══════════════════════════════════════════ */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowProductForm(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{pEditId ? 'Editar producto' : 'Nuevo producto'}</h2>
                <button onClick={() => setShowProductForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>
            <form id="prod-form" onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto px-5 space-y-4 pt-1 pb-4">
              {pError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{pError}</p>}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Nombre del producto</label>
                <input type="text" required value={pName} onChange={e => setPName(e.target.value)}
                  placeholder="Ej: Camisa talla M"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors" />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Unidad</label>
                <select value={pUnit} onChange={e => setPUnit(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  {['unidad', 'kg', 'g', 'litro', 'ml', 'caja', 'par', 'docena', 'metro', 'rollo'].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Precio costo</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base pointer-events-none">$</span>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={pCost} onChange={e => setPCost(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-7 pr-3 py-3.5 text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Precio venta</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base pointer-events-none">$</span>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={pSale} onChange={e => setPSale(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-7 pr-3 py-3.5 text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Stock actual</label>
                  <input type="number" step="0.01" min="0" placeholder="0" value={pStock} onChange={e => setPStock(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Stock mínimo</label>
                  <input type="number" step="0.01" min="0" placeholder="0" value={pMinStock} onChange={e => setPMinStock(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">El stock mínimo activa la alerta de reabastecimiento.</p>
            </form>
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowProductForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0">
                Cancelar
              </button>
              <button form="prod-form" type="submit" disabled={pSaving}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90">
                {pSaving ? 'Guardando…' : pEditId ? 'Actualizar' : 'Agregar producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Bottom sheet: TRANSACCIÓN ═══════════════════════════════════════ */}
      {showTxForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowTxForm(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Nueva {TX_LABEL[txType].toLowerCase()}
                </h2>
                <button onClick={() => setShowTxForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>

            <form id="tx-biz-form" onSubmit={handleSaveTx} className="flex-1 overflow-y-auto px-5 space-y-4 pt-1 pb-4">
              {txError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{txError}</p>}

              {/* Tipo */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(['venta', 'compra', 'gasto', 'ingreso'] as const).map(t => (
                  <button key={t} type="button" onClick={() => {
                    setTxType(t)
                    setTxItems(t === 'venta' || t === 'compra'
                      ? [{ product_id: products[0]?.id ?? '', qty: '1', unit_price: '' }] : [])
                    setTxAmount('')
                  }}
                    className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                      txType === t
                        ? t === 'venta'   ? 'border-emerald-500 bg-emerald-500 text-white'
                        : t === 'compra'  ? 'border-blue-500 bg-blue-500 text-white'
                        : t === 'gasto'   ? 'border-red-500 bg-red-500 text-white'
                        : 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-200 text-gray-600'
                    }`}>
                    {TX_LABEL[t]}
                  </button>
                ))}
              </div>

              {/* Descripción */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)}
                  placeholder={txType === 'venta' ? 'Ej: Venta a cliente' : txType === 'gasto' ? 'Ej: Pago de renta' : ''}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors" />
              </div>

              {/* Fecha */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                <input type="date" required value={txDate} onChange={e => setTxDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors" />
              </div>

              {/* Productos (venta / compra) */}
              {(txType === 'venta' || txType === 'compra') && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Productos</label>
                  {products.length === 0 ? (
                    <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">
                      No tienes productos. Agrega uno desde la pestaña Inventario.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {txItems.map((item, i) => {
                        const prod = products.find(p => p.id === item.product_id)
                        return (
                          <div key={i} className="bg-gray-50 rounded-2xl p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <select value={item.product_id}
                                onChange={e => updateTxItem(i, 'product_id', e.target.value)}
                                className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <button type="button" onClick={() => removeTxItem(i)}
                                className="text-gray-300 active:text-red-400 p-1 flex-shrink-0"><X size={16} /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[10px] text-gray-400 mb-1">Cantidad</p>
                                <input type="number" step="0.01" min="0.01" placeholder="1"
                                  value={item.qty} onChange={e => updateTxItem(i, 'qty', e.target.value)}
                                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-400" />
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-400 mb-1">
                                  Precio {txType === 'venta' ? 'venta' : 'costo'}
                                </p>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                                  <input type="number" step="0.01" min="0" placeholder={
                                    txType === 'venta' ? String(prod?.sale_price ?? '') : String(prod?.cost_price ?? '')
                                  } value={item.unit_price} onChange={e => updateTxItem(i, 'unit_price', e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-6 pr-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-400" />
                                </div>
                              </div>
                            </div>
                            {item.qty && item.unit_price && (
                              <p className="text-xs text-gray-500 text-right font-semibold">
                                Subtotal: {fmt(parseFloat(item.qty || '0') * parseFloat(item.unit_price || '0'))}
                              </p>
                            )}
                          </div>
                        )
                      })}
                      <button type="button" onClick={addTxItem}
                        className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-2.5 text-sm text-gray-500 font-medium active:bg-gray-50 flex items-center justify-center gap-1.5">
                        <Plus size={14} strokeWidth={2.5} /> Agregar producto
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Monto (gasto / ingreso) */}
              {(txType === 'gasto' || txType === 'ingreso') && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg pointer-events-none">$</span>
                    <input type="number" required step="0.01" min="0.01" placeholder="0.00"
                      value={txAmount} onChange={e => setTxAmount(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-8 pr-3 py-3.5 text-[17px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors" />
                  </div>
                </div>
              )}

              {/* Nota */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Nota <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input type="text" value={txNotes} onChange={e => setTxNotes(e.target.value)}
                  placeholder="Detalle adicional…"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white" />
              </div>

              {/* Recibo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Recibo <span className="font-normal normal-case">(opcional)</span>
                </label>
                {txPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={txPreview} alt="Preview" className="w-full max-h-40 object-cover rounded-xl border border-gray-200" />
                    <button type="button"
                      onClick={() => { setTxFile(null); setTxPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                      <X size={12} strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 rounded-2xl py-3 text-sm text-gray-500 font-medium active:bg-gray-50">
                      <ImageIcon size={15} className="text-gray-400" strokeWidth={1.8} /> Galería
                    </button>
                    <button type="button" onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute('capture', 'environment')
                        fileInputRef.current.click()
                        setTimeout(() => fileInputRef.current?.removeAttribute('capture'), 500)
                      }
                    }} className="flex-1 flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 rounded-2xl py-3 text-sm text-gray-500 font-medium active:bg-gray-50">
                      <Camera size={15} className="text-gray-400" strokeWidth={1.8} /> Cámara
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleTxFile} />
              </div>
            </form>

            {/* Total preview + botones */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              {(txType === 'venta' || txType === 'compra') && txItems.length > 0 && (
                <p className="text-center text-sm font-bold text-gray-700 mb-3">
                  Total: {fmt(txItems.reduce((s, item) => s + parseFloat(item.qty || '0') * parseFloat(item.unit_price || '0'), 0))}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowTxForm(false)}
                  className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0">
                  Cancelar
                </button>
                <button form="tx-biz-form" type="submit" disabled={txSaving}
                  className={`flex-1 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90 ${
                    txType === 'venta'   ? 'bg-emerald-500' :
                    txType === 'compra'  ? 'bg-blue-500'    :
                    txType === 'gasto'   ? 'bg-red-500'     : 'bg-green-500'
                  }`}>
                  {txSaving ? 'Guardando…' : `Guardar ${TX_LABEL[txType].toLowerCase()}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
