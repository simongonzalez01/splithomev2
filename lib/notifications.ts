// ── Notification type definitions ───────────────────────────────
export type NotifType =
  | 'daily_expense'
  | 'daily_business'
  | 'low_stock'
  | 'budget_alert'
  | 'fixed_upcoming'

export interface NotifTypeDef {
  type:         NotifType
  label:        string
  description:  string
  icon:         string
  hasTime:      boolean   // shows reminder_time picker
  hasThreshold: boolean   // shows threshold_pct slider
  defaultTime:  string
}

export const NOTIF_TYPES: NotifTypeDef[] = [
  {
    type:         'daily_expense',
    label:        'Recordatorio de gastos diarios',
    description:  'Te avisa si no has registrado gastos en el día',
    icon:         '💰',
    hasTime:      true,
    hasThreshold: false,
    defaultTime:  '20:00',
  },
  {
    type:         'daily_business',
    label:        'Recordatorio de ventas del negocio',
    description:  'Te avisa si no has registrado movimientos hoy',
    icon:         '🏢',
    hasTime:      true,
    hasThreshold: false,
    defaultTime:  '20:00',
  },
  {
    type:         'low_stock',
    label:        'Stock bajo en inventario',
    description:  'Avisa cuando un producto baja del stock mínimo',
    icon:         '📦',
    hasTime:      false,
    hasThreshold: false,
    defaultTime:  '20:00',
  },
  {
    type:         'budget_alert',
    label:        'Alerta de presupuesto',
    description:  'Avisa cuando el gasto supera un % del presupuesto',
    icon:         '📊',
    hasTime:      false,
    hasThreshold: true,
    defaultTime:  '20:00',
  },
  {
    type:         'fixed_upcoming',
    label:        'Gastos fijos próximos',
    description:  'Recordatorio 3 días antes de un gasto fijo',
    icon:         '📅',
    hasTime:      false,
    hasThreshold: false,
    defaultTime:  '20:00',
  },
]

// Helpers
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
