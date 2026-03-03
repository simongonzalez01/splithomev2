'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Redirige el sistema viejo de negocios al nuevo sistema de partners
export default function BusinessDetailRedirect() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const go = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) router.replace(`/partners/solo/${id}`)
      else       router.replace('/login')
    }
    go()
  }, [id, router, supabase])

  return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      Cargando…
    </div>
  )
}
