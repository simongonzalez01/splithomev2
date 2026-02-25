'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Store, X, Check, ArrowRight, Pencil, Trash2 } from 'lucide-react'

type Business = {
  id: string
  name: string
  description: string | null
  color: string
  created_at: string
}

const COLORS = [
  '#F97316', '#EAB308', '#22C55E', '#3B82F6',
  '#A855F7', '#EC4899', '#14B8A6', '#EF4444',
]

export default function BusinessPage() {
  const supabase = createClient()
  const [userId,     setUserId]     = useState<string | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading,    setLoading]    = useState(true)

  // Form
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [name,      setName]      = useState('')
  const [desc,      setDesc]      = useState('')
  const [color,     setColor]     = useState(COLORS[0])
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    setBusinesses(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditId(null); setName(''); setDesc(''); setColor(COLORS[0])
    setFormError(''); setShowForm(true)
  }

  function openEdit(b: Business) {
    setEditId(b.id); setName(b.name); setDesc(b.description ?? '')
    setColor(b.color); setFormError(''); setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    if (!name.trim()) { setFormError('El nombre es requerido'); return }
    setSaving(true)
    const payload = { name: name.trim(), description: desc.trim() || null, color }
    if (editId) {
      const { error } = await supabase.from('businesses').update(payload).eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('businesses').insert({ ...payload, user_id: userId })
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); await load()
  }

  async function handleDelete(b: Business) {
    if (!confirm(`¿Eliminar "${b.name}"? Se borrarán también todos sus movimientos e inventario.`)) return
    await supabase.from('businesses').delete().eq('id', b.id)
    setBusinesses(prev => prev.filter(x => x.id !== b.id))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  return (
    <div className="max-w-lg mx-auto">

      {/* Encabezado */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis Negocios</h1>
          <p className="text-xs text-gray-400 mt-0.5">{businesses.length} negocio{businesses.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} /> Nuevo
        </button>
      </div>

      {/* Lista */}
      <div className="px-4 space-y-3">
        {businesses.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-orange-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Store size={28} className="text-orange-400" strokeWidth={1.5} />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-2">Registra tu negocio</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
              Lleva el control de inventario, ventas y gastos de cada uno de tus negocios.
            </p>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 bg-orange-500 text-white font-semibold px-6 py-3.5 rounded-2xl active:opacity-80 shadow-md text-sm"
            >
              <Plus size={18} strokeWidth={2.5} /> Crear primer negocio
            </button>
          </div>
        ) : (
          businesses.map(b => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <Link
                href={`/business/${b.id}`}
                className="px-4 py-4 flex items-center gap-3 active:bg-gray-50"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: b.color + '22' }}
                >
                  <Store size={22} style={{ color: b.color }} strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-[15px]">{b.name}</p>
                  {b.description && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{b.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={e => { e.preventDefault(); openEdit(b) }}
                    className="text-gray-300 active:text-blue-500 p-1"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={e => { e.preventDefault(); handleDelete(b) }}
                    className="text-gray-300 active:text-red-500 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ArrowRight size={16} className="text-gray-300" />
                </div>
              </Link>
            </div>
          ))
        )}
      </div>

      {/* Bottom sheet form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{editId ? 'Editar negocio' : 'Nuevo negocio'}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>

            <form id="biz-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 space-y-5 pt-2 pb-4">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Nombre del negocio</label>
                <input
                  type="text" required placeholder="Ej: Tienda de ropa" value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text" placeholder="¿A qué se dedica?" value={desc}
                  onChange={e => setDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c} type="button" onClick={() => setColor(c)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${color === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : ''}`}
                      style={{ backgroundColor: c }}
                    >
                      {color === c && <Check size={14} className="text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0">
                Cancelar
              </button>
              <button form="biz-form" type="submit" disabled={saving}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90">
                {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Crear negocio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
