'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, X, Check, CalendarDays,
  CircleCheck, Circle, Trash2, Edit3, User,
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0]
const fmtDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })
const isOverdue = (due: string | null, done: boolean) =>
  !done && !!due && new Date(due + 'T23:59:59') < new Date()

// ── types ─────────────────────────────────────────────────────────────────────
type Profile = { id: string; full_name: string | null; email: string | null }
type Todo = {
  id: string
  business_id: string
  created_by: string
  assigned_to: string | null
  title: string
  description: string | null
  due_date: string | null
  is_done: boolean
  done_at: string | null
  created_at: string
}

// ── component ─────────────────────────────────────────────────────────────────
export default function TodosPage() {
  const { partnerId, businessId } = useParams<{ partnerId: string; businessId: string }>()
  const router   = useRouter()
  const supabase = createClient()

  const [loading,       setLoading]       = useState(true)
  const [userId,        setUserId]        = useState('')
  const [businessName,  setBusinessName]  = useState('')
  const [businessColor, setBusinessColor] = useState('#6366f1')
  const [members,       setMembers]       = useState<Profile[]>([])

  const [todos,      setTodos]      = useState<Todo[]>([])
  const [filter,     setFilter]     = useState<'pendientes' | 'todos' | 'hechos'>('pendientes')

  // form
  const [showForm,   setShowForm]   = useState(false)
  const [editTodo,   setEditTodo]   = useState<Todo | null>(null)
  const [fTitle,     setFTitle]     = useState('')
  const [fDesc,      setFDesc]      = useState('')
  const [fDue,       setFDue]       = useState('')
  const [fAssigned,  setFAssigned]  = useState('')
  const [fError,     setFError]     = useState('')
  const [fSaving,    setFSaving]    = useState(false)

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [businessId])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: biz } = await supabase
      .from('businesses').select('name,color,user_id').eq('id', businessId).single()
    if (biz) { setBusinessName(biz.name); setBusinessColor(biz.color || '#6366f1') }

    // load members for assignment dropdown
    const ownerIds = biz ? [biz.user_id] : []
    const { data: memberRows } = await supabase
      .from('business_members').select('user_id').eq('business_id', businessId)
    const userIds = [
      ...ownerIds,
      ...(memberRows?.map((m: { user_id: string }) => m.user_id) ?? []),
    ].filter(Boolean)

    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('id,full_name,email').in('id', userIds)
      if (profiles) setMembers(profiles as Profile[])
    }

    await loadTodos()
    setLoading(false)
  }

  async function loadTodos() {
    const { data } = await supabase
      .from('business_todos')
      .select('*')
      .eq('business_id', businessId)
      .order('is_done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (data) setTodos(data as Todo[])
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const profileById = (id: string | null) =>
    id ? members.find(m => m.id === id) ?? null : null
  const displayName = (p: Profile | null) =>
    p?.full_name || p?.email || 'Usuario'

  const filteredTodos = todos.filter(t => {
    if (filter === 'pendientes') return !t.is_done
    if (filter === 'hechos')     return t.is_done
    return true
  })

  const pendingCount  = todos.filter(t => !t.is_done).length
  const overdueCount  = todos.filter(t => isOverdue(t.due_date, t.is_done)).length
  const doneCount     = todos.filter(t => t.is_done).length

  // ── toggle done ───────────────────────────────────────────────────────────
  async function toggleDone(todo: Todo) {
    const newDone = !todo.is_done
    await supabase.from('business_todos').update({
      is_done: newDone,
      done_at: newDone ? new Date().toISOString() : null,
    }).eq('id', todo.id)
    setTodos(prev => prev.map(t =>
      t.id === todo.id
        ? { ...t, is_done: newDone, done_at: newDone ? new Date().toISOString() : null }
        : t
    ))
  }

  // ── form ──────────────────────────────────────────────────────────────────
  function openForm(todo?: Todo) {
    if (todo) {
      setEditTodo(todo)
      setFTitle(todo.title)
      setFDesc(todo.description ?? '')
      setFDue(todo.due_date ?? '')
      setFAssigned(todo.assigned_to ?? '')
    } else {
      setEditTodo(null)
      setFTitle(''); setFDesc(''); setFDue(''); setFAssigned('')
    }
    setFError('')
    setShowForm(true)
  }

  async function saveTodo() {
    if (!fTitle.trim()) { setFError('Título requerido'); return }
    setFSaving(true); setFError('')
    const payload = {
      business_id: businessId,
      created_by:  userId,
      title:       fTitle.trim(),
      description: fDesc.trim()   || null,
      due_date:    fDue           || null,
      assigned_to: fAssigned      || null,
    }
    if (editTodo) {
      await supabase.from('business_todos').update(payload).eq('id', editTodo.id)
    } else {
      await supabase.from('business_todos').insert(payload)
    }
    await loadTodos()
    setShowForm(false)
    setFSaving(false)
  }

  async function deleteTodo(todoId: string) {
    await supabase.from('business_todos').delete().eq('id', todoId)
    setTodos(prev => prev.filter(t => t.id !== todoId))
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">{businessName}</p>
            <h1 className="font-bold text-gray-900 text-[17px]">Tareas</h1>
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-50 rounded-2xl p-2.5 text-center border border-gray-100">
            <p className="text-[10px] text-gray-400">Pendientes</p>
            <p className="font-bold text-gray-900">{pendingCount}</p>
          </div>
          {overdueCount > 0 && (
            <div className="flex-1 bg-red-50 rounded-2xl p-2.5 text-center border border-red-100">
              <p className="text-[10px] text-red-400">Vencidas</p>
              <p className="font-bold text-red-500">{overdueCount}</p>
            </div>
          )}
          <div className="flex-1 bg-emerald-50 rounded-2xl p-2.5 text-center border border-emerald-100">
            <p className="text-[10px] text-emerald-500">Hechas</p>
            <p className="font-bold text-emerald-600">{doneCount}</p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3">
          {(['pendientes', 'todos', 'hechos'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                filter === f
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Todo list ───────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 space-y-2">
        {filteredTodos.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-gray-100 mt-4">
            <CircleCheck size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium text-sm">
              {filter === 'hechos' ? 'Ninguna tarea completada aún' : '¡Todo en orden! Sin tareas pendientes'}
            </p>
            {filter === 'pendientes' && (
              <p className="text-gray-300 text-xs mt-1">Tocá + para agregar una</p>
            )}
          </div>
        ) : (
          filteredTodos.map(todo => {
            const overdue    = isOverdue(todo.due_date, todo.is_done)
            const assignee   = profileById(todo.assigned_to)
            const isMyTodo   = todo.created_by === userId || todo.assigned_to === userId

            return (
              <div
                key={todo.id}
                className={`bg-white rounded-3xl border overflow-hidden transition-all ${
                  overdue ? 'border-red-200' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start gap-3 p-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleDone(todo)}
                    className="flex-shrink-0 mt-0.5"
                  >
                    {todo.is_done
                      ? <CircleCheck size={22} className="text-emerald-500" strokeWidth={1.8} />
                      : <Circle size={22} className="text-gray-300" strokeWidth={1.8} />
                    }
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${
                      todo.is_done ? 'line-through text-gray-400' : overdue ? 'text-red-700' : 'text-gray-900'
                    }`}>
                      {todo.title}
                    </p>
                    {todo.description && (
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{todo.description}</p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                      {todo.due_date && (
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          overdue ? 'text-red-500' : todo.is_done ? 'text-gray-400' : 'text-amber-600'
                        }`}>
                          <CalendarDays size={11} />
                          {overdue ? '⚠ ' : ''}{fmtDate(todo.due_date)}
                        </span>
                      )}
                      {assignee && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <User size={11} />
                          {assignee.id === userId ? 'Yo' : displayName(assignee)}
                        </span>
                      )}
                      {todo.is_done && todo.done_at && (
                        <span className="text-[11px] text-emerald-500">
                          ✓ {fmtDate(todo.done_at.split('T')[0])}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    {(isMyTodo || true) && (
                      <button
                        onClick={() => openForm(todo)}
                        className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
                      >
                        <Edit3 size={13} className="text-gray-500" />
                      </button>
                    )}
                    {(todo.created_by === userId) && (
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center"
                      >
                        <Trash2 size={13} className="text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── FAB ─────────────────────────────────────────────────────────────── */}
      <button
        onClick={() => openForm()}
        className="fixed bottom-8 right-5 w-14 h-14 rounded-2xl text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{ backgroundColor: businessColor }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ── Form modal ──────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">

            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-900">{editTodo ? 'Editar tarea' : 'Nueva tarea'}</h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4 pb-12">
              {fError && <p className="text-red-500 text-xs bg-red-50 p-3 rounded-2xl">{fError}</p>}

              {/* Título */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Título *</label>
                <input
                  value={fTitle} onChange={e => setFTitle(e.target.value)}
                  placeholder="Ej: Llamar al proveedor de repuestos"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Descripción (opcional)</label>
                <textarea
                  value={fDesc} onChange={e => setFDesc(e.target.value)}
                  rows={2} placeholder="Detalles de la tarea…"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none"
                />
              </div>

              {/* Fecha límite + Asignado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Fecha límite</label>
                  <input
                    value={fDue} onChange={e => setFDue(e.target.value)} type="date"
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Asignar a</label>
                  <select
                    value={fAssigned} onChange={e => setFAssigned(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-3 py-3 text-sm focus:outline-none"
                  >
                    <option value="">Sin asignar</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.id === userId ? 'Yo' : (m.full_name || m.email || m.id.slice(0, 6))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={saveTodo}
                disabled={fSaving}
                className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                style={{ backgroundColor: businessColor }}
              >
                {fSaving ? 'Guardando…' : editTodo ? 'Actualizar tarea' : 'Crear tarea'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
