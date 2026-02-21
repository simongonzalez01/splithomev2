export type Category = { value: string; label: string; group: string }

export const CATEGORIES: Category[] = [
  // Vivienda
  { value: 'Rent/Mortgage',       label: 'Alquiler / Hipoteca',     group: 'Vivienda' },
  { value: 'HOA',                  label: 'Cuotas HOA',              group: 'Vivienda' },
  { value: 'Repairs',              label: 'Reparaciones',             group: 'Vivienda' },
  // Servicios
  { value: 'Electric',             label: 'Electricidad',             group: 'Servicios' },
  { value: 'Water',                label: 'Agua',                     group: 'Servicios' },
  { value: 'Internet',             label: 'Internet',                 group: 'Servicios' },
  { value: 'Phone',                label: 'Teléfono',                 group: 'Servicios' },
  // Carro
  { value: 'Car Payment',          label: 'Cuota del carro',          group: 'Carro' },
  { value: 'Gas',                  label: 'Gasolina',                 group: 'Carro' },
  { value: 'Car Insurance',        label: 'Seguro del carro',         group: 'Carro' },
  { value: 'Car Maintenance',      label: 'Mantenimiento',            group: 'Carro' },
  { value: 'Tolls/Parking',        label: 'Peajes / Parqueo',        group: 'Carro' },
  // Bebé
  { value: 'Diapers',              label: 'Pañales',                  group: 'Bebé' },
  { value: 'Wipes',                label: 'Toallitas',                group: 'Bebé' },
  { value: 'Formula/Food',         label: 'Fórmula / Comida',        group: 'Bebé' },
  { value: 'Baby Clothing',        label: 'Ropa bebé',               group: 'Bebé' },
  { value: 'Pediatrician',         label: 'Pediatra / Farmacia',     group: 'Bebé' },
  { value: 'Daycare',              label: 'Guardería',                group: 'Bebé' },
  { value: 'Toys',                 label: 'Juguetes',                 group: 'Bebé' },
  // Hogar
  { value: 'Groceries',            label: 'Mercado',                  group: 'Hogar' },
  { value: 'Household Supplies',   label: 'Artículos del hogar',     group: 'Hogar' },
  { value: 'Cleaning',             label: 'Aseo',                     group: 'Hogar' },
  // Salud
  { value: 'Medical',              label: 'Médico',                   group: 'Salud' },
  { value: 'Dental',               label: 'Dental',                   group: 'Salud' },
  { value: 'Vision',               label: 'Visión / Óptica',         group: 'Salud' },
  { value: 'Pharmacy',             label: 'Farmacia',                 group: 'Salud' },
  // Trabajo
  { value: 'Commute',              label: 'Transporte trabajo',       group: 'Trabajo' },
  { value: 'Work Meals',           label: 'Comidas trabajo',          group: 'Trabajo' },
  { value: 'Tools',                label: 'Herramientas',             group: 'Trabajo' },
  // Suscripciones
  { value: 'Netflix',              label: 'Netflix',                  group: 'Suscripciones' },
  { value: 'YouTube Premium',      label: 'YouTube Premium',          group: 'Suscripciones' },
  { value: 'Spotify',              label: 'Spotify',                  group: 'Suscripciones' },
  { value: 'iCloud',               label: 'iCloud',                   group: 'Suscripciones' },
  { value: 'Amazon Prime',         label: 'Amazon Prime',             group: 'Suscripciones' },
  { value: 'Other Subscription',   label: 'Otra suscripción',        group: 'Suscripciones' },
  // Otros
  { value: 'Gifts',                label: 'Regalos',                  group: 'Otros' },
  { value: 'Entertainment',        label: 'Entretenimiento',          group: 'Otros' },
  { value: 'Travel',               label: 'Viajes',                   group: 'Otros' },
  { value: 'Misc',                 label: 'Misceláneos',             group: 'Otros' },
]

export const DEFAULT_CATEGORY = 'Groceries'

export const CATEGORY_GROUPS = [...new Set(CATEGORIES.map(c => c.group))]

export function getCategoryLabel(value: string) {
  return CATEGORIES.find(c => c.value === value)?.label ?? value
}

// Color map for category tiles in forms
export const GROUP_COLORS: Record<string, { tile: string; selected: string }> = {
  'Vivienda':      { tile: 'bg-blue-50 text-blue-700 border-blue-100',    selected: 'bg-blue-600 text-white border-blue-600' },
  'Servicios':     { tile: 'bg-amber-50 text-amber-700 border-amber-100', selected: 'bg-amber-500 text-white border-amber-500' },
  'Carro':         { tile: 'bg-slate-50 text-slate-700 border-slate-200', selected: 'bg-slate-600 text-white border-slate-600' },
  'Bebé':          { tile: 'bg-pink-50 text-pink-700 border-pink-100',    selected: 'bg-pink-500 text-white border-pink-500' },
  'Hogar':         { tile: 'bg-green-50 text-green-700 border-green-100', selected: 'bg-green-600 text-white border-green-600' },
  'Salud':         { tile: 'bg-red-50 text-red-700 border-red-100',       selected: 'bg-red-500 text-white border-red-500' },
  'Trabajo':       { tile: 'bg-purple-50 text-purple-700 border-purple-100', selected: 'bg-purple-600 text-white border-purple-600' },
  'Suscripciones': { tile: 'bg-indigo-50 text-indigo-700 border-indigo-100', selected: 'bg-indigo-600 text-white border-indigo-600' },
  'Otros':         { tile: 'bg-gray-50 text-gray-600 border-gray-200',   selected: 'bg-gray-700 text-white border-gray-700' },
}

// Presets for Fixed Expenses
export const FIXED_PRESETS = [
  { name: 'Netflix',         category: 'Netflix',          amount: 15.99 },
  { name: 'YouTube Premium', category: 'YouTube Premium',  amount: 13.99 },
  { name: 'Spotify',         category: 'Spotify',          amount: 9.99  },
  { name: 'iCloud',          category: 'iCloud',           amount: 2.99  },
  { name: 'Amazon Prime',    category: 'Amazon Prime',     amount: 14.99 },
  { name: 'Alquiler',        category: 'Rent/Mortgage',    amount: 0     },
  { name: 'Electricidad',    category: 'Electric',         amount: 0     },
  { name: 'Agua',            category: 'Water',            amount: 0     },
  { name: 'Internet',        category: 'Internet',         amount: 0     },
  { name: 'Teléfono',        category: 'Phone',            amount: 0     },
  { name: 'Cuota del carro', category: 'Car Payment',      amount: 0     },
  { name: 'Seguro del carro',category: 'Car Insurance',    amount: 0     },
  { name: 'Guardería',       category: 'Daycare',          amount: 0     },
]
