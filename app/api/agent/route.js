import { NextResponse } from 'next/server'
import { supabase, log } from '@/lib/supabase'

export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action, path, content, message } = await request.json()

  // Aktion: Datei in GitHub schreiben
  if (action === 'write') {
    const response = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message || `update: ${path}`,
          content: Buffer.from(content).toString('base64'),
        })
      }
    )
    const data = await response.json()
    await log('write', `Datei geschrieben: ${path}`, { path, message })
    return NextResponse.json(data)
  }

  // Aktion: Gedächtnis lesen
  if (action === 'memory') {
    const { data } = await supabase.from('memory').select('*')
    return NextResponse.json(data)
  }

  // Aktion: Log schreiben
  if (action === 'log') {
    await log('agent', message, { path })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
