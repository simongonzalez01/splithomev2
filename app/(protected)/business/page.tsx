'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Store, X, Check, ChevronRight, Pencil, Trash2,
  ArrowLeftRight, UserPlus, Copy, Users, LogIn, RefreshCw,
  UserMinus, MessageCircle, RotateCcw,
} from 'lucide-react'
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

// ─── Types ────────────────────────────────────────────────────────────────────
type Profile = {
  user_id: string
  display_name: string | null
  full_name: string | null
  email: string | null
}

type OwnedBusiness = {
  id: string
  name: string
  description: string | null
  color: string
  type: 'ventas' | 'cambio'
  invite_code: string | null
  category: string | null
  user_id: string
  created_at: string
}

type JoinedBusiness = OwnedBusiness & { ownerProfile: Profile | null }

type JoinPreview = {
  id: string
  name: string
  color: string
  type: 'ventas' | 'cambio'
  ownerProfile: Profile | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const COLORS = [
  '#F97316', '#EAB308', '#22C55E', '#3B82F6',
  '#A855F7', '#EC4899', '#14B8A6', '#EF4444',
]

function getInitials(p: Profile | null) {
  return (p?.display_name ?? p?.full_name ?? p?.email ?? '?').slice(0, 2).toUpperCase()
}
function getName(p: Profile | null) {
  return p?.display_name ?? p?.full_name ?? p?.email ?? 'Propietario'
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-5">
      <div className="flex items-center justify-between pb-5">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-3 w-20 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-20 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-10 w-24 bg-orange-100 rounded-2xl animate-pulse" />
        </div>
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 px-4 py-4 flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded-lg animate-pulse" />
          </div>
          <div className="w-5 h-5 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BusinessPage() {
  const supabase = createClient()
  const [userId,  setUserId]  = useState<string | null>(null)
  const [owned,   setOwned]   = useState<OwnedBusiness[]>([])
  const [joined,  setJoined]  = useState<JoinedBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState<{ msg: string; ok?: boolean } | null>(null)

  // Invite code
  const [sharingId,    setSharingId]    = useState<string | null>(null)
  const [sharedCode,   setSharedCode]   = useState<{ bizId: string; code: string } | null>(null)
  const [copiedCode,   setCopiedCode]   = useState(false)
  const [regenerating, setRegenerating] = useState<string | null>(null)

  // Create / edit
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [name,      setName]      = useState('')
  const [desc,      setDesc]      = useState('')
  const [color,     setColor]     = useState(COLORS[0])
  const [bizType,   setBizType]   = useState<'ventas' | 'cambio'>('ventas')
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  // Join
  const [showJoin,   setShowJoin]   = useState(false)
  const [joinCode,   setJoinCode]   = useState('')
  const [joining,    setJoining]    = useState(false)
  const [joinError,  setJoinError]  = useState('')
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null)

  // Remove partner / leave
  const [removingPartner, setRemovingPartner] = useState<string | null>(null)
  const [leavingId,       setLeavingId]       = useState<string | null>(null)

  // Context
  const { unreadMap } = useUnreadMessages()

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: rawOwned }, { data: memberships }] = await Promise.all([
      supabase.from('businesses').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('business_members')
        .select('business_id, businesses(id,name,description,color,type,user_id,invite_code,category,created_at)')
        .eq('user_id', user.id),
    ])

    const joinedRaw = (memberships ?? [])
      .map(m => m.businesses as unknown as OwnedBusiness | null)
      .filter((b): b is OwnedBusiness => !!b)

    const ownerIds = [...new Set(joinedRaw.map(b => b.user_id))]
    const { data: profiles } = ownerIds.length > 0
      ? await supabase.from('profiles').select('user_id, display_name, full_name, email').in('user_id', ownerIds)
      : { data: [] }

    const profileMap: Record<string, Profile> = Object.fromEntries(
      (profiles ?? []).map(p => [p.user_id, p])
    )

    setOwned(rawOwned ?? [])
    setJoined(joinedRaw.map(b => ({ ...b, ownerProfile: profileMap[b.user_id] ?? null })))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const refreshing = usePullToRefresh(load)

  // ── Toast ────────────────────────────────────────────────────────────────────
  function showToast(msg: string, ok = false) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Create / Edit ────────────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null); setName(''); setDesc(''); setColor(COLORS[0]); setBizType('ventas')
    setFormError(''); setShowForm(true)
  }
  function openEdit(b: OwnedBusiness) {
    setEditId(b.id); setName(b.name); setDesc(b.description ?? '')
    setColor(b.color); setBizType(b.type ?? 'ventas'); setFormError(''); setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    if (!name.trim()) { setFormError('El nombre es requerido'); return }
    setSaving(true)
    const payload = { name: name.trim(), description: desc.trim() || null, color, type: bizType }
    const { error } = editId
      ? await supabase.from('businesses').update(payload).eq('id', editId)
      : await supabase.from('businesses').insert({ ...payload, user_id: userId })
    if (error) { setFormError(error.message); setSaving(false); return }
    setSaving(false); setShowForm(false); await load()
  }

  // ── Delete (optimistic) ───────────────────────────────────────────────────
  async function handleDelete(b: OwnedBusiness) {
    if (!confirm(`¿Eliminar "${b.name}"? Se borrarán todos sus movimientos e inventario.`)) return
    setOwned(prev => prev.filter(x => x.id !== b.id)) // optimistic
    const { error } = await supabase.from('businesses').delete().eq('id', b.id)
    if (error) { showToast('No se pudo eliminar el negocio'); await load() }
  }

  // ── Share / invite code ───────────────────────────────────────────────────
  async function handleShare(b: OwnedBusiness) {
    if (b.invite_code) { setSharedCode({ bizId: b.id, code: b.invite_code }); return }
    setSharingId(b.id)
    const code = generateCode()
    const { error } = await supabase.from('businesses')
      .update({ invite_code: code, category: 'partner' }).eq('id', b.id)
    setSharingId(null)
    if (!error) { setSharedCode({ bizId: b.id, code }); await load() }
    else showToast('No se pudo generar el código')
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  async function handleRegenerateCode(b: OwnedBusiness) {
    if (!confirm('¿Generar un código nuevo? El código anterior dejará de funcionar.')) return
    setRegenerating(b.id)
    const code = generateCode()
    const { error } = await supabase.from('businesses').update({ invite_code: code }).eq('id', b.id)
    setRegenerating(null)
    if (!error) { setSharedCode({ bizId: b.id, code }); await load() }
    else showToast('No se pudo regenerar el código')
  }

  // ── Remove partner ────────────────────────────────────────────────────────
  async function handleRemovePartner(b: OwnedBusiness) {
    if (!confirm(`¿Remover al socio de "${b.name}"?\nEl código de invitación será eliminado.`)) return
    setRemovingPartner(b.id)
    await supabase.from('business_members').delete().eq('business_id', b.id)
    const { error } = await supabase.from('businesses')
      .update({ invite_code: null, category: null }).eq('id', b.id)
    setRemovingPartner(null)
    if (error) showToast('No se pudo remover el socio')
    else { setSharedCode(null); showToast('Socio removido', true); await load() }
  }

  // ── Leave (optimistic) ────────────────────────────────────────────────────
  async function handleLeave(b: JoinedBusiness) {
    if (!confirm(`¿Salir de "${b.name}"?`)) return
    setLeavingId(b.id)
    setJoined(prev => prev.filter(x => x.id !== b.id)) // optimistic
    const { error } = await supabase.from('business_members').delete()
      .eq('business_id', b.id).eq('user_id', userId!)
    setLeavingId(null)
    if (error) { showToast('No se pudo salir del negocio'); await load() }
    else showToast('Saliste del negocio', true)
  }

  // ── Join: step 1 — look up business ──────────────────────────────────────
  async function handleJoinLookup(e: React.FormEvent) {
    e.preventDefault(); setJoinError('')
    const code = joinCode.trim().toUpperCase()
    if (!code) { setJoinError('Ingresa un código'); return }
    setJoining(true)

    const { data: biz } = await supabase
      .from('businesses').select('id, name, color, type, user_id')
      .eq('invite_code', code).single()

    if (!biz) { setJoinError('Código inválido o no encontrado'); setJoining(false); return }
    if (biz.user_id === userId) { setJoinError('Este negocio ya es tuyo'); setJoining(false); return }

    const { data: existing } = await supabase.from('business_members').select('id')
      .eq('business_id', biz.id).eq('user_id', userId!).maybeSingle()
    if (existing) { setJoinError('Ya eres socio de este negocio'); setJoining(false); return }

    const { data: ownerProfile } = await supabase.from('profiles')
      .select('user_id, display_name, full_name, email').eq('user_id', biz.user_id).maybeSingle()

    setJoinPreview({ id: biz.id, name: biz.name, color: biz.color, type: biz.type, ownerProfile: ownerProfile ?? null })
    setJoining(false)
  }

  // ── Join: step 2 — confirm ────────────────────────────────────────────────
  async function handleJoinConfirm() {
    if (!joinPreview || !userId) return
    setJoining(true)
    const { error } = await supabase.from('business_members').insert({
      business_id: joinPreview.id, user_id: userId,
    })
    // Also create partner relationship records
    const { data: biz } = await supabase.from('businesses').select('user_id').eq('id', joinPreview.id).single()
    if (biz) {
      await supabase.from('partner_relationships').upsert([
        { user_id: userId,      partner_id: biz.user_id, status: 'active' },
        { user_id: biz.user_id, partner_id: userId,      status: 'active' },
      ], { onConflict: 'user_id,partner_id', ignoreDuplicates: true }).select()
    }
    setJoining(false)
    if (error) { setJoinError(error.message); setJoinPreview(null); return }
    setShowJoin(false); setJoinCode(''); setJoinPreview(null)
    showToast(`¡Te uniste a "${joinPreview.name}"!`, true)
    await load()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <Skeleton />

  const totalCount = owned.length + joined.length

  return (
    <div className="max-w-lg mx-auto pb-8">

      {/* ─── Pull-to-refresh indicator ─── */}
      {refreshing && (
        <div className="flex items-center justify-center py-3">
          <RefreshCw size={16} className="text-orange-400 animate-spin" />
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold flex items-center gap-2 transition-all ${
          toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.ok ? <Check size={14} /> : <X size={14} />}
          {toast.msg}
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Negocios</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalCount === 0 ? 'Sin negocios aún' : `${totalCount} negocio${totalCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowJoin(true); setJoinCode(''); setJoinError(''); setJoinPreview(null) }}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-600 text-sm font-semibold px-3 py-2.5 rounded-2xl active:opacity-70"
          >
            <LogIn size={15} strokeWidth={2.2} /> Unirme
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm"
          >
            <Plus size={16} strokeWidth={2.5} /> Nuevo
          </button>
        </div>
      </div>

      {/* ─── Empty state ─── */}
      {totalCount === 0 && (
        <div className="text-center py-16 px-6">
          <div className="w-16 h-16 bg-orange-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Store size={28} className="text-orange-400" strokeWidth={1.5} />
          </div>
          <h3 className="font-bold text-gray-800 text-lg mb-2">Sin negocios aún</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
            Crea tu negocio o únete al de un socio con un código de invitación.
          </p>
          <div className="flex flex-col gap-2 items-center">
            <button onClick={openAdd}
              className="inline-flex items-center gap-2 bg-orange-500 text-white font-semibold px-6 py-3.5 rounded-2xl active:opacity-80 shadow-md text-sm">
              <Plus size={18} strokeWidth={2.5} /> Crear negocio
            </button>
            <button
              onClick={() => { setShowJoin(true); setJoinCode(''); setJoinError(''); setJoinPreview(null) }}
              className="inline-flex items-center gap-2 text-gray-500 font-semibold px-6 py-3 text-sm active:opacity-70"
            >
              <LogIn size={16} /> Unirme con código
            </button>
          </div>
        </div>
      )}

      {/* ─── Mis negocios ─── */}
      {owned.length > 0 && (
        <div className="px-4 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 pb-0.5">
            Mis negocios
          </p>
          {owned.map(b => {
            const unread = unreadMap[b.id] ?? 0
            return (
              <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <Link href={`/partners/solo/${b.id}`} className="px-4 py-4 flex items-center gap-3 active:bg-gray-50">
                  {/* Color icon */}
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: b.color + '22' }}>
                    {b.type === 'cambio'
                      ? <ArrowLeftRight size={22} style={{ color: b.color }} strokeWidth={1.8} />
                      : <Store size={22} style={{ color: b.color }} strokeWidth={1.8} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{b.name}</p>
                      {unread > 0 && (
                        <span className="w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center flex-shrink-0">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </div>
                    {b.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{b.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {b.invite_code ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">
                          <Users size={9} /> Con socio
                        </span>
                      ) : (
                        <span className="inline-flex text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          Solo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {b.invite_code ? (
                      // Has partner: show remove partner button instead of invite
                      <button
                        onClick={e => { e.preventDefault(); handleRemovePartner(b) }}
                        disabled={removingPartner === b.id}
                        className="p-2 text-gray-300 active:text-red-500 rounded-xl active:bg-red-50"
                        title="Remover socio"
                      >
                        {removingPartner === b.id
                          ? <span className="text-[10px] text-gray-400">…</span>
                          : <UserMinus size={15} />}
                      </button>
                    ) : (
                      // No partner: invite button
                      <button
                        onClick={e => { e.preventDefault(); handleShare(b) }}
                        disabled={sharingId === b.id}
                        className="p-2 text-gray-300 active:text-orange-500 rounded-xl active:bg-orange-50"
                        title="Invitar socio"
                      >
                        {sharingId === b.id
                          ? <span className="text-[10px] text-orange-400">…</span>
                          : <UserPlus size={15} />}
                      </button>
                    )}
                    <button onClick={e => { e.preventDefault(); openEdit(b) }}
                      className="p-2 text-gray-300 active:text-blue-500 rounded-xl active:bg-blue-50">
                      <Pencil size={15} />
                    </button>
                    <button onClick={e => { e.preventDefault(); handleDelete(b) }}
                      className="p-2 text-gray-300 active:text-red-500 rounded-xl active:bg-red-50">
                      <Trash2 size={15} />
                    </button>
                    <ChevronRight size={16} className="text-gray-200 ml-1" />
                  </div>
                </Link>

                {/* Inline invite code panel */}
                {sharedCode?.bizId === b.id && (
                  <div className="border-t border-orange-50 bg-orange-50/60 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-0.5">
                        Código para tu socio
                      </p>
                      <span className="font-mono text-lg font-bold text-gray-800 tracking-[0.25em]">
                        {sharedCode.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRegenerateCode(b)}
                        disabled={regenerating === b.id}
                        className="p-2 text-gray-400 active:text-orange-500 rounded-xl active:bg-orange-50"
                        title="Generar nuevo código"
                      >
                        {regenerating === b.id
                          ? <RefreshCw size={14} className="animate-spin" />
                          : <RotateCcw size={14} />}
                      </button>
                      <button
                        onClick={() => copyCode(sharedCode.code)}
                        className="flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-3 py-2 rounded-xl active:opacity-80"
                      >
                        {copiedCode ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                      </button>
                      <button onClick={() => setSharedCode(null)} className="p-2 text-gray-400 active:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Soy socio en ─── */}
      {joined.length > 0 && (
        <div className={`px-4 space-y-3 ${owned.length > 0 ? 'mt-6' : ''}`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 pb-0.5">
            Soy socio en
          </p>
          {joined.map(b => {
            const unread = unreadMap[b.id] ?? 0
            return (
              <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <Link href={`/partners/${b.user_id}/${b.id}`}
                  className="px-4 py-4 flex items-center gap-3 active:bg-gray-50">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: b.color + '22' }}>
                    {b.type === 'cambio'
                      ? <ArrowLeftRight size={22} style={{ color: b.color }} strokeWidth={1.8} />
                      : <Store size={22} style={{ color: b.color }} strokeWidth={1.8} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-gray-900 text-[15px] leading-tight truncate">{b.name}</p>
                      {unread > 0 && (
                        <span className="w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center flex-shrink-0">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </div>
                    {b.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{b.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] font-bold text-orange-600">{getInitials(b.ownerProfile)}</span>
                      </div>
                      <span className="text-xs text-gray-400 truncate">{getName(b.ownerProfile)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={e => { e.preventDefault(); handleLeave(b) }}
                      disabled={leavingId === b.id}
                      className="p-2 text-gray-300 active:text-red-500 rounded-xl active:bg-red-50"
                      title="Salir del negocio"
                    >
                      <LogIn size={15} className="rotate-180" />
                    </button>
                    <ChevronRight size={16} className="text-gray-200 ml-1" />
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Join sheet ─── */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => { setShowJoin(false); setJoinPreview(null) }}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-3" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  {joinPreview ? '¿Unirte a este negocio?' : 'Unirme a un negocio'}
                </h2>
                <button type="button" onClick={() => { setShowJoin(false); setJoinPreview(null) }}
                  className="p-1 text-gray-400"><X size={20} /></button>
              </div>

              {joinError && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl mb-4">{joinError}</p>
              )}

              {joinPreview ? (
                /* ── Confirmation view ── */
                <div className="text-center py-2">
                  <div className="w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: joinPreview.color + '22' }}>
                    {joinPreview.type === 'cambio'
                      ? <ArrowLeftRight size={32} style={{ color: joinPreview.color }} strokeWidth={1.8} />
                      : <Store size={32} style={{ color: joinPreview.color }} strokeWidth={1.8} />}
                  </div>
                  <h3 className="font-bold text-gray-900 text-xl mb-1">{joinPreview.name}</h3>
                  <p className="text-sm text-gray-400 mb-1">Propietario</p>
                  <p className="text-sm font-semibold text-gray-700">{getName(joinPreview.ownerProfile)}</p>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setJoinPreview(null)}
                      className="flex-1 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50"
                    >
                      Atrás
                    </button>
                    <button
                      onClick={handleJoinConfirm}
                      disabled={joining}
                      className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] active:opacity-90"
                    >
                      {joining ? 'Uniéndome…' : '¡Unirme!'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Code input ── */
                <form onSubmit={handleJoinLookup}>
                  <p className="text-sm text-gray-400 mb-4">
                    Ingresa el código que te compartió tu socio.
                  </p>
                  <input
                    type="text"
                    placeholder="Ej: ABC12345"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-[17px] font-mono tracking-[0.25em] text-center uppercase focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors mb-4"
                    maxLength={8}
                    autoFocus
                  />
                  <button type="submit" disabled={joining}
                    className="w-full bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90">
                    {joining ? 'Buscando…' : 'Buscar negocio'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Create / Edit sheet ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editId ? 'Editar negocio' : 'Nuevo negocio'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400"><X size={20} /></button>
              </div>
            </div>

            <form id="biz-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 space-y-5 pt-2 pb-4">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Nombre del negocio
                </label>
                <input type="text" required placeholder="Ej: Tienda de ropa" value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors" />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Descripción <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input type="text" placeholder="¿A qué se dedica?" value={desc}
                  onChange={e => setDesc(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-colors" />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">
                  Tipo de negocio
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['ventas', 'cambio'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setBizType(t)}
                      className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all ${
                        bizType === t ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-gray-50'
                      }`}>
                      {t === 'ventas'
                        ? <Store size={24} className={bizType === t ? 'text-orange-500' : 'text-gray-400'} strokeWidth={1.8} />
                        : <ArrowLeftRight size={24} className={bizType === t ? 'text-orange-500' : 'text-gray-400'} strokeWidth={1.8} />}
                      <span className={`text-sm font-bold ${bizType === t ? 'text-orange-600' : 'text-gray-400'}`}>
                        {t === 'ventas' ? 'Ventas' : 'Cambio'}
                      </span>
                      <span className={`text-[10px] text-center leading-tight px-1 ${bizType === t ? 'text-orange-400' : 'text-gray-300'}`}>
                        {t === 'ventas' ? 'Inventario, ventas y gastos' : 'Cambio de divisas'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                        color === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}>
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

      {/* Chat shortcut hint for businesses with unread (bottom helper) */}
      {Object.keys(unreadMap).length > 0 && (
        <div className="mx-4 mt-4 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <MessageCircle size={18} className="text-blue-500 flex-shrink-0" strokeWidth={1.8} />
          <p className="text-sm text-blue-700 font-medium flex-1">
            Tienes mensajes nuevos — entra al negocio y abre el chat.
          </p>
        </div>
      )}
    </div>
  )
}
