'use client'

import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────
type UnreadMap = Record<string, number> // businessId → unread count

interface UnreadMessagesContextType {
  unreadMap: UnreadMap
  totalUnread: number
  markRead: (businessId: string) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────
const UnreadMessagesContext = createContext<UnreadMessagesContextType>({
  unreadMap: {},
  totalUnread: 0,
  markRead: () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────
export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [unreadMap, setUnreadMap] = useState<UnreadMap>({})
  const [userId,    setUserId]    = useState<string | null>(null)
  const [bizIds,    setBizIds]    = useState<string[]>([])

  /** Mark a business chat as fully read. Persists in localStorage. */
  const markRead = useCallback((businessId: string) => {
    localStorage.setItem(`chat_last_seen_${businessId}`, new Date().toISOString())
    setUnreadMap(prev => {
      const next = { ...prev }
      delete next[businessId]
      return next
    })
  }, [])

  // ── Initialize: fetch biz IDs + unread counts ──────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: owned }, { data: memberships }] = await Promise.all([
        supabase.from('businesses').select('id').eq('user_id', user.id),
        supabase.from('business_members').select('business_id').eq('user_id', user.id),
      ])

      const ids = [
        ...(owned ?? []).map((b: { id: string }) => b.id),
        ...(memberships ?? []).map((m: { business_id: string }) => m.business_id),
      ]
      const uniqueIds = [...new Set(ids)]
      setBizIds(uniqueIds)

      if (uniqueIds.length === 0) return

      // Count unread per business
      const map: UnreadMap = {}
      await Promise.all(uniqueIds.map(async bizId => {
        const lastSeen = localStorage.getItem(`chat_last_seen_${bizId}`)
        let query = supabase
          .from('business_messages')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', bizId)
          .neq('sent_by', user.id)

        if (lastSeen) query = query.gt('created_at', lastSeen)

        const { count } = await query
        if (count && count > 0) map[bizId] = count
      }))

      setUnreadMap(map)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Subscribe to new messages via Realtime ─────────────────────────────────
  useEffect(() => {
    if (!userId || bizIds.length === 0) return

    const channel = supabase
      .channel('unread-chat-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'business_messages' },
        (payload) => {
          const msg = payload.new as {
            id: string; business_id: string; sent_by: string; created_at: string
          }
          if (msg.sent_by === userId) return
          if (!bizIds.includes(msg.business_id)) return

          // Check if user is currently reading this chat
          const lastSeen = localStorage.getItem(`chat_last_seen_${msg.business_id}`)
          if (lastSeen && new Date(msg.created_at) <= new Date(lastSeen)) return

          setUnreadMap(prev => ({
            ...prev,
            [msg.business_id]: (prev[msg.business_id] ?? 0) + 1,
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, bizIds, supabase])

  const totalUnread = Object.values(unreadMap).reduce((sum, n) => sum + n, 0)

  return (
    <UnreadMessagesContext.Provider value={{ unreadMap, totalUnread, markRead }}>
      {children}
    </UnreadMessagesContext.Provider>
  )
}

export const useUnreadMessages = () => useContext(UnreadMessagesContext)
