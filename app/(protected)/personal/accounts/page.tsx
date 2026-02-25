'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Wallet, Users, Pencil, Archive, X, Check, ArchiveRestore,
  CreditCard, ChevronRight, ChevronDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Account = {
  id: string
  name: string
  type: 'savings' | 'person'
  initial_balance: number
  color: string
  person_name: string | null
  is_archived: boolean
}

type TxSummary = {
  account_id: string
  type: 'ingreso' | 'gasto'
  amount: number
}

type Card = {
  id: string
  account_id: string
  name: string
  last_four: string | null
  credit_limit: number
  initial_balance: number
  billing_cycle_day: number | null
  due_day: number | null
  color: string
  is_active: boolean
}

type CardTx = {
  card_id: string
  type: 'cargo' | 'pago'
  amount: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  '#3B82F6', '#22C55E', '#A855F7', '#F97316',
  '#EC4899', '#14B8A6', '#EF4444', '#F59E0B',
  '#6366F1', '#84CC16', '#0EA5E9', '#D946EF',
]

const CARD_COLORS = [
  '#6366F1', '#3B82F6', '#0EA5E9', '#14B8A6',
  '#22C55E', '#F59E0B', '#F97316', '#EF4444',
  '#EC4899', '#A855F7', '#D946EF', '#84CC16',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcBalance(acc: Account, txs: TxSummary[]) {
  const mine     = txs.filter(t => t.account_id === acc.id)
  const ingresos = mine.filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0)
  const gastos   = mine.filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0)
  return Number(acc.initial_balance) + ingresos - gastos
}

function calcCardBalance(card: Card, cardTxs: CardTx[]) {
  const mine   = cardTxs.filter(t => t.card_id === card.id)
  const cargos = mine.filter(t => t.type === 'cargo').reduce((s, t) => s + Number(t.amount), 0)
  const pagos  = mine.filter(t => t.type === 'pago').reduce((s, t) => s + Number(t.amount), 0)
  return Number(card.initial_balance) + cargos - pagos
}

function fmt(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}$${abs}`
}

function daysUntilDue(dueDay: number): number {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const currentDay = today.getDate()
  const dueDate    = new Date(today.getFullYear(), today.getMonth() + (dueDay >= currentDay ? 0 : 1), dueDay)
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const supabase     = createClient()
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [userId,       setUserId]       = useState<string | null>(null)
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [txs,          setTxs]          = useState<TxSummary[]>([])
  const [cards,        setCards]        = useState<Card[]>([])
  const [cardTxs,      setCardTxs]      = useState<CardTx[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [expandedAcc,  setExpandedAcc]  = useState<string | null>(null)

  // Account form
  const [showForm,   setShowForm]   = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [name,       setName]       = useState('')
  const [type,       setType]       = useState<'savings' | 'person'>('savings')
  const [initialBal, setInitialBal] = useState('')
  const [color,      setColor]      = useState(COLORS[0])
  const [personName, setPersonName] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  // Credit card form
  const [showCardForm,    setShowCardForm]    = useState(false)
  const [cardAccountId,   setCardAccountId]   = useState<string | null>(null)
  const [editCardId,      setEditCardId]      = useState<string | null>(null)
  const [cardName,        setCardName]        = useState('')
  const [cardLastFour,    setCardLastFour]    = useState('')
  const [cardLimit,       setCardLimit]       = useState('')
  const [cardInitialBal,  setCardInitialBal]  = useState('0')
  const [cardDueDay,      setCardDueDay]      = useState('')
  const [cardCycleDay,    setCardCycleDay]    = useState('')
  const [cardColor,       setCardColor]       = useState(CARD_COLORS[0])
  const [savingCard,      setSavingCard]      = useState(false)
  const [cardFormError,   setCardFormError]   = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: accs }, { data: allTxs }, { data: allCards }, { data: allCardTxs }] =
      await Promise.all([
        supabase.from('savings_accounts')
          .select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('savings_transactions')
          .select('account_id, type, amount').eq('user_id', user.id),
        supabase.from('savings_credit_cards')
          .select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('savings_credit_card_transactions')
          .select('card_id, type, amount').eq('user_id', user.id),
      ])

    setAccounts(accs ?? [])
    setTxs(allTxs ?? [])
    setCards(allCards ?? [])
    setCardTxs(allCardTxs ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (searchParams.get('new') === '1') openAdd()
  }, [searchParams]) // eslint-disable-line

  // ── Account form helpers ──────────────────────────────────────────────────

  function openAdd() {
    setEditId(null); setName(''); setType('savings')
    setInitialBal('0'); setColor(COLORS[0]); setPersonName('')
    setFormError(''); setShowForm(true)
  }

  function openEdit(acc: Account) {
    setEditId(acc.id); setName(acc.name); setType(acc.type)
    setInitialBal(String(acc.initial_balance))
    setColor(acc.color)
    setPersonName(acc.person_name ?? '')
    setFormError(''); setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    const bal = parseFloat(initialBal)
    if (isNaN(bal))       { setFormError('Ingresa un saldo válido'); return }
    if (!name.trim())     { setFormError('El nombre es requerido'); return }

    setSaving(true)
    const payload = {
      name: name.trim(), type, initial_balance: bal, color,
      person_name: type === 'person' ? (personName.trim() || null) : null,
    }

    if (editId) {
      const { error } = await supabase.from('savings_accounts').update(payload).eq('id', editId)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('savings_accounts').insert({ ...payload, user_id: userId })
      if (error) { setFormError(error.message); setSaving(false); return }
    }

    setSaving(false); setShowForm(false); await load()
  }

  async function toggleArchive(acc: Account) {
    const action = acc.is_archived ? 'restaurar' : 'archivar'
    if (!confirm(`¿Deseas ${action} "${acc.name}"?`)) return
    await supabase.from('savings_accounts').update({ is_archived: !acc.is_archived }).eq('id', acc.id)
    await load()
  }

  // ── Credit card form helpers ──────────────────────────────────────────────

  function openAddCard(accountId: string) {
    setCardAccountId(accountId); setEditCardId(null)
    setCardName(''); setCardLastFour(''); setCardLimit('0')
    setCardInitialBal('0'); setCardDueDay(''); setCardCycleDay('')
    setCardColor(CARD_COLORS[0]); setCardFormError('')
    setShowCardForm(true)
  }

  function openEditCard(card: Card) {
    setCardAccountId(card.account_id); setEditCardId(card.id)
    setCardName(card.name); setCardLastFour(card.last_four ?? '')
    setCardLimit(String(card.credit_limit)); setCardInitialBal(String(card.initial_balance))
    setCardDueDay(card.due_day ? String(card.due_day) : '')
    setCardCycleDay(card.billing_cycle_day ? String(card.billing_cycle_day) : '')
    setCardColor(card.color); setCardFormError('')
    setShowCardForm(true)
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault(); setCardFormError('')
    if (!cardName.trim())       { setCardFormError('El nombre es requerido'); return }
    const limit   = parseFloat(cardLimit)
    const initBal = parseFloat(cardInitialBal)
    if (isNaN(limit) || limit < 0) { setCardFormError('Ingresa un límite válido'); return }
    if (isNaN(initBal))            { setCardFormError('Ingresa un saldo inicial válido'); return }
    const dueDay   = cardDueDay   ? parseInt(cardDueDay)   : null
    const cycleDay = cardCycleDay ? parseInt(cardCycleDay) : null
    if (dueDay && (dueDay < 1 || dueDay > 31))     { setCardFormError('Día de pago: 1-31'); return }
    if (cycleDay && (cycleDay < 1 || cycleDay > 31)) { setCardFormError('Día de corte: 1-31'); return }

    setSavingCard(true)
    const payload = {
      name: cardName.trim(),
      last_four: cardLastFour.trim().slice(0, 4) || null,
      credit_limit: limit,
      initial_balance: initBal,
      due_day: dueDay,
      billing_cycle_day: cycleDay,
      color: cardColor,
    }

    if (editCardId) {
      const { error } = await supabase.from('savings_credit_cards').update(payload).eq('id', editCardId)
      if (error) { setCardFormError(error.message); setSavingCard(false); return }
    } else {
      const { error } = await supabase.from('savings_credit_cards')
        .insert({ ...payload, account_id: cardAccountId, user_id: userId })
      if (error) { setCardFormError(error.message); setSavingCard(false); return }
    }

    setSavingCard(false); setShowCardForm(false); await load()
  }

  async function deleteCard(card: Card) {
    if (!confirm(`¿Eliminar tarjeta "${card.name}"? Se borrarán todos sus movimientos.`)) return
    await supabase.from('savings_credit_cards').delete().eq('id', card.id)
    await load()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const visible    = accounts.filter(a => showArchived ? a.is_archived : !a.is_archived)
  const hasArchived = accounts.some(a => a.is_archived)

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  return (
    <div className="max-w-lg mx-auto">

      {/* ── Encabezado ───────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cuentas</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {accounts.filter(a => !a.is_archived).length} activa{accounts.filter(a => !a.is_archived).length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-2xl active:opacity-80 shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} /> Nueva
        </button>
      </div>

      {/* Toggle archivadas */}
      {hasArchived && (
        <div className="px-4 mb-3">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-xs font-semibold text-gray-400 active:text-gray-600 flex items-center gap-1"
          >
            {showArchived
              ? <><ArchiveRestore size={12} /> Mostrar activas</>
              : <><Archive size={12} /> Ver archivadas ({accounts.filter(a => a.is_archived).length})</>
            }
          </button>
        </div>
      )}

      {/* ── Lista de cuentas ─────────────────────────── */}
      <div className="px-4 space-y-3 pb-6">
        {visible.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Wallet size={36} className="mx-auto mb-3 opacity-20" strokeWidth={1.2} />
            <p className="text-sm">
              {showArchived ? 'No hay cuentas archivadas' : 'Aún no tienes cuentas. ¡Crea la primera!'}
            </p>
          </div>
        ) : (
          visible.map(acc => {
            const bal      = calcBalance(acc, txs)
            const Icon     = acc.type === 'person' ? Users : Wallet
            const accCards = cards.filter(c => c.account_id === acc.id)
            const isExpanded = expandedAcc === acc.id

            return (
              <div key={acc.id} className={`bg-white rounded-2xl border shadow-sm ${acc.is_archived ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                {/* Row principal de la cuenta */}
                <div className="px-4 py-4 flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: acc.color + '22' }}
                  >
                    <Icon size={21} style={{ color: acc.color }} strokeWidth={1.8} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{acc.name}</p>
                    {acc.person_name && <p className="text-xs text-gray-400">{acc.person_name}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Inicial: ${Number(acc.initial_balance).toFixed(2)} ·{' '}
                      <span className="capitalize">{acc.type === 'person' ? 'con persona' : 'ahorro'}</span>
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0 mr-2">
                    {acc.type === 'person' ? (
                      <>
                        <p className={`font-bold text-lg ${bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {fmt(Math.abs(bal))}
                        </p>
                        <p className="text-[10px] text-gray-400 leading-none">
                          {bal > 0 ? 'te deben' : bal < 0 ? 'debes' : 'al día'}
                        </p>
                      </>
                    ) : (
                      <p className={`font-bold text-lg ${bal < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                        {fmt(bal)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(acc)} className="text-gray-300 active:text-blue-500 p-1">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleArchive(acc)} className="text-gray-300 active:text-orange-500 p-1">
                      {acc.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                  </div>
                </div>

                {/* ── Sección tarjetas (solo cuentas de ahorro) ── */}
                {acc.type === 'savings' && !acc.is_archived && (
                  <div className="border-t border-gray-50">
                    {/* Toggle mostrar tarjetas */}
                    <button
                      onClick={() => setExpandedAcc(isExpanded ? null : acc.id)}
                      className="w-full px-4 py-2.5 flex items-center gap-2 text-left active:bg-gray-50"
                    >
                      <CreditCard size={13} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-400">
                        Tarjetas de crédito
                        {accCards.length > 0 && (
                          <span className="ml-1.5 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[10px]">
                            {accCards.length}
                          </span>
                        )}
                      </span>
                      <div className="ml-auto">
                        {isExpanded
                          ? <ChevronDown size={13} className="text-gray-300" />
                          : <ChevronRight size={13} className="text-gray-300" />
                        }
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-2">
                        {accCards.length === 0 && (
                          <p className="text-xs text-gray-400 py-1">Sin tarjetas aún.</p>
                        )}

                        {accCards.map(card => {
                          const cardBal   = calcCardBalance(card, cardTxs)
                          const available = Number(card.credit_limit) - cardBal
                          const used      = card.credit_limit > 0 ? Math.min(cardBal / Number(card.credit_limit), 1) : 0
                          const days      = card.due_day ? daysUntilDue(card.due_day) : null
                          const daysColor = days === null ? 'text-gray-400'
                                          : days <= 3    ? 'text-red-500'
                                          : days <= 7    ? 'text-orange-500'
                                          : 'text-gray-500'

                          return (
                            <div key={card.id} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                              <button
                                onClick={() => router.push(`/personal/cards/${card.id}`)}
                                className="w-full px-3 py-3 flex items-start gap-3 active:bg-gray-100 text-left"
                              >
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                  style={{ backgroundColor: card.color + '22' }}
                                >
                                  <CreditCard size={15} style={{ color: card.color }} strokeWidth={1.8} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-semibold text-gray-800 text-[13px]">{card.name}</p>
                                    {card.last_four && (
                                      <span className="text-[10px] text-gray-400">···{card.last_four}</span>
                                    )}
                                  </div>

                                  {/* Barra de uso */}
                                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${used * 100}%`,
                                        backgroundColor: used > 0.8 ? '#EF4444' : used > 0.5 ? '#F59E0B' : card.color,
                                      }}
                                    />
                                  </div>

                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[11px] text-gray-500">
                                      {fmt(cardBal)} de {fmt(Number(card.credit_limit))}
                                    </span>
                                    {card.due_day && (
                                      <span className={`text-[11px] font-semibold ${daysColor}`}>
                                        · {days === 0 ? '¡Vence hoy!' : days === 1 ? 'Vence mañana' : `Vence en ${days}d`}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />
                              </button>

                              {/* Acciones tarjeta */}
                              <div className="border-t border-gray-100 flex">
                                <button
                                  onClick={() => openEditCard(card)}
                                  className="flex-1 py-2 text-[11px] font-semibold text-gray-400 active:text-blue-500 active:bg-blue-50 flex items-center justify-center gap-1"
                                >
                                  <Pencil size={11} /> Editar
                                </button>
                                <div className="w-px bg-gray-100" />
                                <button
                                  onClick={() => deleteCard(card)}
                                  className="flex-1 py-2 text-[11px] font-semibold text-gray-400 active:text-red-500 active:bg-red-50 flex items-center justify-center gap-1"
                                >
                                  <X size={11} /> Eliminar
                                </button>
                              </div>
                            </div>
                          )
                        })}

                        <button
                          onClick={() => openAddCard(acc.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 active:border-indigo-300 active:text-indigo-500"
                        >
                          <Plus size={13} strokeWidth={2.5} /> Agregar tarjeta
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BOTTOM SHEET — Formulario de cuenta
      ════════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editId ? 'Editar cuenta' : 'Nueva cuenta'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 active:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <form id="account-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 space-y-5 pt-2 pb-4">
              {formError && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{formError}</p>}

              {/* Tipo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                  Tipo de cuenta
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { v: 'savings', emoji: '💰', label: 'Ahorro', desc: 'Banco, efectivo, digital…' },
                    { v: 'person',  emoji: '🤝', label: 'Con persona', desc: 'Préstamos y deudas' },
                  ] as const).map(({ v, emoji, label, desc }) => (
                    <button key={v} type="button" onClick={() => setType(v)}
                      className={`px-3 py-3.5 rounded-2xl border-2 text-left transition-all active:scale-95 ${
                        type === v ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <p className="text-base mb-0.5">{emoji}</p>
                      <p className={`font-semibold text-sm ${type === v ? 'text-emerald-700' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Nombre de la cuenta
                </label>
                <input type="text" required placeholder={type === 'person' ? 'Ej: Cuenta con Juan' : 'Ej: Bank of America'}
                  value={name} onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {type === 'person' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Nombre de la persona <span className="font-normal normal-case">(opcional)</span>
                  </label>
                  <input type="text" placeholder="Ej: Juan Pérez" value={personName}
                    onChange={e => setPersonName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Saldo inicial */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  {type === 'person' ? 'Saldo inicial (+ si te deben · − si debes)' : 'Saldo actual de esta cuenta'}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg pointer-events-none">$</span>
                  <input type="number" required step="0.01" placeholder="0.00" value={initialBal}
                    onChange={e => setInitialBal(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-8 pr-3 py-3.5 text-[17px] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                {type === 'person' && (
                  <p className="text-[11px] text-gray-400 mt-1.5">Usa negativos si debes tú (ej: -50)</p>
                )}
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                        color === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {color === c && <Check size={14} className="text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <button type="button" onClick={() => setShowForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0"
              >
                Cancelar
              </button>
              <button form="account-form" type="submit" disabled={saving}
                className="flex-1 bg-emerald-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90"
              >
                {saving ? 'Guardando…' : editId ? 'Actualizar cuenta' : 'Crear cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          BOTTOM SHEET — Formulario de tarjeta
      ════════════════════════════════════════════════════════════════════════ */}
      {showCardForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCardForm(false)}>
          <div
            className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editCardId ? 'Editar tarjeta' : 'Nueva tarjeta'}
                </h2>
                <button onClick={() => setShowCardForm(false)} className="p-1 text-gray-400 active:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <form id="card-form" onSubmit={handleSaveCard} className="flex-1 overflow-y-auto px-5 space-y-5 pt-2 pb-4">
              {cardFormError && (
                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{cardFormError}</p>
              )}

              {/* Nombre + últimos 4 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Nombre de la tarjeta
                  </label>
                  <input type="text" required placeholder="Ej: Visa Platino" value={cardName}
                    onChange={e => setCardName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Últimos 4
                  </label>
                  <input type="text" maxLength={4} inputMode="numeric" placeholder="1234"
                    value={cardLastFour} onChange={e => setCardLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Límite + saldo actual */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Límite de crédito
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold pointer-events-none">$</span>
                    <input type="number" required min="0" step="0.01" placeholder="0.00" value={cardLimit}
                      onChange={e => setCardLimit(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-7 pr-3 py-3.5 text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Saldo adeudado hoy
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold pointer-events-none">$</span>
                    <input type="number" required min="0" step="0.01" placeholder="0.00" value={cardInitialBal}
                      onChange={e => setCardInitialBal(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-7 pr-3 py-3.5 text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Día de pago + día de corte */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Día de pago
                  </label>
                  <input type="number" min="1" max="31" inputMode="numeric" placeholder="Ej: 15"
                    value={cardDueDay} onChange={e => setCardDueDay(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Día del mes</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                    Día de corte
                  </label>
                  <input type="number" min="1" max="31" inputMode="numeric" placeholder="Ej: 8"
                    value={cardCycleDay} onChange={e => setCardCycleDay(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Opcional</p>
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {CARD_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setCardColor(c)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                        cardColor === c ? 'ring-2 ring-offset-2 ring-gray-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {cardColor === c && <Check size={14} className="text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white flex gap-2"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <button type="button" onClick={() => setShowCardForm(false)}
                className="w-24 border-2 border-gray-200 text-gray-600 font-semibold py-4 rounded-2xl text-sm active:bg-gray-50 flex-shrink-0"
              >
                Cancelar
              </button>
              <button form="card-form" type="submit" disabled={savingCard}
                className="flex-1 bg-indigo-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-[15px] shadow-sm active:opacity-90"
              >
                {savingCard ? 'Guardando…' : editCardId ? 'Actualizar tarjeta' : 'Agregar tarjeta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
