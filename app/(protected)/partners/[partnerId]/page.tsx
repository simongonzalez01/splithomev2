'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  ArrowLeft, Store, ArrowLeftRight, TrendingUp, Plus,
  X, Check, ChevronRight, DollarSign, Wallet,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Profile = { id: string; email: string | null; full_name: string | null }

type SharedBusiness = {
  id: string; name: string; color: string; type: 'ventas' | 'cambio'
  user_id: string; invite_code: string | null
}

type CapitalEntry = {
  id: string; business_id: string; contributed_by: string
  amount: number; description: string | null; date: string
}

type Transfer = {
  id: string; from_user: string; to_user: string
  total_amount: number; currency: string; method: string | null
  date: string; notes: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function displayName(p: Profile | null) { return p?.full_name || p?.email || 'Socio' }
function initials(p: Profile | null) {
  const n = p?.full_name || p?.email || 'S'
  return n.slice(0, 2).toUpperCase()
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PartnerDashboardPage() {
  const supabase    = createClient()
  const { partnerId } = useParams<{ partnerId: string }>()
  const router      = useRouter()

  const [userId,     setUserId]     = useState<string | null>(null)
  const [partner,    setPartner]    = useState<Profile | null>(null)
  const [businesses, setBusinesses] = useState<SharedBusiness[]>([])
  const [capital,    setCapital]    = useState<CapitalEntry[]>([])
  const [transfers,  setTransfers]  = useState<Transfer[]>([])
  const [loading,    setLoading]    = useState(true)

  // ── Transfer form
  const [showTransfer,   setShowTransfer]   = useState(false)
  const [txAmount,       setTxAmount]       = useState('')
  const [txCurrency,     setTxCurrency]     = useState('USD')
  const [txMethod,       setTxMethod]       = useState('')
  const [txDate,         setTxDate]         = useState(todayStr())
  const [txNotes,        setTxNotes]        = useState('')
  const [txDirection,    setTxDirection]    = useState<'sent' | 'received'>('sent')
  const [txSaving,       setTxSaving]       = useState(false)
  const [txError,        setTxError]        = useState('')

  // ─── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    // Perfil del socio
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', partnerId)
      .maybeSingle()

    if (!profile) { router.push('/partners'); return }
    setPartner(profile)

    // Negocios compartidos: donde YO soy dueño y él es miembro
    const { data: ownedBizzes } = await supabase
      .from('businesses')
      .select('id, name, color, type, user_id, invite_code')
      .eq('user_id', user.id)
      .eq('category', 'partner')

    const sharedOwned: SharedBusiness[] = []
    for (const biz of (ownedBizzes ?? [])) {
      const { data: isMember } = await supabase
        .from('business_members')
        .select('id')
        .eq('business_id', biz.id)
        .eq('user_id', partnerId)
        .maybeSingle()
      if (isMember) sharedOwned.push(biz as SharedBusiness)
    }

    // Negocios donde ÉL es dueño y YO soy miembro
    const { data: myMemberships } = await supabase
      .from('business_members')
      .select('business_id')
      .eq('user_id', user.id)

    const memberIds = (myMemberships ?? []).map(m => m.business_id)
    let sharedMember: SharedBusiness[] = []
    if (memberIds.length > 0) {
      const { data: partnerOwned } = await supabase
        .from('businesses')
        .select('id, name, color, type, user_id, invite_code')
        .eq('user_id', partnerId)
        .eq('category', 'partner')
        .in('id', memberIds)
      sharedMember = (partnerOwned ?? []) as SharedBusiness[]
    }

    const allBizzes = [...sharedOwned, ...sharedMember]
    setBusinesses(allBizzes)

    // Capital de todos los negocios compartidos
    if (allBizzes.length > 0) {
      const bizIds = allBizzes.map(b => b.id)
      const { data: capitalData } = await supabase
        .from('business_capital')
        .select('*')
        .in('business_id', bizIds)
        .order('date', { ascending: false })
      setCapital((capitalData ?? []) as CapitalEntry[])
    }

    // Transferencias entre ambos
    const { data: transferData } = await supabase
      .from('partner_transfers')
      .select('*')
      .or(`and(from_user.eq.${user.id},to_user.eq.${partnerId}),and(from_user.eq.${partnerId},to_user.eq.${user.id})`)
      .order('date', { ascending: false })
      .limit(10)
    setTransfers((transferData ?? []) as Transfer[])

    setLoading(false)
  }, [supabase, partnerId, router])

  useEffect(() => { load() }, [load])

  // ─── Capital por negocio ───────────────────────────────────────────────────
  function capitalForBiz(bizId: string) {
    const entries = capital.filter(c => c.business_id === bizId)
    const myTotal      = entries.filter(c => c.contributed_by === userId).reduce((s, c) => s + Number(c.amount), 0)
    const partnerTotal = entries.filter(c => c.contributed_by === partnerId).reduce((s, c) => s + Number(c.amount), 0)
    const total = myTotal + partnerTotal
    return { myTotal, partnerTotal, total }
  }

  // ─── Register transfer ─────────────────────────────────────────────────────
  async function handleSaveTransfer(e: React.FormEvent) {
    e.preventDefault()
    setTxError('')
    const amount = parseFloat(txAmount)
    if (!amount || amount <= 0) { setTxError('Monto inválido'); return }
    setTxSaving(true)

    const fromUser = txDirection === 'sent' ? userId : partnerId
    const toUser   = txDirection === 'sent' ? partnerId : userId

    const { error } = await supabase.from('partner_transfers').insert({
      from_user:    fromUser,
      to_user:      toUser,
      total_amount: amount,
      currency:     txCurrency,
      method:       txMethod.trim() || null,
      date:         txDate,
      notes:        txNotes.trim() || null,
    })

    if (error) { setTxError(error.message); setTxSaving(false); return }
    setTxSaving(false)
    setShowTransfer(false)
    setTxAmount(''); setTxMethod(''); setTxNotes(''); setTxDate(todayStr())
    await load()
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  // Totales globales
  const totalMyCapital      = capital.filter(c => c.contributed_by === userId).reduce((s, c) => s + Number(c.amount), 0)
  const totalPartnerCapital = capital.filter(c => c.contributed_by === partnerId).reduce((s, c) => s + Number(c.amount), 0)
  const totalCapital        = totalMyCapital + totalPartnerCapital

  const totalSent     = transfers.filter(t => t.from_user === userId).reduce((s, t) => s + Number(t.total_amount), 0)
  const totalReceived = transfers.filter(t => t.to_user === userId).reduce((s, t) => s + Number(t.total_amount), 0)

  return (
    <div className="max-w-lg mx-auto">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 active:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div className="w-11 h-11 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
          <span className="text-blue-700 font-bold text-sm">{initials(partner)}</span>
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">{displayName(partner)}</h1>
          {partner?.full_name && partner.email && (
            <p className="text-xs text-gray-400">{partner.email}</p>
          )}
        </div>
      </div>

      {/* Resumen global de capital */}
      {totalCapital > 0 && (
        <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Capital total invertido
          </p>
          <div className="space-y-2">
            {[
              { label: 'Tu capital',           amount: totalMyCapital,      pct: totalCapital ? (totalMyCapital / totalCapital) * 100 : 0 },
              { label: displayName(partner),   amount: totalPartnerCapital, pct: totalCapital ? (totalPartnerCapital / totalCapital) * 100 : 0 },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{row.pct.toFixed(0)}%</span>
                    <span className="font-bold text-gray-900 text-sm">{fmt(row.amount)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full transition-all"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-100 flex justify-between">
              <span className="text-sm font-semibold text-gray-700">Total</span>
              <span className="font-bold text-gray-900">{fmt(totalCapital)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Negocios compartidos */}
      <div className="px-4 mb-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Negocios compartidos ({businesses.length})
        </p>

        {businesses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-6 text-center">
            <p className="text-sm text-gray-400">Aún no hay negocios compartidos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {businesses.map(biz => {
              const cap = capitalForBiz(biz.id)
              const myPct      = cap.total ? (cap.myTotal / cap.total) * 100 : 0
              const partnerPct = cap.total ? (cap.partnerTotal / cap.total) * 100 : 0

              return (
                <Link
                  key={biz.id}
                  href={`/partners/${partnerId}/${biz.id}`}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm active:bg-gray-50"
                >
                  {/* Negocio header */}
                  <div className="px-4 pt-3.5 pb-2 flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: biz.color + '22' }}
                    >
                      {biz.type === 'cambio'
                        ? <ArrowLeftRight size={18} style={{ color: biz.color }} strokeWidth={1.8} />
                        : <Store size={18} style={{ color: biz.color }} strokeWidth={1.8} />
                      }
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-[14px]">{biz.name}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        biz.type === 'cambio' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'
                      }`}>
                        {biz.type === 'cambio' ? '💱 Cambio' : '🛒 Ventas'}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>

                  {/* Capital del negocio */}
                  {cap.total > 0 ? (
                    <div className="px-4 pb-3.5 border-t border-gray-50 pt-2.5">
                      <div className="flex gap-3 text-xs">
                        <div className="flex-1 bg-orange-50 rounded-xl px-3 py-2">
                          <p className="text-gray-400 mb-0.5">Tu capital</p>
                          <p className="font-bold text-gray-900">{fmt(cap.myTotal)}</p>
                          <p className="text-orange-500 font-semibold">{myPct.toFixed(0)}%</p>
                        </div>
                        <div className="flex-1 bg-blue-50 rounded-xl px-3 py-2">
                          <p className="text-gray-400 mb-0.5">{displayName(partner)}</p>
                          <p className="font-bold text-gray-900">{fmt(cap.partnerTotal)}</p>
                          <p className="text-blue-500 font-semibold">{partnerPct.toFixed(0)}%</p>
                        </div>
                        <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                          <p className="text-gray-400 mb-0.5">Total</p>
                          <p className="font-bold text-gray-900">{fmt(cap.total)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 pb-3 border-t border-gray-50 pt-2">
                      <p className="text-xs text-gray-400">Sin aportes de capital aún</p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Transferencias */}
      <div className="px-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Transferencias
          </p>
          <button
            onClick={() => { setShowTransfer(true); setTxError('') }}
            className="flex items-center gap-1 text-[11px] font-bold text-orange-500"
          >
            <Plus size={13} strokeWidth={2.5} /> Registrar
          </button>
        </div>

        {/* Resumen enviado / recibido */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-red-50 rounded-2xl px-3 py-2.5">
            <p className="text-[10px] text-gray-400 mb-0.5">Enviaste</p>
            <p className="font-bold text-gray-900 text-sm">{fmt(totalSent)}</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl px-3 py-2.5">
            <p className="text-[10px] text-gray-400 mb-0.5">Recibiste</p>
            <p className="font-bold text-gray-900 text-sm">{fmt(totalReceived)}</p>
          </div>
        </div>

        {transfers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-5 text-center">
            <DollarSign size={24} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Sin transferencias registradas</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {transfers.map(t => {
              const isSent = t.from_user === userId
              return (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isSent ? 'bg-red-50' : 'bg-emerald-50'
                  }`}>
                    <TrendingUp size={14} className={isSent ? 'text-red-400 rotate-180' : 'text-emerald-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {isSent ? `Enviaste a ${displayName(partner)}` : `Recibiste de ${displayName(partner)}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {fmtDate(t.date)}{t.method ? ` · ${t.method}` : ''}
                      {t.notes ? ` · ${t.notes}` : ''}
                    </p>
                  </div>
                  <span className={`font-bold text-sm flex-shrink-0 ${isSent ? 'text-red-500' : 'text-emerald-600'}`}>
                    {isSent ? '-' : '+'}{fmt(t.total_amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal: Registrar transferencia ──────────────────────────────── */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowTransfer(false)}>
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Registrar transferencia</h2>
                <button onClick={() => setShowTransfer(false)} className="p-1 text-gray-400">
                  <X size={20} />
                </button>
              </div>
            </div>

            <form id="tx-form" onSubmit={handleSaveTransfer}
              className="flex-1 overflow-y-auto px-5 pt-2 pb-4 space-y-4">
              {txError && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{txError}</p>
              )}

              {/* Dirección */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  ¿Quién envió?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button" onClick={() => setTxDirection('sent')}
                    className={`py-3 px-4 rounded-2xl text-sm font-semibold border-2 transition-all ${
                      txDirection === 'sent'
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    📤 Yo envié
                  </button>
                  <button
                    type="button" onClick={() => setTxDirection('received')}
                    className={`py-3 px-4 rounded-2xl text-sm font-semibold border-2 transition-all ${
                      txDirection === 'received'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    📥 Yo recibí
                  </button>
                </div>
              </div>

              {/* Monto y moneda */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Monto
                  </label>
                  <input
                    type="number" required min="0.01" step="0.01"
                    placeholder="0.00" value={txAmount}
                    onChange={e => setTxAmount(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white"
                  />
                </div>
                <div className="w-28">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Moneda
                  </label>
                  <select
                    value={txCurrency} onChange={e => setTxCurrency(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="USD">USD</option>
                    <option value="BS">Bs</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              {/* Método */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Método <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text" placeholder="Ej: Zelle, efectivo, Binance…" value={txMethod}
                  onChange={e => setTxMethod(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white"
                />
              </div>

              {/* Fecha */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Fecha</label>
                <input
                  type="date" required value={txDate} onChange={e => setTxDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white"
                />
              </div>

              {/* Notas */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Notas <span className="font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="text" placeholder="Ej: Pago de ventas semana 10" value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white"
                />
              </div>
            </form>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setShowTransfer(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm flex-shrink-0">
                Cancelar
              </button>
              <button form="tx-form" type="submit" disabled={txSaving}
                className="flex-1 bg-orange-500 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm">
                {txSaving ? 'Guardando…' : 'Guardar transferencia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
