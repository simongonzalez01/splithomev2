'use client'

import { useState, useEffect, useCallback } from 'react'
import { urlBase64ToUint8Array } from '@/lib/notifications'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading'

export function usePushNotifications() {
  const [state,   setState]   = useState<PushState>('loading')
  const [swReady, setSwReady] = useState(false)

  // Register service worker + detect current subscription state
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported'); return
    }
    if (Notification.permission === 'denied') {
      setState('denied'); return
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then(async reg => {
        setSwReady(true)
        const sub = await reg.pushManager.getSubscription()
        setState(sub ? 'subscribed' : 'unsubscribed')
      })
      .catch(() => setState('unsupported'))
  }, [])

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!swReady || !VAPID_PUBLIC_KEY) return false
    setState('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState('denied'); return false }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      })
      const json = sub.toJSON()
      const res  = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint: sub.endpoint,
          p256dh:   json.keys?.p256dh,
          auth:     json.keys?.auth,
        }),
      })
      if (!res.ok) { await sub.unsubscribe(); setState('unsubscribed'); return false }
      setState('subscribed')
      return true
    } catch {
      setState('unsubscribed')
      return false
    }
  }, [swReady])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('unsubscribed')
      return true
    } catch {
      setState('subscribed')  // rollback UI
      return false
    }
  }, [])

  return { state, subscribe, unsubscribe }
}
