import { NextResponse } from 'next/server'

export async function POST(request) {
  const { path, content, message } = await request.json()

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
  return NextResponse.json(data)
}
