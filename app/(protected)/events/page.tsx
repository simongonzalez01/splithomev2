'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Plus, X, Pencil, Trash2 } from 'lucide-react'

type CalEvent = { id: string; title: string; date: string; note: string | null; created_by: string }

function todayStr() { return new Date().toISOString().split('T')[0] }
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function EventsPage() {
  const supabase = createClient()
  const [userId,   setUserId]   = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [events,   setEvents]   = useState<CalEvent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [noFamily, setNoFamily] = useState(false)

  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [title,     setTitle]     = useState('')
  const [date,      setDate]      = useState(todayStr())
  const [note,      setNote]      = useState('')
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  const loadEvents = useCallback(async (fid: string) => {
    const { data } = await supabase.from('events').select('*').eq('family_id', fid)
      .order('date').order('created_at', { ascending: false })
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
      const { error } = await supabase.from('events')
        .update({ title: title.trim(), date, note: note.trim() || null }).eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('events')
        .insert({ family_id: familyId, title: title.trim(), date, note: note.trim() || null, created_by: userId })
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

  const today    = todayStr()
  const upcoming = events.filter(e => e.date >= today)
  const past     = events.filter(e => e.date < today)

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
        <div>
          <h1 className="text-xl font-bold text-gray-900">Eventos</h1>
          <p className="text-xs text-gray-400 mt-0.5">{upcoming.length} próximos</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm">
          <Plus size={16} strokeWidth={2.5} /> Agregar
        </button>
      </div>

      {/* Form sheet */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editId ? 'Editar evento' : 'Nuevo evento'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}
              <input type="text" required placeholder="Título del evento" value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
              />
              <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
              />
              <textarea placeholder="Nota opcional…" value={note} onChange={e => setNote(e.target.value)}
                rows={2}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none transition-colors"
              />
              <div className="flex gap-2 pt-1" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
                <button type="button" onClick={() => setShowForm(false)}
                  className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-3.5 rounded-2xl text-sm flex-shrink-0">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm">
                  {saving ? 'Guardando…' : editId ? 'Actualizar evento' : 'Guardar evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      <div className="px-4 space-y-4">
        {events.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Calendar size={44} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
            <p className="text-sm">Sin eventos. ¡Agrega el primero!</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Próximos ({upcoming.length})</p>
                {upcoming.map(ev => (
                  <EventCard key={ev.id} event={ev} userId={userId!} onEdit={openEdit} onDelete={handleDelete} />
                ))}
              </div>
            )}
            {past.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pasados ({past.length})</p>
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
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex gap-3 items-start transition-opacity ${dimmed ? 'opacity-50' : ''}`}>
      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Calendar size={16} className="text-blue-500" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900">{event.title}</p>
        <p className="text-xs text-blue-500 font-medium mt-0.5">{fmtDate(event.date)}</p>
        {event.note && <p className="text-xs text-gray-500 mt-1 leading-snug">{event.note}</p>}
      </div>
      {event.created_by === userId && (
        <div className="flex gap-1.5 flex-shrink-0 mt-0.5">
          <button onClick={() => onEdit(event)} className="p-1.5 text-gray-400 active:text-blue-600 rounded-lg">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(event.id)} className="p-1.5 text-gray-400 active:text-red-500 rounded-lg">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
