'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ArrowUpDown, AlertCircle, Copy, Check } from 'lucide-react'

interface Tasas {
  bcv: number | null
  binance: number | null
  binanceMedian: number | null
  promedio: number | null
  updatedAt: string
}

function fmtVES(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSD(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export default function TasasPage() {
  const [tasas, setTasas] = useState<Tasas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'usd_to_ves' | 'ves_to_usd'>('usd_to_ves')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const fetchTasas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tasas')
      if (!res.ok) throw new Error('Error al consultar tasas')
      const data: Tasas = await res.json()
      setTasas(data)
    } catch {
      setError('No se pudo obtener las tasas. Revisa tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTasas() }, [fetchTasas])

  // ── Calculator ─────────────────────────────────────────────────────────────
  function calcConvert(rate: number | null): number | null {
    if (!rate || !amount) return null
    const n = parseFloat(amount.replace(',', '.'))
    if (!n || isNaN(n) || n <= 0) return null
    return direction === 'usd_to_ves' ? n * rate : n / rate
  }

  const inputLabel  = direction === 'usd_to_ves' ? 'USD' : 'Bs'
  const outputLabel = direction === 'usd_to_ves' ? 'Bs' : 'USD'

  // time since last update
  function timeSince(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60)  return `hace ${diff}s`
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
    return `hace ${Math.floor(diff / 3600)}h`
  }

  // ── Rate cards config ─────────────────────────────────────────────────────
  const rateCards = [
    {
      key:   'bcv',
      label: 'BCV Oficial',
      emoji: '🏦',
      value: tasas?.bcv,
      note:  'Tasa del día',
      textColor: 'text-blue-600',
      bgColor:   'bg-blue-50',
    },
    {
      key:   'binance',
      label: 'Binance P2P',
      emoji: '📱',
      value: tasas?.binance,
      note:  tasas?.binanceMedian ? `Med: ${fmtVES(tasas.binanceMedian)}` : 'Precio promedio',
      textColor: 'text-amber-600',
      bgColor:   'bg-amber-50',
    },
    {
      key:   'promedio',
      label: 'Promedio',
      emoji: '📊',
      value: tasas?.promedio,
      note:  'BCV + Binance',
      textColor: 'text-orange-600',
      bgColor:   'bg-orange-50',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-screen-sm mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">💱 Tasas del Dólar</h1>
            {tasas && !loading && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Actualizado {timeSince(tasas.updatedAt)}
              </p>
            )}
            {loading && (
              <p className="text-[11px] text-orange-400 mt-0.5 animate-pulse">
                Consultando tasas…
              </p>
            )}
          </div>
          <button
            onClick={fetchTasas}
            disabled={loading}
            className="p-2.5 rounded-xl bg-orange-50 text-orange-500 active:bg-orange-100 transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-screen-sm mx-auto px-4 pt-5 space-y-4">
        {/* ── Error banner ───────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-600">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {/* ── Rate cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5">
          {rateCards.map(({ key, label, emoji, value, note, textColor, bgColor }) => (
            <div
              key={key}
              className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100"
            >
              <div className={`w-8 h-8 rounded-xl ${bgColor} flex items-center justify-center text-base mx-auto`}>
                {emoji}
              </div>
              <div className="text-[9px] font-semibold text-gray-400 mt-1.5 leading-tight uppercase tracking-wide">
                {label}
              </div>
              {loading ? (
                <div className="h-5 bg-gray-100 rounded-lg animate-pulse mt-2 mx-1" />
              ) : value ? (
                <>
                  <div className={`text-[15px] font-bold mt-1.5 ${textColor} leading-none`}>
                    {fmtVES(value)}
                  </div>
                  <div className="text-[9px] text-gray-300 font-medium mt-0.5">Bs/$</div>
                  <div className="text-[9px] text-gray-400 mt-1 leading-tight">{note}</div>
                </>
              ) : (
                <div className="text-xs text-gray-300 mt-2 pb-2">—</div>
              )}
            </div>
          ))}
        </div>

        {/* ── Spread badge ───────────────────────────────────────────────── */}
        {tasas?.bcv && tasas?.binance && (
          <div className="flex items-center justify-center gap-1.5 bg-white rounded-2xl px-4 py-2.5 shadow-sm border border-gray-100">
            <span className="text-[11px] text-gray-500">
              Spread BCV vs Binance:
            </span>
            <span className="text-[12px] font-bold text-orange-500">
              +{(((tasas.binance - tasas.bcv) / tasas.bcv) * 100).toFixed(1)}%
            </span>
            <span className="text-[11px] text-gray-400">
              ({fmtVES(tasas.binance - tasas.bcv)} Bs de diferencia)
            </span>
          </div>
        )}

        {/* ── Calculator ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm">Calculadora</h2>
            <span className="text-[11px] text-gray-400">
              {direction === 'usd_to_ves' ? 'USD → Bolívares' : 'Bolívares → USD'}
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* Input row */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full text-2xl font-bold bg-orange-50 rounded-xl px-4 py-3 pr-14 outline-none text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-orange-200 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-lg">
                  {inputLabel}
                </span>
              </div>
              <button
                onClick={() => {
                  setDirection(d => d === 'usd_to_ves' ? 'ves_to_usd' : 'usd_to_ves')
                  setAmount('')
                }}
                className="p-3 rounded-xl bg-orange-50 text-orange-500 active:bg-orange-100 flex-shrink-0 transition-colors"
                title="Invertir dirección"
              >
                <ArrowUpDown size={20} />
              </button>
            </div>

            {/* Results */}
            <div className="space-y-2">
              {rateCards.map(({ key, label, emoji, value, textColor }) => {
                const result = calcConvert(value ?? null)
                const resultText = result !== null
                  ? direction === 'usd_to_ves'
                    ? `${fmtVES(result)} Bs`
                    : `$ ${fmtUSD(result)}`
                  : null

                function handleCopy() {
                  if (!resultText) return
                  navigator.clipboard.writeText(resultText)
                  setCopiedKey(key)
                  setTimeout(() => setCopiedKey(null), 2000)
                }

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                  >
                    <span className="text-[13px] text-gray-500 flex items-center gap-1.5">
                      <span>{emoji}</span>
                      <span>{label}</span>
                      {value && (
                        <span className="text-[10px] text-gray-300">
                          ({fmtVES(value)} Bs/$)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm ${result !== null ? textColor : 'text-gray-300'}`}>
                        {resultText ?? (loading ? '…' : '—')}
                      </span>
                      {resultText && (
                        <button
                          onClick={handleCopy}
                          className="p-1 rounded-lg text-gray-300 active:text-orange-500 active:bg-orange-50 transition-colors"
                          title="Copiar resultado"
                        >
                          {copiedKey === key
                            ? <Check size={14} className="text-emerald-500" />
                            : <Copy size={14} />
                          }
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Tip */}
            {!amount && (
              <p className="text-center text-[11px] text-gray-300 pb-1">
                Escribe un monto arriba para ver la conversión
              </p>
            )}
          </div>
        </div>

        {/* ── Disclaimer ─────────────────────────────────────────────────── */}
        <p className="text-center text-[10px] text-gray-300 pb-2">
          BCV: fuente oficial · Binance: precio P2P de mercado · Los valores son referenciales
        </p>
      </div>
    </div>
  )
}
