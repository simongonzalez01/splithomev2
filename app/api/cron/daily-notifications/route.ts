import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ────────────────────────────────────────────────────────
type NotifPayload = {
  user_id: string
  type:    string
  title:   string
  body:    string
  link:    string | null
}

// ── Helpers ──────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function daysUntilDay(dueDay: number): number {
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const currentDay = today.getDate()
  const dueDate    = new Date(
    today.getFullYear(),
    today.getMonth() + (dueDay >= currentDay ? 0 : 1),
    dueDay,
  )
  return Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000)
}

// ── Main handler ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Configure web-push (must be inside handler so env vars are available at runtime)
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_SUBJECT ?? 'admin@splithome.app'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const admin  = createAdminClient()
  const today  = todayStr()
  const toSend: NotifPayload[] = []

  // ── 1. Get all users ──────────────────────────────────────────
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const userIds = (users?.users ?? []).map(u => u.id)
  if (userIds.length === 0) return NextResponse.json({ sent: 0 })

  // ── 2. Get all preferences (flat map: user_id+type → prefs) ──
  const { data: allPrefs } = await admin
    .from('notification_preferences')
    .select('user_id, type, enabled, reminder_time, threshold_pct')

  function getPref(userId: string, type: string) {
    return (allPrefs ?? []).find(p => p.user_id === userId && p.type === type)
  }
  function isEnabled(userId: string, type: string): boolean {
    const p = getPref(userId, type)
    return p ? p.enabled : true   // default ON if no record
  }

  // ── 3. Delete today's notifications already sent (idempotent) ─
  await admin
    .from('notifications')
    .delete()
    .eq('read', false)
    .gte('created_at', today + 'T00:00:00Z')
    .lt('created_at',  today + 'T23:59:59Z')

  // ═══════════════════════════════════════════════════════════════
  // CHECK: daily_expense  — did any family member log expenses today?
  // ═══════════════════════════════════════════════════════════════
  const { data: families } = await admin
    .from('families').select('id, name')

  for (const family of (families ?? [])) {
    // Get members of this family from profiles (or use family_id column)
    const { data: familyExpenses } = await admin
      .from('expenses')
      .select('paid_by')
      .eq('family_id', family.id)
      .eq('date', today)

    // Get all users in this family
    const { data: familyProfiles } = await admin
      .from('profiles')
      .select('id')
      .eq('family_id', family.id)

    const membersWhoLogged = new Set((familyExpenses ?? []).map(e => e.paid_by))

    for (const profile of (familyProfiles ?? [])) {
      const uid = profile.id
      if (!isEnabled(uid, 'daily_expense')) continue
      if (!membersWhoLogged.has(uid)) {
        toSend.push({
          user_id: uid,
          type:    'daily_expense',
          title:   '💰 ¿Cargaste los gastos de hoy?',
          body:    'No registraste ningún gasto hoy. ¡Mantén tu historial al día!',
          link:    '/expenses',
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK: daily_business — did the business log transactions today?
  // ═══════════════════════════════════════════════════════════════
  const { data: businesses } = await admin
    .from('businesses').select('id, name, user_id')

  for (const biz of (businesses ?? [])) {
    const { data: txToday } = await admin
      .from('business_transactions')
      .select('id')
      .eq('business_id', biz.id)
      .eq('date', today)
      .limit(1)

    if ((txToday ?? []).length > 0) continue  // already logged

    // Get all users in this business (owner + members)
    const { data: members } = await admin
      .from('business_members')
      .select('user_id')
      .eq('business_id', biz.id)

    const bizUsers = [biz.user_id, ...((members ?? []).map(m => m.user_id))]

    for (const uid of bizUsers) {
      if (!isEnabled(uid, 'daily_business')) continue
      toSend.push({
        user_id: uid,
        type:    'daily_business',
        title:   `🏢 ¿Registraste las ventas de ${biz.name}?`,
        body:    'No hay movimientos registrados hoy en tu negocio.',
        link:    '/partners',
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK: low_stock — products at or below minimum stock
  // ═══════════════════════════════════════════════════════════════
  for (const biz of (businesses ?? [])) {
    const { data: lowProds } = await admin
      .from('business_products')
      .select('name, stock, min_stock')
      .eq('business_id', biz.id)
      .eq('is_active', true)
      .gt('min_stock', 0)
      .lte('stock', admin.from('business_products').select('min_stock') as unknown as number)

    // Simpler: fetch all and filter in JS
    const { data: allProds } = await admin
      .from('business_products')
      .select('name, stock, min_stock')
      .eq('business_id', biz.id)
      .eq('is_active', true)
      .gt('min_stock', 0)

    const low = (allProds ?? []).filter(p => Number(p.stock) <= Number(p.min_stock))
    if (low.length === 0) continue

    const { data: members } = await admin
      .from('business_members').select('user_id').eq('business_id', biz.id)
    const bizUsers = [biz.user_id, ...((members ?? []).map(m => m.user_id))]

    for (const uid of bizUsers) {
      if (!isEnabled(uid, 'low_stock')) continue
      const names = low.slice(0, 3).map(p => p.name).join(', ')
      toSend.push({
        user_id: uid,
        type:    'low_stock',
        title:   `📦 Stock bajo en ${biz.name}`,
        body:    `${low.length} producto${low.length > 1 ? 's' : ''} con stock mínimo: ${names}${low.length > 3 ? '…' : ''}`,
        link:    '/partners',
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK: budget_alert — spending over threshold
  // ═══════════════════════════════════════════════════════════════
  const month = today.slice(0, 7) + '-01'   // YYYY-MM-01

  for (const family of (families ?? [])) {
    const { data: budgets } = await admin
      .from('budgets')
      .select('category, amount')
      .eq('family_id', family.id)
      .eq('month', month)

    if (!budgets || budgets.length === 0) continue

    const { data: expenses } = await admin
      .from('expenses')
      .select('category, amount')
      .eq('family_id', family.id)
      .gte('date', month)
      .lt('date', today.slice(0, 8) + '99')   // rest of month

    const spent: Record<string, number> = {}
    for (const e of (expenses ?? [])) {
      spent[e.category] = (spent[e.category] ?? 0) + Number(e.amount)
    }

    const { data: familyProfiles } = await admin
      .from('profiles').select('id').eq('family_id', family.id)

    for (const profile of (familyProfiles ?? [])) {
      const uid       = profile.id
      if (!isEnabled(uid, 'budget_alert')) continue
      const threshold = getPref(uid, 'budget_alert')?.threshold_pct ?? 80

      const overBudget = (budgets ?? []).filter(b => {
        const pct = (spent[b.category] ?? 0) / Number(b.amount) * 100
        return pct >= threshold
      })

      if (overBudget.length === 0) continue
      const cats = overBudget.slice(0, 2).map(b => {
        const pct = Math.round((spent[b.category] ?? 0) / Number(b.amount) * 100)
        return `${b.category} (${pct}%)`
      }).join(', ')

      toSend.push({
        user_id: uid,
        type:    'budget_alert',
        title:   '📊 Alerta de presupuesto',
        body:    `${overBudget.length} categoría${overBudget.length > 1 ? 's' : ''} sobre el ${threshold}%: ${cats}`,
        link:    '/budgets',
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK: fixed_upcoming — fixed expenses due in ≤3 days
  // ═══════════════════════════════════════════════════════════════
  for (const family of (families ?? [])) {
    const { data: fixed } = await admin
      .from('fixed_expenses')
      .select('name, due_day')
      .eq('family_id', family.id)
      .eq('is_active', true)

    const upcoming = (fixed ?? []).filter(f => {
      const d = daysUntilDay(f.due_day)
      return d >= 0 && d <= 3
    })
    if (upcoming.length === 0) continue

    const { data: familyProfiles } = await admin
      .from('profiles').select('id').eq('family_id', family.id)

    for (const profile of (familyProfiles ?? [])) {
      const uid = profile.id
      if (!isEnabled(uid, 'fixed_upcoming')) continue
      const names = upcoming.slice(0, 2).map(f => {
        const d = daysUntilDay(f.due_day)
        return `${f.name} (${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`})`
      }).join(', ')
      toSend.push({
        user_id: uid,
        type:    'fixed_upcoming',
        title:   '📅 Gastos fijos próximos',
        body:    `Vencen pronto: ${names}${upcoming.length > 2 ? ` y ${upcoming.length - 2} más` : ''}`,
        link:    '/fixed',
      })
    }
  }

  // ── 4. Insert all notifications into DB ──────────────────────
  if (toSend.length > 0) {
    await admin.from('notifications').insert(toSend)
  }

  // ── 5. Send web push to subscribed devices ───────────────────
  const { data: allSubs } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')

  let pushed = 0
  const failedEndpoints: string[] = []

  for (const notif of toSend) {
    const userSubs = (allSubs ?? []).filter(s => s.user_id === notif.user_id)
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: notif.title, body: notif.body, type: notif.type, link: notif.link }),
        )
        pushed++
      } catch {
        failedEndpoints.push(sub.endpoint)
      }
    }
  }

  // Clean up expired/invalid subscriptions
  if (failedEndpoints.length > 0) {
    await admin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', failedEndpoints)
  }

  return NextResponse.json({ notifications: toSend.length, pushed })
}
