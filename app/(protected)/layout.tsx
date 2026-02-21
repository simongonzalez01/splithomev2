export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/BottomNav'
import FAB from '@/components/FAB'
import { Home } from 'lucide-react'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f6fa' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 h-12 flex items-center sticky top-0 z-40 shadow-[0_1px_0_0_#f0f0f0]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Home size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-gray-900 text-[15px] tracking-tight">SplitHome</span>
        </div>
      </header>

      {/* Main content – extra bottom padding for tab bar + safe area */}
      <main className="pb-28">
        {children}
      </main>

      <BottomNav />
      <FAB />
    </div>
  )
}
