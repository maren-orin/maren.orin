import { NextResponse } from 'next/server'
import { supabase, remember } from '@/lib/supabase'

export async function GET() {
  try {
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
      return NextResponse.json({ error: 'Kein Access Token', tokenData })
    }

    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=5',
      { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
    )
    
    const listData = await listResponse.json()
    const messages = listData.messages || []

    const emails = []
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
  id: msg.id,
  from_email: from,
  subject,
  body,
  status: 'unread'
}, { onConflict: 'id' })

      emails.push({ from, subject, body })
    }

    return NextResponse.json({ 
      success: true, 
      count: emails.length, 
      emails 
    })

  } catch (error) {
    return NextResponse.json({ error: error.message })
  }
}
