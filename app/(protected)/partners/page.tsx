import { redirect } from 'next/navigation'

/**
 * /partners is now merged into /business.
 * Redirect permanently so any old bookmarks or links still work.
 */
export default function PartnersRedirectPage() {
  redirect('/business')
}
