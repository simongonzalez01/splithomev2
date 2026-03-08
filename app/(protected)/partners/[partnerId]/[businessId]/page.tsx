'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, X, Pencil, Trash2, TrendingUp, TrendingDown,
  Package, DollarSign, AlertTriangle, Camera, Image as ImageIcon,
  Check, Users, ShieldCheck, Clock, CreditCard, ChevronDown,
  Store, ArrowLeftRight, Wallet, ChevronRight,
} from 'lucide-react'
import ImportInventoryModal from '@/components/ImportInventoryModal'

// ─── Types ─────────────────────────────────────────────────────────────────────
type Business = {
  id: string; name: string; description: string | null
  color: string; type: 'ventas' | 'cambio'; user_id: string
}
type Profile = { id: string; user_id?: string; email: string | null; full_name: string | null; display_name?: string | null }
type Product = {
  id: string; name: string; unit: string
  cost_price: number; sale_price: number
  stock: number; min_stock: number; is_active: boolean
}
type TxItem = { product_id: string; quantity: number; unit_price: number; subtotal: number }
type Transaction = {
  id: string
  type: 'venta' | 'compra' | 'gasto' | 'ingreso' | 'retiro'
  total: number; description: string | null; date: string
  receipt_url: string | null; notes: string | null; created_at: string
  created_by: string | null; verified_by: string | null; verified_at: string | null
  payment_type: 'contado' | 'credito' | null
  amount_paid: number | null; client_name: string | null
}
type TxPayment = { id: string; amount: number; date: string; notes: string | null }
type CapitalEntry = {
  id: string; contributed_by: string
  amount: number; description: string | null; date: string
}
type Member = { id: string; user_id: string; role: string; profit_share: number; profile?: Profile }
type Exchange = {
  id: string; business_id: string; sent_by: string | null
  amount_sent: number; currency_sent: string
  amount_received: number; currency_received: string
  exchange_rate: number | null; method: string | null
  date: string; notes: string | null; receipt_url: string | null; status: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const mStart = () => new Date().toISOString().slice(0, 7)
const fmtDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
const displayName = (p: Profile | null | undefined) => p?.full_name || p?.display_name || p?.email || 'Socio'
const initials = (p: Profile | null | undefined) => (p?.full_name || p?.display_name || p?.email || 'S').slice(0, 2).toUpperCase()

const TX_COLORS: Record<string, string> = {
  venta: 'text-emerald-600', compra: 'text-blue-600',
  ingreso: 'text-emerald-500', gasto: 'text-red-500', retiro: 'text-purple-500',
}
const TX_BG: Record<string, string> = {
  venta: 'bg-emerald-50', compra: 'bg-blue-50',
  ingreso: 'bg-green-50', gasto: 'bg-red-50', retiro: 'bg-purple-50',
}
const TX_LABEL: Record<string, string> = {
  venta: 'Venta', compra: 'Compra', ingreso: 'Ingreso', gasto: 'Gasto', retiro: 'Retiro',
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function PartnerBusinessPage() {
  const supabase = createClient()
  const { partnerId, businessId } = useParams<{ partnerId: string; businessId: string }>()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userId,   setUserId]   = useState<string | null>(null)
  const [isOwner,  setIsOwner]  = useState(false)
  const [business, setBusiness] = useState<Business | null>(null)
  const [partner,  setPartner]  = useState<Profile | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [txs,      setTxs]      = useState<Transaction[]>([])
  const [capital,  setCapital]  = useState<CapitalEntry[]>([])
  const [members,  setMembers]  = useState<Member[]>([])
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [loading,  setLoading]  = useState(true)

  const [tab, setTab] = useState<'dashboard' | 'inventario' | 'movimientos' | 'socios' | 'chat'>('dashboard')

  // Filters
  const [filterMonth, setFilterMonth] = useState(mStart())
  const [filterType,  setFilterType]  = useState('')

  // ── Product form
  const [showImportModal, setShowImportModal] = useState(false)
  const [showProdForm,    setShowProdForm]    = useState(false)
  const [pEditId,  setPEditId]  = useState<string | null>(null)
  const [pName,    setPName]    = useState('')
  const [pUnit,    setPUnit]    = useState('unidad')
  const [pCost,    setPCost]    = useState('')
  const [pSale,    setPSale]    = useState('')
  const [pStock,   setPStock]   = useState('0')
  const [pMin,     setPMin]     = useState('0')
  const [pSaving,  setPSaving]  = useState(false)
  const [pError,   setPError]   = useState('')

  // ── Transaction form
  const [showTxForm,  setShowTxForm]  = useState(false)
  const [txEditId,    setTxEditId]    = useState<string | null>(null)
  const [txType,      setTxType]      = useState<Transaction['type']>('venta')
  const [txDesc,      setTxDesc]      = useState('')
  const [txDate,      setTxDate]      = useState(today())
  const [txNotes,     setTxNotes]     = useState('')
  const [txAmount,    setTxAmount]    = useState('')
  const [txItems,     setTxItems]     = useState<{ product_id: string; qty: string; unit_price: string }[]>([])
  const [txOrigItems, setTxOrigItems] = useState<TxItem[]>([])
  const [txPayType,   setTxPayType]   = useState<'contado' | 'credito'>('contado')
  const [txAmtPaid,   setTxAmtPaid]   = useState('')
  const [txClient,    setTxClient]    = useState('')
  const [txFile,      setTxFile]      = useState<File | null>(null)
  const [txPreview,   setTxPreview]   = useState<string | null>(null)
  const [txExistRec,  setTxExistRec]  = useState<string | null>(null)
  const [txSaving,    setTxSaving]    = useState(false)
  const [txError,     setTxError]     = useState('')
  const [txItemSearches, setTxItemSearches] = useState<string[]>([])
  const [txDropdownOpen, setTxDropdownOpen] = useState<number>(-1)

  // ── View receipt
  const [viewReceipt, setViewReceipt] = useState<string | null>(null)

  // ── Credit payment modal
  const [payTx,      setPayTx]      = useState<Transaction | null>(null)
  const [payments,   setPayments]   = useState<TxPayment[]>([])
  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount,  setPayAmount]  = useState('')
  const [payDate,    setPayDate]    = useState(today())
  const [payNotes,   setPayNotes]   = useState('')
  const [paySaving,  setPaySaving]  = useState(false)
  const [payError,   setPayError]   = useState('')

  // ── Capital form
  const [showCapForm, setShowCapForm] = useState(false)
  const [capAmount,   setCapAmount]   = useState('')
  const [capDesc,     setCapDesc]     = useState('')
  const [capDate,     setCapDate]     = useState(today())
  const [capSaving,   setCapSaving]   = useState(false)
  const [capError,    setCapError]    = useState('')

  // ── Exchange form (cambio businesses)
  const [showExForm,   setShowExForm]   = useState(false)
  const [exEditId,     setExEditId]     = useState<string | null>(null)
  const [exSentBy,     setExSentBy]     = useState<'me' | 'partner'>('me')
  const [exSenderCurr, setExSenderCurr] = useState<'VES' | 'USD'>('VES')
  const [exVesAmt,     setExVesAmt]     = useState('')
  const [exUsdAmt,     setExUsdAmt]     = useState('')
  const [exMethod,     setExMethod]     = useState('pago_movil')
  const [exRef,        setExRef]        = useState('')
  const [exDate,       setExDate]       = useState(today())
  const [exNotes,      setExNotes]      = useState('')
  const [exSaving,     setExSaving]     = useState(false)
  const [exError,      setExError]      = useState('')

  // ─── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    // Check access: owner or member
    const { data: ownedBiz } = await supabase
      .from('businesses').select('*').eq('id', businessId).eq('user_id', user.id).maybeSingle()

    let biz: Business | null = ownedBiz as Business | null
    let ownerFlag = !!ownedBiz

    if (!biz) {
      const { data: memberCheck } = await supabase
        .from('business_members').select('id').eq('business_id', businessId).eq('user_id', user.id).maybeSingle()
      if (!memberCheck) { router.push('/partners'); return }
      const { data: memberBiz } = await supabase.from('businesses').select('*').eq('id', businessId).maybeSingle()
      biz = memberBiz as Business | null
    }
    if (!biz) { router.push('/partners'); return }

    setBusiness(biz)
    setIsOwner(ownerFlag)

    // Partner profile — partnerId is an auth user UUID, query by user_id
    if (partnerId !== 'pending' && partnerId !== 'solo') {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id,user_id,email,full_name,display_name')
        .eq('user_id', partnerId)
        .maybeSingle()
      setPartner(prof as Profile | null)
    }

    const [{ data: prods }, { data: transactions }] = await Promise.all([
      supabase.from('business_products').select('*').eq('business_id', businessId).eq('is_active', true).order('name'),
      supabase.from('business_transactions').select('*').eq('business_id', businessId)
        .order('date', { ascending: false }).order('created_at', { ascending: false }),
    ])

    setProducts(prods ?? [])
    setTxs((transactions ?? []) as Transaction[])

    // Capital
    const { data: cap } = await supabase.from('business_capital').select('*')
      .eq('business_id', businessId).order('date', { ascending: false })
    setCapital((cap ?? []) as CapitalEntry[])

    // Exchanges (cambio businesses)
    if (biz.type === 'cambio') {
      const { data: exs } = await supabase.from('business_exchanges').select('*')
        .eq('business_id', businessId).order('date', { ascending: false })
      setExchanges((exs ?? []) as Exchange[])
    }

    // Members with profiles — ids are auth user UUIDs, query by user_id
    const { data: mems } = await supabase.from('business_members').select('*').eq('business_id', businessId)
    if (mems && mems.length > 0) {
      const ids = mems.map((m: Member) => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,user_id,email,full_name,display_name')
        .in('user_id', ids)
      const profileMap = Object.fromEntries((profiles ?? []).map((p: Profile) => [p.user_id ?? p.id, p]))
      setMembers(mems.map((m: Member) => ({ ...m, profile: profileMap[m.user_id] })))
    } else {
      setMembers([])
    }

    setLoading(false)
  }, [supabase, businessId, partnerId, router])

  useEffect(() => { load() }, [load])

  // ─── Metrics ─────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const cashIn  = txs.filter(t => t.type === 'venta' || t.type === 'ingreso')
      .reduce((s, t) => s + (t.payment_type === 'credito' ? Number(t.amount_paid ?? 0) : Number(t.total)), 0)
    const cashOut = txs.filter(t => t.type === 'compra' || t.type === 'gasto' || t.type === 'retiro')
      .reduce((s, t) => s + Number(t.total), 0)
    const invVal  = products.reduce((s, p) => s + Number(p.stock) * Number(p.cost_price), 0)
    const m       = mStart()
    const mTxs    = txs.filter(t => t.date.startsWith(m))
    const mIn     = mTxs.filter(t => t.type === 'venta' || t.type === 'ingreso')
      .reduce((s, t) => s + (t.payment_type === 'credito' ? Number(t.amount_paid ?? 0) : Number(t.total)), 0)
    const mOut    = mTxs.filter(t => t.type === 'compra' || t.type === 'gasto')
      .reduce((s, t) => s + Number(t.total), 0)
    const pendingCredit = txs.filter(t => t.type === 'venta' && t.payment_type === 'credito'
      && Number(t.amount_paid ?? 0) < Number(t.total))
    const pendingTotal = pendingCredit.reduce((s, t) => s + (Number(t.total) - Number(t.amount_paid ?? 0)), 0)
    return { cashBalance: cashIn - cashOut, inventoryValue: invVal, monthProfit: mIn - mOut, pendingCredit, pendingTotal }
  }, [txs, products])

  const lowStock = products.filter(p => Number(p.stock) <= Number(p.min_stock) && Number(p.min_stock) > 0)

  // Cambio metrics
  const cambioMetrics = useMemo(() => {
    if (!business || business.type !== 'cambio') return null
    const todayStr = new Date().toISOString().split('T')[0]
    const mStr = mStart()
    const todayExs  = exchanges.filter(e => e.date === todayStr)
    const monthExs  = exchanges.filter(e => e.date.startsWith(mStr))
    // Net balance: total USD sent by me vs by partner this month
    let myUsdSent = 0, partnerUsdSent = 0
    let myVesSent = 0, partnerVesSent = 0
    for (const e of monthExs) {
      const isMine = !e.sent_by || e.sent_by === userId
      const usdAmt = e.currency_sent === 'USD' ? Number(e.amount_sent) : Number(e.amount_received)
      const vesAmt = e.currency_sent === 'VES' ? Number(e.amount_sent) : Number(e.amount_received)
      if (isMine) { myUsdSent += usdAmt; myVesSent += vesAmt }
      else         { partnerUsdSent += usdAmt; partnerVesSent += vesAmt }
    }
    // Method breakdown this month
    const byMethod: Record<string, number> = {}
    for (const e of monthExs) {
      const m = e.method ?? 'otro'
      byMethod[m] = (byMethod[m] ?? 0) + 1
    }
    return {
      todayCount: todayExs.length, monthCount: monthExs.length, totalCount: exchanges.length,
      myUsdSent, partnerUsdSent, myVesSent, partnerVesSent, byMethod,
    }
  }, [exchanges, business, userId])

  // Filtered exchanges
  const filteredExchanges = useMemo(() =>
    exchanges.filter(e => !filterMonth || e.date.startsWith(filterMonth))
  , [exchanges, filterMonth])

  // Capital metrics
  const myCapTotal      = capital.filter(c => c.contributed_by === userId).reduce((s, c) => s + Number(c.amount), 0)
  const partnerCapTotal = capital.filter(c => c.contributed_by === partnerId && partnerId !== 'pending')
    .reduce((s, c) => s + Number(c.amount), 0)
  const totalCap        = myCapTotal + partnerCapTotal

  // Profit split
  const memberProfitShare  = members.find(m => m.user_id === userId)?.profit_share ?? 50
  const partnerProfitShare = members.find(m => m.user_id === partnerId)?.profit_share ??
    members.find(m => m.user_id !== userId)?.profit_share ?? 50
  const ownerShare = isOwner ? (100 - members.reduce((s, m) => s + m.profit_share, 0)) : memberProfitShare

  const netProfit = txs
    .filter(t => t.type === 'venta' || t.type === 'ingreso')
    .reduce((s, t) => s + (t.payment_type === 'credito' ? Number(t.amount_paid ?? 0) : Number(t.total)), 0)
    - txs.filter(t => t.type === 'compra' || t.type === 'gasto').reduce((s, t) => s + Number(t.total), 0)
  const myProfitShare = netProfit * ((isOwner ? ownerShare : memberProfitShare) / 100)
  const partnerProfitAmt = netProfit * (partnerProfitShare / 100)

  // ─── Product handlers ────────────────────────────────────────────────────
  function openAddProduct() {
    setPEditId(null); setPName(''); setPUnit('unidad'); setPCost(''); setPSale('')
    setPStock('0'); setPMin('0'); setPError(''); setShowProdForm(true)
  }
  function openEditProduct(p: Product) {
    setPEditId(p.id); setPName(p.name); setPUnit(p.unit)
    setPCost(String(p.cost_price)); setPSale(String(p.sale_price))
    setPStock(String(p.stock)); setPMin(String(p.min_stock))
    setPError(''); setShowProdForm(true)
  }
  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault(); setPError('')
    if (!pName.trim()) { setPError('Nombre requerido'); return }
    setPSaving(true)
    const payload = { name: pName.trim(), unit: pUnit, cost_price: parseFloat(pCost) || 0, sale_price: parseFloat(pSale) || 0, stock: parseFloat(pStock) || 0, min_stock: parseFloat(pMin) || 0 }
    if (pEditId) {
      const { error } = await supabase.from('business_products').update(payload).eq('id', pEditId)
      if (error) { setPError(error.message); setPSaving(false); return }
    } else {
      const { error } = await supabase.from('business_products').insert({ ...payload, business_id: businessId, user_id: userId, is_active: true })
      if (error) { setPError(error.message); setPSaving(false); return }
    }
    setPSaving(false); setShowProdForm(false); await load()
  }
  async function handleDeleteProduct(p: Product) {
    if (!confirm(`¿Desactivar "${p.name}"?`)) return
    await supabase.from('business_products').update({ is_active: false }).eq('id', p.id)
    await load()
  }

  // ─── Transaction handlers ────────────────────────────────────────────────
  function openAddTx(type: Transaction['type'] = 'venta') {
    setTxEditId(null); setTxOrigItems([]); setTxExistRec(null)
    setTxType(type); setTxDesc(''); setTxDate(today()); setTxNotes('')
    setTxPayType('contado'); setTxAmtPaid(''); setTxClient('')
    setTxItems(type === 'venta' || type === 'compra'
      ? [{ product_id: '', qty: '1', unit_price: '' }] : [])
    setTxItemSearches(type === 'venta' || type === 'compra' ? [''] : [])
    setTxDropdownOpen(-1)
    setTxAmount(''); setTxFile(null); setTxPreview(null)
    setTxError(''); setShowTxForm(true)
  }

  async function openEditTx(t: Transaction) {
    setTxEditId(t.id); setTxType(t.type); setTxDesc(t.description ?? '')
    setTxDate(t.date); setTxNotes(t.notes ?? '')
    setTxPayType(t.payment_type ?? 'contado')
    setTxAmtPaid(String(t.amount_paid ?? '')); setTxClient(t.client_name ?? '')
    setTxFile(null); setTxPreview(null); setTxExistRec(t.receipt_url); setTxError('')
    if (t.type === 'venta' || t.type === 'compra') {
      const { data: items } = await supabase.from('business_tx_items')
        .select('product_id,quantity,unit_price,subtotal').eq('transaction_id', t.id)
      const orig = (items ?? []) as TxItem[]
      setTxOrigItems(orig)
      setTxItems(orig.map(i => ({ product_id: i.product_id, qty: String(i.quantity), unit_price: String(i.unit_price) })))
      setTxItemSearches(orig.map(i => products.find(p => p.id === i.product_id)?.name ?? ''))
      setTxDropdownOpen(-1)
      setTxAmount('')
    } else {
      setTxOrigItems([]); setTxItems([]); setTxAmount(String(t.total))
      setTxItemSearches([]); setTxDropdownOpen(-1)
    }
    setShowTxForm(true)
  }

  async function handleSaveTx(e: React.FormEvent) {
    e.preventDefault(); setTxError('')
    const hasItems = txType === 'venta' || txType === 'compra'
    const validItems = hasItems
      ? txItems.filter(i => i.product_id && parseFloat(i.qty) > 0).map(i => {
          const prod = products.find(p => p.id === i.product_id)
          const qty  = parseFloat(i.qty)
          const price = parseFloat(i.unit_price) || (txType === 'venta' ? Number(prod?.sale_price ?? 0) : Number(prod?.cost_price ?? 0))
          return { product_id: i.product_id, quantity: qty, unit_price: price, subtotal: qty * price }
        })
      : []
    if (hasItems && validItems.length === 0) { setTxError('Agrega al menos un producto'); return }
    const total = hasItems ? validItems.reduce((s, i) => s + i.subtotal, 0) : parseFloat(txAmount)
    if (!hasItems && (!total || total <= 0)) { setTxError('Monto inválido'); return }

    const amtPaid = txPayType === 'credito' ? (parseFloat(txAmtPaid) || 0) : total

    setTxSaving(true)

    // Upload receipt if new file
    let receiptUrl = txExistRec
    if (txFile) {
      const ext  = txFile.name.split('.').pop()
      const path = `receipts/${userId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, txFile)
      if (upErr) { setTxError('Error al subir recibo: ' + upErr.message); setTxSaving(false); return }
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
      receiptUrl = urlData.publicUrl
    }

    const txPayload = {
      business_id:  businessId,
      user_id:      userId,            // ← required by RLS policy (user_id = auth.uid())
      type:         txType,
      total,
      description:  txDesc.trim() || null,
      date:         txDate,
      notes:        txNotes.trim() || null,
      receipt_url:  receiptUrl,
      created_by:   userId,
      payment_type: txType === 'venta' ? txPayType : 'contado',
      amount_paid:  txType === 'venta' ? amtPaid : total,
      client_name:  txType === 'venta' && txClient.trim() ? txClient.trim() : null,
    }

    if (txEditId) {
      // Net stock delta for venta/compra
      if (hasItems) {
        const deltas: Record<string, number> = {}
        for (const orig of txOrigItems) {
          deltas[orig.product_id] = (deltas[orig.product_id] ?? 0) + (txType === 'venta' ? +1 : -1) * orig.quantity
        }
        for (const item of validItems) {
          deltas[item.product_id] = (deltas[item.product_id] ?? 0) + (txType === 'venta' ? -1 : +1) * item.quantity
        }
        const { data: freshProds } = await supabase.from('business_products').select('id,stock').eq('business_id', businessId)
        for (const [prodId, delta] of Object.entries(deltas)) {
          if (Math.abs(delta) < 0.001) continue
          const prod = freshProds?.find(p => p.id === prodId)
          if (!prod) continue
          await supabase.from('business_products').update({ stock: Number(prod.stock) + delta }).eq('id', prodId)
        }
        await supabase.from('business_tx_items').delete().eq('transaction_id', txEditId)
        await supabase.from('business_tx_items').insert(validItems.map(i => ({ ...i, transaction_id: txEditId })))
      }
      const { error } = await supabase.from('business_transactions').update(txPayload).eq('id', txEditId)
      if (error) { setTxError(error.message); setTxSaving(false); return }
    } else {
      const { data: newTx, error } = await supabase.from('business_transactions').insert(txPayload).select().single()
      if (error || !newTx) { setTxError(error?.message ?? 'Error'); setTxSaving(false); return }
      if (hasItems) {
        await supabase.from('business_tx_items').insert(validItems.map(i => ({ ...i, transaction_id: newTx.id })))
        // Adjust stock
        for (const item of validItems) {
          const { data: prod } = await supabase.from('business_products').select('stock').eq('id', item.product_id).single()
          if (!prod) continue
          const newStock = txType === 'venta' ? Number(prod.stock) - item.quantity : Number(prod.stock) + item.quantity
          await supabase.from('business_products').update({ stock: newStock }).eq('id', item.product_id)
        }
      }
      // If credit sale with initial payment, record it
      if (txType === 'venta' && txPayType === 'credito' && amtPaid > 0) {
        await supabase.from('business_transaction_payments').insert({
          transaction_id: newTx.id, business_id: businessId,
          amount: amtPaid, date: txDate, notes: 'Pago inicial',
        })
      }
    }

    setTxSaving(false); setShowTxForm(false); await load()
  }

  async function handleDeleteTx(t: Transaction) {
    if (t.created_by && t.created_by !== userId) { alert('Solo puedes eliminar tus propias transacciones.'); return }
    if (!confirm('¿Eliminar esta transacción?')) return
    if (t.type === 'venta' || t.type === 'compra') {
      const { data: items } = await supabase.from('business_tx_items').select('*').eq('transaction_id', t.id)
      for (const item of (items ?? []) as TxItem[]) {
        const { data: prod } = await supabase.from('business_products').select('stock').eq('id', item.product_id).single()
        if (!prod) continue
        const restored = t.type === 'venta' ? Number(prod.stock) + item.quantity : Number(prod.stock) - item.quantity
        await supabase.from('business_products').update({ stock: restored }).eq('id', item.product_id)
      }
    }
    await supabase.from('business_transactions').delete().eq('id', t.id)
    await load()
  }

  async function handleVerifyTx(t: Transaction) {
    await supabase.from('business_transactions').update({
      verified_by: userId, verified_at: new Date().toISOString(),
    }).eq('id', t.id)
    await load()
  }

  // ─── Payment handlers ────────────────────────────────────────────────────
  async function openPayments(t: Transaction) {
    setPayTx(t); setShowPayForm(false)
    setPayAmount(''); setPayDate(today()); setPayNotes(''); setPayError('')
    const { data } = await supabase.from('business_transaction_payments')
      .select('*').eq('transaction_id', t.id).order('date')
    setPayments((data ?? []) as TxPayment[])
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault(); setPayError('')
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) { setPayError('Monto inválido'); return }
    if (!payTx) return
    const remaining = Number(payTx.total) - Number(payTx.amount_paid ?? 0)
    if (amount > remaining + 0.01) { setPayError(`El máximo a pagar es ${fmt(remaining)}`); return }
    setPaySaving(true)

    await supabase.from('business_transaction_payments').insert({
      transaction_id: payTx.id, business_id: businessId,
      amount, date: payDate, notes: payNotes.trim() || null,
    })
    const newPaid = Number(payTx.amount_paid ?? 0) + amount
    await supabase.from('business_transactions').update({ amount_paid: newPaid }).eq('id', payTx.id)

    setPaySaving(false); setShowPayForm(false); setPayAmount(''); setPayNotes('')
    // Refresh
    const { data } = await supabase.from('business_transaction_payments')
      .select('*').eq('transaction_id', payTx.id).order('date')
    setPayments((data ?? []) as TxPayment[])
    // Update local tx
    setPayTx(prev => prev ? { ...prev, amount_paid: newPaid } : null)
    await load()
  }

  // ─── Capital handlers ────────────────────────────────────────────────────
  async function handleAddCapital(e: React.FormEvent) {
    e.preventDefault(); setCapError('')
    const amount = parseFloat(capAmount)
    if (!amount || amount <= 0) { setCapError('Monto inválido'); return }
    setCapSaving(true)
    const { error } = await supabase.from('business_capital').insert({
      business_id: businessId, contributed_by: userId,
      amount, description: capDesc.trim() || null, date: capDate,
    })
    if (error) { setCapError(error.message); setCapSaving(false); return }
    setCapSaving(false); setShowCapForm(false)
    setCapAmount(''); setCapDesc(''); setCapDate(today())
    await load()
  }

  async function handleDeleteCapital(c: CapitalEntry) {
    if (c.contributed_by !== userId) { alert('Solo puedes eliminar tus propios aportes.'); return }
    if (!confirm('¿Eliminar este aporte de capital?')) return
    await supabase.from('business_capital').delete().eq('id', c.id)
    await load()
  }

  // ─── Exchange handlers ────────────────────────────────────────────────────
  function openAddExchange() {
    setExEditId(null); setExSentBy('me'); setExSenderCurr('VES')
    setExVesAmt(''); setExUsdAmt(''); setExMethod('pago_movil')
    setExRef(''); setExDate(today()); setExNotes(''); setExError(''); setShowExForm(true)
  }

  function openEditExchange(e: Exchange) {
    setExEditId(e.id)
    setExSentBy(!e.sent_by || e.sent_by === userId ? 'me' : 'partner')
    const senderCurr = e.currency_sent === 'VES' ? 'VES' : 'USD'
    setExSenderCurr(senderCurr)
    if (e.currency_sent === 'VES') {
      setExVesAmt(String(e.amount_sent)); setExUsdAmt(String(e.amount_received))
    } else {
      setExUsdAmt(String(e.amount_sent)); setExVesAmt(String(e.amount_received))
    }
    setExMethod(e.method ?? 'pago_movil'); setExRef('')
    setExDate(e.date); setExNotes(e.notes ?? ''); setExError(''); setShowExForm(true)
  }

  async function handleSaveExchange(ev: React.FormEvent) {
    ev.preventDefault(); setExError('')
    const vesAmt = parseFloat(exVesAmt)
    const usdAmt = parseFloat(exUsdAmt)
    if (!vesAmt || vesAmt <= 0) { setExError('Monto en VES inválido'); return }
    if (!usdAmt || usdAmt <= 0) { setExError('Monto en USD inválido'); return }
    // amount_sent = what the sender sends, amount_received = what the sender receives
    const amtSent     = exSenderCurr === 'VES' ? vesAmt : usdAmt
    const currSent    = exSenderCurr
    const amtRecv     = exSenderCurr === 'VES' ? usdAmt : vesAmt
    const currRecv    = exSenderCurr === 'VES' ? 'USD' : 'VES'
    // Rate always expressed as VES per 1 USD
    const rate        = Math.round((vesAmt / usdAmt) * 100) / 100
    const sentById    = exSentBy === 'me' ? userId : (partner?.id ?? null)
    const notesStr    = [exRef.trim() ? `Ref: ${exRef.trim()}` : '', exNotes.trim()].filter(Boolean).join(' · ') || null
    setExSaving(true)
    const payload = {
      business_id: businessId, sent_by: sentById,
      amount_sent: amtSent, currency_sent: currSent,
      amount_received: amtRecv, currency_received: currRecv,
      exchange_rate: rate, method: exMethod, date: exDate,
      notes: notesStr, status: 'completada',
    }
    if (exEditId) {
      const { error } = await supabase.from('business_exchanges').update(payload).eq('id', exEditId)
      if (error) { setExError(error.message); setExSaving(false); return }
    } else {
      const { error } = await supabase.from('business_exchanges').insert(payload)
      if (error) { setExError(error.message); setExSaving(false); return }
    }
    setExSaving(false); setShowExForm(false); await load()
  }

  async function handleDeleteExchange(e: Exchange) {
    if (e.sent_by && e.sent_by !== userId) { alert('Solo puedes eliminar tus propias operaciones.'); return }
    if (!confirm('¿Eliminar esta operación de cambio?')) return
    await supabase.from('business_exchanges').delete().eq('id', e.id)
    await load()
  }

  // ─── File handling ────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setTxFile(file)
    const reader = new FileReader()
    reader.onload = ev => setTxPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  // ─── Filtered transactions ────────────────────────────────────────────────
  const filteredTxs = useMemo(() => txs.filter(t => {
    if (filterMonth && !t.date.startsWith(filterMonth)) return false
    if (filterType && t.type !== filterType) return false
    return true
  }), [txs, filterMonth, filterType])

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )
  if (!business) return null

  // 'pending' = tiene invite code pero sin socio aún
  // 'solo'    = negocio propio sin socio (redirigido desde /business)
  const isPending = partnerId === 'pending' || partnerId === 'solo'
  const tabs = business.type === 'cambio'
    ? (['dashboard', 'movimientos', 'socios', 'imports', 'chat'] as const)
    : (['dashboard', 'inventario', 'movimientos', 'socios', 'imports', 'chat'] as const)

  const TAB_LABELS: Record<string, string> = {
    dashboard: '🏠',
    inventario: '📦',
    movimientos: '📊',
    socios: '🤝',
    imports: '🚢',
    chat: '💬',
  }
  const TAB_NAMES: Record<string, string> = {
    dashboard: 'Inicio',
    inventario: 'Stock',
    movimientos: business.type === 'cambio' ? 'Ops' : 'Movs',
    socios: 'Socios',
    imports: 'Imports',
    chat: 'Chat',
  }

  return (
    <div className="max-w-lg mx-auto">

      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: business.color + '22' }}>
          {business.type === 'cambio'
            ? <ArrowLeftRight size={18} style={{ color: business.color }} strokeWidth={1.8} />
            : <Store size={18} style={{ color: business.color }} strokeWidth={1.8} />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 text-[16px] truncate">{business.name}</h1>
          {!isPending && partner && (
            <p className="text-xs text-gray-400">con {displayName(partner)}</p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 pt-1 pb-3">
        <div className="flex gap-0.5 bg-gray-100 p-1 rounded-2xl">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => {
                if (t === 'chat') {
                  router.push(`/partners/${partnerId}/${businessId}/chat`)
                } else if (t === 'imports') {
                  router.push(`/partners/${partnerId}/${businessId}/imports`)
                } else {
                  setTab(t as typeof tab)
                }
              }}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all flex flex-col items-center gap-0.5 ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}
            >
              <span className="text-base leading-none">{TAB_LABELS[t]}</span>
              <span>{TAB_NAMES[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════ DASHBOARD ══════════════ */}
      {tab === 'dashboard' && (
        <div className="px-4 space-y-3 pb-6">

          {/* ── VENTAS: financial summary ─────────────────────────────────── */}
          {business.type === 'ventas' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Balance caja</p>
                  <p className={`text-xl font-bold ${metrics.cashBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {metrics.cashBalance < 0 ? '-' : ''}{fmt(metrics.cashBalance)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Inventario</p>
                  <p className="text-xl font-bold text-blue-600">{fmt(metrics.inventoryValue)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ganancia mes</p>
                  <p className={`text-xl font-bold ${metrics.monthProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {metrics.monthProfit < 0 ? '-' : ''}{fmt(metrics.monthProfit)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ganancia total</p>
                  <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {netProfit < 0 ? '-' : ''}{fmt(netProfit)}
                  </p>
                </div>
              </div>

              {metrics.pendingCredit.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={16} className="text-amber-500" />
                    <p className="text-sm font-bold text-amber-700">Ventas por cobrar</p>
                  </div>
                  <p className="text-xs text-amber-600">
                    {metrics.pendingCredit.length} venta{metrics.pendingCredit.length !== 1 ? 's' : ''} pendiente{metrics.pendingCredit.length !== 1 ? 's' : ''} · {fmt(metrics.pendingTotal)} por cobrar
                  </p>
                  <button onClick={() => { setTab('movimientos'); setFilterType('venta') }}
                    className="text-xs font-bold text-amber-700 mt-1.5 underline">Ver ventas →</button>
                </div>
              )}

              {lowStock.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={16} className="text-red-400" />
                    <p className="text-sm font-bold text-red-600">Stock bajo</p>
                  </div>
                  <p className="text-xs text-red-500">{lowStock.map(p => p.name).join(', ')}</p>
                </div>
              )}

              {!isPending && totalCap > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Distribución de ganancia</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Tu ganancia', amount: myProfitShare, pct: isOwner ? ownerShare : memberProfitShare },
                      { label: displayName(partner), amount: partnerProfitAmt, pct: partnerProfitShare },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-600 truncate block">{row.label}</span>
                          <span className="text-[10px] text-gray-400">{row.pct}%</span>
                        </div>
                        <span className={`font-bold text-sm ml-3 ${row.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {fmt(row.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                {(['venta', 'gasto', 'compra', 'ingreso'] as const).map(type => (
                  <button key={type} onClick={() => { setTab('movimientos'); openAddTx(type) }}
                    className={`${TX_BG[type]} rounded-2xl px-4 py-3.5 text-left active:opacity-80`}>
                    <p className={`text-xs font-bold ${TX_COLORS[type]}`}>+ {TX_LABEL[type]}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── CAMBIO: exchange summary ──────────────────────────────────── */}
          {business.type === 'cambio' && (() => {
            const m = cambioMetrics
            const myName      = 'Yo'
            const partnerName = displayName(partner)
            const METHOD_EMOJI: Record<string, string> = {
              pago_movil: '📱', zelle: '🟢', efectivo: '💵', transferencia: '🏦',
            }
            return (
              <>
                {/* Contador hoy / este mes */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Hoy</p>
                    <p className="text-3xl font-black text-gray-900">{m?.todayCount ?? 0}</p>
                    <p className="text-[10px] text-gray-400">operaciones</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Este mes</p>
                    <p className="text-3xl font-black text-gray-900">{m?.monthCount ?? 0}</p>
                    <p className="text-[10px] text-gray-400">operaciones</p>
                  </div>
                </div>

                {/* Flujo por persona (quién envió qué este mes) */}
                {m && m.monthCount > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Quién envió este mes</p>
                    <div className="space-y-3">
                      {[
                        { name: myName,      usd: m.myUsdSent,      ves: m.myVesSent      },
                        { name: partnerName, usd: m.partnerUsdSent, ves: m.partnerVesSent },
                      ].map(row => (
                        <div key={row.name} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: business.color }}>
                            {(row.name[0] ?? '?').toUpperCase()}
                          </div>
                          <span className="text-sm font-bold text-gray-700 flex-1">{row.name}</span>
                          <div className="text-right">
                            {row.usd > 0 && (
                              <p className="text-sm font-bold text-emerald-600">
                                ${row.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span className="text-[10px] font-normal text-gray-400 ml-0.5">USD</span>
                              </p>
                            )}
                            {row.ves > 0 && (
                              <p className="text-[11px] text-gray-500">
                                {row.ves.toLocaleString('es-VE')} VES
                              </p>
                            )}
                            {row.usd === 0 && row.ves === 0 && (
                              <p className="text-xs text-gray-300">Sin envíos</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Desglose por método */}
                {m && m.monthCount > 0 && Object.keys(m.byMethod).length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Por método</p>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(m.byMethod).map(([method, count]) => (
                        <div key={method} className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-1.5">
                          <span>{METHOD_EMOJI[method] ?? '💱'}</span>
                          <span className="text-xs font-bold text-gray-600">
                            {method === 'pago_movil' ? 'Pago Móvil' : method.charAt(0).toUpperCase() + method.slice(1)}
                          </span>
                          <span className="text-xs text-gray-400 font-medium">×{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { setTab('movimientos'); openAddExchange() }}
                  className="w-full py-4 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 active:opacity-90"
                  style={{ backgroundColor: business.color }}
                >
                  <Plus size={16} strokeWidth={2.5} /> Nueva operación de cambio
                </button>
              </>
            )
          })()}

          {/* ── Tareas — visible for ALL business types ─────────────── */}
          <a href={`/partners/${partnerId}/${businessId}/todos`}
            className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 active:opacity-80">
            <span className="text-2xl">✅</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-700">Tareas pendientes</p>
              <p className="text-xs text-gray-400">Ver y gestionar tareas del negocio</p>
            </div>
            <ChevronRight size={16} className="text-emerald-300" />
          </a>
        </div>
      )}

      {/* ══════════════ INVENTARIO ══════════════ */}
      {tab === 'inventario' && business.type === 'ventas' && (
        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {products.length} producto{products.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 active:text-orange-500"
              >
                📥 Excel
              </button>
              <button onClick={openAddProduct}
                className="flex items-center gap-1 text-xs font-bold text-orange-500">
                <Plus size={14} strokeWidth={2.5} /> Agregar
              </button>
            </div>
          </div>

          {/* Import modal */}
          {showImportModal && (
            <ImportInventoryModal
              businessId={businessId}
              color={business.color}
              onClose={() => setShowImportModal(false)}
              onSuccess={() => { setShowImportModal(false); load() }}
            />
          )}
          {products.length === 0 ? (
            <div className="text-center py-12">
              <Package size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Sin productos todavía</p>
            </div>
          ) : (
            <div className="space-y-2">
              {products.map(p => (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl shadow-sm px-4 py-3.5 border ${
                    (p.cost_price === 0 || p.sale_price === 0)
                      ? 'border-orange-200'
                      : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900 text-[14px]">{p.name}</p>
                        {(p.cost_price === 0 || p.sale_price === 0) && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            <AlertTriangle size={9} />
                            {p.cost_price === 0 && p.sale_price === 0
                              ? 'Sin precios'
                              : p.cost_price === 0
                              ? 'Sin precio costo'
                              : 'Sin precio venta'}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span className={p.cost_price === 0 ? 'text-orange-400 font-semibold' : ''}>
                          Costo: {p.cost_price === 0 ? '—' : fmt(p.cost_price)}
                        </span>
                        <span className={p.sale_price === 0 ? 'text-orange-400 font-semibold' : ''}>
                          Precio: {p.sale_price === 0 ? '—' : fmt(p.sale_price)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className={`font-bold text-sm ${Number(p.stock) <= Number(p.min_stock) && p.min_stock > 0 ? 'text-red-500' : 'text-gray-800'}`}>
                          {p.stock} {p.unit}
                        </p>
                      </div>
                      <button onClick={() => openEditProduct(p)} className="text-gray-300 p-1"><Pencil size={14} /></button>
                      {isOwner && (
                        <button onClick={() => handleDeleteProduct(p)} className="text-gray-300 p-1"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ MOVIMIENTOS (VENTAS) ══════════════ */}
      {tab === 'movimientos' && business.type === 'ventas' && (
        <div className="px-4 pb-6">
          {/* Controls */}
          <div className="flex gap-2 mb-3">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
              <option value="">Todos</option>
              <option value="venta">Ventas</option>
              <option value="compra">Compras</option>
              <option value="gasto">Gastos</option>
              <option value="ingreso">Ingresos</option>
              <option value="retiro">Retiros</option>
            </select>
            <button onClick={() => openAddTx('venta')}
              className="bg-orange-500 text-white rounded-xl px-3 py-2 flex items-center gap-1 text-sm font-bold">
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>

          {/* Types quick filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
            {['venta', 'compra', 'gasto', 'ingreso', 'retiro'].map(type => (
              <button key={type} onClick={() => openAddTx(type as Transaction['type'])}
                className={`flex-shrink-0 ${TX_BG[type]} ${TX_COLORS[type]} text-xs font-bold px-3 py-1.5 rounded-xl`}>
                + {TX_LABEL[type]}
              </button>
            ))}
          </div>

          {filteredTxs.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Sin movimientos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTxs.map(t => {
                const isCredit = t.type === 'venta' && t.payment_type === 'credito'
                const paid = Number(t.amount_paid ?? t.total)
                const total = Number(t.total)
                const isPaid = paid >= total - 0.01
                const isMine = !t.created_by || t.created_by === userId
                const isVerified = !!t.verified_at
                const canVerify = !isMine && !isVerified && !isPending

                return (
                  <div key={t.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 active:bg-gray-50"
                    onClick={() => isCredit && !isPaid ? openPayments(t) : undefined}>
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 ${TX_BG[t.type]} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        {t.type === 'venta' ? <TrendingUp size={16} className={TX_COLORS[t.type]} />
                          : t.type === 'compra' ? <Package size={16} className={TX_COLORS[t.type]} />
                          : t.type === 'retiro' ? <Wallet size={16} className={TX_COLORS[t.type]} />
                          : t.type === 'ingreso' ? <TrendingUp size={16} className={TX_COLORS[t.type]} />
                          : <TrendingDown size={16} className={TX_COLORS[t.type]} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${TX_BG[t.type]} ${TX_COLORS[t.type]}`}>
                            {TX_LABEL[t.type]}
                          </span>
                          {/* Verification badge */}
                          {!isMine && (
                            isVerified
                              ? <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                  <ShieldCheck size={11} /> Verificado
                                </span>
                              : <span className="text-[10px] text-amber-500 font-semibold flex items-center gap-0.5">
                                  <Clock size={11} /> Sin verificar
                                </span>
                          )}
                          {/* Credit badge */}
                          {isCredit && (
                            <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${isPaid ? 'text-emerald-500' : 'text-amber-500'}`}>
                              <CreditCard size={11} /> {isPaid ? 'Cobrado' : `${fmt(paid)}/${fmt(total)}`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">
                          {t.description || TX_LABEL[t.type]}
                          {t.client_name ? ` · ${t.client_name}` : ''}
                        </p>
                        <p className="text-xs text-gray-400">
                          {fmtDate(t.date)}
                          {!isMine ? ` · ${displayName(partner)}` : ''}
                          {t.notes ? ` · ${t.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`font-bold text-sm ${TX_COLORS[t.type]}`}>
                          {t.type === 'venta' || t.type === 'ingreso' ? '+' : '-'}{fmt(t.total)}
                        </span>
                        <div className="flex gap-1">
                          {t.receipt_url && (
                            <button onClick={e => { e.stopPropagation(); setViewReceipt(t.receipt_url!) }}
                              className="text-[10px] text-blue-500 font-semibold">Recibo</button>
                          )}
                          {isCredit && !isPaid && (
                            <button onClick={e => { e.stopPropagation(); openPayments(t) }}
                              className="text-[10px] text-amber-500 font-semibold">+ Pago</button>
                          )}
                          {canVerify && (
                            <button onClick={e => { e.stopPropagation(); handleVerifyTx(t) }}
                              className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                              <Check size={10} /> Verificar
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); openEditTx(t) }}
                            className="text-gray-300 p-0.5"><Pencil size={12} /></button>
                          <button onClick={e => { e.stopPropagation(); handleDeleteTx(t) }}
                            className="text-gray-300 p-0.5"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ MOVIMIENTOS (CAMBIO) ══════════════ */}
      {tab === 'movimientos' && business.type === 'cambio' && (
        <div className="px-4 pb-6">
          <div className="flex gap-2 mb-4">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={openAddExchange}
              className="text-white rounded-xl px-4 py-2 flex items-center gap-1.5 text-sm font-bold"
              style={{ backgroundColor: business.color }}>
              <Plus size={15} strokeWidth={2.5} /> Nueva
            </button>
          </div>

          {filteredExchanges.length === 0 ? (
            <div className="text-center py-12">
              <ArrowLeftRight size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Sin operaciones de cambio</p>
              <button onClick={openAddExchange}
                className="mt-4 px-5 py-2.5 text-sm font-bold rounded-2xl text-white"
                style={{ backgroundColor: business.color }}>
                + Registrar primera operación
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredExchanges.map(ex => {
                const isMine   = !ex.sent_by || ex.sent_by === userId
                const senderName   = isMine ? 'Yo' : displayName(partner)
                const receiverName = isMine ? displayName(partner) : 'Yo'
                const senderInit   = (senderName[0] ?? '?').toUpperCase()
                const receiverInit = (receiverName[0] ?? '?').toUpperCase()
                // Compute VES and USD amounts regardless of sent/received direction
                const vesAmt = ex.currency_sent === 'VES' ? Number(ex.amount_sent) : Number(ex.amount_received)
                const usdAmt = ex.currency_sent === 'USD' ? Number(ex.amount_sent) : Number(ex.amount_received)
                const rate = ex.exchange_rate ?? (vesAmt > 0 && usdAmt > 0 ? Math.round(vesAmt / usdAmt) : 0)
                const METHOD_LABEL: Record<string, string> = {
                  pago_movil: '📱 Pago Móvil', zelle: '🟢 Zelle',
                  efectivo: '💵 Efectivo', transferencia: '🏦 Transf.',
                }
                const methodLabel = ex.method ? (METHOD_LABEL[ex.method] ?? ex.method) : null
                return (
                  <div key={ex.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
                    {/* Top row: avatars + method badge */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {/* Sender avatar */}
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: isMine ? business.color : '#6b7280' }}>
                          {senderInit}
                        </div>
                        <span className="text-gray-300 text-xs">→</span>
                        {/* Receiver avatar */}
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: isMine ? '#6b7280' : business.color }}>
                          {receiverInit}
                        </div>
                        <span className="text-xs text-gray-500 ml-1 font-medium">
                          {senderName} → {receiverName}
                        </span>
                      </div>
                      {methodLabel && (
                        <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                          {methodLabel}
                        </span>
                      )}
                    </div>
                    {/* Amounts */}
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xl font-black text-gray-900">
                        {vesAmt.toLocaleString('es-VE')}
                        <span className="text-xs font-bold text-gray-400 ml-1">VES</span>
                      </span>
                      <span className="text-gray-300 text-sm">=</span>
                      <span className="text-xl font-black" style={{ color: business.color }}>
                        ${usdAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-bold ml-1 opacity-70">USD</span>
                      </span>
                    </div>
                    {/* Rate + notes + date */}
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-gray-400">
                        1 USD = {rate.toLocaleString()} VES
                        {ex.notes ? <span className="ml-2 text-gray-500 font-medium">{ex.notes}</span> : null}
                      </p>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-gray-300 mr-1">{fmtDate(ex.date)}</span>
                        <button onClick={() => openEditExchange(ex)} className="text-gray-300 p-1.5 active:text-blue-500">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDeleteExchange(ex)} className="text-gray-300 p-1.5 active:text-red-500">
                          <Trash2 size={12} />
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

      {/* ══════════════ SOCIOS ══════════════ */}
      {tab === 'socios' && (
        <div className="px-4 pb-6 space-y-5">

          {/* Capital */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Capital invertido</p>
              <button onClick={() => { setShowCapForm(true); setCapError('') }}
                className="flex items-center gap-1 text-[11px] font-bold text-orange-500">
                <Plus size={13} strokeWidth={2.5} /> Agregar aporte
              </button>
            </div>
            {totalCap > 0 ? (
              <div className="space-y-2 mb-3">
                {[
                  { label: 'Tu capital', amount: myCapTotal, pct: totalCap ? (myCapTotal / totalCap) * 100 : 0 },
                  ...(!isPending ? [{ label: displayName(partner), amount: partnerCapTotal, pct: totalCap ? (partnerCapTotal / totalCap) * 100 : 0 }] : []),
                ].map(row => (
                  <div key={row.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">{row.label}</span>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-gray-400">{row.pct.toFixed(0)}%</span>
                        <span className="font-bold text-sm text-gray-900">{fmt(row.amount)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-400 rounded-full" style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100 flex justify-between">
                  <span className="text-sm font-semibold text-gray-700">Total</span>
                  <span className="font-bold text-gray-900">{fmt(totalCap)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-3">Sin aportes de capital todavía</p>
            )}

            {/* Capital history */}
            {capital.length > 0 && (
              <div className="border-t border-gray-50 pt-3 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Historial</p>
                {capital.map(c => {
                  const isMine = c.contributed_by === userId
                  return (
                    <div key={c.id} className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isMine ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                        {isMine ? 'TÚ' : initials(partner)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{fmt(c.amount)}</p>
                        <p className="text-[10px] text-gray-400">{fmtDate(c.date)}{c.description ? ` · ${c.description}` : ''}</p>
                      </div>
                      {isMine && (
                        <button onClick={() => handleDeleteCapital(c)} className="text-gray-200 p-1">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Miembros */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Miembros</p>
            <div className="space-y-3">
              {/* Owner */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="text-orange-700 text-xs font-bold">
                    {isOwner ? 'TÚ' : initials(partner)}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {isOwner ? 'Tú' : displayName(partner)}
                    <span className="ml-1.5 text-[10px] bg-orange-50 text-orange-600 font-bold px-1.5 py-0.5 rounded-full">Dueño</span>
                  </p>
                  <p className="text-xs text-gray-400">{isOwner ? ownerShare : partnerProfitShare}% de ganancia</p>
                </div>
              </div>
              {/* Members */}
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                    <span className="text-blue-700 text-xs font-bold">
                      {m.user_id === userId ? 'TÚ' : initials(m.profile)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {m.user_id === userId ? 'Tú' : displayName(m.profile)}
                      <span className="ml-1.5 text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded-full">Socio</span>
                    </p>
                    <p className="text-xs text-gray-400">{m.profit_share}% de ganancia</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ganancia por persona */}
          {!isPending && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Ganancia acumulada</p>
              <div className="space-y-2">
                {[
                  { label: 'Tú', amount: myProfitShare, pct: isOwner ? ownerShare : memberProfitShare },
                  { label: displayName(partner), amount: partnerProfitAmt, pct: partnerProfitShare },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-600">{row.label}</span>
                      <span className="text-xs text-gray-400 ml-1.5">({row.pct}%)</span>
                    </div>
                    <span className={`font-bold text-sm ${row.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmt(row.amount)}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100 flex justify-between">
                  <span className="text-sm font-semibold text-gray-700">Ganancia neta total</span>
                  <span className={`font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(netProfit)}</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">* Solo incluye lo cobrado en ventas a crédito</p>
            </div>
          )}

          {/* Retiro rápido */}
          <button onClick={() => openAddTx('retiro')}
            className="w-full bg-purple-50 border border-purple-100 rounded-2xl px-4 py-3.5 text-left flex items-center gap-3 active:opacity-80">
            <Wallet size={20} className="text-purple-400" />
            <div>
              <p className="text-sm font-bold text-purple-700">Registrar retiro</p>
              <p className="text-xs text-gray-400">Cuando alguien saca dinero del negocio</p>
            </div>
            <Plus size={16} className="text-purple-400 ml-auto" />
          </button>

          {/* Link a Pedidos */}
          <a href={`/partners/${partnerId}/${businessId}/pedidos`}
            className="w-full bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3.5 text-left flex items-center gap-3 active:opacity-80">
            <Package size={20} className="text-orange-400" />
            <div>
              <p className="text-sm font-bold text-orange-700">Pedidos & Proveedores</p>
              <p className="text-xs text-gray-400">Órdenes de compra e importaciones</p>
            </div>
            <ChevronRight size={16} className="text-orange-400 ml-auto" />
          </a>

        </div>
      )}

      {/* ══════════════ MODAL: Transacción ══════════════ */}
      {showTxForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowTxForm(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{txEditId ? 'Editar' : 'Nueva'} {TX_LABEL[txType].toLowerCase()}</h2>
                <button onClick={() => setShowTxForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>

            <form id="tx-form" onSubmit={handleSaveTx} className="flex-1 overflow-y-auto px-5 pt-2 pb-4 space-y-4">
              {txError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{txError}</p>}

              {/* Type selector */}
              {!txEditId && (
                <div className="flex gap-1.5 flex-wrap">
                  {(['venta','compra','gasto','ingreso','retiro'] as const).map(type => (
                    <button key={type} type="button" onClick={() => {
                      setTxType(type)
                      setTxItems(type === 'venta' || type === 'compra'
                        ? [{ product_id: products[0]?.id ?? '', qty: '1', unit_price: '' }] : [])
                      setTxAmount('')
                      setTxPayType('contado')
                    }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                        txType === type ? `${TX_BG[type]} ${TX_COLORS[type]} border-current` : 'bg-gray-50 text-gray-400 border-transparent'
                      }`}>
                      {TX_LABEL[type]}
                    </button>
                  ))}
                </div>
              )}

              {/* Products (venta/compra) */}
              {(txType === 'venta' || txType === 'compra') && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Productos</label>
                  {products.length === 0 ? (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700 font-semibold text-center">
                      No hay productos en el inventario.<br />
                      <span className="font-normal text-orange-500">Agrega productos en la pestaña Inventario primero.</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {txItems.map((item, idx) => {
                        const prod = products.find(p => p.id === item.product_id)
                        const search = txItemSearches[idx] ?? ''
                        const filtered = products.filter(p =>
                          p.name.toLowerCase().includes(search.toLowerCase())
                        )
                        const isOpen = txDropdownOpen === idx
                        return (
                          <div key={idx} className="bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-2.5">
                            {/* Row 1: product search input */}
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Buscar producto..."
                                value={search}
                                onChange={e => {
                                  const val = e.target.value
                                  setTxItemSearches(prev => prev.map((s, i) => i === idx ? val : s))
                                  setTxDropdownOpen(idx)
                                  if (!val) setTxItems(prev => prev.map((it, i) => i === idx ? { ...it, product_id: '' } : it))
                                }}
                                onFocus={() => setTxDropdownOpen(idx)}
                                onBlur={() => setTimeout(() => setTxDropdownOpen(-1), 150)}
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-orange-400"
                              />
                              {txItems.length > 1 && (
                                <button type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    setTxItems(prev => prev.filter((_, i) => i !== idx))
                                    setTxItemSearches(prev => prev.filter((_, i) => i !== idx))
                                    setTxDropdownOpen(-1)
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-400 p-0.5">
                                  <X size={13} />
                                </button>
                              )}
                              {/* Autocomplete dropdown */}
                              {isOpen && filtered.length > 0 && (
                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                  {filtered.map(p => (
                                    <button key={p.id} type="button"
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => {
                                        const autoPrice = txType === 'venta' ? Number(p.sale_price) : Number(p.cost_price)
                                        setTxItems(prev => prev.map((it, i) => i === idx ? {
                                          ...it, product_id: p.id,
                                          unit_price: autoPrice > 0 ? String(autoPrice) : it.unit_price,
                                        } : it))
                                        setTxItemSearches(prev => prev.map((s, i) => i === idx ? p.name : s))
                                        setTxDropdownOpen(-1)
                                      }}
                                      className="w-full text-left px-3 py-2.5 hover:bg-orange-50 border-b border-gray-50 last:border-0 transition-colors">
                                      <div className="text-sm font-semibold text-gray-800">{p.name}</div>
                                      <div className="flex gap-3 text-[10px] text-gray-400 mt-0.5">
                                        <span>{txType === 'venta' ? 'Precio' : 'Costo'}: {txType === 'venta'
                                          ? (p.sale_price > 0 ? fmt(p.sale_price) : '—')
                                          : (p.cost_price > 0 ? fmt(p.cost_price) : '—')}</span>
                                        <span className={`${Number(p.stock) <= Number(p.min_stock) && p.min_stock > 0 ? 'text-red-400 font-semibold' : ''}`}>
                                          Stock: {p.stock} {p.unit}{Number(p.stock) <= Number(p.min_stock) && p.min_stock > 0 ? ' ⚠' : ''}
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Row 2: Cantidad + Precio */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Cantidad</label>
                                <input type="number" placeholder="1" min="0.01" step="any" value={item.qty}
                                  onChange={e => setTxItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))}
                                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400" />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">
                                  {txType === 'venta' ? 'Precio venta' : 'Precio costo'}
                                </label>
                                <input type="number" placeholder="0.00" min="0" step="any" value={item.unit_price}
                                  onChange={e => setTxItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: e.target.value } : it))}
                                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400" />
                              </div>
                            </div>
                            {/* Hints: show ref prices from catalog */}
                            {prod && (
                              <div className="flex gap-3 text-[10px] px-0.5">
                                <span className={prod.cost_price === 0 ? 'text-orange-400' : 'text-gray-400'}>
                                  Costo: {prod.cost_price === 0 ? '—' : fmt(prod.cost_price)}
                                </span>
                                <span className={prod.sale_price === 0 ? 'text-orange-400' : 'text-gray-400'}>
                                  Precio: {prod.sale_price === 0 ? '—' : fmt(prod.sale_price)}
                                </span>
                                <span className={`${Number(prod.stock) <= Number(prod.min_stock) && prod.min_stock > 0 ? 'text-red-400 font-semibold' : 'text-gray-400'}`}>
                                  Stock: {prod.stock} {prod.unit}{Number(prod.stock) <= Number(prod.min_stock) && prod.min_stock > 0 ? ' ⚠' : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <button type="button" onClick={() => {
                        setTxItems(prev => [...prev, { product_id: '', qty: '1', unit_price: '' }])
                        setTxItemSearches(prev => [...prev, ''])
                        setTxDropdownOpen(txItems.length)
                      }}
                        className="text-xs text-orange-500 font-semibold flex items-center gap-1">
                        <Plus size={13} /> Agregar producto
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Amount (non-product types) */}
              {txType !== 'venta' && txType !== 'compra' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Monto</label>
                  <input type="number" required min="0.01" step="any" placeholder="0.00" value={txAmount}
                    onChange={e => setTxAmount(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white" />
                </div>
              )}

              {/* Credit options (venta only) */}
              {txType === 'venta' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Pago</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {([['contado', '💵 Contado', 'Pagó completo'], ['credito', '🕐 Crédito', 'Pago parcial']] as const).map(([v, label, sub]) => (
                      <button key={v} type="button" onClick={() => setTxPayType(v)}
                        className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 text-left transition-all ${
                          txPayType === v ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        <div>{label}</div>
                        <div className="text-[10px] font-normal text-gray-400">{sub}</div>
                      </button>
                    ))}
                  </div>
                  {txPayType === 'credito' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                          Monto inicial recibido
                        </label>
                        <input type="number" min="0" step="any" placeholder="0.00 (puede ser 0)" value={txAmtPaid}
                          onChange={e => setTxAmtPaid(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                          Nombre del cliente
                        </label>
                        <input type="text" placeholder="Ej: Pedro Martínez" value={txClient}
                          onChange={e => setTxClient(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input type="text" placeholder="Ej: Tractor John Deere" value={txDesc}
                  onChange={e => setTxDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              {/* Date + Notes */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                  <input type="date" required value={txDate} onChange={e => setTxDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Notas</label>
                  <input type="text" placeholder="Opcional" value={txNotes} onChange={e => setTxNotes(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>

              {/* Receipt */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Recibo (opcional)</label>
                {txExistRec && !txFile && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">Recibo actual guardado</span>
                    <button type="button" onClick={() => setViewReceipt(txExistRec)} className="text-xs text-blue-500 font-semibold">Ver</button>
                    <button type="button" onClick={() => setTxExistRec(null)} className="text-xs text-red-400 font-semibold">Quitar</button>
                  </div>
                )}
                {txPreview ? (
                  <div className="relative">
                    <img src={txPreview} alt="preview" className="w-full h-32 object-cover rounded-2xl" />
                    <button type="button" onClick={() => { setTxFile(null); setTxPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="flex-1 border-2 border-dashed border-gray-200 rounded-2xl py-3 flex items-center justify-center gap-2 text-sm text-gray-400">
                      <ImageIcon size={16} /> Galería
                    </button>
                    <button type="button" onClick={() => { if (fileInputRef.current) { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click() } }}
                      className="flex-1 border-2 border-dashed border-gray-200 rounded-2xl py-3 flex items-center justify-center gap-2 text-sm text-gray-400">
                      <Camera size={16} /> Cámara
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
            </form>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowTxForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm flex-shrink-0">Cancelar</button>
              <button form="tx-form" type="submit" disabled={txSaving}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm">
                {txSaving ? 'Guardando…' : txEditId ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL: Pagos de crédito ══════════════ */}
      {payTx && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setPayTx(null)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl" style={{ maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Pagos recibidos</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {payTx.description || 'Venta'} {payTx.client_name ? `· ${payTx.client_name}` : ''}
                  </p>
                </div>
                <button onClick={() => setPayTx(null)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
              {/* Progress */}
              <div className="mt-3 bg-gray-50 rounded-2xl px-4 py-3">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Cobrado: <span className="font-bold text-emerald-600">{fmt(Number(payTx.amount_paid ?? 0))}</span></span>
                  <span className="text-gray-600">Total: <span className="font-bold">{fmt(Number(payTx.total))}</span></span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (Number(payTx.amount_paid ?? 0) / Number(payTx.total)) * 100)}%` }} />
                </div>
                <p className="text-xs text-amber-600 font-semibold mt-1.5">
                  Por cobrar: {fmt(Number(payTx.total) - Number(payTx.amount_paid ?? 0))}
                </p>
              </div>
            </div>

            <div className="overflow-y-auto px-5 pb-3" style={{ maxHeight: '30vh' }}>
              {payments.length === 0
                ? <p className="text-sm text-gray-400 py-4 text-center">Sin pagos registrados</p>
                : payments.map(p => (
                  <div key={p.id} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{fmt(p.amount)}</p>
                      <p className="text-xs text-gray-400">{fmtDate(p.date)}{p.notes ? ` · ${p.notes}` : ''}</p>
                    </div>
                    <span className="text-emerald-600 font-bold text-sm">+{fmt(p.amount)}</span>
                  </div>
                ))
              }
            </div>

            {Number(payTx.amount_paid ?? 0) < Number(payTx.total) - 0.01 && (
              showPayForm ? (
                <form onSubmit={handleAddPayment} className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  {payError && <p className="text-red-600 text-sm">{payError}</p>}
                  <div className="flex gap-2">
                    <input type="number" required min="0.01" step="any" placeholder="Monto" value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    <input type="date" required value={payDate} onChange={e => setPayDate(e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <input type="text" placeholder="Notas (opcional)" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <div className="flex gap-2" style={{ paddingBottom: 'max(0rem, env(safe-area-inset-bottom))' }}>
                    <button type="button" onClick={() => setShowPayForm(false)}
                      className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-3.5 rounded-2xl text-sm flex-shrink-0">Cancelar</button>
                    <button type="submit" disabled={paySaving}
                      className="flex-1 bg-emerald-500 text-white font-bold py-3.5 rounded-2xl text-sm">
                      {paySaving ? 'Guardando…' : 'Registrar pago'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="px-5 py-3 border-t border-gray-100"
                  style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                  <button onClick={() => setShowPayForm(true)}
                    className="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl text-sm">
                    + Registrar nuevo pago
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ══════════════ MODAL: Producto ══════════════ */}
      {showProdForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowProdForm(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">{pEditId ? 'Editar' : 'Nuevo'} producto</h2>
                <button onClick={() => setShowProdForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>
            <form id="prod-form" onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto px-5 pt-2 pb-4 space-y-4">
              {pError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{pError}</p>}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Nombre</label>
                <input required value={pName} onChange={e => setPName(e.target.value)} placeholder="Ej: Tractor John Deere"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Costo</label>
                  <input type="number" min="0" step="any" value={pCost} onChange={e => setPCost(e.target.value)} placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Precio venta</label>
                  <input type="number" min="0" step="any" value={pSale} onChange={e => setPSale(e.target.value)} placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Stock actual</label>
                  <input type="number" min="0" step="any" value={pStock} onChange={e => setPStock(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Stock mínimo</label>
                  <input type="number" min="0" step="any" value={pMin} onChange={e => setPMin(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
            </form>
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowProdForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm flex-shrink-0">Cancelar</button>
              <button form="prod-form" type="submit" disabled={pSaving}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm">
                {pSaving ? 'Guardando…' : pEditId ? 'Actualizar' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL: Capital ══════════════ */}
      {showCapForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCapForm(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">Agregar aporte de capital</h2>
                <button onClick={() => setShowCapForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>
            <form id="cap-form" onSubmit={handleAddCapital} className="px-5 pt-2 pb-4 space-y-4">
              {capError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{capError}</p>}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Monto (USD)</label>
                <input type="number" required min="0.01" step="any" placeholder="0.00" value={capAmount}
                  onChange={e => setCapAmount(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input type="text" placeholder="Ej: Capital inicial" value={capDesc} onChange={e => setCapDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                <input type="date" required value={capDate} onChange={e => setCapDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </form>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowCapForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm flex-shrink-0">Cancelar</button>
              <button form="cap-form" type="submit" disabled={capSaving}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm">
                {capSaving ? 'Guardando…' : 'Registrar aporte'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL: Operación de cambio ══════════════ */}
      {showExForm && business.type === 'cambio' && (() => {
        const myName      = 'Yo'
        const partnerName = displayName(partner)
        const vesNum = parseFloat(exVesAmt) || 0
        const usdNum = parseFloat(exUsdAmt) || 0
        const impliedRate = usdNum > 0 ? Math.round(vesNum / usdNum) : 0
        const METHODS = [
          { key: 'pago_movil',    label: 'Pago Móvil',  emoji: '📱' },
          { key: 'zelle',         label: 'Zelle',        emoji: '🟢' },
          { key: 'efectivo',      label: 'Efectivo',     emoji: '💵' },
          { key: 'transferencia', label: 'Transferencia',emoji: '🏦' },
        ]
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowExForm(false)}>
            <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex-shrink-0 px-5 pt-3 pb-2">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">
                    {exEditId ? 'Editar' : 'Nueva'} operación
                  </h2>
                  <button onClick={() => setShowExForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
                </div>
              </div>

              <form id="ex-form" onSubmit={handleSaveExchange} className="flex-1 overflow-y-auto px-5 pt-2 pb-4 space-y-5">
                {exError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{exError}</p>}

                {/* ── ¿Quién envía? ── */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">¿Quién envía?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'me',      name: myName,      sub: 'Tú' },
                      { key: 'partner', name: partnerName, sub: 'Socio' },
                    ].map(opt => (
                      <button key={opt.key} type="button" onClick={() => setExSentBy(opt.key as 'me' | 'partner')}
                        className={`flex items-center gap-2.5 px-3 py-3 rounded-2xl border-2 transition-all ${
                          exSentBy === opt.key
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
                          exSentBy === opt.key ? '' : 'opacity-50'
                        }`} style={{ backgroundColor: business.color }}>
                          {(opt.name[0] ?? '?').toUpperCase()}
                        </div>
                        <div className="text-left min-w-0">
                          <p className={`text-sm font-bold truncate ${exSentBy === opt.key ? 'text-orange-700' : 'text-gray-500'}`}>
                            {opt.name}
                          </p>
                          <p className="text-[10px] text-gray-400">{opt.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Montos VES / USD ── */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Montos del cambio</label>
                  <div className="space-y-2">
                    {/* VES */}
                    <div className={`flex items-center gap-2 bg-gray-50 border-2 rounded-2xl px-4 py-3 transition-all ${
                      exSenderCurr === 'VES' ? 'border-orange-400' : 'border-gray-200'
                    }`}>
                      <button type="button" onClick={() => setExSenderCurr('VES')}
                        className={`text-xs font-black w-14 py-1 rounded-xl flex-shrink-0 ${
                          exSenderCurr === 'VES' ? 'text-white' : 'bg-gray-200 text-gray-500'
                        }`} style={exSenderCurr === 'VES' ? { backgroundColor: business.color } : {}}>
                        VES
                      </button>
                      <input
                        type="number" required min="0.01" step="any" placeholder="0"
                        value={exVesAmt} onChange={e => setExVesAmt(e.target.value)}
                        className="flex-1 bg-transparent text-right text-[17px] font-bold text-gray-900 focus:outline-none"
                      />
                      {exSenderCurr === 'VES' && (
                        <span className="text-[10px] text-orange-500 font-bold flex-shrink-0">ENVÍA</span>
                      )}
                    </div>
                    {/* Rate display */}
                    <div className="flex items-center justify-center gap-2 py-0.5">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-[11px] text-gray-400 font-medium">
                        {impliedRate > 0 ? `1 USD = ${impliedRate.toLocaleString()} VES` : '⇅ tasa de cambio'}
                      </span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                    {/* USD */}
                    <div className={`flex items-center gap-2 bg-gray-50 border-2 rounded-2xl px-4 py-3 transition-all ${
                      exSenderCurr === 'USD' ? 'border-orange-400' : 'border-gray-200'
                    }`}>
                      <button type="button" onClick={() => setExSenderCurr('USD')}
                        className={`text-xs font-black w-14 py-1 rounded-xl flex-shrink-0 ${
                          exSenderCurr === 'USD' ? 'text-white' : 'bg-gray-200 text-gray-500'
                        }`} style={exSenderCurr === 'USD' ? { backgroundColor: business.color } : {}}>
                        USD
                      </button>
                      <input
                        type="number" required min="0.01" step="any" placeholder="0.00"
                        value={exUsdAmt} onChange={e => setExUsdAmt(e.target.value)}
                        className="flex-1 bg-transparent text-right text-[17px] font-bold text-gray-900 focus:outline-none"
                      />
                      {exSenderCurr === 'USD' && (
                        <span className="text-[10px] text-orange-500 font-bold flex-shrink-0">ENVÍA</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 ml-1">
                    Toca <span className="font-bold">VES</span> o <span className="font-bold">USD</span> para indicar qué moneda envía {exSentBy === 'me' ? myName : partnerName}
                  </p>
                </div>

                {/* ── Método ── */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Método de pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    {METHODS.map(m => (
                      <button key={m.key} type="button" onClick={() => setExMethod(m.key)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border-2 transition-all ${
                          exMethod === m.key ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-gray-50'
                        }`}>
                        <span className="text-lg">{m.emoji}</span>
                        <span className={`text-sm font-bold ${exMethod === m.key ? 'text-orange-700' : 'text-gray-500'}`}>
                          {m.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Referencia + Fecha ── */}
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                      Referencia / Confirmación
                      <span className="font-normal normal-case ml-1">(N° de operación, opcional)</span>
                    </label>
                    <input type="text" placeholder="Ej: PM12345678 / ZELLE-9ABC"
                      value={exRef} onChange={e => setExRef(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                      <input type="date" required value={exDate} onChange={e => setExDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Notas</label>
                      <input type="text" placeholder="Opcional" value={exNotes} onChange={e => setExNotes(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                  </div>
                </div>
              </form>

              <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-2"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <button type="button" onClick={() => setShowExForm(false)}
                  className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm flex-shrink-0">
                  Cancelar
                </button>
                <button form="ex-form" type="submit" disabled={exSaving}
                  className="flex-1 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm disabled:opacity-60"
                  style={{ backgroundColor: business.color }}>
                  {exSaving ? 'Guardando…' : exEditId ? 'Actualizar' : 'Registrar operación'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══════════════ MODAL: Ver recibo ══════════════ */}
      {viewReceipt && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setViewReceipt(null)}>
          <img src={viewReceipt} alt="recibo" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button onClick={() => setViewReceipt(null)}
            className="absolute top-6 right-6 bg-white/20 text-white rounded-full p-2"><X size={20} /></button>
        </div>
      )}
    </div>
  )
}
