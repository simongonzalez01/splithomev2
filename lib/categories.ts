export type Category = { value: string; label: string; group: string }

export const CATEGORIES: Category[] = [
  // Vivienda
  { value: 'Rent/Mortgage',       label: 'Rent / Mortgage',         group: 'Vivienda' },
  { value: 'HOA',                  label: 'HOA',                     group: 'Vivienda' },
  { value: 'Repairs',              label: 'Repairs',                  group: 'Vivienda' },
  // Servicios
  { value: 'Electric',             label: 'Electric',                 group: 'Servicios' },
  { value: 'Water',                label: 'Water',                    group: 'Servicios' },
  { value: 'Internet',             label: 'Internet',                 group: 'Servicios' },
  { value: 'Phone',                label: 'Phone',                    group: 'Servicios' },
  // Carro
  { value: 'Car Payment',          label: 'Car Payment',              group: 'Carro' },
  { value: 'Gas',                  label: 'Gas',                      group: 'Carro' },
  { value: 'Car Insurance',        label: 'Car Insurance',            group: 'Carro' },
  { value: 'Car Maintenance',      label: 'Car Maintenance',          group: 'Carro' },
  { value: 'Tolls/Parking',        label: 'Tolls / Parking',         group: 'Carro' },
  // Bebé
  { value: 'Diapers',              label: 'Diapers',                  group: 'Bebé' },
  { value: 'Wipes',                label: 'Wipes',                    group: 'Bebé' },
  { value: 'Formula/Food',         label: 'Formula / Food',           group: 'Bebé' },
  { value: 'Baby Clothing',        label: 'Baby Clothing',            group: 'Bebé' },
  { value: 'Pediatrician',         label: 'Pediatrician / Pharmacy',  group: 'Bebé' },
  { value: 'Daycare',              label: 'Daycare',                  group: 'Bebé' },
  { value: 'Toys',                 label: 'Toys',                     group: 'Bebé' },
  // Hogar
  { value: 'Groceries',            label: 'Groceries',                group: 'Hogar' },
  { value: 'Household Supplies',   label: 'Household Supplies',       group: 'Hogar' },
  { value: 'Cleaning',             label: 'Cleaning',                 group: 'Hogar' },
  // Salud
  { value: 'Medical',              label: 'Medical',                  group: 'Salud' },
  { value: 'Dental',               label: 'Dental',                   group: 'Salud' },
  { value: 'Vision',               label: 'Vision',                   group: 'Salud' },
  { value: 'Pharmacy',             label: 'Pharmacy',                 group: 'Salud' },
  // Trabajo
  { value: 'Commute',              label: 'Commute',                  group: 'Trabajo' },
  { value: 'Work Meals',           label: 'Work Meals',               group: 'Trabajo' },
  { value: 'Tools',                label: 'Tools',                    group: 'Trabajo' },
  // Suscripciones
  { value: 'Netflix',              label: 'Netflix',                  group: 'Suscripciones' },
  { value: 'YouTube Premium',      label: 'YouTube Premium',          group: 'Suscripciones' },
  { value: 'Spotify',              label: 'Spotify',                  group: 'Suscripciones' },
  { value: 'iCloud',               label: 'iCloud',                   group: 'Suscripciones' },
  { value: 'Amazon Prime',         label: 'Amazon Prime',             group: 'Suscripciones' },
  { value: 'Other Subscription',   label: 'Other Subscription',       group: 'Suscripciones' },
  // Otros
  { value: 'Gifts',                label: 'Gifts',                    group: 'Otros' },
  { value: 'Entertainment',        label: 'Entertainment',            group: 'Otros' },
  { value: 'Travel',               label: 'Travel',                   group: 'Otros' },
  { value: 'Misc',                 label: 'Misc',                     group: 'Otros' },
]

export const DEFAULT_CATEGORY = 'Groceries'

export const CATEGORY_GROUPS = [...new Set(CATEGORIES.map(c => c.group))]

export function getCategoryLabel(value: string) {
  return CATEGORIES.find(c => c.value === value)?.label ?? value
}

// Presets for Fixed Expenses
export const FIXED_PRESETS = [
  { name: 'Netflix',        category: 'Netflix',          amount: 15.99 },
  { name: 'YouTube Premium',category: 'YouTube Premium',  amount: 13.99 },
  { name: 'Spotify',        category: 'Spotify',          amount: 9.99  },
  { name: 'iCloud',         category: 'iCloud',           amount: 2.99  },
  { name: 'Amazon Prime',   category: 'Amazon Prime',     amount: 14.99 },
  { name: 'Rent',           category: 'Rent/Mortgage',    amount: 0     },
  { name: 'Electric',       category: 'Electric',         amount: 0     },
  { name: 'Water',          category: 'Water',            amount: 0     },
  { name: 'Internet',       category: 'Internet',         amount: 0     },
  { name: 'Phone',          category: 'Phone',            amount: 0     },
  { name: 'Car Payment',    category: 'Car Payment',      amount: 0     },
  { name: 'Car Insurance',  category: 'Car Insurance',    amount: 0     },
  { name: 'Daycare',        category: 'Daycare',          amount: 0     },
]
