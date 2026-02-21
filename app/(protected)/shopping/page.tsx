'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ShoppingCart, Plus, X, Trash2, Search, Check } from 'lucide-react'

type Item = { id: string; name: string; qty: string | null; note: string | null; bought: boolean; created_by: string }

const SUGGESTIONS = [
  'Leche','Huevos','Pan','Arroz','Pasta','Pollo','Carne','Pescado','Frutas','Verduras',
  'Agua','Café','Azúcar','Aceite','Cereal','Mantequilla','Queso','Yogurt','Jugo','Avena',
  'Pañales','Wipes','Fórmula','Baby food','Toallitas húmedas',
  'Detergente','Jabón','Shampoo','Papel toalla','Papel higiénico','Bolsas basura',
  'Jabón de platos','Cloro','Suavizante','Esponjas',
  'Snacks','Galletas','Chocolate','Helado','Refresco',
]

export default function ShoppingPage() {
  const supabase = createClient()
  const [userId,   setUserId]   = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [items,    setItems]    = useState<Item[]>([])
  const [loading,  setLoading]  = useState(true)
  const [noFamily, setNoFamily] = useState(false)

  const [name,    setName]    = useState('')
  const [qty,     setQty]     = useState('')
  const [note,    setNote]    = useState('')
  const [adding,  setAdding]  = useState(false)
  const [showDetail,     setShowDetail]     = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [confirmBulk,    setConfirmBulk]    = useState(false)

  const loadItems = useCallback(async (fid: string) => {
    const { data } = await supabase.from('shopping_items').select('*').eq('family_id', fid)
      .order('bought').order('created_at', { ascending: false })
    setItems(data ?? [])
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('family_id').eq('user_id', user.id).single()
      if (!profile?.family_id) { setNoFamily(true); setLoading(false); return }
      setFamilyId(profile.family_id)
      await loadItems(profile.family_id)
      setLoading(false)
    }
    init()
  }, [supabase, loadItems])

  async function addItem(itemName: string, itemQty = '', itemNote = '') {
    if (!itemName.trim()) return
    setAdding(true)
    const { error } = await supabase.from('shopping_items').insert({
      family_id: familyId, name: itemName.trim(),
      qty: itemQty.trim() || null, note: itemNote.trim() || null, created_by: userId,
    })
    if (!error) { setName(''); setQty(''); setNote(''); await loadItems(familyId!) }
    setAdding(false); setShowDetail(false)
  }

  async function quickAdd(suggestion: string) {
    if (adding) return
    setAdding(true)
    const { error } = await supabase.from('shopping_items').insert({
      family_id: familyId, name: suggestion, created_by: userId,
    })
    if (!error) await loadItems(familyId!)
    setAdding(false)
  }

  async function toggleBought(item: Item) {
    await supabase.from('shopping_items').update({ bought: !item.bought }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, bought: !i.bought } : i))
  }

  async function deleteItem(id: string) {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function deleteBought() {
    const boughtIds = items.filter(i => i.bought).map(i => i.id)
    if (boughtIds.length === 0) return
    await supabase.from('shopping_items').delete().in('id', boughtIds)
    setItems(prev => prev.filter(i => !i.bought))
    setConfirmBulk(false)
  }

  const pending  = items.filter(i => !i.bought)
  const bought   = items.filter(i => i.bought)
  const filtSug  = SUGGESTIONS
    .filter(s => name.trim() === '' || s.toLowerCase().includes(name.toLowerCase()))
    .filter(s => !items.some(i => i.name.toLowerCase() === s.toLowerCase()))

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
          <h1 className="text-xl font-bold text-gray-900">Lista de Mercado</h1>
          <p className="text-xs text-gray-400 mt-0.5">{pending.length} pendientes · {bought.length} comprados</p>
        </div>
        {bought.length > 0 && (
          <button onClick={() => setConfirmBulk(true)}
            className="flex items-center gap-1.5 text-xs text-red-500 border border-red-200 bg-red-50 px-3 py-2 rounded-2xl font-semibold active:opacity-80">
            <Trash2 size={12} />
            Borrar comprados
          </button>
        )}
      </div>

      {/* Quick add bar */}
      <div className="px-4 mb-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2} />
            <input
              type="text" placeholder="Busca o escribe un ítem…" value={name}
              onChange={e => { setName(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              className="w-full border border-gray-200 bg-white rounded-2xl pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={() => name.trim()
              ? (showDetail ? addItem(name, qty, note) : setShowDetail(true))
              : setShowDetail(v => !v)
            }
            disabled={adding}
            className="bg-blue-600 disabled:opacity-60 text-white px-4 py-3 rounded-2xl text-sm font-bold active:opacity-80 flex items-center gap-1">
            {adding ? '…' : showDetail ? <Check size={16} /> : <Plus size={18} strokeWidth={2.5} />}
          </button>
        </div>

        {/* Detail fields */}
        {showDetail && (
          <div className="mt-2 flex gap-2">
            <input type="text" placeholder="Cantidad (ej. 2 kg)" value={qty}
              onChange={e => setQty(e.target.value)}
              className="flex-1 border border-gray-200 bg-white rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input type="text" placeholder="Nota opcional" value={note}
              onChange={e => setNote(e.target.value)}
              className="flex-1 border border-gray-200 bg-white rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        )}

        {/* Suggestions */}
        {showSuggestions && filtSug.length > 0 && (
          <div className="mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
            <div className="flex flex-wrap gap-2 p-3">
              {filtSug.slice(0, 12).map(s => (
                <button key={s}
                  onClick={() => { quickAdd(s); setShowSuggestions(false); setName('') }}
                  className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full active:bg-blue-100">
                  + {s}
                </button>
              ))}
              {name.trim() && !SUGGESTIONS.some(s => s.toLowerCase() === name.toLowerCase()) && (
                <button onClick={() => { addItem(name); setShowSuggestions(false) }}
                  className="bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full active:bg-gray-200">
                  + Crear &ldquo;{name}&rdquo;
                </button>
              )}
            </div>
            <button onClick={() => setShowSuggestions(false)}
              className="w-full text-xs text-gray-400 py-2 border-t border-gray-100">Cerrar</button>
          </div>
        )}
      </div>

      {/* Bulk delete confirm */}
      {confirmBulk && (
        <div className="mx-4 mb-3 bg-red-50 rounded-2xl p-4 flex items-center gap-3 border border-red-200">
          <p className="flex-1 text-sm text-red-700 font-medium">¿Borrar {bought.length} comprados?</p>
          <button onClick={deleteBought} className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl">Sí, borrar</button>
          <button onClick={() => setConfirmBulk(false)} className="text-gray-500 text-xs px-2 py-1.5">No</button>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-14 text-gray-400">
          <ShoppingCart size={44} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
          <p className="text-sm">Lista vacía. ¡Agrega algo!</p>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div className="px-4 space-y-2 mb-4">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Por comprar ({pending.length})
          </p>
          {pending.map(item => (
            <ShoppingCard key={item.id} item={item} userId={userId!}
              onToggle={() => toggleBought(item)} onDelete={() => deleteItem(item.id)} />
          ))}
        </div>
      )}

      {/* Bought */}
      {bought.length > 0 && (
        <div className="px-4 space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Comprado ({bought.length})
          </p>
          {bought.map(item => (
            <ShoppingCard key={item.id} item={item} userId={userId!}
              onToggle={() => toggleBought(item)} onDelete={() => deleteItem(item.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ShoppingCard({ item, userId, onToggle, onDelete }: {
  item: Item; userId: string; onToggle: () => void; onDelete: () => void
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm px-4 py-3 flex items-center gap-3 transition-opacity ${
      item.bought ? 'border-gray-100 opacity-55' : 'border-gray-100'
    }`}>
      <button onClick={onToggle}
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          item.bought ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 active:border-blue-400'
        }`}>
        {item.bought && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${item.bought ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {item.name}
          {item.qty && <span className="text-gray-400 font-normal ml-1">× {item.qty}</span>}
        </p>
        {item.note && <p className="text-xs text-gray-400 truncate mt-0.5">{item.note}</p>}
      </div>
      {item.created_by === userId && (
        <button onClick={onDelete} className="text-gray-300 active:text-red-400 flex-shrink-0 p-1">
          <X size={15} />
        </button>
      )}
    </div>
  )
}
