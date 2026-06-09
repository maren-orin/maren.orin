// rebuild: 2026-06-09
/**
 * app/api/debug/route.js
...

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
import { notify, supabaseAdmin } from '@/lib/supabase'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const test = searchParams.get('test')
  const secret = searchParams.get('secret')

  // Authentifizierung – Agent Secret oder Cron Secret
  const authHeader = request.headers.get('authorization')
  const isAuthorized =
    authHeader === `Bearer ${process.env.AGENT_SECRET}` ||
    secret === process.env.CRON_SECRET

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
