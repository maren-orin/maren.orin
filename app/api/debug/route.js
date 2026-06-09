/**
 * app/api/debug/route.js
 * Erstellt: 2026-06-06
 * Zuletzt geändert: 2026-06-09
 *
 * Debug und Trigger Route – intern und für Cron Jobs
 * Gesichert über AGENT_SECRET oder CRON_SECRET
 *
 * Abhängigkeiten: lib/supabase.js
 */
import { NextResponse } from 'next/server'
import { notify } from '@/lib/supabase'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const test = searchParams.get('test')
  const secret = searchParams.get('secret')

  const authHeader = request.headers.get('authorization')
  const isAuthorized =
    authHeader === `Bearer ${process.env.AGENT_SECRET}` ||
    secret === process.env.CRON_SECRET

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (test === 'telegram') {
    await notify('Telegram funktioniert!', 'success')
    return NextResponse.json({ success: true, test: 'telegram' })
  }

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

// Selbst-Modifikations Test – liest Erlaubtenliste
  if (test === 'modify-status') {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/modify`,
      {
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
    usage: '/api/debug?test=think&secret=YOUR_CRON_SECRET'
  })
}
