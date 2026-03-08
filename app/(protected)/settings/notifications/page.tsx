'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { NOTIF_TYPES, type NotifType } from '@/lib/notifications'
import {
  Bell, BellOff, ChevronLeft, Check, Loader2,
  Smartphone, AlertTriangle,
} from 'lucide-react'

type Pref = {
  type:          NotifType
  enabled:       boolean
  reminder_time: string
  threshold_pct: number
}

function defaultPref(type: NotifType): Pref {
  return { type, enabled: true, reminder_time: '20:00', threshold_pct: 80 }
}

export default function NotificationSettingsPage() {
  const router   = useRouter()
  const supabase = createClient()
  const push     = usePushNotifications()

  const [prefs,   setPrefs]   = useState<Record<NotifType, Pref>>(() =>
    Object.fromEntries(NOTIF_TYPES.map(t => [t.type, defaultPref(t.type)])) as Record<NotifType, Pref>
  )
  const [saving,  setSaving]  = useState<NotifType | null>(null)
  const [saved,   setSaved]   = useState<NotifType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadPrefs() }, [])

  async function loadPrefs() {
    const { data } = await supabase.from('notification_preferences').select('*')
    if (data && data.length > 0) {
      setPrefs(prev => {
        const next = { ...prev }
        for (const row of data) {
          if (next[row.type as NotifType]) {
            next[row.type as NotifType] = {
              type:          row.type,
              enabled:       row.enabled,
              reminder_time: row.reminder_time ?? '20:00',
              threshold_pct: row.threshold_pct ?? 80,
            }
          }
        }
        return next
      })
    }
    setLoading(false)
  }

  async function savePref(type: NotifType, patch: Partial<Pref>) {
    setSaving(type)
    const updated = { ...prefs[type], ...patch }
    setPrefs(prev => ({ ...prev, [type]: updated }))

    await supabase.from('notification_preferences').upsert(
      {
        type:          updated.type,
        enabled:       updated.enabled,
        reminder_time: updated.reminder_time,
        threshold_pct: updated.threshold_pct,
      },
      { onConflict: 'user_id,type' }
    )
    setSaving(null)
    setSaved(type)
    setTimeout(() => setSaved(null), 1500)
  }

  const pushLabel = {
    loading:      'Cargando...',
    unsupported:  'No compatible con este navegador',
    denied:       'Notificaciones bloqueadas por el navegador',
    subscribed:   'Notificaciones activas en este dispositivo',
    unsubscribed: 'Activar notificaciones en este dispositivo',
  }[push.state]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f6fa' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
          <ChevronLeft size={18} className="text-gray-600" />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 text-base">Notificaciones</h1>
          <p className="text-xs text-gray-500">Elige qué alertas quieres recibir</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

        {/* ── Web Push toggle ───────────────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone size={15} className="text-blue-500" />
            <h2 className="font-bold text-gray-900 text-sm">Notificaciones en el dispositivo</h2>
          </div>

          {push.state === 'denied' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Tienes las notificaciones bloqueadas en el navegador. Ve a Configuración → Sitio → Notificaciones para habilitarlas.</span>
            </div>
          )}

          {push.state === 'unsupported' && (
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-600">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Tu navegador no soporta notificaciones push. En iPhone, agrega la app a la pantalla de inicio e inténtalo de nuevo.</span>
            </div>
          )}

          <button
            disabled={push.state === 'loading' || push.state === 'denied' || push.state === 'unsupported'}
            onClick={() => push.state === 'subscribed' ? push.unsubscribe() : push.subscribe()}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all
              ${push.state === 'subscribed'
                ? 'bg-blue-50 border-blue-400 text-blue-700'
                : push.state === 'denied' || push.state === 'unsupported'
                  ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
              }`}
          >
            <div className="flex items-center gap-3">
              {push.state === 'loading'
                ? <Loader2 size={18} className="animate-spin text-gray-400" />
                : push.state === 'subscribed'
                  ? <Bell size={18} />
                  : <BellOff size={18} />
              }
              <span className="text-sm font-semibold">{pushLabel}</span>
            </div>
            {push.state === 'subscribed' && (
              <span className="text-xs font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">Activo</span>
            )}
          </button>
          <p className="text-[10px] text-gray-400 px-1">
            Recibirás notificaciones aunque la app esté cerrada. Las notificaciones se envían una vez al día.
          </p>
        </div>

        {/* ── Notification types ─────────────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-sm divide-y divide-gray-50 overflow-hidden">
          <div className="px-4 py-3">
            <h2 className="font-bold text-gray-900 text-sm">Tipos de recordatorios</h2>
            <p className="text-xs text-gray-400 mt-0.5">Personaliza qué y cuándo recibes cada alerta</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : (
            NOTIF_TYPES.map(def => {
              const pref = prefs[def.type]
              return (
                <div key={def.type} className="px-4 py-4 space-y-3">
                  {/* Toggle row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className="text-xl leading-none mt-0.5">{def.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{def.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{def.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {saved === def.type && (
                        <Check size={14} className="text-green-500" />
                      )}
                      {saving === def.type && (
                        <Loader2 size={14} className="animate-spin text-gray-400" />
                      )}
                      <button
                        onClick={() => savePref(def.type, { enabled: !pref.enabled })}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                          pref.enabled ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                        role="switch"
                        aria-checked={pref.enabled}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                          pref.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Time picker (daily types) */}
                  {pref.enabled && def.hasTime && (
                    <div className="ml-8 flex items-center gap-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Hora del recordatorio
                      </label>
                      <input
                        type="time"
                        value={pref.reminder_time}
                        onChange={e => setPrefs(prev => ({
                          ...prev,
                          [def.type]: { ...prev[def.type], reminder_time: e.target.value }
                        }))}
                        onBlur={e => savePref(def.type, { reminder_time: e.target.value })}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <span className="text-[10px] text-gray-400">(en tu zona horaria)</span>
                    </div>
                  )}

                  {/* Threshold (budget alert) */}
                  {pref.enabled && def.hasThreshold && (
                    <div className="ml-8 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Alertar cuando supere el
                        </label>
                        <span className="text-sm font-bold text-blue-600">{pref.threshold_pct}%</span>
                      </div>
                      <input
                        type="range"
                        min={50} max={100} step={5}
                        value={pref.threshold_pct}
                        onChange={e => setPrefs(prev => ({
                          ...prev,
                          [def.type]: { ...prev[def.type], threshold_pct: Number(e.target.value) }
                        }))}
                        onMouseUp={e => savePref(def.type, { threshold_pct: Number((e.target as HTMLInputElement).value) })}
                        onTouchEnd={e => savePref(def.type, { threshold_pct: Number((e.target as HTMLInputElement).value) })}
                        className="w-full accent-blue-500"
                      />
                      <div className="flex justify-between text-[9px] text-gray-300">
                        <span>50%</span><span>75%</span><span>100%</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Info */}
        <p className="text-[10px] text-gray-400 text-center px-4 pb-6">
          Las notificaciones se procesan una vez por día. La hora exacta puede variar ±1 hora según el servidor.
        </p>
      </div>
    </div>
  )
}
