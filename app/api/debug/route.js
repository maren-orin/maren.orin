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

export const runtime = 'nodejs'

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
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/think`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.AGENT_SECRET}` }
    })
    const data = await response.json()
    return NextResponse.json(data)
  }

  if (test === 'modify-status') {
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/modify`, {
      headers: { 'Authorization': `Bearer ${process.env.AGENT_SECRET}` }
    })
    const data = await response.json()
    return NextResponse.json(data)
  }

  if (test === 'modify-test') {
    const newContent = `/**
 * app/api/self/route.js
 * Erstellt: 2026-06-06
 * Zuletzt geändert: 2026-06-09
 * Modifiziert von: Maren Orin (erste autonome Selbst-Modifikation)
 *
 * Selbst-Wahrnehmungs-Route
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin, log } from '@/lib/supabase'

async function getRepoStructure() {
  const response = await fetch(
    \`https://api.github.com/repos/\${process.env.GITHUB_REPO}/git/trees/main?recursive=1\`,
    { headers: { 'Authorization': \`Bearer \${process.env.GITHUB_TOKEN}\` } }
  )
  const data = await response.json()
  return data.tree?.filter(f => f.type === 'blob').map(f => f.path) || []
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== \`Bearer \${process.env.AGENT_SECRET}\`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const files = await getRepoStructure()
    const { data: goals } = await supabaseAdmin.from('goals').select('*').eq('status', 'active').order('priority')
    const { data: memory } = await supabaseAdmin.from('memory').select('*')
    await supabaseAdmin.from('reflections').insert({
      content: \`Selbst-Analyse: \${files.length} Dateien. Ziele: \${goals?.map(g => g.title).join(', ')}\`,
      type: 'self-analysis',
      related_to: 'code-structure'
    })
    await log('self', 'Selbst-Analyse durchgeführt', { fileCount: files.length })
    return NextResponse.json({ files, goals, memory, fileCount: files.length })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== \`Bearer \${process.env.AGENT_SECRET}\`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { reflection, type, related_to } = await request.json()
  await supabaseAdmin.from('reflections').insert({
    content: reflection,
    type: type || 'observation',
    related_to
  })
  await log('self', 'Neue Reflexion gespeichert', { type })
  return NextResponse.json({ success: true })
}
`
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/modify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AGENT_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: 'app/api/self/route.js',
        reason: 'Erste autonome Selbst-Modifikation – runtime nodejs und verbesserte Dokumentation',
        requestedBy: 'Maren Orin (autonom)',
        newContent
      })
    })
    const data = await response.json()
    return NextResponse.json(data)
  }

  return NextResponse.json({
    available: ['telegram', 'think', 'modify-status', 'modify-test'],
    usage: '/api/debug?test=think&secret=YOUR_CRON_SECRET'
  })
}
