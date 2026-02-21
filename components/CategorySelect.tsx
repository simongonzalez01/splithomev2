'use client'

import { CATEGORIES } from '@/lib/categories'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
}

// Group categories into optgroups
const grouped = CATEGORIES.reduce<Record<string, typeof CATEGORIES>>((acc, c) => {
  if (!acc[c.group]) acc[c.group] = []
  acc[c.group].push(c)
  return acc
}, {})

export default function CategorySelect({ value, onChange, className = '', required }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      className={`w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${className}`}
    >
      {Object.entries(grouped).map(([group, cats]) => (
        <optgroup key={group} label={`── ${group}`}>
          {cats.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
