'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Wallet, Users, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'

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

function calcBalance(acc: Account, txs: TxSummary[]) {
  const mine    = txs.filter(t => t.account_id === acc.id)
  const ingresos = mine.filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0)
  const gastos   = mine.filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0)
  return Number(acc.initial_balance) + ingresos - gastos
}

function fmt(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}$${abs}`
}

export default function PersonalPage() {
  const supabase = createClient()
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [txs,          setTxs]          = useState<TxSummary[]>([])
  const [loading,      setLoading]      = useState(true)
  const [monthIncome,  setMonthIncome]  = useState(0)
  const [monthExpense, setMonthExpense] = useState(0)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const monthStr = new Date().toISOString().slice(0, 7) // YYYY-MM

    const [{ data: accs }, { data: allTxs }, { data: monthTxs }] = await Promise.all([
      supabase.from('savings_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true }),
      supabase.from('savings_transactions')
        .select('account_id, type, amount')
        .eq('user_id', user.id),
      supabase.from('savings_transactions')
        .select('type, amount')
        .eq('user_id', user.id)
        .gte('date', monthStr + '-01')
        .lte('date', monthStr + '-31'),
    ])

    setAccounts(accs ?? [])
    setTxs(allTxs ?? [])

    const inc = (monthTxs ?? []).filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0)
    const exp = (monthTxs ?? []).filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0)
    setMonthIncome(inc)
    setMonthExpense(exp)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const savingsAccounts = accounts.filter(a => a.type === 'savings')
  const personAccounts  = accounts.filter(a => a.type === 'person')
  const totalSavings    = savingsAccounts.reduce((s, a) => s + calcBalance(a, txs), 0)

  const nowLabel = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' })

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 pb-6">

      {/* ── Balance total ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-3xl p-6 mb-4 shadow-lg">
        <p className="text-emerald-100 text-xs font-medium mb-1 uppercase tracking-widest">Total ahorros</p>
        <p className="text-white text-4xl font-bold tracking-tight leading-none">{fmt(totalSavings)}</p>
        <p className="text-emerald-200 text-xs mt-2">
          {savingsAccounts.length} cuenta{savingsAccounts.length !== 1 ? 's' : ''} activa{savingsAccounts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Resumen del mes ───────────────────────────────── */}
      {(monthIncome > 0 || monthExpense > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-emerald-500" strokeWidth={2} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ingresos</span>
            </div>
            <p className="text-emerald-600 font-bold text-lg">{fmt(monthIncome)}</p>
            <p className="text-[10px] text-gray-400 capitalize">{nowLabel}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={14} className="text-red-400" strokeWidth={2} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Gastos</span>
            </div>
            <p className="text-red-500 font-bold text-lg">{fmt(monthExpense)}</p>
            <p className="text-[10px] text-gray-400 capitalize">{nowLabel}</p>
          </div>
        </div>
      )}

      {/* ── Acciones rápidas ─────────────────────────────── */}
      <div className="flex gap-3 mb-6">
        <Link
          href="/personal/transactions?new=1"
          className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:bg-gray-50"
        >
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Plus size={18} className="text-emerald-600" strokeWidth={2.5} />
          </div>
          <span className="text-xs font-semibold text-gray-700 text-center">Nuevo movimiento</span>
        </Link>
        <Link
          href="/personal/accounts?new=1"
          className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-1.5 shadow-sm active:bg-gray-50"
        >
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
            <Wallet size={17} className="text-blue-600" strokeWidth={2} />
          </div>
          <span className="text-xs font-semibold text-gray-700 text-center">Nueva cuenta</span>
        </Link>
      </div>

      {/* ── Mis cuentas de ahorro ────────────────────────── */}
      {savingsAccounts.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Mis cuentas</h2>
            <Link href="/personal/accounts" className="text-[11px] text-emerald-600 font-semibold">Ver todas</Link>
          </div>
          <div className="space-y-3">
            {savingsAccounts.map(acc => {
              const bal = calcBalance(acc, txs)
              return (
                <Link
                  key={acc.id}
                  href={`/personal/transactions?account=${acc.id}`}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: acc.color + '22' }}
                  >
                    <Wallet size={20} style={{ color: acc.color }} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-[15px]">{acc.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-lg ${bal < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                      {fmt(bal)}
                    </p>
                  </div>
                  <ArrowRight size={15} className="text-gray-300 flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Cuentas con personas ─────────────────────────── */}
      {personAccounts.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Con personas</h2>
            <Link href="/personal/accounts" className="text-[11px] text-emerald-600 font-semibold">Ver todas</Link>
          </div>
          <div className="space-y-3">
            {personAccounts.map(acc => {
              const bal = calcBalance(acc, txs)
              // positive = te deben  |  negative = debes tú
              return (
                <Link
                  key={acc.id}
                  href={`/personal/transactions?account=${acc.id}`}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3 active:bg-gray-50"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: acc.color + '22' }}
                  >
                    <Users size={20} style={{ color: acc.color }} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-[15px]">{acc.name}</p>
                    {acc.person_name && (
                      <p className="text-xs text-gray-400 truncate">{acc.person_name}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-lg ${
                      bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {fmt(Math.abs(bal))}
                    </p>
                    <p className="text-[10px] text-gray-400 leading-none">
                      {bal > 0 ? 'te deben' : bal < 0 ? 'debes' : 'al día ✓'}
                    </p>
                  </div>
                  <ArrowRight size={15} className="text-gray-300 flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Estado vacío ─────────────────────────────────── */}
      {accounts.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Wallet size={28} className="text-emerald-400" strokeWidth={1.5} />
          </div>
          <h3 className="font-bold text-gray-800 text-lg mb-2">Tus finanzas personales</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
            Crea tu primera cuenta de ahorro y empieza a registrar tus movimientos.
          </p>
          <Link
            href="/personal/accounts?new=1"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-6 py-3.5 rounded-2xl active:opacity-80 shadow-md text-sm"
          >
            <Plus size={18} strokeWidth={2.5} />
            Crear primera cuenta
          </Link>
        </div>
      )}
    </div>
  )
}
