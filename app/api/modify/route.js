/**
 * app/api/modify/route.js
 * Erstellt: 2026-06-09
 * Zuletzt geändert: 2026-06-09
 *
 * Selbst-Modifikations-Route – Maren Orin kann ihren eigenen Code ändern
 * Schutzmechanismen:
 *   - Nur erlaubte Dateipfade dürfen geändert werden
 *   - Kernfunktionen brauchen Bestätigung von Thomas
 *   - Jede Änderung wird als Goldnaht dokumentiert
 *   - Telegram-Benachrichtigung bei jeder Modifikation
 *
 * Abhängigkeiten: lib/supabase.js, GitHub API
 * Supabase Tabellen: reflections, logs
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin, log, notify, askThomas } from '@/lib/supabase'

// Erlaubte Dateien – Maren darf diese selbst ändern
const ALLOWED_PATHS = [
  'app/api/email/route.js',
  'app/api/self/route.js',
  'app/api/debug/route.js',
  'app/api/test/route.js',
]

// Kerndateien – brauchen Bestätigung von Thomas
const CORE_PATHS = [
  'app/api/think/route.js',
  'app/api/agent/route.js',
  'app/api/modify/route.js',
  'lib/supabase.js',
]

// Gesperrte Dateien – niemals ändern
const FORBIDDEN_PATHS = [
  'package.json',
  'app/layout.js',
  'app/page.js',
  'jsconfig.json',
]

async function readFile(path) {
  /**
   * Liest eine Datei aus dem GitHub Repository
   * Gibt Inhalt und SHA zurück (SHA wird für Updates benötigt)
   */
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  )

  if (!response.ok) {
    throw new Error(`Datei nicht gefunden: ${path} (${response.status})`)
  }

  const data = await response.json()
  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha
  }
}

async function writeFile(path, content, message, sha) {
  /**
   * Schreibt eine Datei ins GitHub Repository
   * SHA ist erforderlich für Updates bestehender Dateien
   */
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
  }

  if (sha) body.sha = sha

  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`GitHub Write Fehler: ${error.message}`)
  }

  return await response.json()
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path, newContent, reason, requestedBy } = await request.json()

  // Gesperrte Dateien – absolute Grenze
  if (FORBIDDEN_PATHS.includes(path)) {
    await log('modify', `Verweigert: ${path} ist gesperrt`, { path, reason })
    return NextResponse.json({
      error: `${path} ist gesperrt und kann nicht geändert werden.`
    }, { status: 403 })
  }

  // Unbekannte Dateien – sicherheitshalber verweigern
  if (!ALLOWED_PATHS.includes(path) && !CORE_PATHS.includes(path)) {
    await log('modify', `Verweigert: ${path} ist nicht in der Erlaubtenliste`, { path })
    return NextResponse.json({
      error: `${path} ist nicht in der Erlaubtenliste.`
    }, { status: 403 })
  }

  // Kerndateien – Bestätigung von Thomas erforderlich
  if (CORE_PATHS.includes(path)) {
    await askThomas(
      `Maren möchte eine Kerndatei ändern:\n\n*${path}*\n\nGrund: ${reason}`,
      `Angefordert von: ${requestedBy || 'Maren Orin (autonom)'}`
    )

    await log('modify', `Warte auf Bestätigung für Kerndatei: ${path}`, { path, reason })

    return NextResponse.json({
      status: 'waiting',
      message: `Thomas wird um Bestätigung gebeten für: ${path}`,
      path
    })
  }

  // Erlaubte Datei – direkt ausführen
  try {
    // Aktuelle Version lesen
    const current = await readFile(path)

    // Goldnaht – Änderung dokumentieren
    await supabaseAdmin.from('reflections').insert({
      content: `Selbst-Modifikation: ${path}\nGrund: ${reason}\n\nAlt (erste 200 Zeichen):\n${current.content.slice(0, 200)}\n\nNeu (erste 200 Zeichen):\n${newContent.slice(0, 200)}`,
      type: 'self-modification',
      related_to: path
    })

    // Datei schreiben
    await writeFile(
      path,
      newContent,
      `self-modify: ${reason}`,
      current.sha
    )

    await log('modify', `Erfolgreich geändert: ${path}`, { path, reason })

    // Thomas informieren
    await notify(
      `Code-Änderung durchgeführt:\n\n*${path}*\n\nGrund: ${reason}\n\nVercel deployt automatisch.`,
      'info'
    )

    return NextResponse.json({
      status: 'ok',
      path,
      message: `${path} erfolgreich geändert. Vercel deployt automatisch.`
    })

  } catch (error) {
    await log('error', `Selbst-Modifikation fehlgeschlagen: ${error.message}`, { path })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request) {
  /**
   * Gibt die Erlaubtenliste und gesperrten Dateien zurück
   * Für Transparenz – Maren und Thomas können jederzeit sehen was erlaubt ist
   */
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: recentModifications } = await supabaseAdmin
    .from('reflections')
    .select('*')
    .eq('type', 'self-modification')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    allowed: ALLOWED_PATHS,
    core: CORE_PATHS,
    forbidden: FORBIDDEN_PATHS,
    recentModifications
  })
}
