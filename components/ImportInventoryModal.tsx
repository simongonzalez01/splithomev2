'use client'

import { useRef, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { X, Download, Upload, Check, AlertTriangle, FileSpreadsheet, Pencil, ChevronUp, ChevronDown } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────
type ParsedRow = {
  rowNum:     number
  name:       string
  unit:       string
  cost_price: number | null
  sale_price: number | null
  stock:      number
  min_stock:  number
  errors:     string[]
}

type RowOverride = {
  name?:       string
  unit?:       string
  cost_price?: number | null
  sale_price?: number | null
  stock?:      number
  min_stock?:  number
}

// ─── Column mapping ────────────────────────────────────────────────────────────
const COL_NOMBRE    = ['nombre', 'producto', 'descripcion', 'name']
const COL_UNIDAD    = ['unidad', 'unit', 'um']
const COL_COSTO     = ['precio costo', 'costo', 'cost', 'cost_price', 'precio de costo']
const COL_VENTA     = ['precio venta', 'venta', 'sale', 'sale_price', 'precio de venta', 'precio']
const COL_STOCK     = ['stock', 'stock inicial', 'cantidad', 'qty', 'existencia']
const COL_MIN_STOCK = ['stock mínimo', 'stock minimo', 'min stock', 'min_stock', 'mínimo', 'minimo']

function matchCol(headers: string[], candidates: string[]): number {
  return headers.findIndex(h => candidates.some(c => h.trim().toLowerCase() === c))
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = parseFloat(String(v).replace(/,/g, '.'))
  return isNaN(n) ? null : n
}

// ─── Re-validator ──────────────────────────────────────────────────────────────
function applyOverride(base: ParsedRow, ov: RowOverride): ParsedRow {
  const name       = ov.name       !== undefined ? ov.name       : base.name
  const unit       = ov.unit       !== undefined ? ov.unit       : base.unit
  const cost_price = ov.cost_price !== undefined ? ov.cost_price : base.cost_price
  const sale_price = ov.sale_price !== undefined ? ov.sale_price : base.sale_price
  const stock      = ov.stock      !== undefined ? ov.stock      : base.stock
  const min_stock  = ov.min_stock  !== undefined ? ov.min_stock  : base.min_stock

  const errors: string[] = []
  if (!name.trim())                               errors.push('Nombre requerido')
  if (!unit.trim())                               errors.push('Unidad requerida')
  if (cost_price === null)                        errors.push('Precio costo inválido')
  if (sale_price === null)                        errors.push('Precio venta inválido')
  if (cost_price !== null && cost_price < 0)      errors.push('Precio costo negativo')
  if (sale_price !== null && sale_price < 0)      errors.push('Precio venta negativo')

  return { rowNum: base.rowNum, name, unit, cost_price, sale_price, stock, min_stock, errors }
}

// ─── Template generator ────────────────────────────────────────────────────────
function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const rows = [
    ['Nombre', 'Unidad', 'Precio Costo', 'Precio Venta', 'Stock Inicial', 'Stock Mínimo'],
    ['Camiseta talla M',  'unidad', 15000, 25000, 50, 5],
    ['Pantalón',          'unidad', 30000, 55000, 30, 3],
    ['Cinturón de cuero', 'unidad',  8000, 18000, 20, 2],
    ['Bolsa de tela',     'unidad',  3000,  7000,  0, 0],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, 'plantilla_inventario.xlsx')
}

// ─── Parser ────────────────────────────────────────────────────────────────────
function parseSheet(workbook: XLSX.WorkBook): ParsedRow[] {
  const ws  = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
  if (raw.length < 2) return []

  const headers   = (raw[0] as string[]).map(h => String(h).trim().toLowerCase())
  const iNombre   = matchCol(headers, COL_NOMBRE)
  const iUnidad   = matchCol(headers, COL_UNIDAD)
  const iCosto    = matchCol(headers, COL_COSTO)
  const iVenta    = matchCol(headers, COL_VENTA)
  const iStock    = matchCol(headers, COL_STOCK)
  const iMinStock = matchCol(headers, COL_MIN_STOCK)

  const results: ParsedRow[] = []

  for (let i = 1; i < raw.length; i++) {
    const row    = raw[i] as string[]
    const nombre = iNombre >= 0 ? String(row[iNombre] ?? '').trim() : ''
    const unidad = iUnidad >= 0 ? String(row[iUnidad] ?? '').trim() : ''

    if (!nombre && !unidad && row.every(c => !c)) continue

    const cost     = iCosto    >= 0 ? toNum(row[iCosto])    : null
    const sale     = iVenta    >= 0 ? toNum(row[iVenta])    : null
    const stock    = iStock    >= 0 ? toNum(row[iStock])    : null
    const minStock = iMinStock >= 0 ? toNum(row[iMinStock]) : null

    const errors: string[] = []
    if (!nombre)                          errors.push('Nombre requerido')
    if (!unidad)                          errors.push('Unidad requerida')
    if (cost === null)                    errors.push('Precio costo inválido')
    if (sale === null)                    errors.push('Precio venta inválido')
    if (cost !== null && cost < 0)        errors.push('Precio costo negativo')
    if (sale !== null && sale < 0)        errors.push('Precio venta negativo')

    results.push({
      rowNum:     i + 1,
      name:       nombre,
      unit:       unidad || 'unidad',
      cost_price: cost,
      sale_price: sale,
      stock:      stock    !== null ? Math.max(0, stock)    : 0,
      min_stock:  minStock !== null ? Math.max(0, minStock) : 0,
      errors,
    })
  }

  return results
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function ImportInventoryModal({
  businessId, color, onClose, onSuccess,
}: {
  businessId: string
  color:      string
  onClose:    () => void
  onSuccess:  () => void
}) {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [step,       setStep]       = useState<'upload' | 'preview'>('upload')
  const [rows,       setRows]       = useState<ParsedRow[]>([])
  const [importing,  setImporting]  = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [parseError, setParseError] = useState('')

  // ── Editing state ──────────────────────────────────────────────────────────
  const [editOverrides,  setEditOverrides]  = useState<Record<number, RowOverride>>({})
  const [includedErrors, setIncludedErrors] = useState<Set<number>>(new Set())
  const [expandedRow,    setExpandedRow]    = useState<number>(-1)

  // ── Effective rows (overrides + re-validation) ─────────────────────────────
  const effectiveRows = useMemo(() =>
    rows.map(r => applyOverride(r, editOverrides[r.rowNum] ?? {})),
    [rows, editOverrides],
  )

  const validRows       = effectiveRows.filter(r => r.errors.length === 0)
  const invalidRows     = effectiveRows.filter(r => r.errors.length > 0)
  const includedInvalid = invalidRows.filter(r => includedErrors.has(r.rowNum))
  const totalToImport   = validRows.length + includedInvalid.length

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetPreview() {
    setRows([]); setParseError(''); setEditOverrides({})
    setIncludedErrors(new Set()); setExpandedRow(-1)
  }

  function setOverride(rowNum: number, field: keyof RowOverride, raw: string) {
    const numericFields: (keyof RowOverride)[] = ['cost_price', 'sale_price', 'stock', 'min_stock']
    const value = numericFields.includes(field)
      ? (raw === '' ? null : (parseFloat(raw.replace(/,/g, '.')) || null))
      : raw
    setEditOverrides(prev => ({
      ...prev,
      [rowNum]: { ...(prev[rowNum] ?? {}), [field]: value },
    }))
    // If the row becomes valid after this override, uncheck "include anyway"
    setIncludedErrors(prev => {
      const next = new Set(prev)
      next.delete(rowNum)
      return next
    })
  }

  function toggleInclude(rowNum: number) {
    setIncludedErrors(prev => {
      const next = new Set(prev)
      if (next.has(rowNum)) next.delete(rowNum); else next.add(rowNum)
      return next
    })
  }

  // ── File handling ──────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    resetPreview()
    setFileName(file.name)

    try {
      const buffer = await file.arrayBuffer()
      const wb     = XLSX.read(buffer, { type: 'array' })
      const parsed = parseSheet(wb)
      if (parsed.length === 0) {
        setParseError('No se encontraron filas con datos. Asegúrate de que el archivo tiene el formato correcto.')
        return
      }
      setRows(parsed)
      setStep('preview')
    } catch {
      setParseError('No se pudo leer el archivo. Asegúrate de que es un Excel válido (.xlsx o .xls).')
    }
    e.target.value = ''
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (totalToImport === 0) return
    setImporting(true)

    // includedInvalid rows: use 0 for missing prices — they'll show ⚠️ in inventory
    const allToImport = [
      ...validRows,
      ...includedInvalid.map(r => ({
        ...r,
        name:       r.name.trim()  || '(sin nombre)',
        unit:       r.unit.trim()  || 'unidad',
        cost_price: r.cost_price   ?? 0,
        sale_price: r.sale_price   ?? 0,
      })),
    ]

    const payload = allToImport.map(r => ({
      business_id: businessId,
      name:        r.name,
      unit:        r.unit,
      cost_price:  r.cost_price!,
      sale_price:  r.sale_price!,
      stock:       r.stock,
      min_stock:   r.min_stock,
      is_active:   true,
    }))

    const { error } = await supabase.from('business_products').insert(payload)
    setImporting(false)

    if (error) setParseError(`Error al importar: ${error.message}`)
    else { onSuccess(); onClose() }
  }

  // ── Render: upload step ────────────────────────────────────────────────────
  const renderUpload = () => (
    <div className="space-y-5">
      <div className="bg-blue-50 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-700 mb-2">📋 Formato del Excel</p>
        <p className="text-xs text-blue-600 leading-relaxed">
          El archivo debe tener estas columnas en la primera fila:
        </p>
        <div className="mt-2 space-y-0.5">
          {[
            ['Nombre',        'Nombre del producto',               true],
            ['Unidad',        'Ej: unidad, par, caja, kg',         true],
            ['Precio Costo',  'Número sin símbolos',               true],
            ['Precio Venta',  'Número sin símbolos',               true],
            ['Stock Inicial', 'Cantidad en inventario (opcional)',  false],
            ['Stock Mínimo',  'Alerta de stock bajo (opcional)',    false],
          ].map(([col, desc, req]) => (
            <div key={col as string} className="flex items-start gap-2 text-xs">
              <span className="font-bold text-blue-800 w-28 flex-shrink-0">{col as string}</span>
              <span className="text-blue-500">{desc as string}</span>
              {req && <span className="text-orange-500 font-bold flex-shrink-0">*</span>}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={downloadTemplate}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500 active:bg-gray-50 active:border-gray-300 transition-colors"
      >
        <Download size={16} className="text-gray-400" />
        Descargar plantilla de Excel
      </button>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-sm active:opacity-80 shadow-sm"
        style={{ backgroundColor: color }}
      >
        <Upload size={16} />
        Seleccionar archivo Excel
      </button>

      {parseError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-xs text-red-600 font-semibold flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          {parseError}
        </div>
      )}
    </div>
  )

  // ── Render: preview step ───────────────────────────────────────────────────
  const renderPreview = () => (
    <div className="space-y-4">

      {/* Summary counters */}
      <div className="flex gap-2">
        <div className="flex-1 bg-emerald-50 rounded-2xl p-3 text-center">
          <p className="text-2xl font-black text-emerald-600">{validRows.length}</p>
          <p className="text-[10px] font-bold text-emerald-500 mt-0.5">Válidos</p>
        </div>
        {invalidRows.length > 0 && (
          <div className="flex-1 bg-red-50 rounded-2xl p-3 text-center">
            <p className="text-2xl font-black text-red-500">{invalidRows.length}</p>
            <p className="text-[10px] font-bold text-red-400 mt-0.5">Con errores</p>
          </div>
        )}
        {includedInvalid.length > 0 && (
          <div className="flex-1 bg-orange-50 rounded-2xl p-3 text-center">
            <p className="text-2xl font-black text-orange-500">{includedInvalid.length}</p>
            <p className="text-[10px] font-bold text-orange-400 mt-0.5">Incluidos</p>
          </div>
        )}
        <div className="flex-1 bg-gray-50 rounded-2xl p-3 text-center">
          <p className="text-2xl font-black text-gray-600">{effectiveRows.length}</p>
          <p className="text-[10px] font-bold text-gray-400 mt-0.5">Total</p>
        </div>
      </div>

      {/* File name */}
      <div className="flex items-center gap-2 px-1">
        <FileSpreadsheet size={14} className="text-gray-400" />
        <p className="text-xs text-gray-400 truncate">{fileName}</p>
        <button
          onClick={() => { setStep('upload'); resetPreview() }}
          className="text-xs text-orange-500 font-bold ml-auto flex-shrink-0"
        >
          Cambiar
        </button>
      </div>

      {/* Rows list */}
      <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
        {effectiveRows.map(r => {
          const isExpanded = expandedRow === r.rowNum
          const isIncluded = includedErrors.has(r.rowNum)
          const hasError   = r.errors.length > 0

          return (
            <div
              key={r.rowNum}
              className={`rounded-xl px-3 py-2.5 transition-colors ${
                hasError ? 'bg-red-50 border border-red-100' : 'bg-gray-50'
              }`}
            >
              {/* Row header */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {!hasError
                    ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                    : <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />}
                  <p className={`text-xs font-bold truncate ${hasError ? 'text-red-700' : 'text-gray-800'}`}>
                    {r.name || <span className="italic text-gray-400">Sin nombre</span>}
                  </p>
                </div>
                {hasError && (
                  <button
                    onClick={() => setExpandedRow(isExpanded ? -1 : r.rowNum)}
                    className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 border border-orange-200 px-2 py-1 rounded-lg flex-shrink-0"
                  >
                    <Pencil size={9} />
                    {isExpanded ? 'Cerrar' : 'Editar'}
                    {isExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                  </button>
                )}
              </div>

              {/* Collapsed info line */}
              {!isExpanded && (
                hasError ? (
                  <p className="text-[10px] text-red-400 mt-0.5 ml-4">
                    Fila {r.rowNum}: {r.errors.join(', ')}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-0.5 ml-4">
                    {r.unit} · Costo: {r.cost_price?.toLocaleString()} · Venta: {r.sale_price?.toLocaleString()} · Stock: {r.stock}
                  </p>
                )
              )}

              {/* "Include anyway" badge when collapsed + checked */}
              {!isExpanded && hasError && isIncluded && (
                <div className="flex items-center gap-1 mt-1.5 ml-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  <p className="text-[10px] text-orange-500 font-semibold">
                    Se importará con datos incompletos
                  </p>
                </div>
              )}

              {/* ── Inline edit form ── */}
              {isExpanded && (
                <div className="mt-3 space-y-2.5 pt-2.5 border-t border-red-100">
                  <div className="grid grid-cols-2 gap-2">

                    {/* Nombre */}
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                        Nombre <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="text"
                        defaultValue={r.name}
                        onChange={e => setOverride(r.rowNum, 'name', e.target.value)}
                        placeholder="Nombre del producto"
                        className={`w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                          r.errors.some(err => err.includes('Nombre'))
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      />
                    </div>

                    {/* Unidad */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                        Unidad <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="text"
                        defaultValue={r.unit === 'unidad' && !r.unit ? '' : r.unit}
                        onChange={e => setOverride(r.rowNum, 'unit', e.target.value)}
                        placeholder="unidad"
                        className={`w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                          r.errors.some(err => err.includes('Unidad'))
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      />
                    </div>

                    {/* Stock */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Stock inicial</label>
                      <input
                        type="number"
                        defaultValue={r.stock}
                        onChange={e => setOverride(r.rowNum, 'stock', e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-200 bg-white rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>

                    {/* Precio costo */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                        Precio costo <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="number"
                        defaultValue={r.cost_price ?? ''}
                        onChange={e => setOverride(r.rowNum, 'cost_price', e.target.value)}
                        placeholder="0.00"
                        className={`w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                          r.errors.some(err => err.includes('costo'))
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      />
                    </div>

                    {/* Precio venta */}
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                        Precio venta <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="number"
                        defaultValue={r.sale_price ?? ''}
                        onChange={e => setOverride(r.rowNum, 'sale_price', e.target.value)}
                        placeholder="0.00"
                        className={`w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                          r.errors.some(err => err.includes('venta'))
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Remaining errors after editing */}
                  {r.errors.length > 0 && (
                    <p className="text-[10px] text-red-500 font-semibold">
                      ⚠ Pendiente: {r.errors.join(', ')}
                    </p>
                  )}

                  {/* "Include anyway" checkbox — only if errors remain */}
                  {r.errors.length > 0 && (
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={() => toggleInclude(r.rowNum)}
                        className="mt-0.5 w-4 h-4 rounded accent-orange-500 flex-shrink-0"
                      />
                      <span className="text-xs text-gray-700 font-semibold leading-tight">
                        Importar de todas formas{' '}
                        <span className="text-gray-400 font-normal">
                          (los precios faltantes quedarán en $0 y se marcarán en el inventario)
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer hint */}
      {invalidRows.length > 0 && (
        <p className="text-[10px] text-gray-400 text-center leading-relaxed">
          {includedInvalid.length > 0
            ? `Se importarán ${totalToImport} productos. Los ${includedInvalid.length} incompletos quedarán marcados con ⚠️ en el inventario.`
            : `Edita los errores o márcalos para importarlos. Solo los ${validRows.length} válidos se incluirán ahora.`}
        </p>
      )}

      {parseError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-xs text-red-600 font-semibold">
          {parseError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={() => { setStep('upload'); resetPreview() }}
          className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm active:opacity-70"
        >
          Cancelar
        </button>
        <button
          onClick={handleImport}
          disabled={totalToImport === 0 || importing}
          className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm active:opacity-80 disabled:opacity-40 shadow-sm"
          style={{ backgroundColor: color }}
        >
          {importing
            ? 'Importando...'
            : `Importar ${totalToImport} producto${totalToImport !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )

  // ── Modal wrapper ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
      <div className="w-full bg-white rounded-t-3xl max-w-lg mx-auto" style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-lg">Importar inventario</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-5">
          {step === 'upload' ? renderUpload() : renderPreview()}
        </div>
      </div>
    </div>
  )
}
