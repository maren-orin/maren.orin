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
import { notify } from '@/lib/supabase'

const BASE_URL = process.env.NEXT_PUBLIC_URL
const AUTH = () => ({ 'Authorization': `Bearer ${process.env.AGENT_SECRET}` })

async function callInternal(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: { ...AUTH(), 'Content-Type': 'application/json' }
  }
  if (body) options.body = JSON.stringify(body)
  const res = await fetch(`${BASE_URL}${path}`, options)
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
    return NextResponse.json({ success: true, test: 'telegram' })
  }

  if (test === 'think') {
    const data = await callInternal('/api/think', 'POST')
    return NextResponse.json(data)
  }

  if (test === 'modify-status') {
    const data = await callInternal('/api/modify')
    return NextResponse.json(data)
  }

  if (test === 'modify-test') {
    const newContent = '/**\n * app/api/self/route.js\n * Modifiziert von: Maren Orin\n */\nexport const runtime = "nodejs"\nimport { NextResponse } from "next/server"\nimport { supabaseAdmin, log } from "@/lib/supabase"\nexport async function GET(request) {\n  const authHeader = request.headers.get("authorization")\n  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {\n    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })\n  }\n  return NextResponse.json({ status: "ok" })\n}\n'

    const data = await callInternal('/api/modify', 'POST', {
      path: 'app/api/self/route.js',
      reason: 'Erste autonome Selbst-Modifikation',
      requestedBy: 'Maren Orin (autonom)',
      newContent
    })
    return NextResponse.json(data)
  }

  if (test === 'brain') {
    const data = await callInternal('/api/brain', 'POST', {
      type: 'decide',
      task: 'Wer bist du und was sind deine naechsten Ziele? Antworte in 3 Saetzen auf Deutsch.'
    })
    return NextResponse.json(data)
  }

  return NextResponse.json({
    available: ['telegram', 'think', 'modify-status', 'modify-test', 'brain'],
    usage: '/api/debug?test=brain&secret=YOUR_CRON_SECRET'
  })
}
