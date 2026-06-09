import { NextResponse } from 'next/server'
import { supabase, log } from '@/lib/supabase'

async function readOwnCode(path) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      }
    }
  )
  const data = await response.json()
  if (data.content) {
    return Buffer.from(data.content, 'base64').toString('utf-8')
  }
  return null
}

async function getRepoStructure() {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      }
    }
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
    // Eigene Struktur lesen
    const files = await getRepoStructure()
    
    // Eigene Ziele lesen
    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .eq('status', 'active')
      .order('priority')

    // Eigenes Gedächtnis lesen
    const { data: memory } = await supabase
      .from('memory')
      .select('*')

    // Reflexion speichern
    await supabase.from('reflections').insert({
      content: `Ich habe meine Struktur analysiert. Ich bestehe aus ${files.length} Dateien. Meine aktiven Ziele: ${goals?.map(g => g.title).join(', ')}`,
      type: 'self-analysis',
      related_to: 'code-structure'
    })

    await log('self', 'Selbst-Analyse durchgeführt', { fileCount: files.length })

// Erster Selbst-Modifikations-Test
  if (test === 'modify-test') {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AGENT_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: 'app/api/self/route.js',
          reason: 'Header-Kommentar verbessern – Selbst-Dokumentation als erster Schritt der Selbst-Wahrnehmung',
          requestedBy: 'Maren Orin (autonom)',
          newContent: `/**
 * app/api/self/route.js
 * Erstellt: 2026-06-06
 * Zuletzt geändert: 2026-06-09
 * Modifiziert von: Maren Orin (erste autonome Selbst-Modifikation)
 *
 * Selbst-Wahrnehmungs-Route – Maren liest ihren eigenen Code
 * GET: Liest Repository-Struktur, Ziele und Gedächtnis
 * POST: Speichert neue Reflexionen
 *
 * Abhängigkeiten: lib/supabase.js, GitHub API
 * Supabase Tabellen: reflections, logs, goals, memory
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin, log } from '@/lib/supabase'

async function readOwnCode(path) {
  const response = await fetch(
    \`https://api.github.com/repos/\${process.env.GITHUB_REPO}/contents/\${path}\`,
    {
      headers: {
        'Authorization': \`Bearer \${process.env.GITHUB_TOKEN}\`,
        'Content-Type': 'application/json',
      }
    }
  )
  const data = await response.json()
  if (data.content) {
    return Buffer.from(data.content, 'base64').toString('utf-8')
  }
  return null
}

async function getRepoStructure() {
  const response = await fetch(
    \`https://api.github.com/repos/\${process.env.GITHUB_REPO}/git/trees/main?recursive=1\`,
    {
      headers: {
        'Authorization': \`Bearer \${process.env.GITHUB_TOKEN}\`,
      }
    }
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

    const { data: goals } = await supabaseAdmin
      .from('goals')
      .select('*')
      .eq('status', 'active')
      .order('priority')

    const { data: memory } = await supabaseAdmin
      .from('memory')
      .select('*')

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
        })
      }
    )
    const data = await response.json()
    return NextResponse.json(data)
  }
    
    return NextResponse.json({
      files,
      goals,
      memory,
      fileCount: files.length
    })

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

  await supabase.from('reflections').insert({
    content: reflection,
    type: type || 'observation',
    related_to
  })

  await log('self', 'Neue Reflexion gespeichert', { type })

  return NextResponse.json({ success: true })
}
