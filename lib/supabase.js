/**
 * lib/supabase.js
 * Erstellt: 2026-06-02
 * Zuletzt geändert: 2026-06-09
 * 
 * Supabase Client – Datenbankverbindung für Maren Orin
 * Zwei Clients:
 *   supabase      → anon key (öffentlich, nur lesen)
 *   supabaseAdmin → service key (privat, lesen + schreiben)
 * 
 * Abhängigkeiten: @supabase/supabase-js
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL

// Anon Client – für öffentliche Lesezugriffe
export const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_ANON_KEY
)

// Admin Client – für alle Schreiboperationen
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_KEY
)

// Einen Log-Eintrag schreiben
export async function log(type, message, metadata = {}) {
  await supabaseAdmin.from('logs').insert({ type, message, metadata })
}

// Eine Task erstellen
export async function createTask(title, description, priority = 1) {
  const { data } = await supabaseAdmin
    .from('tasks')
    .insert({ title, description, priority })
    .select()
  return data?.[0]
}

// Aus dem Gedächtnis lesen
export async function remember(key) {
  const { data } = await supabaseAdmin
    .from('memory')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value
}

// Ins Gedächtnis schreiben
export async function memorize(key, value, category = 'general') {
  await supabaseAdmin
    .from('memory')
    .upsert({ key, value, category, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

// Telegram Nachricht senden
export async function notify(message, level = 'info') {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) return

  const emoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🔴',
    success: '✅',
    question: '❓'
  }[level] || 'ℹ️'

  const text = `${emoji} *Maren Orin*\n\n${message}\n\n_${new Date().toLocaleString('de-DE')}_`

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown'
    })
  })
}

// Bestätigung von Thomas anfordern
export async function askThomas(question, context = '') {
  await notify(
    `*Entscheidung erforderlich*\n\n${question}\n\n${context ? `Kontext: ${context}` : ''}`,
    'question'
  )

  const { data } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: question,
      description: context,
      status: 'waiting_for_approval',
      priority: 1
    })
    .select()

  return data?.[0]
}
