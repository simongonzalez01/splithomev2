'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type CalEvent = { id: string; title: string; date: string; note: string | null; created_by: string }

function todayStr() { return new Date().toISOString().split('T')[0] }
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function EventsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [noFamily, setNoFamily] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const loadEvents = useCallback(async (fid: string) => {
    const { data } = await supabase.from('events').select('*').eq('family_id', fid).order('date').order('created_at', { ascending: false })
    setEvents(data ?? [])
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('family_id').eq('user_id', user.id).single()
      if (!profile?.family_id) { setNoFamily(true); setLoading(false); return }
      setFamilyId(profile.family_id)
      await loadEvents(profile.family_id)
      setLoading(false)
    }
    init()
  }, [supabase, loadEvents])

  function openAdd() {
    setEditId(null); setTitle(''); setDate(todayStr()); setNote(''); setFormError(''); setShowForm(true)
  }
  function openEdit(ev: CalEvent) {
    setEditId(ev.id); setTitle(ev.title); setDate(ev.date); setNote(ev.note ?? ''); setFormError(''); setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    if (!title.trim()) { setFormError('El título es requerido.'); return }
    setSaving(true)
    if (editId) {
      const { error } = await supabase.from('events').update({ title: title.trim(), date, note: note.trim() || null }).eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('events').insert({ family_id: familyId, title: title.trim(), date, note: note.trim() || null, created_by: userId })
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false)
    await loadEvents(familyId!)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Borrar este evento?')) return
    await supabase.from('events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  const today = todayStr()
  const upcoming = events.filter(e => e.date >= today)
  const past = events.filter(e => e.date < today)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  if (noFamily) return (
    <div className="px-4 py-12 text-center">
      <p className="text-gray-500 mb-3">Necesitas unirte a una familia primero.</p>
      <a href="/family" className="text-blue-600 underline font-medium">Ir a Familia →</a>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Eventos</h1>
        <button onClick={openAdd}
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl active:opacity-80">
          + Agregar
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-3"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-1" />
            <h2 className="text-lg font-bold">{editId ? 'Editar evento' : 'Nuevo evento'}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}
              <input type="text" required placeholder="Título del evento" value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea placeholder="Nota opcional…" value={note} onChange={e => setNote(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl">
                  {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="px-4 space-y-4">
        {events.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-sm">Sin eventos. ¡Agrega el primero!</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Próximos ({upcoming.length})</p>
                {upcoming.map(ev => (
                  <EventCard key={ev.id} event={ev} userId={userId!} onEdit={openEdit} onDelete={handleDelete} />
                ))}
              </div>
            )}
            {past.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pasados ({past.length})</p>
                {past.slice(0, 10).map(ev => (
                  <EventCard key={ev.id} event={ev} userId={userId!} onEdit={openEdit} onDelete={handleDelete} dimmed />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, userId, onEdit, onDelete, dimmed = false }: {
  event: CalEvent; userId: string
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; dimmed?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex gap-3 items-start ${dimmed ? 'opacity-50' : ''}`}>
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-lg">📅</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900">{event.title}</p>
        <p className="text-xs text-blue-500 font-medium mt-0.5">{fmtDate(event.date)}</p>
        {event.note && <p className="text-xs text-gray-500 mt-1">{event.note}</p>}
      </div>
      {event.created_by === userId && (
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => onEdit(event)} className="text-xs text-gray-400 active:text-blue-600 p-1">✏️</button>
          <button onClick={() => onDelete(event.id)} className="text-xs text-gray-400 active:text-red-500 p-1">🗑</button>
        </div>
      )}
    </div>
  )
}
