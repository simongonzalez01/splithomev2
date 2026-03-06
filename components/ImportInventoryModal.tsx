'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { X, Download, Upload, Check, AlertTriangle, FileSpreadsheet } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────
type ParsedRow = {
  rowNum: number
  name: string
  unit: string
  cost_price: number | null
  sale_price: number | null
  stock: number
  min_stock: number
  errors: string[]
}

// ─── Column mapping ────────────────────────────────────────────────────────────
// Accepts variations of the header names (case-insensitive, trimmed)
const COL_NOMBRE     = ['nombre', 'producto', 'descripcion', 'name']
const COL_UNIDAD     = ['unidad', 'unit', 'um']
const COL_COSTO      = ['precio costo', 'costo', 'cost', 'cost_price', 'precio de costo']
const COL_VENTA      = ['precio venta', 'venta', 'sale', 'sale_price', 'precio de venta', 'precio']
const COL_STOCK      = ['stock', 'stock inicial', 'cantidad', 'qty', 'existencia']
const COL_MIN_STOCK  = ['stock mínimo', 'stock minimo', 'min stock', 'min_stock', 'mínimo', 'minimo']

function matchCol(headers: string[], candidates: string[]): number {
  return headers.findIndex(h =>
    candidates.some(c => h.trim().toLowerCase() === c)
  )
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = parseFloat(String(v).replace(/,/g, '.'))
  return isNaN(n) ? null : n
}

// ─── Template generator ────────────────────────────────────────────────────────
function downloadTemplate() {
  const wb = XLSX.utils.book_new()

  // Data rows: headers + examples
  const rows = [
    ['Nombre', 'Unidad', 'Precio Costo', 'Precio Venta', 'Stock Inicial', 'Stock Mínimo'],
    ['Camiseta talla M', 'unidad', 15000, 25000, 50, 5],
    ['Pantalón', 'unidad', 30000, 55000, 30, 3],
    ['Cinturón de cuero', 'unidad', 8000, 18000, 20, 2],
    ['Bolsa de tela', 'unidad', 3000, 7000, 0, 0],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 28 }, // Nombre
    { wch: 12 }, // Unidad
    { wch: 14 }, // Precio Costo
    { wch: 14 }, // Precio Venta
    { wch: 14 }, // Stock Inicial
    { wch: 13 }, // Stock Mínimo
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  XLSX.writeFile(wb, 'plantilla_inventario.xlsx')
}

// ─── Parser ────────────────────────────────────────────────────────────────────
function parseSheet(workbook: XLSX.WorkBook): ParsedRow[] {
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
  if (raw.length < 2) return []

  const headers = (raw[0] as string[]).map(h => String(h).trim().toLowerCase())

  const iNombre    = matchCol(headers, COL_NOMBRE)
  const iUnidad    = matchCol(headers, COL_UNIDAD)
  const iCosto     = matchCol(headers, COL_COSTO)
  const iVenta     = matchCol(headers, COL_VENTA)
  const iStock     = matchCol(headers, COL_STOCK)
  const iMinStock  = matchCol(headers, COL_MIN_STOCK)

  const results: ParsedRow[] = []

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as string[]
    const nombre = iNombre >= 0 ? String(row[iNombre] ?? '').trim() : ''
    const unidad = iUnidad >= 0 ? String(row[iUnidad] ?? '').trim() : ''

    // Skip completely empty rows
    if (!nombre && !unidad && row.every(c => !c)) continue

    const cost  = iCosto    >= 0 ? toNum(row[iCosto])   : null
    const sale  = iVenta    >= 0 ? toNum(row[iVenta])   : null
    const stock    = iStock    >= 0 ? toNum(row[iStock])    : null
    const minStock = iMinStock >= 0 ? toNum(row[iMinStock]) : null

    const errors: string[] = []
    if (!nombre) errors.push('Nombre requerido')
    if (!unidad) errors.push('Unidad requerida')
    if (cost === null)  errors.push('Precio costo inválido')
    if (sale === null)  errors.push('Precio venta inválido')
    if (cost !== null && cost < 0) errors.push('Precio costo negativo')
    if (sale !== null && sale < 0) errors.push('Precio venta negativo')

    results.push({
      rowNum: i + 1,
      name:      nombre,
      unit:      unidad || 'unidad',
      cost_price: cost,
      sale_price: sale,
      stock:      stock !== null ? Math.max(0, stock) : 0,
      min_stock:  minStock !== null ? Math.max(0, minStock) : 0,
      errors,
    })
  }

  return results
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function ImportInventoryModal({
  businessId,
  color,
  onClose,
  onSuccess,
}: {
  businessId: string
  color: string
  onClose: () => void
  onSuccess: () => void
}) {
  const supabase  = createClient()
  const fileRef   = useRef<HTMLInputElement>(null)

  const [step,       setStep]       = useState<'upload' | 'preview'>('upload')
  const [rows,       setRows]       = useState<ParsedRow[]>([])
  const [importing,  setImporting]  = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [parseError, setParseError] = useState('')

  const validRows   = rows.filter(r => r.errors.length === 0)
  const invalidRows = rows.filter(r => r.errors.length > 0)

  // ── File handling ──────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError('')
    setFileName(file.name)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
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

    // Reset input so same file can be re-uploaded
    e.target.value = ''
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)

    const payload = validRows.map(r => ({
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
    if (error) {
      setParseError(`Error al importar: ${error.message}`)
    } else {
      onSuccess()
      onClose()
    }
  }

  // ── Render: upload step ────────────────────────────────────────────────────
  const renderUpload = () => (
    <div className="space-y-5">
      {/* Instructions */}
      <div className="bg-blue-50 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-700 mb-2">📋 Formato del Excel</p>
        <p className="text-xs text-blue-600 leading-relaxed">
          El archivo debe tener estas columnas en la primera fila:
        </p>
        <div className="mt-2 space-y-0.5">
          {[
            ['Nombre', 'Nombre del producto', true],
            ['Unidad', 'Ej: unidad, par, caja, kg', true],
            ['Precio Costo', 'Número sin símbolos', true],
            ['Precio Venta', 'Número sin símbolos', true],
            ['Stock Inicial', 'Cantidad en inventario (opcional)', false],
            ['Stock Mínimo', 'Alerta de stock bajo (opcional)', false],
          ].map(([col, desc, req]) => (
            <div key={col as string} className="flex items-start gap-2 text-xs">
              <span className="font-bold text-blue-800 w-28 flex-shrink-0">{col as string}</span>
              <span className="text-blue-500">{desc as string}</span>
              {req && <span className="text-orange-500 font-bold flex-shrink-0">*</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Download template */}
      <button
        onClick={downloadTemplate}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500 active:bg-gray-50 active:border-gray-300 transition-colors"
      >
        <Download size={16} className="text-gray-400" />
        Descargar plantilla de Excel
      </button>

      {/* Upload */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
      />
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
      {/* Summary */}
      <div className="flex gap-3">
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
        <div className="flex-1 bg-gray-50 rounded-2xl p-3 text-center">
          <p className="text-2xl font-black text-gray-600">{rows.length}</p>
          <p className="text-[10px] font-bold text-gray-400 mt-0.5">Total</p>
        </div>
      </div>

      {/* File name */}
      <div className="flex items-center gap-2 px-1">
        <FileSpreadsheet size={14} className="text-gray-400" />
        <p className="text-xs text-gray-400 truncate">{fileName}</p>
        <button
          onClick={() => { setStep('upload'); setRows([]); setParseError('') }}
          className="text-xs text-orange-500 font-bold ml-auto flex-shrink-0"
        >
          Cambiar
        </button>
      </div>

      {/* Rows preview */}
      <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5">
        {rows.map(r => (
          <div
            key={r.rowNum}
            className={`rounded-xl px-3 py-2.5 ${
              r.errors.length > 0 ? 'bg-red-50 border border-red-100' : 'bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {r.errors.length === 0
                    ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                    : <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />}
                  <p className={`text-xs font-bold truncate ${r.errors.length > 0 ? 'text-red-700' : 'text-gray-800'}`}>
                    {r.name || <span className="text-gray-400 italic">Sin nombre</span>}
                  </p>
                </div>
                {r.errors.length === 0 ? (
                  <p className="text-[10px] text-gray-400 mt-0.5 ml-4">
                    {r.unit} · Costo: {r.cost_price?.toLocaleString()} · Venta: {r.sale_price?.toLocaleString()} · Stock: {r.stock}
                  </p>
                ) : (
                  <p className="text-[10px] text-red-400 mt-0.5 ml-4">
                    Fila {r.rowNum}: {r.errors.join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {invalidRows.length > 0 && (
        <p className="text-[10px] text-gray-400 text-center">
          Las filas con errores serán omitidas. Solo se importarán las {validRows.length} válidas.
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
          onClick={() => { setStep('upload'); setRows([]); setParseError('') }}
          className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm active:opacity-70"
        >
          Cancelar
        </button>
        <button
          onClick={handleImport}
          disabled={validRows.length === 0 || importing}
          className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm active:opacity-80 disabled:opacity-40 shadow-sm"
          style={{ backgroundColor: color }}
        >
          {importing
            ? 'Importando...'
            : `Importar ${validRows.length} producto${validRows.length !== 1 ? 's' : ''}`}
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
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"
          >
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
