'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Copy, Check, LogOut, ChevronRight, X, Plus } from 'lucide-react'

type Member = { user_id: string; display_name: string | null }
type Settlement = { id: string; from_user: string; to_user: string; amount: number; date: string; note: string | null; created_by: string }

function todayStr() { return new Date().toISOString().split('T')[0] }
function monthFirst() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function monthLast() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(0)
  return d.toISOString().split('T')[0]
}

export default function ProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [familyName, setFamilyName] = useState('')
  const [familyCode, setFamilyCode] = useState('')
  const [members,        setMembers]        = useState<Member[]>([])
  const [settlements,    setSettlements]    = useState<Settlement[]>([])
  const [loading,        setLoading]        = useState(true)
  const [copied,         setCopied]         = useState(false)
  const [isCreator,      setIsCreator]      = useState(false)
  const [removingMember, setRemovingMember] = useState<string | null>(null)

  // Settlement form
  const [showSettle, setShowSettle] = useState(false)
  const [fromUser, setFromUser] = useState('')
  const [toUser, setToUser] = useState('')
  const [settleAmount, setSettleAmount] = useState('')
  const [settleNote, setSettleNote] = useState('')
  const [settleDate, setSettleDate] = useState(todayStr())
  const [addingSettle, setAddingSettle] = useState(false)
  const [settleError, setSettleError] = useState('')

  const memberName = (uid: string) => members.find(m => m.user_id === uid)?.display_name || uid.slice(0, 8)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id); setEmail(user.email ?? null); setFromUser(user.id)
      const { data: profile } = await supabase.from('profiles').select('display_name, family_id').eq('user_id', user.id).single()
      setDisplayName(profile?.display_name ?? '')
      if (profile?.family_id) {
        setFamilyId(profile.family_id)
        const { data: fam } = await supabase.from('families').select('name, code, created_by').eq('id', profile.family_id).single()
        setFamilyName(fam?.name ?? ''); setFamilyCode(fam?.code ?? '')
        setIsCreator(fam?.created_by === user.id)
        const { data: mems } = await supabase.from('profiles').select('user_id, display_name').eq('family_id', profile.family_id)
        setMembers(mems ?? [])
        const other = (mems ?? []).find(m => m.user_id !== user.id)
        if (other) setToUser(other.user_id)
        const { data: settles } = await supabase.from('settlements').select('*')
          .eq('family_id', profile.family_id).gte('date', monthFirst()).lte('date', monthLast())
          .order('created_at', { ascending: false })
        setSettlements(settles ?? [])
      }
      setLoading(false)
    }
    init()
  }, [supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login'); router.refresh()
  }

  function copyCode() {
    if (familyCode) {
      navigator.clipboard.writeText(familyCode)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleAddSettlement(e: React.FormEvent) {
    e.preventDefault(); setSettleError('')
    const amt = parseFloat(settleAmount)
    if (isNaN(amt) || amt <= 0) { setSettleError('Monto inválido'); return }
    if (fromUser === toUser) { setSettleError('Los usuarios deben ser diferentes'); return }
    setAddingSettle(true)
    const { data, error } = await supabase.from('settlements').insert({
      family_id: familyId, from_user: fromUser, to_user: toUser,
      amount: amt, date: settleDate, note: settleNote || null, created_by: userId,
    }).select().single()
    if (error) { setSettleError(error.message); setAddingSettle(false); return }
    setSettlements(prev => [data as Settlement, ...prev])
    setSettleAmount(''); setSettleNote(''); setShowSettle(false)
    setAddingSettle(false)
  }

  async function deleteSettlement(id: string) {
    await supabase.from('settlements').delete().eq('id', id)
    setSettlements(prev => prev.filter(s => s.id !== id))
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!confirm(`¿Eliminar a ${memberName} de la familia? Perderá acceso a los gastos compartidos.`)) return
    setRemovingMember(memberId)
    await supabase.from('profiles').update({ family_id: null }).eq('user_id', memberId)
    setMembers(prev => prev.filter(m => m.user_id !== memberId))
    setRemovingMember(null)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>

  const initials = (displayName || email || 'U')[0].toUpperCase()

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Perfil</h1>

      {/* User info */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-lg truncate">{displayName || 'Sin nombre'}</p>
            <p className="text-sm text-gray-400 truncate">{email}</p>
          </div>
        </div>
      </section>

      {/* Family */}
      {familyId ? (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Mi Familia</h2>
          <p className="text-sm text-gray-600 font-medium">{familyName}</p>

          {/* Code */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-xs font-semibold text-blue-600 mb-2">Código de invitación</p>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black font-mono tracking-widest text-blue-800">{familyCode}</span>
              <button onClick={copyCode}
                className="ml-auto flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl active:opacity-80">
                {copied
                  ? <><Check size={14} strokeWidth={3} /> Copiado</>
                  : <><Copy size={14} /> Copiar</>
                }
              </button>
            </div>
            <p className="text-xs text-blue-500 mt-2">Comparte este código para invitar a tu familia</p>
          </div>

          {/* Members */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Miembros ({members.length})</p>
            <div className="space-y-2">
              {members.map(m => {
                const isSelf    = m.user_id === userId
                const canRemove = isCreator && !isSelf
                const name      = m.display_name || 'Sin nombre'
                return (
                  <div key={m.user_id} className="flex items-center gap-3 py-1">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                      {(m.display_name ?? '?')[0].toUpperCase()}
                    </div>
                    <p className="text-sm font-medium text-gray-800 flex-1">
                      {name}
                      {isSelf && <span className="ml-1 text-xs text-blue-400">(tú)</span>}
                      {isCreator && isSelf && <span className="ml-1 text-xs text-amber-500">· Admin</span>}
                    </p>
                    {canRemove && (
                      <button
                        onClick={() => handleRemoveMember(m.user_id, name)}
                        disabled={removingMember === m.user_id}
                        className="text-gray-300 active:text-red-500 disabled:opacity-50 p-1 flex-shrink-0"
                        title={`Eliminar a ${name}`}
                      >
                        {removingMember === m.user_id
                          ? <span className="text-[10px] text-gray-400">…</span>
                          : <X size={15} strokeWidth={2} />
                        }
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-yellow-50 rounded-2xl border border-yellow-200 p-5 text-center">
          <p className="text-yellow-800 font-medium mb-3">No perteneces a ninguna familia aún.</p>
          <Link href="/family" className="bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm">
            Crear / Unirse a familia →
          </Link>
        </section>
      )}

      {/* Settlements */}
      {familyId && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800">Pagos / Liquidaciones</h2>
            <button onClick={() => setShowSettle(true)}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-xl font-semibold">
              <Plus size={12} strokeWidth={2.5} /> Registrar
            </button>
          </div>

          {settlements.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Sin pagos este mes.</p>
          ) : (
            <div className="space-y-2">
              {settlements.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      <span className="text-blue-600">{memberName(s.from_user)}</span>
                      {' → '}
                      <span className="text-green-600">{memberName(s.to_user)}</span>
                    </p>
                    <p className="text-xs text-gray-400">{s.date}{s.note ? ` · ${s.note}` : ''}</p>
                  </div>
                  <span className="font-bold text-gray-900">${Number(s.amount).toFixed(2)}</span>
                  {s.created_by === userId && (
                    <button onClick={() => deleteSettlement(s.id)} className="text-gray-300 active:text-red-400 p-1">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Settlement form sheet */}
      {showSettle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowSettle(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5 space-y-3"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-1" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Registrar pago</h2>
              <button onClick={() => setShowSettle(false)} className="text-gray-400 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddSettlement} className="space-y-3">
              {settleError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{settleError}</p>}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">De</label>
                  <select value={fromUser} onChange={e => setFromUser(e.target.value)}
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.user_id.slice(0, 8)}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Para</label>
                  <select value={toUser} onChange={e => setToUser(e.target.value)}
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.user_id.slice(0, 8)}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <input type="number" required min="0.01" step="0.01" placeholder="Monto $"
                  value={settleAmount} onChange={e => setSettleAmount(e.target.value)}
                  className="flex-1 border border-gray-200 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input type="date" required value={settleDate} onChange={e => setSettleDate(e.target.value)}
                  className="flex-1 border border-gray-200 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <input type="text" placeholder="Nota (opcional)" value={settleNote} onChange={e => setSettleNote(e.target.value)}
                className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowSettle(false)}
                  className="flex-1 border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl">Cancelar</button>
                <button type="submit" disabled={addingSettle}
                  className="flex-1 bg-blue-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl">
                  {addingSettle ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick links */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        <Link href="/history" className="flex items-center gap-3 px-5 py-4 active:bg-gray-50">
          <span className="text-xl">📊</span>
          <span className="text-sm font-medium text-gray-800">Historial de meses</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/budgets" className="flex items-center gap-3 px-5 py-4 active:bg-gray-50">
          <span className="text-xl">💰</span>
          <span className="text-sm font-medium text-gray-800">Presupuestos</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
      </section>

      {/* Logout */}
      <button onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 font-semibold py-4 rounded-2xl text-sm active:opacity-80">
        <LogOut size={16} />
        Cerrar sesión
      </button>
    </div>
  )
}
