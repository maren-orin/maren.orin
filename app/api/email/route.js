import { NextResponse } from 'next/server'
import { supabase, log, remember } from '@/lib/supabase'

async function getAccessToken() {
  const refreshToken = await remember('gmail_refresh_token')
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    })
  })
  
  const data = await response.json()
  return data.access_token
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const accessToken = await getAccessToken()
    
    // Ungelesene E-Mails abrufen
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=10',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    
    const listData = await listResponse.json()
    const messages = listData.messages || []
    
    const emails = []
    
    for (const msg of messages) {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
      const msgData = await msgResponse.json()
      
      const headers = msgData.payload.headers
      const from = headers.find(h => h.name === 'From')?.value || ''
      const subject = headers.find(h => h.name === 'Subject')?.value || ''
      const body = msgData.snippet || ''
      
      // In Supabase speichern
      await supabase.from('emails').upsert({
        id: msg.id,
        from_email: from,
        subject,
        body,
        status: 'unread'
      })
      
      emails.push({ from, subject, body })
    }
    
    await log('email', `${emails.length} E-Mails abgerufen`, { count: emails.length })
    
    return NextResponse.json({ success: true, count: emails.length, emails })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
