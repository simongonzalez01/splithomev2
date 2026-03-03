'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Copy, Check, Share2, Store, ArrowLeftRight, Trash2, Edit3, X } from 'lucide-react'

type Business = {
  id: string; name: string; description: string | null
  color: string; type: 'ventas' | 'cambio'; invite_code: string | null
  user_id: string; created_at: string
}

export default function PendingBusinessPage() {
  const { bizId } = useParams<{ bizId: string }>()
  const router    = useRouter()
  const supabase  = createClient()

  const [loading,  setLoading]  = useState(true)
  const [userId,   setUserId]   = useState('')
  const [business, setBusiness] = useState<Business | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [notOwner, setNotOwner] = useState(false)

  // Edit form
  const [showEdit, setShowEdit] = useState(false)
  const [eName,    setEName]    = useState('')
  const [eDesc,    setEDesc]    = useState('')
  const [eColor,   setEColor]   = useState('#6366f1')
  const [eSaving,  setESaving]  = useState(false)

  const COLORS = [
    '#6366f1','#3b82f6','#0ea5e9','#22c55e','#f59e0b',
    '#f97316','#ef4444','#a855f7','#ec4899','#14b8a6',
  ]

  useEffect(() => { load() }, [bizId])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: biz } = await supabase
      .from('businesses').select('*').eq('id', bizId).single()

    if (!biz) { router.push('/partners'); return }
    if (biz.user_id !== user.id) { setNotOwner(true); setLoading(false); return }

    setBusiness(biz as Business)
    setEName(biz.name); setEDesc(biz.description ?? ''); setEColor(biz.color)
    setLoading(false)
  }

  function copyCode() {
    if (!business?.invite_code) return
    navigator.clipboard.writeText(business.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function shareCode() {
    if (!business?.invite_code) return
    const text = `¡Unite a mi negocio "${business.name}" en SplitHome!\nUsá el código: ${business.invite_code}`
    if (navigator.share) {
      navigator.share({ title: 'SplitHome — Código de invitación', text })
    } else {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  async function saveEdit() {
    if (!business || !eName.trim()) return
    setESaving(true)
    await supabase.from('businesses').update({
      name: eName.trim(), description: eDesc.trim() || null, color: eColor,
    }).eq('id', business.id)
    setBusiness(prev => prev ? { ...prev, name: eName.trim(), description: eDesc.trim() || null, color: eColor } : prev)
    setShowEdit(false)
    setESaving(false)
  }

  async function deleteBusiness() {
    if (!business) return
    if (!confirm(`¿Eliminar "${business.name}"? Esto es irreversible.`)) return
    await supabase.from('businesses').delete().eq('id', business.id)
    router.push('/partners')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
    </div>
  )

  if (notOwner) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6 text-center gap-4">
      <p className="text-gray-500 text-sm">No sos el dueño de este negocio.</p>
      <button onClick={() => router.push('/partners')}
        className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-semibold text-sm">
        Volver a Socios
      </button>
    </div>
  )

  if (!business) return null

  const code = business.invite_code ?? '--------'

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.push('/partners')}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Sin socio aún</p>
          <h1 className="font-bold text-gray-900 text-[17px] truncate">{business.name}</h1>
        </div>
        <button onClick={() => setShowEdit(true)}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <Edit3 size={16} className="text-gray-500" />
        </button>
      </div>

      <div className="px-4 pt-5 space-y-4">

        {/* Business card */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: business.color + '22' }}>
              {business.type === 'cambio'
                ? <ArrowLeftRight size={22} style={{ color: business.color }} strokeWidth={1.8} />
                : <Store size={22} style={{ color: business.color }} strokeWidth={1.8} />
              }
            </div>
            <div>
              <p className="font-bold text-gray-900 text-[16px]">{business.name}</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: business.color + '18', color: business.color }}>
                {business.type === 'cambio' ? 'Cambio' : 'Ventas'}
              </span>
            </div>
          </div>
          {business.description && (
            <p className="text-sm text-gray-500">{business.description}</p>
          )}
        </div>

        {/* Invite code */}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-900 text-[15px]">Código de invitación</p>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-bold">
              ⏳ Esperando socio
            </span>
          </div>

          {/* Big code */}
          <div className="bg-gray-50 rounded-2xl p-5 text-center border border-gray-100">
            <p className="text-[36px] font-black font-mono tracking-[0.15em] text-gray-900 select-all">
              {code}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Tu socio debe ingresar este código en la sección Socios → Unirse
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={copyCode}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all"
              style={{ backgroundColor: copied ? '#22c55e' : business.color, color: 'white' }}>
              {copied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar código</>}
            </button>
            <button onClick={shareCode}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm bg-gray-100 text-gray-700">
              <Share2 size={16} /> Compartir
            </button>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-blue-50 rounded-3xl border border-blue-100 p-5 space-y-3">
          <p className="font-bold text-blue-800 text-sm">¿Cómo funciona?</p>
          <div className="space-y-2.5">
            {[
              { n: '1', text: 'Compartí el código de 8 letras con tu socio' },
              { n: '2', text: 'Tu socio va a Socios → "Unirse con código"' },
              { n: '3', text: 'Una vez que se una, ambos verán el negocio en su sección de Socios' },
            ].map(step => (
              <div key={step.n} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step.n}
                </div>
                <p className="text-sm text-blue-700">{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <button onClick={deleteBusiness}
          className="w-full py-3.5 rounded-2xl bg-red-50 border border-red-100 text-red-500 font-bold text-sm flex items-center justify-center gap-2">
          <Trash2 size={16} /> Eliminar negocio
        </button>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[80vh] overflow-y-auto">
            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-gray-900">Editar negocio</h3>
              <button onClick={() => setShowEdit(false)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-4 space-y-4 pb-10">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Nombre</label>
                <input value={eName} onChange={e => setEName(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1.5 block">Descripción</label>
                <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setEColor(c)}
                      className={`w-9 h-9 rounded-full transition-all ${eColor === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : ''}`}
                      style={{ backgroundColor: c }}>
                      {eColor === c && <Check size={14} className="text-white mx-auto" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={saveEdit} disabled={eSaving}
                className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                style={{ backgroundColor: eColor }}>
                {eSaving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
