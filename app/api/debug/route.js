import { NextResponse } from 'next/server'

export async function GET() {
  const repo = process.env.GITHUB_REPO || 
    `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO_NAME}`
  
  const token = process.env.GITHUB_TOKEN
  
  const response = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/main?recursive=1`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  )
  
  const data = await response.json()
  
  return NextResponse.json({
    repo,
    tokenExists: !!token,
    tokenStart: token?.substring(0, 4),
    status: response.status,
    data
  })
}
