'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, ChevronRight, Clock, Package } from 'lucide-react'

// ─── Stages ───────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'proforma',       label: 'Proforma',    icon: '📄' },
  { key: 'aprobada',       label: 'Aprobada',    icon: '✅' },
  { key: 'deposito',       label: 'Depósito',    icon: '💰' },
  { key: 'produccion',     label: 'Producción',  icon: '🏭' },
  { key: 'pago_final',     label: 'Pago final',  icon: '💳' },
  { key: 'enviado_agente', label: 'Al agente',   icon: '📦' },
  { key: 'en_transito',    label: 'En tránsito', icon: '✈️' },
  { key: 'recibido',       label: 'Recibido',    icon: '📥' },
  { key: 'verificando',    label: 'Verificando', icon: '🔍' },
  { key: 'cerrado',        label: 'Cerrado',     icon: '🎉' },
] as const

const STAGE_BADGE: Record<string, string> = {
  proforma:       'bg-gray-100 text-gray-500',
  aprobada:       'bg-blue-50 text-blue-600',
  deposito:       'bg-yellow-50 text-yellow-700',
  produccion:     'bg-orange-50 text-orange-600',
  pago_final:     'bg-orange-50 text-orange-700',
  enviado_agente: 'bg-indigo-50 text-indigo-600',
  en_transito:    'bg-indigo-50 text-indigo-700',
  recibido:       'bg-purple-50 text-purple-600',
  verificando:    'bg-purple-50 text-purple-700',
  cerrado:        'bg-emerald-50 text-emerald-600',
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type Order = {
  id: string
  title: string
  supplier_name: string | null
  status: string
  currency: string
  supplier_total: number | null
  freight_total:  number | null
  production_eta: string | null
  arrival_eta:    string | null
  created_at:     string
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function ImportsListPage() {
  const { partnerId, businessId } = useParams<{ partnerId: string; businessId: string }>()
  const router   = useRouter()
  const supabase = createClient()

  const [orders,        setOrders]        = useState<Order[]>([])
  const [loading,       setLoading]       = useState(true)
  const [businessName,  setBusinessName]  = useState('')
  const [businessColor, setBusinessColor] = useState('#F97316')

  const load = useCallback(async () => {
    const { data: biz } = await supabase
      .from('businesses').select('name,color').eq('id', businessId).single()
    if (biz) { setBusinessName(biz.name); setBusinessColor(biz.color || '#F97316') }

    const { data } = await supabase
      .from('import_orders')
      .select('id,title,supplier_name,status,currency,supplier_total,freight_total,production_eta,arrival_eta,created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    if (data) setOrders(data as Order[])
    setLoading(false)
  }, [businessId, supabase])

  useEffect(() => { load() }, [load])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const stageIndex = (s: string) => STAGES.findIndex(st => st.key === s)
  const stageLabel = (s: string) => STAGES.find(st => st.key === s)?.label ?? s
  const stageIcon  = (s: string) => STAGES.find(st => st.key === s)?.icon ?? '•'

  function nextEta(o: Order) {
    const inProd = ['proforma','aprobada','deposito','produccion'].includes(o.status)
    if (inProd && o.production_eta) return { label: 'Prod.', date: o.production_eta }
    if (o.arrival_eta) return { label: 'Llegada', date: o.arrival_eta }
    return null
  }

  function daysLeft(d: string) {
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-orange-500 animate-spin" />
    </div>
  )

  const activeOrders = orders.filter(o => o.status !== 'cerrado')
  const closedOrders = orders.filter(o => o.status === 'cerrado')

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* Header */}
      <div
        className="px-4 pt-12 pb-4 flex items-center gap-3"
        style={{ backgroundColor: businessColor + '12', borderBottom: `3px solid ${businessColor}25` }}
      >
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center shadow-sm"
        >
          <ArrowLeft size={18} className="text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 truncate">{businessName}</p>
          <h1 className="font-bold text-gray-900 text-lg leading-tight">Importaciones</h1>
        </div>
        <button
          onClick={() => router.push(`/partners/${partnerId}/${businessId}/imports/new`)}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-white text-sm font-bold shadow-sm active:opacity-80"
          style={{ backgroundColor: businessColor }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Nuevo
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">

        {/* Empty state */}
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-24 text-center px-6">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 text-4xl"
              style={{ backgroundColor: businessColor + '18' }}
            >
              🚢
            </div>
            <p className="font-bold text-gray-700 text-lg">Sin importaciones</p>
            <p className="text-sm text-gray-400 mt-2 mb-8 max-w-xs">
              Registra tu primer pedido de importación para comenzar a hacer seguimiento.
            </p>
            <button
              onClick={() => router.push(`/partners/${partnerId}/${businessId}/imports/new`)}
              className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-white font-bold shadow-md active:opacity-80"
              style={{ backgroundColor: businessColor }}
            >
              <Plus size={18} strokeWidth={2.5} />
              Crear importación
            </button>
          </div>
        )}

        {/* Active orders */}
        {activeOrders.length > 0 && (
          <div className="space-y-3">
            {activeOrders.map(o => {
              const idx      = stageIndex(o.status)
              const progress = Math.round((idx / (STAGES.length - 1)) * 100)
              const eta      = nextEta(o)
              const days     = eta ? daysLeft(eta.date) : null

              return (
                <button
                  key={o.id}
                  onClick={() => router.push(`/partners/${partnerId}/${businessId}/imports/${o.id}`)}
                  className="w-full bg-white rounded-2xl border border-gray-100 p-4 text-left shadow-sm active:scale-[0.99] transition-transform"
                >
                  {/* Title + badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">{o.title}</p>
                      {o.supplier_name && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{o.supplier_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STAGE_BADGE[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {stageIcon(o.status)} {stageLabel(o.status)}
                      </span>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: businessColor }}
                    />
                  </div>

                  {/* Bottom row: totals + ETA */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-xs text-gray-400">
                      {o.supplier_total !== null && (
                        <span>Prov: {o.currency} {o.supplier_total.toLocaleString()}</span>
                      )}
                      {o.freight_total !== null && (
                        <span>Flete: {o.currency} {o.freight_total.toLocaleString()}</span>
                      )}
                    </div>
                    {eta && days !== null && (
                      <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                        days < 0   ? 'bg-red-50 text-red-500'
                        : days <= 7 ? 'bg-orange-50 text-orange-500'
                                    : 'bg-gray-50 text-gray-400'
                      }`}>
                        <Clock size={10} />
                        {days < 0
                          ? `${Math.abs(days)}d atraso`
                          : days === 0
                          ? `Hoy · ${eta.label}`
                          : `${days}d · ${eta.label}`}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Closed orders */}
        {closedOrders.length > 0 && (
          <div className={`${activeOrders.length > 0 ? 'mt-8' : ''}`}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-3">
              Cerrados ({closedOrders.length})
            </p>
            <div className="space-y-2">
              {closedOrders.map(o => (
                <button
                  key={o.id}
                  onClick={() => router.push(`/partners/${partnerId}/${businessId}/imports/${o.id}`)}
                  className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-3.5 text-left flex items-center gap-3 active:bg-gray-50"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-700 text-sm truncate">{o.title}</p>
                    {o.supplier_name && (
                      <p className="text-xs text-gray-400 truncate">{o.supplier_name}</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
