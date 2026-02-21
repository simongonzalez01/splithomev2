'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import CategorySelect from '@/components/CategorySelect'
import { DEFAULT_CATEGORY } from '@/lib/categories'

type Expense = {
  id: string; title: string; amount: number; date: string
  category: string; paid_by: string; note: string | null; created_at: string
}
type Note = { id: string; expense_id: string; user_id: string; content: string; created_at: string }
type Member = { user_id: string; display_name: string | null }

function todayStr() { return new Date().toISOString().split('T')[0] }
function monthStart(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset)
  return d.toISOString().split('T')[0].slice(0, 7) // YYYY-MM
}

export default function ExpensesPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [notes, setNotes] = useState<Record<string, Note[]>>({})
  const [loading, setLoading] = useState(true)
  const [noFamily, setNoFamily] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState(monthStart())
  const [filterCat, setFilterCat] = useState('')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr()); const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [paidBy, setPaidBy] = useState(''); const [expNote, setExpNote] = useState('')
  const [formError, setFormError] = useState(''); const [saving, setSaving] = useState(false)

  // Note panel
  const [openNotes, setOpenNotes] = useState<string | null>(null)
  const [noteText, setNoteText] = useState(''); const [addingNote, setAddingNote] = useState(false)

  const memberName = (uid: string) => members.find(m => m.user_id === uid)?.display_name || uid.slice(0, 8)

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
  }, [supabase, loadExpenses])

  // Filter logic
  const filtered = useMemo(() => {
    return expenses.filter(e => {
      const matchMonth = e.date.startsWith(filterMonth)
      const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase())
      const matchCat = !filterCat || e.category === filterCat
      return matchMonth && matchSearch && matchCat
    })
  }, [expenses, filterMonth, search, filterCat])

  const monthTotal = useMemo(() =>
    filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered])

  function openAdd() {
    setEditId(null); setTitle(''); setAmount(''); setDate(todayStr())
    setCategory(DEFAULT_CATEGORY); setPaidBy(userId ?? ''); setExpNote('')
    setFormError(''); setShowForm(true)
  }
  function openEdit(e: Expense) {
    setEditId(e.id); setTitle(e.title); setAmount(String(e.amount))
    setDate(e.date); setCategory(e.category); setPaidBy(e.paid_by)
    setExpNote(e.note ?? ''); setFormError(''); setShowForm(true)
  }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault(); setFormError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setFormError('Enter a valid amount > 0'); return }
    setSaving(true)
    if (editId) {
      const { error } = await supabase.from('expenses')
        .update({ title, amount: amt, date, category, paid_by: paidBy, note: expNote || null })
        .eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('expenses')
        .insert({ family_id: familyId, title, amount: amt, date, category, paid_by: paidBy, note: expNote || null })
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false)
    await loadExpenses(familyId!)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Borrar este gasto?')) return
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
    if (openNotes === id) setOpenNotes(null)
  }

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

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  if (noFamily) return (
    <div className="px-4 py-12 text-center">
      <p className="text-gray-500 mb-3">Necesitas unirte a una familia primero.</p>
      <a href="/family" className="text-blue-600 underline font-medium">Ir a Familia →</a>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Gastos</h1>
        <button onClick={openAdd}
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl active:opacity-80">
          + Agregar
        </button>
      </div>

      {/* Month total pill */}
      <div className="px-4 mb-3">
        <div className="bg-blue-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-blue-600 font-medium">Total {filterMonth}</span>
          <span className="text-blue-700 font-bold">${monthTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 mb-3 space-y-2">
        <input type="text" placeholder="🔍 Buscar por título…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
        <div className="flex gap-2">
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="">Todas las categorías</option>
            {[...new Set(expenses.map(e => e.category))].sort().map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Add/Edit Sheet */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-1" />
            <h2 className="text-lg font-bold text-gray-900">{editId ? 'Editar gasto' : 'Nuevo gasto'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}
              <input type="text" required placeholder="Título del gasto" value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <input type="number" required step="0.01" min="0.01" placeholder="Monto $"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <CategorySelect value={category} onChange={setCategory} required />
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Pagado por</label>
                <select value={paidBy} onChange={e => setPaidBy(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.user_id.slice(0, 8)}{m.user_id === userId ? ' (yo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <input type="text" placeholder="Nota opcional…" value={expNote}
                onChange={e => setExpNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl">
                  {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense list */}
      <div className="px-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">💸</p>
            <p className="text-sm">{expenses.length === 0 ? 'Sin gastos aún. ¡Agrega uno!' : 'Sin resultados con esos filtros.'}</p>
          </div>
        ) : filtered.map(exp => (
          <div key={exp.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-start gap-2 justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 leading-tight">{exp.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {exp.date} · {exp.category}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pagó: <span className="font-medium">{memberName(exp.paid_by)}</span>
                    {exp.paid_by === userId && ' (yo)'}
                  </p>
                  {exp.note && <p className="text-xs text-blue-600 mt-1 italic">"{exp.note}"</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="font-bold text-blue-600 text-lg">${Number(exp.amount).toFixed(2)}</p>
                  {exp.paid_by === userId && (
                    <div className="flex gap-3 mt-1 justify-end">
                      <button onClick={() => openEdit(exp)} className="text-xs text-gray-400 active:text-blue-600">Editar</button>
                      <button onClick={() => handleDelete(exp.id)} className="text-xs text-gray-400 active:text-red-500">Borrar</button>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => toggleNotes(exp.id)}
                className="mt-2 text-xs text-blue-500 active:text-blue-700">
                💬 {openNotes === exp.id ? 'Ocultar notas' : `Notas${notes[exp.id]?.length ? ` (${notes[exp.id].length})` : ''}`}
              </button>
            </div>

            {openNotes === exp.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                {(notes[exp.id] ?? []).length === 0
                  ? <p className="text-xs text-gray-400">Sin notas. ¡Sé el primero!</p>
                  : (notes[exp.id] ?? []).map(n => (
                    <div key={n.id} className="flex items-start gap-2">
                      <div className="flex-1 bg-white rounded-xl px-3 py-2 text-sm border border-gray-100">
                        <span className="font-semibold text-xs text-blue-600">{memberName(n.user_id)}: </span>
                        {n.content}
                      </div>
                      {n.user_id === userId && (
                        <button onClick={() => deleteNote(n.id, exp.id)}
                          className="text-gray-300 active:text-red-400 text-xs pt-1">✕</button>
                      )}
                    </div>
                  ))
                }
                <div className="flex gap-2 pt-1">
                  <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="Escribe una nota…"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    onKeyDown={e => { if (e.key === 'Enter') addNote(exp.id) }}
                  />
                  <button onClick={() => addNote(exp.id)} disabled={addingNote || !noteText.trim()}
                    className="bg-blue-600 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-xl">
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
