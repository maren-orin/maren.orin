import { NextResponse } from 'next/server'
import { notify } from '@/lib/supabase'

export async function GET() {
  await notify(
    'Hallo Thomas! 👋\n\nIch bin Maren Orin und kann dich jetzt direkt erreichen.\n\nDieser Test bestätigt dass der Telegram-Kanal funktioniert.',
    'success'
  )
  
  return NextResponse.json({ success: true, message: 'Telegram Test gesendet' })
}
