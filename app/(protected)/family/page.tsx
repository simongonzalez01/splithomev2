'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function randomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function FamilyPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Create form
  const [familyName, setFamilyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Join form
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      // If already in a family, redirect to dashboard
      const { data: profile } = await supabase
        .from('profiles').select('family_id').eq('user_id', user.id).single()
      if (profile?.family_id) { router.replace('/'); return }
      setLoading(false)
    }
    init()
  }, [supabase, router])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    if (!familyName.trim()) { setCreateError('Ingresa un nombre para la familia'); return }
    setCreating(true)
    const code = randomCode()
    const { data: fam, error: famErr } = await supabase
      .from('families')
      .insert({ name: familyName.trim(), code, created_by: userId })
      .select().single()
    if (famErr || !fam) { setCreateError(famErr?.message ?? 'Error al crear'); setCreating(false); return }
    const { error: profErr } = await supabase
      .from('profiles').update({ family_id: fam.id }).eq('user_id', userId)
    if (profErr) { setCreateError(profErr.message); setCreating(false); return }
    router.push('/')
    router.refresh()
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoinError('')
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) { setJoinError('El código debe tener 6 caracteres'); return }
    setJoining(true)
    const { data: fam, error } = await supabase
      .from('families').select('id, name').eq('code', code).single()
    if (error || !fam) {
      setJoinError('Código no encontrado. Verifica e intenta de nuevo.')
      setJoining(false); return
    }
    const { error: profErr } = await supabase
      .from('profiles').update({ family_id: fam.id }).eq('user_id', userId)
    if (profErr) { setJoinError(profErr.message); setJoining(false); return }
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-10 pb-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-5xl">🏠</p>
        <h1 className="text-2xl font-bold text-gray-900">Configura tu familia</h1>
        <p className="text-sm text-gray-400">Crea una familia nueva o únete con un código de invitación.</p>
      </div>

      {/* ── Create ─────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">Crear familia</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          {createError && (
            <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{createError}</p>
          )}
          <input
            type="text"
            placeholder="Nombre de la familia (ej. Los García)"
            value={familyName}
            onChange={e => setFamilyName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={creating}
            className="w-full bg-blue-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm active:opacity-90"
          >
            {creating ? 'Creando…' : 'Crear familia →'}
          </button>
        </form>
      </section>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">O</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* ── Join ───────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">Unirte a una familia</h2>
        <form onSubmit={handleJoin} className="space-y-3">
          {joinError && (
            <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{joinError}</p>
          )}
          <input
            type="text"
            placeholder="Código (ej. AB12CD)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm uppercase font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
          />
          <button
            type="submit"
            disabled={joining}
            className="w-full border-2 border-blue-600 text-blue-600 font-bold py-3 rounded-xl text-sm active:bg-blue-50 disabled:opacity-60"
          >
            {joining ? 'Uniéndome…' : 'Unirme →'}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-3 text-center">
          Pide el código al miembro que creó la familia. Lo encuentran en Perfil.
        </p>
      </section>
    </div>
  )
}
