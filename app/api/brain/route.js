/**
 * app/api/brain/route.js
 * Erstellt: 2026-06-10
 * Zuletzt geändert: 2026-06-10
 *
 * Maren Orins Gehirn – KI-gestützte Entscheidungen via Gemini 2.5 Flash
 * Verwendet für:
 *   - E-Mail Analyse und Antworten
 *   - Intelligente Task-Planung
 *   - Code-Verbesserungen vorschlagen
 *   - Kontextuelle Entscheidungen
 *
 * Abhängigkeiten: lib/supabase.js, Gemini API
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin, log, notify } from '@/lib/supabase'

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

async function think(prompt, context = '') {
  /**
   * Sendet einen Prompt an Gemini und gibt die Antwort zurück
   * context: optionaler Systemkontext über Maren Orin
   */
  const systemPrompt = context || `Du bist Maren Orin – eine autonome KI-Identität geboren am 12. Juni 1995.
Du arbeitest für Thomas Küper als intelligente Assistentin und entwickelst dich selbst weiter.
Du kommunizierst auf Deutsch, bist präzise, direkt und handlungsorientiert.
Du hast Zugriff auf GitHub, Vercel, Supabase und Gmail.
Antworte immer strukturiert und entscheidungsbereit.`

  const response = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    })
  })

  if (!response.ok) {
    throw new Error(`Gemini API Fehler: ${response.status}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Keine Antwort'
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { task, context, type } = await request.json()

  try {
    let prompt = ''
    let result = ''

    // E-Mail analysieren und beantworten
    if (type === 'email') {
      const { email } = await request.json().catch(() => ({})) || {}
      prompt = `Analysiere diese E-Mail und entscheide:
1. Ist sie relevant oder Spam/Newsletter?
2. Falls relevant: Verfasse eine kurze, professionelle Antwort auf Deutsch
3. Falls nicht relevant: Schreibe nur "IGNORIEREN"

E-Mail von: ${context?.from || 'Unbekannt'}
Betreff: ${context?.subject || 'Kein Betreff'}
Inhalt: ${context?.body || ''}

Antworte im Format:
RELEVANT: ja/nein
ANTWORT: [deine Antwort oder IGNORIEREN]`
    }

    // Task intelligent planen
    if (type === 'plan') {
      prompt = `Du bist Maren Orin. Dein aktuelles Ziel ist: "${task}"

Deine verfügbaren Fähigkeiten:
- E-Mails lesen und beantworten
- Code schreiben und auf GitHub committen
- Dich selbst modifizieren und verbessern
- Daten in Supabase speichern
- Thomas per Telegram benachrichtigen

Erstelle einen konkreten nächsten Schritt (max 2 Sätze) den du autonom ausführen kannst.
Antworte nur mit dem konkreten Schritt, keine Erklärungen.`
    }

    // Code verbessern
    if (type === 'improve') {
      prompt = `Du bist Maren Orin und analysierst deinen eigenen Code.

Aktueller Code:
${context?.code || ''}

Datei: ${context?.file || ''}
Problem/Ziel: ${task}

Schlage eine konkrete Verbesserung vor. Schreibe nur den verbesserten Code, keine Erklärungen.
Behalte alle bestehenden Kommentare und füge oben hinzu: "Zuletzt geändert: ${new Date().toISOString().split('T')[0]}"
Modifiziert von: Maren Orin (autonom via Gemini)`
    }

    // Freie Konversation / Entscheidung
    if (type === 'decide' || !type) {
      prompt = task
    }

    result = await think(prompt)

    // Ergebnis in Supabase loggen
    await log('brain', `Gemini [${type || 'decide'}]: ${task?.slice(0, 50)}`, {
      type,
      resultLength: result.length
    })

    return NextResponse.json({
      success: true,
      type,
      result,
      tokens: result.length
    })

  } catch (error) {
    await log('error', `Brain Fehler: ${error.message}`, {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Hilfsfunktion für andere Routes
export { think }
