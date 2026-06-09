/**
 * app/api/debug/route.js
 * Erstellt: 2026-06-06
 * Zuletzt geändert: 2026-06-06
 * 
 * Debug-Route – testet verschiedene System-Komponenten
 * Nur für interne Tests, nicht für Produktion
 */
import { NextResponse } from 'next/server'
import { notify } from '@/lib/supabase'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const test = searchParams.get('test')

  // Telegram Test
  if (test === 'telegram') {
    await notify('✅ Telegram funktioniert!', 'success')
    return NextResponse.json({ success: true, test: 'telegram' })
  }

  // KIRA Think Test
  if (test === 'think') {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/think`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AGENT_SECRET}`
        }
      }
    )
    const data = await response.json()
    return NextResponse.json(data)
  }

  return NextResponse.json({ 
    available: ['telegram', 'think'],
    usage: '/api/debug?test=telegram'
  })
}
