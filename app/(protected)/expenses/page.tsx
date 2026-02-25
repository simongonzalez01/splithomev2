'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CATEGORIES, CATEGORY_GROUPS, GROUP_COLORS, DEFAULT_CATEGORY,
  getCategoryLabel, getCustomCategories, addCustomCategory, removeCustomCategory,
  type Category,
} from '@/lib/categories'
import { Search, Plus, X, MessageSquare, Receipt, Pencil, Trash2, Download, Camera, ImageIcon, Eye } from 'lucide-react'

type Expense = {
  id: string; title: string; amount: number; date: string
  category: string; paid_by: string; note: string | null; created_at: string
  split_mode: string | null; receipt_url: string | null
}
type Note   = { id: string; expense_id: string; user_id: string; content: string; created_at: string }
type Member = { user_id: string; display_name: string | null }

function todayStr() { return new Date().toISOString().split('T')[0] }
function monthStart() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().split('T')[0].slice(0, 7)
}
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
}

function exportToCSV(expenses: Expense[], members: Member[], month: string) {
  const name = (uid: string) => members.find(m => m.user_id === uid)?.display_name ?? uid.slice(0, 8)
  const headers = ['Fecha', 'Descripción', 'Monto', 'Categoría', 'Pagó']
  const rows = expenses.map(e => [
    e.date, e.title, Number(e.amount).toFixed(2), getCategoryLabel(e.category), name(e.paid_by),
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `gastos_${month}.csv`; a.click()
  URL.revokeObjectURL(url)
}

const CUSTOM_COLORS = {
  tile:     'bg-violet-50 text-violet-700 border-violet-100',
  selected: 'bg-violet-600 text-white border-violet-600',
}

export default function ExpensesPage() {
  const supabase = createClient()
  const [userId,   setUserId]   = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [members,  setMembers]  = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [notes,    setNotes]    = useState<Record<string, Note[]>>({})
  const [loading,  setLoading]  = useState(true)
  const [noFamily, setNoFamily] = useState(false)

  // Filters
  const [search,      setSearch]      = useState('')
  const [filterMonth, setFilterMonth] = useState(monthStart())
  const [filterCat,   setFilterCat]   = useState('')

  // Form state
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [title,     setTitle]     = useState('')
  const [amount,    setAmount]    = useState('')
  const [date,      setDate]      = useState(todayStr())
  const [category,  setCategory]  = useState(DEFAULT_CATEGORY)
  const [paidBy,    setPaidBy]    = useState('')
  const [expNote,   setExpNote]   = useState('')
  const [formError, setFormError] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [split,     setSplit]     = useState<'50/50' | 'personal' | 'para_otro'>('50/50')

  // Receipt state
  const receiptInputRef                   = useRef<HTMLInputElement>(null)
  const [receiptFile,    setReceiptFile]    = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null) // local blob URL
  const [receiptCurrentPath, setReceiptCurrentPath] = useState<string | null>(null) // path from DB
  const [receiptCurrentPreview, setReceiptCurrentPreview] = useState<string | null>(null) // signed URL for existing
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null)

  // Custom categories
  const [customCats,    setCustomCats]    = useState<Category[]>([])
  const [showCatInput,  setShowCatInput]  = useState(false)
  const [newCatLabel,   setNewCatLabel]   = useState('')

  // Note panel
  const [openNotes,  setOpenNotes]  = useState<string | null>(null)
  const [noteText,   setNoteText]   = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const memberName = (uid: string) =>
    members.find(m => m.user_id === uid)?.display_name || uid.slice(0, 8)

  const loadExpenses = useCallback(async (fid: string) => {
    const { data } = await supabase
      .from('expenses').select('*').eq('family_id', fid)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
    setExpenses(data ?? [])
  }, [supabase])

  const loadNotes = useCallback(async (expenseId: string) => {
    const { data } = await supabase
      .from('expense_notes').select('*').eq('expense_id', expenseId)
      .order('created_at', { ascending: true })
    setNotes(prev => ({ ...prev, [expenseId]: data ?? [] }))
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id); setPaidBy(user.id)
      const { data: profile } = await supabase.from('profiles').select('family_id').eq('user_id', user.id).single()
      if (!profile?.family_id) { setNoFamily(true); setLoading(false); return }
      setFamilyId(profile.family_id)
      const { data: mems } = await supabase.from('profiles').select('user_id, display_name').eq('family_id', profile.family_id)
      setMembers(mems ?? [])
      await loadExpenses(profile.family_id)
      setLoading(false)
    }
    init()
    setCustomCats(getCustomCategories())
  }, [supabase, loadExpenses])

  const filtered = useMemo(() => expenses.filter(e => {
    const mOk = e.date.startsWith(filterMonth)
    const sOk = !search || e.title.toLowerCase().includes(search.toLowerCase())
    const cOk = !filterCat || e.category === filterCat
    return mOk && sOk && cOk
  }), [expenses, filterMonth, search, filterCat])

  const monthTotal = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered])

  // ── Receipt helpers ────────────────────────────────────────────────────────
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

  // ── Form open helpers ──────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null); setTitle(''); setAmount(''); setDate(todayStr())
    setCategory(DEFAULT_CATEGORY); setPaidBy(userId ?? ''); setExpNote('')
    setSplit('50/50'); setFormError(''); setShowCatInput(false); setNewCatLabel('')
    clearNewReceipt(); setReceiptCurrentPath(null); setReceiptCurrentPreview(null)
    setShowForm(true)
  }

  function openEdit(e: Expense) {
    setEditId(e.id); setTitle(e.title); setAmount(String(e.amount))
    setDate(e.date); setCategory(e.category); setPaidBy(e.paid_by)
    setExpNote(e.note ?? '')
    setSplit((e.split_mode as '50/50' | 'personal' | 'para_otro') ?? '50/50')
    setFormError(''); setShowCatInput(false); setNewCatLabel('')
    clearNewReceipt()
    setReceiptCurrentPath(e.receipt_url)
    setReceiptCurrentPreview(null)
    if (e.receipt_url) {
      supabase.storage.from('receipts').createSignedUrl(e.receipt_url, 3600)
        .then(({ data }) => setReceiptCurrentPreview(data?.signedUrl ?? null))
    }
    setShowForm(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault(); setFormError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setFormError('Ingresa un monto válido mayor a 0'); return }
    setSaving(true)

    // Upload new receipt if any
    let receipt_url: string | null = receiptCurrentPath
    if (receiptFile && familyId) {
      const ext  = receiptFile.name.split('.').pop() ?? 'jpg'
      const path = `family/${familyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, receiptFile)
      if (!upErr) receipt_url = path
    }

    if (editId) {
      const { error } = await supabase.from('expenses')
        .update({ title, amount: amt, date, category, paid_by: paidBy, note: expNote || null, split_mode: split, receipt_url })
        .eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('expenses')
        .insert({ family_id: familyId, title, amount: amt, date, category, paid_by: paidBy, note: expNote || null, split_mode: split, receipt_url })
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false)
    clearNewReceipt()
    await loadExpenses(familyId!)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('¿Borrar este gasto?')) return
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
    if (openNotes === id) setOpenNotes(null)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  async function toggleNotes(id: string) {
    if (openNotes === id) { setOpenNotes(null); return }
    setOpenNotes(id); setNoteText('')
    if (!notes[id]) await loadNotes(id)
  }

  async function addNote(expenseId: string) {
    if (!noteText.trim()) return
    setAddingNote(true)
    const { error } = await supabase.from('expense_notes')
      .insert({ expense_id: expenseId, family_id: familyId, user_id: userId, content: noteText.trim() })
    if (!error) { setNoteText(''); await loadNotes(expenseId) }
    setAddingNote(false)
  }

  async function deleteNote(noteId: string, expenseId: string) {
    await supabase.from('expense_notes').delete().eq('id', noteId)
    setNotes(prev => ({ ...prev, [expenseId]: (prev[expenseId] ?? []).filter(n => n.id !== noteId) }))
  }

  // ── Custom categories ──────────────────────────────────────────────────────
  function handleAddCustomCat() {
    if (!newCatLabel.trim()) return
    const cat = addCustomCategory(newCatLabel)
    setCustomCats(getCustomCategories())
    setCategory(cat.value)
    setNewCatLabel(''); setShowCatInput(false)
  }

  function handleRemoveCustomCat(value: string) {
    removeCustomCategory(value)
    setCustomCats(getCustomCategories())
    if (category === value) setCategory(DEFAULT_CATEGORY)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )
  if (noFamily) return (
    <div className="px-4 py-12 text-center">
      <p className="text-gray-500 mb-3">Necesitas unirte a una familia primero.</p>
      <a href="/family" className="text-blue-600 underline font-medium">Ir a Familia →</a>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto">

      {/* ── Receipt lightbox ─────────────────────────────────── */}
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

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gastos</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} {filtered.length === 1 ? 'gasto' : 'gastos'} ·{' '}
            <span className="font-semibold text-gray-700">${monthTotal.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button onClick={() => exportToCSV(filtered, members, filterMonth)}
              className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2.5 rounded-2xl active:bg-gray-50">
              <Download size={14} strokeWidth={2} />
              CSV
            </button>
          )}
          <button onClick={openAdd}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm">
            <Plus size={16} strokeWidth={2.5} /> Agregar
          </button>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────── */}
      <div className="px-4 mb-4 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2} />
          <input type="text" placeholder="Buscar…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="flex gap-2">
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Todas</option>
            {[...new Set(expenses.map(e => e.category))].sort().map(c => (
              <option key={c} value={c}>{getCategoryLabel(c)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Formulario bottom sheet ───────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowForm(false)}>
          <div className="bg-white w-full rounded-t-3xl flex flex-col shadow-2xl"
            style={{ maxHeight: '94vh' }}
            onClick={e => e.stopPropagation()}>

            {/* Handle */}
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editId ? 'Editar gasto' : 'Nuevo gasto'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 active:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Form body — scrollable */}
            <form id="expense-form" onSubmit={handleSave}
              className="flex-1 overflow-y-auto px-5 space-y-5 pt-1 pb-4">

              {formError && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>
              )}

              {/* Descripción */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Descripción</label>
                <input type="text" required placeholder="¿En qué gastaron?" value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Monto + Fecha */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg pointer-events-none">$</span>
                    <input type="number" required step="0.01" min="0.01" placeholder="0.00"
                      value={amount} onChange={e => setAmount(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-8 pr-3 py-3.5 text-[17px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                  <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Categoría — tiles por grupo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Categoría —{' '}
                  <span className="text-blue-600 font-bold normal-case capitalize text-xs">{getCategoryLabel(category)}</span>
                </label>
                <div className="max-h-52 overflow-y-auto space-y-3 rounded-xl">
                  {CATEGORY_GROUPS.map(group => {
                    const cats    = CATEGORIES.filter(c => c.group === group)
                    const gColors = GROUP_COLORS[group] ?? {
                      tile: 'bg-gray-50 text-gray-600 border-gray-200',
                      selected: 'bg-gray-700 text-white border-gray-700',
                    }
                    return (
                      <div key={group}>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 pl-0.5">{group}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cats.map(cat => {
                            const sel = category === cat.value
                            return (
                              <button key={cat.value} type="button"
                                onClick={() => setCategory(cat.value)}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all active:scale-95 ${
                                  sel ? gColors.selected : gColors.tile
                                }`}
                              >
                                {cat.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {/* Custom categories */}
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 pl-0.5">Personalizado</p>
                    <div className="flex flex-wrap gap-1.5">
                      {customCats.map(cat => {
                        const sel = category === cat.value
                        return (
                          <div key={cat.value} className="relative group">
                            <button type="button"
                              onClick={() => setCategory(cat.value)}
                              className={`pl-2.5 pr-7 py-1.5 rounded-xl text-[11px] font-semibold border transition-all active:scale-95 ${
                                sel ? CUSTOM_COLORS.selected : CUSTOM_COLORS.tile
                              }`}
                            >
                              {cat.label}
                            </button>
                            <button type="button"
                              onClick={() => handleRemoveCustomCat(cat.value)}
                              className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full w-4 h-4 flex items-center justify-center ${
                                sel ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'
                              }`}
                            >
                              <X size={9} strokeWidth={3} />
                            </button>
                          </div>
                        )
                      })}

                      {showCatInput ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Nueva categoría"
                            value={newCatLabel}
                            onChange={e => setNewCatLabel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCat() } }}
                            className="border border-violet-300 rounded-xl px-2.5 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-violet-400 w-32 bg-white"
                          />
                          <button type="button" onClick={handleAddCustomCat}
                            className="bg-violet-600 text-white rounded-xl px-2.5 py-1.5 text-[11px] font-semibold active:opacity-80">
                            OK
                          </button>
                          <button type="button" onClick={() => { setShowCatInput(false); setNewCatLabel('') }}
                            className="text-gray-400 p-1">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button type="button"
                          onClick={() => setShowCatInput(true)}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border border-dashed border-violet-300 text-violet-600 bg-violet-50 active:bg-violet-100">
                          + Nueva
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ¿Quién pagó? */}
              {members.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">¿Quién pagó?</label>
                  <div className="flex gap-2">
                    {members.map(m => {
                      const sel = paidBy === m.user_id
                      return (
                        <button key={m.user_id} type="button"
                          onClick={() => setPaidBy(m.user_id)}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm border-2 transition-all active:scale-95 ${
                            sel
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                            sel ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {(m.display_name ?? '?')[0].toUpperCase()}
                          </span>
                          <span className="truncate">{m.display_name ?? m.user_id.slice(0, 8)}</span>
                          {m.user_id === userId && (
                            <span className={`text-[10px] flex-shrink-0 ${sel ? 'opacity-60' : 'text-gray-400'}`}>(yo)</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* División */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">División</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setSplit('50/50')}
                    className={`py-3 rounded-2xl font-semibold text-sm border-2 transition-all active:scale-95 ${
                      split === '50/50'
                        ? 'border-green-500 bg-green-500 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}>
                    50 / 50
                  </button>
                  <button type="button" onClick={() => setSplit('personal')}
                    className={`py-3 rounded-2xl font-semibold text-sm border-2 transition-all active:scale-95 ${
                      split === 'personal'
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}>
                    Solo mío
                  </button>
                  <button type="button" onClick={() => setSplit('para_otro')}
                    className={`py-3 rounded-2xl font-semibold text-sm border-2 transition-all active:scale-95 ${
                      split === 'para_otro'
                        ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}>
                    Para otro
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                  {split === '50/50'
                    ? 'Cada uno paga la mitad del gasto'
                    : split === 'personal'
                    ? 'El que pagó asume el gasto completo'
                    : 'Yo pagué, pero es gasto del otro — me debe todo'}
                </p>
              </div>

              {/* Nota */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Nota <span className="font-normal normal-case text-gray-400">(opcional)</span>
                </label>
                <input type="text" placeholder="Ej: con propina, compra especial…" value={expNote}
                  onChange={e => setExpNote(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Recibo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Recibo <span className="font-normal normal-case text-gray-400">(opcional)</span>
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

                {/* Galería / Cámara buttons */}
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => triggerReceiptPick('gallery')}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 bg-gray-50 rounded-2xl py-3 text-sm text-gray-600 font-medium active:bg-gray-100 transition-colors">
                    <ImageIcon size={15} strokeWidth={2} className="text-gray-400" />
                    Galería
                  </button>
                  <button type="button"
                    onClick={() => triggerReceiptPick('camera')}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 bg-gray-50 rounded-2xl py-3 text-sm text-gray-600 font-medium active:bg-gray-100 transition-colors">
                    <Camera size={15} strokeWidth={2} className="text-gray-400" />
                    Cámara
                  </button>
                </div>

                {/* Hidden file input */}
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReceiptChange}
                />
              </div>
            </form>

            {/* Botones sticky */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0">
                Cancelar
              </button>
              <button form="expense-form" type="submit" disabled={saving}
                className="flex-1 bg-blue-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90">
                {saving ? 'Guardando…' : editId ? 'Actualizar gasto' : 'Guardar gasto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de gastos ───────────────────────────────────── */}
      <div className="px-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Receipt size={40} className="mx-auto mb-3 opacity-25" strokeWidth={1.2} />
            <p className="text-sm">
              {expenses.length === 0 ? 'Sin gastos aún. ¡Agrega uno!' : 'Sin resultados con esos filtros.'}
            </p>
          </div>
        ) : filtered.map(exp => (
          <div key={exp.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3.5">
              <div className="flex items-start gap-3 justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Receipt size={15} className="text-blue-500" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 leading-tight truncate">{exp.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {fmtDate(exp.date)} · {getCategoryLabel(exp.category)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5 flex items-center flex-wrap gap-1">
                      <span>
                        Pagó: <span className="font-semibold text-gray-600">{memberName(exp.paid_by)}</span>
                        {exp.paid_by === userId && <span className="text-gray-400"> (yo)</span>}
                      </span>
                      {exp.split_mode === 'para_otro' && (
                        <span className="bg-amber-50 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-100 leading-none">
                          cargo de {memberName(members.find(m => m.user_id !== exp.paid_by)?.user_id ?? '')}
                        </span>
                      )}
                      {exp.split_mode === 'personal' && (
                        <span className="bg-gray-100 text-gray-500 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                          personal
                        </span>
                      )}
                    </p>
                    {exp.note && <p className="text-[11px] text-blue-500 italic mt-0.5 truncate">&quot;{exp.note}&quot;</p>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right ml-1">
                  <p className="font-bold text-blue-600 text-lg">${Number(exp.amount).toFixed(2)}</p>
                  {exp.paid_by === userId && (
                    <div className="flex gap-3 mt-1 justify-end">
                      <button onClick={() => openEdit(exp)} className="text-gray-400 active:text-blue-600">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(exp.id)} className="text-gray-400 active:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes + Receipt row */}
              <div className="mt-2 flex items-center gap-4 ml-12">
                <button onClick={() => toggleNotes(exp.id)}
                  className="flex items-center gap-1.5 text-xs text-blue-500 active:text-blue-700">
                  <MessageSquare size={12} />
                  {openNotes === exp.id
                    ? 'Ocultar notas'
                    : `Notas${notes[exp.id]?.length ? ` (${notes[exp.id].length})` : ''}`}
                </button>
                {exp.receipt_url && (
                  <button onClick={() => handleViewReceipt(exp.receipt_url!)}
                    className="flex items-center gap-1.5 text-xs text-purple-500 active:text-purple-700">
                    <Eye size={12} />
                    Ver recibo
                  </button>
                )}
              </div>
            </div>

            {/* Panel de notas */}
            {openNotes === exp.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                {(notes[exp.id] ?? []).length === 0
                  ? <p className="text-xs text-gray-400">Sin notas aún.</p>
                  : (notes[exp.id] ?? []).map(n => (
                    <div key={n.id} className="flex items-start gap-2">
                      <div className="flex-1 bg-white rounded-xl px-3 py-2 text-sm border border-gray-100">
                        <span className="font-semibold text-xs text-blue-600">{memberName(n.user_id)}: </span>
                        {n.content}
                      </div>
                      {n.user_id === userId && (
                        <button onClick={() => deleteNote(n.id, exp.id)}
                          className="text-gray-300 active:text-red-400 pt-1.5">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))
                }
                <div className="flex gap-2 pt-1">
                  <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="Escribe una nota…"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    onKeyDown={e => { if (e.key === 'Enter') addNote(exp.id) }}
                  />
                  <button onClick={() => addNote(exp.id)} disabled={addingNote || !noteText.trim()}
                    className="bg-blue-600 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-xl font-medium">
                    Enviar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
