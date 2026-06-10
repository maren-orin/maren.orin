/**
 * app/api/debug/route.js
 * Erstellt: 2026-06-06
 * Zuletzt geändert: 2026-06-10
 *
 * Debug und Trigger Route – intern und für Cron Jobs
 * Gesichert über AGENT_SECRET oder CRON_SECRET
 *
 * Abhängigkeiten: lib/supabase.js
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { notify, remember } from '@/lib/supabase'

const BASE = process.env.NEXT_PUBLIC_URL
const AGENT_AUTH = () => ({ 'Authorization': `Bearer ${process.env.AGENT_SECRET}`, 'Content-Type': 'application/json' })

async function call(path, method = 'GET', body = null) {
  const opts = { method, headers: AGENT_AUTH() }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  return res.json()
}

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
    return NextResponse.json({ success: true })
  }

  if (test === 'think') {
    const data = await call('/api/think', 'POST')
    return NextResponse.json(data)
  }

  if (test === 'modify-status') {
    const data = await call('/api/modify')
    return NextResponse.json(data)
  }

  if (test === 'brain') {
    const data = await call('/api/brain', 'POST', {
      type: 'decide',
      task: 'Wer bist du und was sind deine naechsten Ziele? Antworte in 3 Saetzen auf Deutsch.'
    })
    return NextResponse.json(data)
  }

  if (test === 'gmail-test') {
    const refreshToken = await remember('gmail_refresh_token')

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      })
    })

    const tokenData = await tokenResponse.json()
    return NextResponse.json({
      hasRefreshToken: !!refreshToken,
      refreshTokenStart: refreshToken?.substring(0, 10),
      tokenResponse: tokenData.access_token ? 'OK' : tokenData.error,
      errorDetail: tokenData.error_description
    })
  }

  return NextResponse.json({
    available: ['telegram', 'think', 'modify-status', 'brain', 'gmail-test'],
    usage: '/api/debug?test=think&secret=YOUR_CRON_SECRET'
  })
}
