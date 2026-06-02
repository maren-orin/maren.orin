import { NextResponse } from 'next/server'
import { memorize } from '@/lib/supabase'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 })
  }

  // Code gegen Token tauschen
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://maren-orin.vercel.app/api/auth/callback',
      grant_type: 'authorization_code',
    })
  })

  const tokens = await response.json()

  if (tokens.refresh_token) {
    await memorize('gmail_refresh_token', tokens.refresh_token, 'auth')
    await memorize('gmail_access_token', tokens.access_token, 'auth')
    return NextResponse.json({ success: true, message: 'Gmail verbunden' })
  }

  return NextResponse.json({ error: 'Kein Refresh Token', tokens }, { status: 400 })
}
