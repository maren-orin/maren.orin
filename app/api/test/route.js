import { NextResponse } from 'next/server'
import { supabase, remember, log } from '@/lib/supabase'

export async function GET(request) {
  try {
    // Gmail Token holen
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

    // E-Mails lesen
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=5',
      { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
    )
    const listData = await listResponse.json()
    const messages = listData.messages || []

    for (const msg of messages) {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
      )
      const msgData = await msgResponse.json()
      const headers = msgData.payload.headers
      const from = headers.find(h => h.name === 'From')?.value || ''
      const subject = headers.find(h => h.name === 'Subject')?.value || ''
      const body = msgData.snippet || ''

      await supabase.from('emails').upsert({
        id: msg.id, from_email: from, subject, body, status: 'unread'
      }, { onConflict: 'id' })
    }

    // Repo Struktur lesen
    const repoResponse = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
      { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
    )
    const repoData = await repoResponse.json()
    const files = repoData.tree?.filter(f => f.type === 'blob').map(f => f.path) || []

    // Ziele lesen
    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .eq('status', 'active')
      .order('priority')

    // Reflexion speichern
    await supabase.from('reflections').insert({
      content: `Selbst-Analyse: ${files.length} Dateien im Repository. Aktive Ziele: ${goals?.map(g => g.title).join(', ')}`,
      type: 'self-analysis',
      related_to: 'main-loop'
    })

    await log('main', `Loop ausgeführt: ${messages.length} E-Mails, ${files.length} Dateien`, {
      emails: messages.length,
      files: files.length,
      goals: goals?.length
    })

    return NextResponse.json({ 
      success: true,
      emails: messages.length,
      files: files.length,
      goals: goals?.length,
      fileList: files
    })

  } catch (error) {
    await log('error', error.message, {})
    return NextResponse.json({ error: error.message })
  }
}
