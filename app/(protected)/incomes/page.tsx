'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Pencil, Trash2, TrendingUp, Search, Camera, ImageIcon, Eye,
} from 'lucide-react'

// ── Categorías de ingresos ─────────────────────────────────────────────────
const INCOME_CATEGORIES = [
  { value: 'Sale',        label: 'Venta',               emoji: '🚗' },
  { value: 'Salary',      label: 'Salario / Sueldo',    emoji: '💼' },
  { value: 'Bonus',       label: 'Bono / Extra',        emoji: '🎁' },
  { value: 'Refund',      label: 'Reembolso',           emoji: '↩️' },
  { value: 'Gift',        label: 'Regalo / Donación',   emoji: '🎀' },
  { value: 'Rent',        label: 'Alquiler cobrado',    emoji: '🏠' },
  { value: 'Freelance',   label: 'Freelance',           emoji: '💻' },
  { value: 'Investment',  label: 'Inversión',           emoji: '📈' },
  { value: 'Tax Refund',  label: 'Devolución impuestos', emoji: '🏛️' },
  { value: 'Other',       label: 'Otro ingreso',        emoji: '💰' },
]

function getCatLabel(val: string) {
  return INCOME_CATEGORIES.find(c => c.value === val)?.label ?? val
}
function getCatEmoji(val: string) {
  return INCOME_CATEGORIES.find(c => c.value === val)?.emoji ?? '💰'
}

type Income = {
  id: string
  title: string
  amount: number
  date: string
  category: string
  received_by: string
  note: string | null
  split_mode: string
  for_member: string | null
  created_at: string
  receipt_url: string | null
}
type Member = { user_id: string; display_name: string | null }

function todayStr() { return new Date().toISOString().split('T')[0] }
function monthStart() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().split('T')[0].slice(0, 7)
}
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export default function IncomesPage() {
  const supabase = createClient()
  const [userId,   setUserId]   = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [members,  setMembers]  = useState<Member[]>([])
  const [incomes,  setIncomes]  = useState<Income[]>([])
  const [loading,  setLoading]  = useState(true)
  const [noFamily, setNoFamily] = useState(false)

  const [search,      setSearch]      = useState('')
  const [filterMonth, setFilterMonth] = useState(monthStart())

  // Form
  const [showForm,   setShowForm]   = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [title,      setTitle]      = useState('')
  const [amount,     setAmount]     = useState('')
  const [date,       setDate]       = useState(todayStr())
  const [category,   setCategory]   = useState('Sale')
  const [receivedBy, setReceivedBy] = useState('')
  const [forMember,  setForMember]  = useState('')
  const [incomeNote, setIncomeNote] = useState('')
  const [split,      setSplit]      = useState<'50/50' | 'personal' | 'para_otro'>('50/50')
  const [formError,  setFormError]  = useState('')
  const [saving,     setSaving]     = useState(false)

  // Receipt state
  const receiptInputRef                         = useRef<HTMLInputElement>(null)
  const [receiptFile,          setReceiptFile]          = useState<File | null>(null)
  const [receiptPreview,       setReceiptPreview]       = useState<string | null>(null)
  const [receiptCurrentPath,   setReceiptCurrentPath]   = useState<string | null>(null)
  const [receiptCurrentPreview, setReceiptCurrentPreview] = useState<string | null>(null)
  const [viewingReceipt,       setViewingReceipt]       = useState<string | null>(null)

  const memberName = (uid: string) =>
    members.find(m => m.user_id === uid)?.display_name || uid.slice(0, 8)

  const loadIncomes = useCallback(async (fid: string) => {
    const { data } = await supabase
      .from('incomes').select('*').eq('family_id', fid)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
    setIncomes(data ?? [])
  }, [supabase])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase
        .from('profiles').select('family_id').eq('user_id', user.id).single()
      if (!profile?.family_id) { setNoFamily(true); setLoading(false); return }
      const fid = profile.family_id
      setFamilyId(fid)
      setReceivedBy(user.id)
      const { data: mems } = await supabase
        .from('profiles').select('user_id, display_name').eq('family_id', fid)
      setMembers(mems ?? [])
      await loadIncomes(fid)
      setLoading(false)
    })()
  }, [supabase, loadIncomes])

  // ── Receipt helpers ──────────────────────────────────────────────────────
  function triggerReceiptPick(mode: 'gallery' | 'camera') {
    const inp = receiptInputRef.current
    if (!inp) return
    if (mode === 'camera') inp.setAttribute('capture', 'environment')
    else                   inp.removeAttribute('capture')
    inp.click()
  }

  function handleReceiptChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    setReceiptFile(file)
    setReceiptPreview(URL.createObjectURL(file))
    ev.target.value = ''
  }

  function clearNewReceipt() {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview)
    setReceiptFile(null)
    setReceiptPreview(null)
  }

  async function handleViewReceipt(path: string) {
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
    if (data?.signedUrl) setViewingReceipt(data.signedUrl)
  }

  // ── Form open helpers ────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null)
    setTitle(''); setAmount(''); setDate(todayStr())
    setCategory('Sale'); setReceivedBy(userId ?? '')
    setForMember(''); setIncomeNote(''); setSplit('50/50')
    setFormError('')
    clearNewReceipt(); setReceiptCurrentPath(null); setReceiptCurrentPreview(null)
    setShowForm(true)
  }

  function openEdit(inc: Income) {
    setEditId(inc.id)
    setTitle(inc.title); setAmount(String(inc.amount)); setDate(inc.date)
    setCategory(inc.category); setReceivedBy(inc.received_by)
    setForMember(inc.for_member ?? ''); setIncomeNote(inc.note ?? '')
    setSplit((inc.split_mode as 'personal' | '50/50' | 'para_otro') ?? '50/50')
    setFormError('')
    clearNewReceipt()
    setReceiptCurrentPath(inc.receipt_url)
    setReceiptCurrentPreview(null)
    if (inc.receipt_url) {
      supabase.storage.from('receipts').createSignedUrl(inc.receipt_url, 3600)
        .then(({ data }) => setReceiptCurrentPreview(data?.signedUrl ?? null))
    }
    setShowForm(true)
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function saveIncome() {
    if (!title.trim()) { setFormError('Escribe una descripción'); return }
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { setFormError('Monto inválido'); return }
    if (!receivedBy) { setFormError('Selecciona quién lo recibió'); return }
    if (split === 'para_otro' && !forMember) { setFormError('Selecciona para quién es'); return }
    setSaving(true)

    // Upload receipt if any
    let receipt_url: string | null = receiptCurrentPath
    if (receiptFile && familyId) {
      const ext  = receiptFile.name.split('.').pop() ?? 'jpg'
      const path = `family/${familyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, receiptFile)
      if (!upErr) receipt_url = path
    }

    const payload = {
      family_id: familyId,
      title: title.trim(),
      amount: amt,
      date,
      category,
      received_by: receivedBy,
      note: incomeNote.trim() || null,
      split_mode: split,
      for_member: split === 'para_otro' ? forMember : null,
      receipt_url,
      updated_at: new Date().toISOString(),
    }
    if (editId) {
      await supabase.from('incomes').update(payload).eq('id', editId)
    } else {
      await supabase.from('incomes').insert(payload)
    }
    await loadIncomes(familyId!)
    clearNewReceipt()
    setShowForm(false)
    setSaving(false)
  }

  async function deleteIncome(id: string) {
    if (!confirm('¿Eliminar este ingreso?')) return
    await supabase.from('incomes').delete().eq('id', id)
    setIncomes(prev => prev.filter(i => i.id !== id))
  }

  // Filters
  const filtered = incomes.filter(i => {
    const matchMonth  = i.date.startsWith(filterMonth)
    const matchSearch = !search ||
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      getCatLabel(i.category).toLowerCase().includes(search.toLowerCase())
    return matchMonth && matchSearch
  })

  const totalMonth = filtered.reduce((s, i) => s + Number(i.amount), 0)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>
  if (noFamily) return (
    <div className="p-6 text-center text-gray-500">
      No tienes familia. <a href="/family" className="text-blue-500 underline">Crear o unirse</a>
    </div>
  )

  return (
    <div className="px-4 pt-5 pb-28 max-w-lg mx-auto space-y-4">

      {/* ── Receipt lightbox ──────────────────────────────────── */}
      {viewingReceipt && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4"
          onClick={() => setViewingReceipt(null)}>
          <button
            className="absolute top-5 right-5 text-white/70 active:text-white bg-black/30 rounded-full p-2"
            onClick={() => setViewingReceipt(null)}>
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewingReceipt} alt="Recibo"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ingresos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Dinero que entra a la familia</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-500 text-white px-4 py-2 rounded-xl font-semibold text-sm shadow-sm active:opacity-80">
          <Plus size={15} strokeWidth={2.5} /> Agregar
        </button>
      </div>

      {/* Resumen del mes */}
      <section className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-md">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-1">Total ingresado</p>
        <p className="text-4xl font-black tracking-tight">${totalMonth.toFixed(2)}</p>
        <p className="text-xs opacity-60 mt-1">{filtered.length} ingreso{filtered.length !== 1 ? 's' : ''} este mes</p>
      </section>

      {/* Filtros */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        </div>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <TrendingUp size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Sin ingresos este mes.</p>
          <button onClick={openAdd} className="mt-3 text-emerald-500 text-sm font-semibold">
            + Registrar ingreso
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          {filtered.map(inc => {
            const splitLabel =
              inc.split_mode === 'personal' ? 'Solo para mí' :
              inc.split_mode === 'para_otro' ? `Para ${memberName(inc.for_member ?? '')}` :
              '50/50'
            return (
              <div key={inc.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-lg flex-shrink-0">
                    {getCatEmoji(inc.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{inc.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {fmtDate(inc.date)} · {getCatLabel(inc.category)} · {memberName(inc.received_by)}
                    </p>
                    <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      inc.split_mode === '50/50'     ? 'bg-blue-50 text-blue-600' :
                      inc.split_mode === 'personal'  ? 'bg-purple-50 text-purple-600' :
                      'bg-orange-50 text-orange-600'
                    }`}>
                      {splitLabel}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <p className="text-sm font-bold text-emerald-600">+${Number(inc.amount).toFixed(2)}</p>
                    <div className="flex gap-1.5">
                      {inc.receipt_url && (
                        <button onClick={() => handleViewReceipt(inc.receipt_url!)}
                          className="text-purple-400 active:text-purple-600 p-1">
                          <Eye size={13} />
                        </button>
                      )}
                      <button onClick={() => openEdit(inc)}
                        className="text-gray-300 hover:text-gray-500 p-1">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteIncome(inc.id)}
                        className="text-gray-300 hover:text-red-400 p-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
                {/* Receipt label */}
                {inc.receipt_url && (
                  <button onClick={() => handleViewReceipt(inc.receipt_url!)}
                    className="mt-1.5 ml-[52px] flex items-center gap-1 text-[11px] text-purple-500 active:text-purple-700">
                    <Eye size={11} />
                    Ver recibo
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal / Form ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl flex flex-col"
            style={{ maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}>

            {/* Handle + title */}
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editId ? 'Editar ingreso' : 'Nuevo ingreso'}
                </h2>
                <button onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-gray-600 p-1">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4 pt-1">

              {/* Descripción */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Descripción</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Ej: Venta del carro"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              {/* Monto + Fecha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Monto ($)</label>
                  <input type="number" inputMode="decimal" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">Categoría</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {INCOME_CATEGORIES.map(cat => (
                    <button key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-semibold transition-all ${
                        category === cat.value
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-gray-50 text-gray-600 border-gray-100 active:bg-gray-100'
                      }`}>
                      <span className="text-lg leading-none">{cat.emoji}</span>
                      <span className="leading-tight text-center">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quién lo recibió */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">¿Quién lo recibió?</label>
                <div className="flex gap-2">
                  {members.map(m => (
                    <button key={m.user_id}
                      onClick={() => setReceivedBy(m.user_id)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        receivedBy === m.user_id
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-gray-50 text-gray-600 border-gray-100'
                      }`}>
                      {m.display_name ?? 'Miembro'}
                      {m.user_id === userId && <span className="text-[10px] ml-1 opacity-70">(yo)</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split mode */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">¿Cómo se divide?</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { val: '50/50',     label: '50/50',       desc: 'Para todos por igual', color: 'blue'   },
                    { val: 'personal',  label: 'Solo para mí', desc: 'Solo el receptor',    color: 'purple' },
                    { val: 'para_otro', label: 'Para el otro', desc: 'Lo recibí por ti',   color: 'orange' },
                  ] as const).map(({ val, label, desc, color }) => {
                    const otherName = members.find(m => m.user_id !== receivedBy)?.display_name ?? 'el otro'
                    const resolvedDesc =
                      val === 'para_otro' ? `Lo recibí, es de ${otherName}` :
                      val === 'personal'  ? 'Solo mío, no afecta deudas' :
                      desc
                    return (
                      <button key={val} onClick={() => setSplit(val)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all ${
                          split === val
                            ? color === 'blue'   ? 'bg-blue-500 text-white border-blue-500' :
                              color === 'purple' ? 'bg-purple-500 text-white border-purple-500' :
                              'bg-orange-500 text-white border-orange-500'
                            : 'bg-gray-50 text-gray-600 border-gray-100'
                        }`}>
                        <span className="text-xs font-bold">{label}</span>
                        <span className={`text-[10px] leading-tight ${split === val ? 'opacity-75' : 'text-gray-400'}`}>{resolvedDesc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Para quién (solo si es para_otro) */}
              {split === 'para_otro' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    ¿Para quién es el ingreso?
                  </label>
                  <div className="flex gap-2">
                    {members.filter(m => m.user_id !== receivedBy).map(m => (
                      <button key={m.user_id}
                        onClick={() => setForMember(m.user_id)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                          forMember === m.user_id
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-gray-50 text-gray-600 border-gray-100'
                        }`}>
                        {m.display_name ?? 'Miembro'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Nota */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nota (opcional)</label>
                <textarea value={incomeNote} onChange={e => setIncomeNote(e.target.value)}
                  rows={2} placeholder="Detalles adicionales…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              {/* Recibo */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">
                  Recibo <span className="font-normal text-gray-400">(opcional)</span>
                </label>

                {/* Existing receipt preview (edit mode) */}
                {editId && receiptCurrentPreview && !receiptPreview && (
                  <div className="mb-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptCurrentPreview} alt="Recibo actual"
                      className="w-14 h-14 rounded-xl object-cover border border-gray-200 cursor-pointer"
                      onClick={() => setViewingReceipt(receiptCurrentPreview)}
                    />
                    <p className="text-[11px] text-gray-400 leading-snug">
                      Recibo actual.<br />Sube otro para reemplazar.
                    </p>
                  </div>
                )}

                {/* New receipt preview */}
                {receiptPreview && (
                  <div className="mb-2 relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptPreview} alt="Recibo"
                      className="w-14 h-14 rounded-xl object-cover border border-gray-200"
                    />
                    <button type="button" onClick={clearNewReceipt}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow">
                      <X size={10} strokeWidth={3} />
                    </button>
                  </div>
                )}

                {/* Galería / Cámara */}
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => triggerReceiptPick('gallery')}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 bg-gray-50 rounded-2xl py-3 text-sm text-gray-600 font-medium active:bg-gray-100">
                    <ImageIcon size={15} strokeWidth={2} className="text-gray-400" />
                    Galería
                  </button>
                  <button type="button"
                    onClick={() => triggerReceiptPick('camera')}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 bg-gray-50 rounded-2xl py-3 text-sm text-gray-600 font-medium active:bg-gray-100">
                    <Camera size={15} strokeWidth={2} className="text-gray-400" />
                    Cámara
                  </button>
                </div>

                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReceiptChange}
                />
              </div>

              {formError && (
                <p className="text-red-500 text-xs font-semibold">{formError}</p>
              )}
            </div>

            {/* Sticky footer */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0">
                Cancelar
              </button>
              <button onClick={saveIncome} disabled={saving}
                className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-bold text-[15px] shadow-sm disabled:opacity-60 active:opacity-80">
                {saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Registrar ingreso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
