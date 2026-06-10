/**
 * app/api/telegram/route.js
 * Erstellt: 2026-06-10
 * Zuletzt geändert: 2026-06-10
 *
 * Telegram Webhook – Maren empfängt Antworten von Thomas
 * Verarbeitet:
 *   "ja" / "yes" → Aufgabe bestätigen
 *   "nein" / "no" → Aufgabe ablehnen
 *   Text → Als neue Aufgabe speichern
 *
 * Abhängigkeiten: lib/supabase.js, Gmail API
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin, log, notify, remember } from '@/lib/supabase'

async function sendEmail(to, subject, body) {
  /**
   * Sendet eine E-Mail über Gmail API im Namen von maren.orin@endia.de
   */
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
  if (!tokenData.access_token) {
    throw new Error('Kein Gmail Access Token')
  }

  // E-Mail als RFC 2822 formatieren
  const emailLines = [
    `From: Maren Orin <maren.orin@endia.de>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body
  ]
  const email = emailLines.join('\r\n')
  const encodedEmail = Buffer.from(email).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const sendResponse = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedEmail })
    }
  )

  if (!sendResponse.ok) {
    const error = await sendResponse.json()
    throw new Error(`Gmail Send Fehler: ${JSON.stringify(error)}`)
  }

  return await sendResponse.json()
}

export async function POST(request) {
  try {
    const body = await request.json()
    const message = body.message

    if (!message) {
      return NextResponse.json({ ok: true })
    }

    const text = message.text?.toLowerCase().trim() || ''
    const chatId = message.chat?.id

    // Sicherheit – nur Thomas darf antworten
    if (String(chatId) !== process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true })
    }

    await log('telegram', `Nachricht empfangen: ${text}`, { chatId })

    // JA – letzte wartende Aufgabe bestätigen
    if (['ja', 'yes', 'ok', 'j', 'y'].includes(text)) {
      const { data: waitingTasks } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .eq('status', 'waiting_for_approval')
        .order('created_at', { ascending: false })
        .limit(1)

      if (!waitingTasks || waitingTasks.length === 0) {
        await notify('Keine wartenden Aufgaben gefunden.', 'info')
        return NextResponse.json({ ok: true })
      }

      const task = waitingTasks[0]

      // E-Mail Entwurf senden
      const { data: emailDraft } = await supabaseAdmin
        .from('emails')
        .select('*')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)

      if (emailDraft && emailDraft.length > 0) {
        const email = emailDraft[0]

        try {
          await sendEmail(
            email.from_email,
            `Re: ${email.subject}`,
            email.reply
          )

          await supabaseAdmin.from('emails').update({
            status: 'sent',
            replied_at: new Date().toISOString()
          }).eq('id', email.id)

          await supabaseAdmin.from('tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString()
          }).eq('id', task.id)

          await notify(
            `E-Mail gesendet an: ${email.from_email}\nBetreff: Re: ${email.subject}`,
            'success'
          )

          await log('email', `E-Mail gesendet: ${email.subject}`, { to: email.from_email })

        } catch (error) {
          await notify(`E-Mail senden fehlgeschlagen: ${error.message}`, 'warning')
        }

      } else {
        // Andere Aufgabe bestätigen
        await supabaseAdmin.from('tasks').update({
          status: 'pending'
        }).eq('id', task.id)

        await notify(`Aufgabe freigegeben: ${task.title}`, 'success')
      }
    }

    // NEIN – Aufgabe ablehnen
    else if (['nein', 'no', 'n', 'stopp', 'stop'].includes(text)) {
      const { data: waitingTasks } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .eq('status', 'waiting_for_approval')
        .order('created_at', { ascending: false })
        .limit(1)

      if (waitingTasks && waitingTasks.length > 0) {
        await supabaseAdmin.from('tasks').update({
          status: 'rejected'
        }).eq('id', waitingTasks[0].id)

        await notify(`Aufgabe abgelehnt: ${waitingTasks[0].title}`, 'info')
      }
    }

    // TEXT – Neue Aufgabe von Thomas
    else if (text.length > 3) {
      await supabaseAdmin.from('tasks').insert({
        title: message.text,
        description: `Direkt von Thomas per Telegram: ${message.text}`,
        status: 'pending',
        priority: 2,
        origin: 'thomas',
        retry_count: 0
      })

      await notify(
        `Neue Aufgabe von Thomas erhalten:\n"${message.text}"\n\nIch kümmere mich darum.`,
        'success'
      )
    }

    return NextResponse.json({ ok: true })

  } catch (error) {
    await log('error', `Telegram Webhook Fehler: ${error.message}`, {})
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Telegram Webhook aktiv' })
}
