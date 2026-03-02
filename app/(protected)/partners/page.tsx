'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Check, ArrowRight, Handshake,
  Store, ArrowLeftRight, Copy, Users, QrCode,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Profile = { id: string; email: string | null; full_name: string | null }

type SharedBusiness = {
  id: string; name: string; color: string; type: 'ventas' | 'cambio'
  invite_code: string | null; user_id: string
}

type PartnerGroup = {
  partner: Profile | null   // null = negocio sin socio todavía
  businesses: SharedBusiness[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function displayName(p: Profile | null) {
  if (!p) return 'Sin nombre'
  return p.full_name || p.email || 'Socio'
}

function initials(p: Profile | null) {
  const name = p?.full_name || p?.email || 'S'
  return name.slice(0, 2).toUpperCase()
}

const COLORS = [
  '#F97316', '#EAB308', '#22C55E', '#3B82F6',
  '#A855F7', '#EC4899', '#14B8A6', '#EF4444',
]

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PartnersPage() {
  const supabase = createClient()
  const [userId,        setUserId]        = useState<string | null>(null)
  const [partnerGroups, setPartnerGroups] = useState<PartnerGroup[]>([])
  const [loading,       setLoading]       = useState(true)
  const [copied,        setCopied]        = useState<string | null>(null)

  // ── Create business form
  const [showCreate,   setShowCreate]   = useState(false)
  const [bizName,      setBizName]      = useState('')
  const [bizDesc,      setBizDesc]      = useState('')
  const [bizType,      setBizType]      = useState<'ventas' | 'cambio'>('ventas')
  const [bizColor,     setBizColor]     = useState(COLORS[0])
  const [creating,     setCreating]     = useState(false)
  const [createError,  setCreateError]  = useState('')

  // ── Join business form
  const [showJoin,    setShowJoin]    = useState(false)
  const [joinCode,    setJoinCode]    = useState('')
  const [joining,     setJoining]     = useState(false)
  const [joinError,   setJoinError]   = useState('')
  const [joinSuccess, setJoinSuccess] = useState('')

  // ─── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    // Negocios que YO creé como partner
    const { data: owned } = await supabase
      .from('businesses')
      .select('id, name, color, type, invite_code, user_id')
      .eq('user_id', user.id)
      .eq('category', 'partner')
      .order('created_at', { ascending: true })

    // Negocios donde soy miembro
    const { data: memberships } = await supabase
      .from('business_members')
      .select('business_id, businesses(id, name, color, type, invite_code, user_id)')
      .eq('user_id', user.id)

    // Construir mapa: partnerId -> { profile, businesses }
    const map: Record<string, { partnerProfile: Profile | null; businesses: SharedBusiness[] }> = {}

    // Negocios propios: buscar quiénes son miembros
    for (const biz of (owned ?? []) as SharedBusiness[]) {
      const { data: members } = await supabase
        .from('business_members')
        .select('user_id')
        .eq('business_id', biz.id)

      if (!members || members.length === 0) {
        // Sin socio aún — agrupar bajo clave especial
        const key = '__pending__'
        if (!map[key]) map[key] = { partnerProfile: null, businesses: [] }
        map[key].businesses.push(biz)
      } else {
        for (const m of members) {
          const pid = m.user_id
          if (!map[pid]) map[pid] = { partnerProfile: null, businesses: [] }
          // Evitar duplicados
          if (!map[pid].businesses.find(b => b.id === biz.id)) {
            map[pid].businesses.push(biz)
          }
        }
      }
    }

    // Negocios como miembro: el socio es el dueño
    for (const row of (memberships ?? [])) {
      const biz = (row.businesses as unknown) as SharedBusiness
      if (!biz) continue
      const ownerId = biz.user_id
      if (!map[ownerId]) map[ownerId] = { partnerProfile: null, businesses: [] }
      if (!map[ownerId].businesses.find(b => b.id === biz.id)) {
        map[ownerId].businesses.push(biz)
      }
    }

    // Obtener perfiles de socios reales
    const partnerIds = Object.keys(map).filter(k => k !== '__pending__')
    if (partnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', partnerIds)
      for (const p of (profiles ?? [])) {
        if (map[p.id]) map[p.id].partnerProfile = p
      }
    }

    // Convertir mapa a array
    const groups: PartnerGroup[] = Object.entries(map).map(([, v]) => ({
      partner: v.partnerProfile,
      businesses: v.businesses,
    }))

    // Primero grupos con socio, luego sin socio
    groups.sort((a, b) => {
      if (!a.partner && b.partner) return 1
      if (a.partner && !b.partner) return -1
      return 0
    })

    setPartnerGroups(groups)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ─── Create shared business ────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    if (!bizName.trim()) { setCreateError('El nombre es requerido'); return }
    setCreating(true)

    const inviteCode = generateCode()
    const { error } = await supabase.from('businesses').insert({
      user_id:     userId,
      name:        bizName.trim(),
      description: bizDesc.trim() || null,
      type:        bizType,
      color:       bizColor,
      category:    'partner',
      invite_code: inviteCode,
    })

    if (error) { setCreateError(error.message); setCreating(false); return }
    setCreating(false)
    setShowCreate(false)
    setBizName(''); setBizDesc(''); setBizType('ventas'); setBizColor(COLORS[0])
    await load()
  }

  // ─── Join with code ────────────────────────────────────────────────────────
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoinError(''); setJoinSuccess('')
    const code = joinCode.trim().toUpperCase()
    if (!code) { setJoinError('Ingresa el código'); return }
    setJoining(true)

    // Buscar negocio por código
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name, user_id, category')
      .eq('invite_code', code)
      .single()

    if (!biz) { setJoinError('Código inválido. Verifica el código con tu socio.'); setJoining(false); return }
    if (biz.user_id === userId) { setJoinError('Este negocio es tuyo.'); setJoining(false); return }
    if (biz.category !== 'partner') { setJoinError('Este código no es de un negocio compartido.'); setJoining(false); return }

    // Verificar si ya es miembro
    const { data: existing } = await supabase
      .from('business_members')
      .select('id')
      .eq('business_id', biz.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) { setJoinError('Ya eres socio de este negocio.'); setJoining(false); return }

    // Unirse al negocio
    const { error: joinErr } = await supabase
      .from('business_members')
      .insert({ business_id: biz.id, user_id: userId, role: 'partner' })

    if (joinErr) { setJoinError(joinErr.message); setJoining(false); return }

    // Crear vínculo de socios (en ambas direcciones)
    await supabase.from('partner_relationships').upsert([
      { user_id: userId,      partner_id: biz.user_id, status: 'active' },
      { user_id: biz.user_id, partner_id: userId,      status: 'active' },
    ], { onConflict: 'user_id,partner_id', ignoreDuplicates: true })

    setJoining(false)
    setJoinSuccess(`¡Te uniste a "${biz.name}"!`)
    setJoinCode('')
    await load()
    setTimeout(() => { setShowJoin(false); setJoinSuccess('') }, 1500)
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  const totalBusinesses = partnerGroups.reduce((s, g) => s + g.businesses.length, 0)

  return (
    <div className="max-w-lg mx-auto">

      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Socios</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalBusinesses} negocio{totalBusinesses !== 1 ? 's' : ''} compartido{totalBusinesses !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowJoin(true); setJoinError(''); setJoinSuccess(''); setJoinCode('') }}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-semibold px-3 py-2.5 rounded-2xl active:opacity-80"
          >
            <QrCode size={15} strokeWidth={2.2} /> Unirme
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreateError('') }}
            className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm"
          >
            <Plus size={16} strokeWidth={2.5} /> Nuevo
          </button>
        </div>
      </div>

      {/* Empty state */}
      {partnerGroups.length === 0 && (
        <div className="text-center py-16 px-8">
          <div className="w-16 h-16 bg-orange-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Handshake size={28} className="text-orange-400" strokeWidth={1.5} />
          </div>
          <h3 className="font-bold text-gray-800 text-lg mb-2">Sin negocios compartidos</h3>
          <p className="text-sm text-gray-400 max-w-xs mx-auto mb-6">
            Crea un negocio compartido y comparte el código con tu socio, o únete al negocio de alguien con su código.
          </p>
          <div className="flex flex-col gap-3 items-center">
            <button
              onClick={() => { setShowCreate(true); setCreateError('') }}
              className="inline-flex items-center gap-2 bg-orange-500 text-white font-semibold px-6 py-3.5 rounded-2xl text-sm shadow-md"
            >
              <Plus size={18} strokeWidth={2.5} /> Crear negocio compartido
            </button>
            <button
              onClick={() => { setShowJoin(true); setJoinError(''); setJoinSuccess(''); setJoinCode('') }}
              className="text-sm text-gray-500 flex items-center gap-2"
            >
              <QrCode size={16} /> Tengo un código de mi socio
            </button>
          </div>
        </div>
      )}

      {/* Lista de grupos */}
      <div className="px-4 space-y-6 pb-6">
        {partnerGroups.map((group, gi) => (
          <div key={gi}>
            {/* Encabezado del grupo */}
            {group.partner ? (
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-700 font-bold text-xs">{initials(group.partner)}</span>
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{displayName(group.partner)}</p>
                  {group.partner.full_name && group.partner.email && (
                    <p className="text-xs text-gray-400">{group.partner.email}</p>
                  )}
                </div>
                <Link
                  href={`/partners/${group.partner.id}`}
                  className="ml-auto text-xs font-semibold text-orange-500 flex items-center gap-1"
                >
                  Ver resumen <ArrowRight size={12} />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Users size={18} className="text-gray-400" />
                </div>
                <div>
                  <p className="font-bold text-gray-600 text-sm">Sin socio aún</p>
                  <p className="text-xs text-gray-400">Comparte el código para que tu socio se una</p>
                </div>
              </div>
            )}

            {/* Negocios del grupo */}
            <div className="space-y-2 ml-1">
              {group.businesses.map(biz => (
                <BusinessCard
                  key={biz.id}
                  biz={biz}
                  partnerId={group.partner?.id ?? null}
                  isOwner={biz.user_id === userId}
                  copied={copied}
                  onCopy={copyCode}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal: Crear negocio compartido ─────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCreate(false)}>
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Nuevo negocio compartido</h2>
                <button onClick={() => setShowCreate(false)} className="p-1 text-gray-400">
                  <X size={20} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Se generará un código para que tu socio se una
              </p>
            </div>

            <form id="create-form" onSubmit={handleCreate}
              className="flex-1 overflow-y-auto px-5 pt-3 pb-4 space-y-5">
              {createError && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{createError}</p>
              )}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Nombre del negocio
                </label>
                <input
                  type="text" required placeholder="Ej: Maquinaria Agrícola" value={bizName}
                  onChange={e => setBizName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text" placeholder="¿A qué se dedica?" value={bizDesc}
                  onChange={e => setBizDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white"
                />
              </div>

              {/* Tipo de negocio */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Tipo de negocio
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { v: 'ventas', emoji: '🛒', label: 'Ventas', sub: 'Inventario y ventas' },
                    { v: 'cambio', emoji: '💱', label: 'Cambio', sub: 'Divisas y transferencias' },
                  ] as const).map(opt => (
                    <button
                      key={opt.v} type="button" onClick={() => setBizType(opt.v)}
                      className={`py-3 px-4 rounded-2xl text-sm font-semibold border-2 text-left transition-all ${
                        bizType === opt.v
                          ? opt.v === 'ventas'
                            ? 'bg-orange-50 border-orange-400 text-orange-700'
                            : 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}
                    >
                      <div className="text-lg mb-0.5">{opt.emoji}</div>
                      <div>{opt.label}</div>
                      <div className="text-[10px] font-normal text-gray-400 mt-0.5">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c} type="button" onClick={() => setBizColor(c)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                        bizColor === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {bizColor === c && <Check size={14} className="text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowCreate(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm flex-shrink-0">
                Cancelar
              </button>
              <button form="create-form" type="submit" disabled={creating}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm">
                {creating ? 'Creando…' : 'Crear negocio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Unirse con código ─────────────────────────────────────── */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowJoin(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Unirse con código</h2>
                <button onClick={() => setShowJoin(false)} className="p-1 text-gray-400">
                  <X size={20} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Pídele el código a tu socio y escríbelo aquí</p>
            </div>

            <form id="join-form" onSubmit={handleJoin} className="px-5 pt-2 pb-4 space-y-4">
              {joinError && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{joinError}</p>
              )}
              {joinSuccess && (
                <p className="text-emerald-600 text-sm bg-emerald-50 px-3 py-2 rounded-xl font-semibold">
                  ✅ {joinSuccess}
                </p>
              )}
              <input
                type="text"
                placeholder="Ej: HK7M2X9A"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-2xl font-mono text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white"
              />
            </form>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowJoin(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm flex-shrink-0">
                Cancelar
              </button>
              <button form="join-form" type="submit" disabled={joining}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm">
                {joining ? 'Verificando…' : 'Unirme'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Business Card ─────────────────────────────────────────────────────────────
function BusinessCard({
  biz, partnerId, isOwner, copied, onCopy,
}: {
  biz: SharedBusiness
  partnerId: string | null
  isOwner: boolean
  copied: string | null
  onCopy: (code: string) => void
}) {
  const href = partnerId
    ? `/partners/${partnerId}/${biz.id}`
    : `/partners/pending/${biz.id}`

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <Link href={href} className="px-4 py-3.5 flex items-center gap-3 active:bg-gray-50">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: biz.color + '22' }}
        >
          {biz.type === 'cambio'
            ? <ArrowLeftRight size={20} style={{ color: biz.color }} strokeWidth={1.8} />
            : <Store size={20} style={{ color: biz.color }} strokeWidth={1.8} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-[14px]">{biz.name}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            biz.type === 'cambio' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'
          }`}>
            {biz.type === 'cambio' ? '💱 Cambio' : '🛒 Ventas'}
          </span>
        </div>
        <ArrowRight size={15} className="text-gray-300 flex-shrink-0" />
      </Link>

      {/* Código de invitación — solo visible para el dueño */}
      {isOwner && biz.invite_code && (
        <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={12} className="text-gray-300" />
            <span className="text-[11px] text-gray-400">Código:</span>
            <span className="font-mono text-sm font-bold text-gray-700 tracking-widest">
              {biz.invite_code}
            </span>
          </div>
          <button
            onClick={() => onCopy(biz.invite_code!)}
            className="flex items-center gap-1 text-[11px] font-semibold text-orange-500 active:opacity-70"
          >
            {copied === biz.invite_code
              ? <><Check size={12} className="text-emerald-500" /> Copiado</>
              : <><Copy size={12} /> Copiar</>
            }
          </button>
        </div>
      )}
    </div>
  )
}
