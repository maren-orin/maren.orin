/**
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
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
    { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
  )
  const data = await response.json()
  return data.tree?.filter(f => f.type === 'blob').map(f => f.path) || []
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const files = await getRepoStructure()
    const { data: goals } = await supabaseAdmin.from('goals').select('*').eq('status', 'active').order('priority')
    const { data: memory } = await supabaseAdmin.from('memory').select('*')
    await supabaseAdmin.from('reflections').insert({
      content: `Selbst-Analyse: ${files.length} Dateien. Ziele: ${goals?.map(g => g.title).join(', ')}`,
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
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
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
