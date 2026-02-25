'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Search, Camera, Trash2, Pencil, Receipt,
  TrendingUp, TrendingDown, ChevronDown, Image as ImageIcon,
} from 'lucide-react'

type Account = { id: string; name: string; color: string; type: string }

type Transaction = {
  id: string
  account_id: string
  type: 'ingreso' | 'gasto'
  amount: number
  category: string | null
  description: string
  date: string
  receipt_url: string | null
  notes: string | null
  created_at: string
  savings_accounts: { name: string; color: string; type: string } | null
}

type Category = { id: string; name: string; type: 'income' | 'expense' | 'both' }

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function monthStart() { return new Date().toISOString().slice(0, 7) }
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function TransactionsPage() {
  const supabase     = createClient()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userId,    setUserId]    = useState<string | null>(null)
  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [txs,       setTxs]       = useState<Transaction[]>([])
  const [cats,      setCats]      = useState<Category[]>([])
  const [loading,   setLoading]   = useState(true)

  // Filtros
  const [filterAccount, setFilterAccount] = useState<string>(searchParams.get('account') ?? '')
  const [filterMonth,   setFilterMonth]   = useState(monthStart())
  const [filterType,    setFilterType]    = useState<'' | 'ingreso' | 'gasto'>('')
  const [search,        setSearch]        = useState('')

  // Formulario
  const [showForm,    setShowForm]    = useState(false)
  const [editId,      setEditId]      = useState<string | null>(null)
  const [fAccount,    setFAccount]    = useState('')
  const [fType,       setFType]       = useState<'ingreso' | 'gasto'>('gasto')
  const [fAmount,     setFAmount]     = useState('')
  const [fCategory,   setFCategory]   = useState('')
  const [fDesc,       setFDesc]       = useState('')
  const [fDate,       setFDate]       = useState(todayStr())
  const [fNotes,      setFNotes]      = useState('')
  const [fReceiptFile, setFReceiptFile] = useState<File | null>(null)
  const [fReceiptPreview, setFReceiptPreview] = useState<string | null>(null)
  const [fExistingReceipt, setFExistingReceipt] = useState<string | null>(null)
  const [newCatInput, setNewCatInput] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  // Ver recibo
  const [viewReceipt, setViewReceipt] = useState<string | null>(null)
  const [loadingReceipt, setLoadingReceipt] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: accs }, { data: transactions }, { data: categories }] = await Promise.all([
      supabase.from('savings_accounts')
        .select('id, name, color, type')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true }),
      supabase.from('savings_transactions')
        .select('*, savings_accounts(name, color, type)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('savings_categories')
        .select('id, name, type')
        .order('name', { ascending: true }),
    ])

    setAccounts(accs ?? [])
    setTxs(transactions ?? [])
    setCats(categories ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Abrir formulario por query param
  useEffect(() => {
    if (searchParams.get('new') === '1') openAdd()
    const acc = searchParams.get('account')
    if (acc) setFilterAccount(acc)
  }, [searchParams]) // eslint-disable-line

  // Filtros aplicados
  const filtered = useMemo(() => txs.filter(t => {
    const accOk  = !filterAccount || t.account_id === filterAccount
    const monOk  = t.date.startsWith(filterMonth)
    const typOk  = !filterType   || t.type === filterType
    const srcOk  = !search       || t.description.toLowerCase().includes(search.toLowerCase())
    return accOk && monOk && typOk && srcOk
  }), [txs, filterAccount, filterMonth, filterType, search])

  const totalIngresos = useMemo(() => filtered.filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0), [filtered])
  const totalGastos   = useMemo(() => filtered.filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0), [filtered])

  // Categorías según tipo
  const filteredCats = useMemo(() =>
    cats.filter(c => c.type === 'both' || c.type === (fType === 'ingreso' ? 'income' : 'expense')),
    [cats, fType]
  )

  function openAdd() {
    setEditId(null)
    setFAccount(filterAccount || (accounts[0]?.id ?? ''))
    setFType('gasto'); setFAmount(''); setFCategory('')
    setFDesc(''); setFDate(todayStr()); setFNotes('')
    setFReceiptFile(null); setFReceiptPreview(null); setFExistingReceipt(null)
    setShowCatInput(false); setNewCatInput(''); setFormError('')
    setShowForm(true)
  }

  function openEdit(tx: Transaction) {
    setEditId(tx.id)
    setFAccount(tx.account_id); setFType(tx.type)
    setFAmount(String(tx.amount)); setFCategory(tx.category ?? '')
    setFDesc(tx.description); setFDate(tx.date); setFNotes(tx.notes ?? '')
    setFReceiptFile(null); setFReceiptPreview(null)
    setFExistingReceipt(tx.receipt_url)
    setShowCatInput(false); setNewCatInput(''); setFormError('')
    setShowForm(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFReceiptFile(file)
    const reader = new FileReader()
    reader.onload = ev => setFReceiptPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadReceipt(file: File, uid: string): Promise<string | null> {
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${uid}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('receipts').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (error) { console.error('Upload error:', error); return null }
    return path
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    const amt = parseFloat(fAmount)
    if (isNaN(amt) || amt <= 0) { setFormError('Ingresa un monto válido mayor a 0'); return }
    if (!fAccount) { setFormError('Selecciona una cuenta'); return }
    if (!fDesc.trim()) { setFormError('La descripción es requerida'); return }

    setSaving(true)
    let receiptPath = fExistingReceipt

    // Subir foto si hay una nueva
    if (fReceiptFile && userId) {
      const path = await uploadReceipt(fReceiptFile, userId)
      receiptPath = path
    }

    const payload = {
      account_id:  fAccount,
      type:        fType,
      amount:      amt,
      category:    fCategory || null,
      description: fDesc.trim(),
      date:        fDate,
      notes:       fNotes.trim() || null,
      receipt_url: receiptPath,
    }

    if (editId) {
      const { error } = await supabase.from('savings_transactions').update(payload).eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('savings_transactions')
        .insert({ ...payload, user_id: userId })
      if (error) { setFormError(error.message); setSaving(false); return }
    }

    setSaving(false); setShowForm(false)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Borrar este movimiento?')) return
    await supabase.from('savings_transactions').delete().eq('id', id)
    setTxs(prev => prev.filter(t => t.id !== id))
  }

  async function handleAddCat() {
    if (!newCatInput.trim() || !userId) return
    const { data } = await supabase.from('savings_categories')
      .insert({ user_id: userId, name: newCatInput.trim(), type: fType === 'ingreso' ? 'income' : 'expense', is_default: false })
      .select('id, name, type')
      .single()
    if (data) {
      setCats(prev => [...prev, data])
      setFCategory(data.name)
    }
    setNewCatInput(''); setShowCatInput(false)
  }

  async function openReceipt(path: string) {
    setLoadingReceipt(true)
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
    setViewReceipt(data?.signedUrl ?? null)
    setLoadingReceipt(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  return (
    <div className="max-w-lg mx-auto">

      {/* ── Encabezado ───────────────────────────────── */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Movimientos</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="text-emerald-600 font-semibold">+{fmt(totalIngresos)}</span>
            {' · '}
            <span className="text-red-500 font-semibold">-{fmt(totalGastos)}</span>
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} /> Agregar
        </button>
      </div>

      {/* ── Filtros ──────────────────────────────────── */}
      <div className="px-4 mb-4 space-y-2">
        {/* Búsqueda */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2} />
          <input
            type="text"
            placeholder="Buscar descripción…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>

        <div className="flex gap-2">
          {/* Mes */}
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {/* Tipo */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as '' | 'ingreso' | 'gasto')}
            className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="gasto">Gastos</option>
          </select>
        </div>

        {/* Cuenta */}
        <select
          value={filterAccount}
          onChange={e => setFilterAccount(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <option value="">Todas las cuentas</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* ── Lista de movimientos ─────────────────────── */}
      <div className="px-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Receipt size={40} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
            <p className="text-sm">
              {txs.length === 0 ? 'Sin movimientos aún. ¡Agrega el primero!' : 'Sin resultados con esos filtros.'}
            </p>
          </div>
        ) : (
          filtered.map(tx => {
            const isIngreso = tx.type === 'ingreso'
            const acc       = tx.savings_accounts
            return (
              <div key={tx.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-4 py-3.5 flex items-start gap-3">
                  {/* Icono tipo */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isIngreso ? 'bg-emerald-50' : 'bg-red-50'
                  }`}>
                    {isIngreso
                      ? <TrendingUp  size={15} className="text-emerald-500" strokeWidth={2} />
                      : <TrendingDown size={15} className="text-red-400"    strokeWidth={2} />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 leading-tight truncate">{tx.description}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {fmtDate(tx.date)}
                      {tx.category && <> · {tx.category}</>}
                    </p>
                    {acc && (
                      <p className="text-[11px] mt-0.5 flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="text-gray-400">{acc.name}</span>
                      </p>
                    )}
                    {tx.notes && (
                      <p className="text-[11px] text-blue-500 italic mt-0.5 truncate">"{tx.notes}"</p>
                    )}
                    {/* Ver recibo */}
                    {tx.receipt_url && (
                      <button
                        onClick={() => openReceipt(tx.receipt_url!)}
                        disabled={loadingReceipt}
                        className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-600 font-semibold active:opacity-60"
                      >
                        <Camera size={11} strokeWidth={2} />
                        {loadingReceipt ? 'Abriendo…' : 'Ver recibo'}
                      </button>
                    )}
                  </div>

                  {/* Monto + acciones */}
                  <div className="flex-shrink-0 text-right ml-1">
                    <p className={`font-bold text-lg ${isIngreso ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isIngreso ? '+' : '-'}{fmt(Number(tx.amount))}
                    </p>
                    <div className="flex gap-3 mt-1 justify-end">
                      <button onClick={() => openEdit(tx)} className="text-gray-400 active:text-blue-600">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(tx.id)} className="text-gray-400 active:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Modal: ver recibo ────────────────────────── */}
      {viewReceipt && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setViewReceipt(null)}
        >
          <div className="relative max-w-sm w-full">
            <button
              onClick={() => setViewReceipt(null)}
              className="absolute -top-10 right-0 text-white/70 active:text-white"
            >
              <X size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewReceipt}
              alt="Recibo"
              className="w-full rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* ── Bottom sheet: formulario ─────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle + título */}
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editId ? 'Editar movimiento' : 'Nuevo movimiento'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 active:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Cuerpo scrollable */}
            <form id="tx-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 space-y-5 pt-1 pb-4">
              {formError && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>
              )}

              {/* Tipo de movimiento */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setFType('gasto'); setFCategory('') }}
                    className={`py-3.5 rounded-2xl font-bold text-sm border-2 transition-all active:scale-95 ${
                      fType === 'gasto'
                        ? 'border-red-400 bg-red-500 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    📤 Gasto
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFType('ingreso'); setFCategory('') }}
                    className={`py-3.5 rounded-2xl font-bold text-sm border-2 transition-all active:scale-95 ${
                      fType === 'ingreso'
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    📥 Ingreso
                  </button>
                </div>
              </div>

              {/* Cuenta */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Cuenta</label>
                {accounts.length === 0 ? (
                  <p className="text-sm text-red-500">No tienes cuentas. Crea una primero.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {accounts.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setFAccount(a.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all active:scale-95 ${
                          fAccount === a.id
                            ? 'text-white border-transparent'
                            : 'border-gray-200 text-gray-600'
                        }`}
                        style={fAccount === a.id ? { backgroundColor: a.color, borderColor: a.color } : {}}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: fAccount === a.id ? 'white' : a.color }}
                        />
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Monto + Fecha */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg pointer-events-none">$</span>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={fAmount}
                      onChange={e => setFAmount(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-8 pr-3 py-3.5 text-[17px] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                  <input
                    type="date"
                    required
                    value={fDate}
                    onChange={e => setFDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Descripción</label>
                <input
                  type="text"
                  required
                  placeholder={fType === 'ingreso' ? 'Ej: Pago de nómina' : 'Ej: Supermercado'}
                  value={fDesc}
                  onChange={e => setFDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Categoría{' '}
                  {fCategory && (
                    <span className={`font-bold normal-case capitalize text-xs ${
                      fType === 'ingreso' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      — {fCategory}
                    </span>
                  )}
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {filteredCats.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFCategory(c.name === fCategory ? '' : c.name)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all active:scale-95 ${
                        fCategory === c.name
                          ? fType === 'ingreso'
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-red-500 text-white border-red-500'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}

                  {/* Agregar categoría personalizada */}
                  {showCatInput ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Nueva categoría"
                        value={newCatInput}
                        onChange={e => setNewCatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCat() } }}
                        className="border border-emerald-300 rounded-xl px-2.5 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400 w-32 bg-white"
                      />
                      <button type="button" onClick={handleAddCat}
                        className="bg-emerald-600 text-white rounded-xl px-2.5 py-1.5 text-[11px] font-semibold active:opacity-80">
                        OK
                      </button>
                      <button type="button" onClick={() => { setShowCatInput(false); setNewCatInput('') }}
                        className="text-gray-400 p-1"><X size={13} /></button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCatInput(true)}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border border-dashed border-emerald-300 text-emerald-600 bg-emerald-50 active:bg-emerald-100"
                    >
                      + Nueva
                    </button>
                  )}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Nota <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Detalle adicional…"
                  value={fNotes}
                  onChange={e => setFNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Foto de recibo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Recibo / Comprobante <span className="font-normal normal-case">(opcional)</span>
                </label>

                {/* Recibo existente */}
                {fExistingReceipt && !fReceiptFile && (
                  <div className="flex items-center gap-2 mb-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <Camera size={14} className="text-emerald-500" strokeWidth={2} />
                    <span className="text-sm text-emerald-700 font-medium flex-1">Recibo guardado</span>
                    <button
                      type="button"
                      onClick={() => setFExistingReceipt(null)}
                      className="text-red-400 active:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Preview nueva foto */}
                {fReceiptPreview && (
                  <div className="relative mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fReceiptPreview}
                      alt="Vista previa"
                      className="w-full max-h-40 object-cover rounded-xl border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => { setFReceiptFile(null); setFReceiptPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center active:bg-red-600"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>
                  </div>
                )}

                {/* Botón elegir foto */}
                {!fReceiptPreview && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-2xl py-3.5 text-sm text-gray-500 font-medium active:bg-gray-50"
                    >
                      <ImageIcon size={16} className="text-gray-400" strokeWidth={1.8} />
                      Galería
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.setAttribute('capture', 'environment')
                          fileInputRef.current.click()
                          setTimeout(() => fileInputRef.current?.removeAttribute('capture'), 500)
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-2xl py-3.5 text-sm text-gray-500 font-medium active:bg-gray-50"
                    >
                      <Camera size={16} className="text-gray-400" strokeWidth={1.8} />
                      Cámara
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </form>

            {/* Botones sticky */}
            <div
              className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0"
              >
                Cancelar
              </button>
              <button
                form="tx-form"
                type="submit"
                disabled={saving || accounts.length === 0}
                className="flex-1 bg-emerald-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90"
              >
                {saving ? 'Guardando…' : editId ? 'Actualizar' : `Guardar ${fType}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
