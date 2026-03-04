'use client'

import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, X, FileText, Check } from 'lucide-react'

type ItemDraft = { id: string; description: string; qty: string; unit_price: string }

const CURRENCIES = ['USD', 'EUR', 'COP', 'CNY', 'MXN']

export default function NewImportPage() {
  const { partnerId, businessId } = useParams<{ partnerId: string; businessId: string }>()
  const router   = useRouter()
  const supabase = createClient()
  const proformaRef = useRef<HTMLInputElement>(null)

  // Form fields
  const [title,         setTitle]         = useState('')
  const [supplierName,  setSupplierName]  = useState('')
  const [currency,      setCurrency]      = useState('USD')
  const [supplierTotal, setSupplierTotal] = useState('')
  const [freightTotal,  setFreightTotal]  = useState('')
  const [notes,         setNotes]         = useState('')
  const [proformaFile,  setProformaFile]  = useState<File | null>(null)

  // Product items
  const [items, setItems] = useState<ItemDraft[]>([])

  // State
  const [saving,    setSaving]    = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')

  function addItem() {
    setItems(prev => [
      ...prev,
      { id: crypto.randomUUID(), description: '', qty: '', unit_price: '' },
    ])
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function updateItem(id: string, field: keyof ItemDraft, value: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('El nombre del pedido es requerido'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Upload proforma if provided
    let proformaUrl: string | null = null
    let proformaName: string | null = null
    if (proformaFile) {
      setUploading(true)
      const ext  = proformaFile.name.split('.').pop()
      const path = `imports/proformas/${businessId}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, proformaFile)
      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
        proformaUrl  = publicUrl
        proformaName = proformaFile.name
      }
      setUploading(false)
    }

    // Create order
    const { data: order, error: orderErr } = await supabase
      .from('import_orders')
      .insert({
        business_id:    businessId,
        title:          title.trim(),
        supplier_name:  supplierName.trim() || null,
        currency,
        supplier_total: supplierTotal ? parseFloat(supplierTotal) : null,
        freight_total:  freightTotal  ? parseFloat(freightTotal)  : null,
        notes:          notes.trim() || null,
        proforma_url:   proformaUrl,
        proforma_name:  proformaName,
        status:         'proforma',
        created_by:     user.id,
      })
      .select('id')
      .single()

    if (orderErr || !order) {
      setError(orderErr?.message ?? 'No se pudo crear el pedido')
      setSaving(false)
      return
    }

    // Insert initial event
    await supabase.from('import_events').insert({
      order_id:   order.id,
      stage:      'proforma',
      note:       'Pedido creado',
      created_by: user.id,
    })

    // Insert product items
    const validItems = items.filter(i => i.description.trim())
    if (validItems.length > 0) {
      await supabase.from('import_order_items').insert(
        validItems.map((item, idx) => ({
          order_id:    order.id,
          description: item.description.trim(),
          qty_ordered: item.qty ? parseInt(item.qty) : 0,
          unit_price:  item.unit_price ? parseFloat(item.unit_price) : null,
          sort_order:  idx,
        }))
      )
    }

    setSaving(false)
    router.replace(`/partners/${partnerId}/${businessId}/imports/${order.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900 text-lg">Nueva importación</h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-600 font-semibold">
            {error}
          </div>
        )}

        {/* ── Info básica ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Información básica</p>

          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">
              Nombre del pedido <span className="text-orange-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Calzado verano 2025"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">Proveedor</label>
            <input
              type="text"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="Ej: Guangzhou Trading Co."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>

          {/* Currency */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">Moneda</label>
            <div className="flex gap-2 flex-wrap">
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                    currency === c
                      ? 'border-orange-400 bg-orange-50 text-orange-600'
                      : 'border-gray-100 text-gray-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Montos ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Montos acordados</p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 block mb-1.5">
                💰 Total proveedor ({currency})
              </label>
              <input
                type="number"
                value={supplierTotal}
                onChange={e => setSupplierTotal(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 block mb-1.5">
                🚢 Total flete ({currency})
              </label>
              <input
                type="number"
                value={freightTotal}
                onChange={e => setFreightTotal(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>
        </div>

        {/* ── Productos ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              📦 Productos ({items.length})
            </p>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 text-xs font-bold text-orange-500 bg-orange-50 px-2.5 py-1.5 rounded-xl active:opacity-70"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>

          {items.length === 0 && (
            <p className="text-xs text-gray-300 text-center py-4">
              Agrega los productos incluidos en este pedido (opcional)
            </p>
          )}

          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                    placeholder="Nombre del producto"
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-gray-300 active:text-red-500 rounded-lg"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={item.qty}
                    onChange={e => updateItem(item.id, 'qty', e.target.value)}
                    placeholder="Cant."
                    className="w-20 bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-400"
                  />
                  <input
                    type="number"
                    value={item.unit_price}
                    onChange={e => updateItem(item.id, 'unit_price', e.target.value)}
                    placeholder={`P. unit (${currency})`}
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-orange-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Proforma ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            📄 Proforma (opcional)
          </p>
          <input
            ref={proformaRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={e => setProformaFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => proformaRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-xl px-4 py-4 text-sm text-center font-semibold transition-all ${
              proformaFile
                ? 'border-emerald-400 text-emerald-600 bg-emerald-50'
                : 'border-gray-200 text-gray-400 active:border-orange-300'
            }`}
          >
            {proformaFile ? (
              <span className="flex items-center justify-center gap-2">
                <Check size={15} /> {proformaFile.name}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <FileText size={15} /> Adjuntar proforma
              </span>
            )}
          </button>
        </div>

        {/* ── Notas ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-3">
            📝 Notas
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observaciones generales del pedido..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm resize-none focus:outline-none focus:border-orange-400"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || uploading}
          className="w-full py-4 rounded-2xl bg-orange-500 text-white font-bold text-sm shadow-md active:opacity-80 disabled:opacity-50"
        >
          {uploading ? 'Subiendo proforma...' : saving ? 'Creando pedido...' : '🚢 Crear importación'}
        </button>
      </form>
    </div>
  )
}
