'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Send, Image as ImageIcon, FileText, X, Download } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
const fmtDay = (s: string) =>
  new Date(s).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
const isSameDay = (a: string, b: string) =>
  new Date(a).toDateString() === new Date(b).toDateString()

// ── types ─────────────────────────────────────────────────────────────────────
type Profile = { id: string; full_name: string | null; email: string | null }
type Message = {
  id: string
  business_id: string
  sent_by: string
  content: string | null
  file_url: string | null
  file_name: string | null
  file_type: string | null
  created_at: string
  profile?: Profile | null
}

// ── component ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { partnerId, businessId } = useParams<{ partnerId: string; businessId: string }>()
  const router   = useRouter()
  const supabase = createClient()

  const [loading,       setLoading]       = useState(true)
  const [userId,        setUserId]        = useState('')
  const [businessName,  setBusinessName]  = useState('')
  const [businessColor, setBusinessColor] = useState('#6366f1')
  const [members,       setMembers]       = useState<Profile[]>([])
  const [messages,      setMessages]      = useState<Message[]>([])

  const [text,     setText]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [uploading,setUploading]= useState(false)

  const bottomRef  = useRef<HTMLDivElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [businessId])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: biz } = await supabase
      .from('businesses').select('name,color').eq('id', businessId).single()
    if (biz) { setBusinessName(biz.name); setBusinessColor(biz.color || '#6366f1') }

    // Load members (owner + members) for profile lookup
    const { data: bizFull } = await supabase
      .from('businesses').select('user_id').eq('id', businessId).single()
    const { data: memberRows } = await supabase
      .from('business_members').select('user_id').eq('business_id', businessId)

    const userIds = [
      ...(bizFull ? [bizFull.user_id] : []),
      ...(memberRows?.map((m: { user_id: string }) => m.user_id) ?? []),
    ].filter(Boolean)

    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('id,full_name,email').in('id', userIds)
      if (profiles) setMembers(profiles as Profile[])
    }

    await loadMessages()
    setLoading(false)
  }

  const profileById = useCallback(
    (id: string) => members.find(m => m.id === id) ?? null,
    [members]
  )

  const displayName = (p: Profile | null) =>
    p?.full_name || p?.email || 'Usuario'

  const initials = (p: Profile | null) =>
    (p?.full_name || p?.email || 'U').slice(0, 2).toUpperCase()

  async function loadMessages() {
    const { data } = await supabase
      .from('business_messages')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as Message[])
  }

  // ── scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }, [messages, loading])

  // ── realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${businessId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'business_messages', filter: `business_id=eq.${businessId}` },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev =>
            prev.some(m => m.id === msg.id) ? prev : [...prev, msg]
          )
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [businessId])

  // ── send text ─────────────────────────────────────────────────────────────
  async function sendMessage() {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setText('')
    await supabase.from('business_messages').insert({
      business_id: businessId,
      sent_by: userId,
      content,
    })
    setSending(false)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── send file ─────────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `chat/${businessId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('receipts').upload(path, file)
    if (error) { alert('Error al subir archivo'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
    await supabase.from('business_messages').insert({
      business_id: businessId,
      sent_by: userId,
      content: null,
      file_url: publicUrl,
      file_name: file.name,
      file_type: file.type.startsWith('image') ? 'image' : 'document',
    })
    setUploading(false)
    e.target.value = ''
  }

  // ── delete message ────────────────────────────────────────────────────────
  async function deleteMessage(msgId: string) {
    await supabase.from('business_messages').delete().eq('id', msgId)
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 pt-12 pb-3 flex items-center gap-3 border-b border-gray-100 bg-white"
      >
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Chat</p>
          <h1 className="font-bold text-gray-900 text-[16px] truncate">{businessName}</h1>
        </div>
        {/* Member avatars */}
        <div className="flex -space-x-2">
          {members.slice(0, 3).map(m => (
            <div
              key={m.id}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold border-2 border-white"
              style={{ backgroundColor: businessColor }}
            >
              {initials(m)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 pb-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full pt-20 text-center">
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 text-3xl"
              style={{ backgroundColor: `${businessColor}20` }}
            >
              💬
            </div>
            <p className="text-gray-500 font-semibold">Comiencen a chatear</p>
            <p className="text-gray-400 text-sm mt-1">Los mensajes son solo entre socios del negocio</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMine   = msg.sent_by === userId
          const profile  = profileById(msg.sent_by)
          const prevMsg  = messages[idx - 1]
          const showDay  = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at)
          const prevSame = prevMsg && prevMsg.sent_by === msg.sent_by && !showDay
          const nextMsg  = messages[idx + 1]
          const nextSame = nextMsg && nextMsg.sent_by === msg.sent_by &&
            isSameDay(msg.created_at, nextMsg.created_at)

          return (
            <div key={msg.id}>
              {/* Day separator */}
              {showDay && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-semibold capitalize">
                    {fmtDay(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}

              {/* Message row */}
              <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'} ${prevSame ? 'mt-0.5' : 'mt-3'}`}>

                {/* Avatar (only last in group) */}
                {!isMine && (
                  <div className="w-7 flex-shrink-0 flex items-end">
                    {!nextSame ? (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: businessColor }}
                      >
                        {initials(profile)}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Bubble */}
                <div className={`group relative max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {/* Sender name (first in group, not mine) */}
                  {!isMine && !prevSame && (
                    <span className="text-[10px] text-gray-400 ml-3 mb-0.5 font-semibold">
                      {displayName(profile)}
                    </span>
                  )}

                  <div
                    className={`px-3.5 py-2.5 ${
                      isMine
                        ? 'text-white rounded-t-2xl rounded-l-2xl rounded-br-sm'
                        : 'bg-white text-gray-900 rounded-t-2xl rounded-r-2xl rounded-bl-sm border border-gray-100'
                    } ${msg.file_url ? 'p-1.5' : ''}`}
                    style={isMine ? { backgroundColor: businessColor } : {}}
                  >
                    {/* Image */}
                    {msg.file_type === 'image' && msg.file_url && (
                      <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={msg.file_url}
                          alt={msg.file_name ?? 'imagen'}
                          className="max-w-[220px] rounded-xl object-cover"
                        />
                      </a>
                    )}

                    {/* Document */}
                    {msg.file_type === 'document' && msg.file_url && (
                      <a
                        href={msg.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 px-2 py-1 rounded-xl ${
                          isMine ? 'bg-white/20' : 'bg-gray-50'
                        }`}
                      >
                        <FileText size={20} className={isMine ? 'text-white' : 'text-gray-500'} />
                        <span className={`text-xs font-semibold truncate max-w-[150px] ${isMine ? 'text-white' : 'text-gray-700'}`}>
                          {msg.file_name}
                        </span>
                        <Download size={14} className={isMine ? 'text-white/70' : 'text-gray-400'} />
                      </a>
                    )}

                    {/* Text */}
                    {msg.content && (
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                        isMine ? 'text-white' : 'text-gray-900'
                      }`}>
                        {msg.content}
                      </p>
                    )}
                  </div>

                  {/* Time + delete */}
                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[10px] text-gray-400">{fmtTime(msg.created_at)}</span>
                    {isMine && (
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={11} className="text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-t border-gray-100 px-3 py-3 pb-safe">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex items-end gap-2">
          {/* Attach */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            {uploading
              ? <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              : <ImageIcon size={18} className="text-gray-500" />
            }
          </button>

          {/* Text input */}
          <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 flex items-end gap-2 min-h-[42px]">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none leading-relaxed max-h-[120px] overflow-y-auto"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </div>

          {/* Send */}
          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
            style={{ backgroundColor: businessColor }}
          >
            <Send size={17} className="text-white" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  )
}
