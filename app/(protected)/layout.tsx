export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/BottomNav'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Slim top bar */}
      <header className="bg-white border-b border-gray-100 px-4 h-12 flex items-center sticky top-0 z-40 shadow-sm">
        <span className="font-bold text-blue-600 text-base tracking-tight">🏠 SplitHome</span>
      </header>

      {/* Main content – extra bottom padding for tab bar + safe area */}
      <main className="pb-28">
        {children}
      </main>

      <BottomNav />
    </div>
  )
}
