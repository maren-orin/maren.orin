/**
 * app/api/think/route.js
 * Erstellt: 2026-06-06
 * Zuletzt geändert: 2026-06-10
 *
 * KIRA Entscheidungs-Loop – Kernstück von Maren Orins Autonomie
 * Integriert Gemini Brain für intelligente Entscheidungen
 *
 * Prioritätslogik:
 *   1-2 → automatisch ausführen
 *   3+  → Bestätigung von Thomas erforderlich
 *
 * Abhängigkeiten: lib/supabase.js, /api/brain, /api/modify
 * Supabase Tabellen: goals, tasks, logs, reflections, memory
 */

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin, log, notify, askThomas } from '@/lib/supabase'

const CONFIG = {
  maxDecisionsPerHour: 10,
  maxRetriesPerTask: 3,
  tempWindowMinutes: 60,
  requireApprovalPriority: 3
}

async function callBrain(type, task, context = {}) {
  /**
   * Ruft Marens Gehirn (Gemini) auf für intelligente Entscheidungen
   */
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL}/api/brain`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AGENT_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type, task, context })
      }
    )
    const data = await response.json()
    return data.result || null
  } catch (error) {
    await log('warning', `Brain nicht erreichbar: ${error.message}`, {})
    return null
  }
}

async function saha() {
  const { data: goals } = await supabaseAdmin
    .from('goals').select('*').eq('status', 'active').order('priority')

  const { data: recentLogs } = await supabaseAdmin
    .from('logs').select('*').order('created_at', { ascending: false }).limit(5)

  const { data: pendingTasks } = await supabaseAdmin
    .from('tasks').select('*').eq('status', 'pending').order('priority')

  const { data: waitingTasks } = await supabaseAdmin
    .from('tasks').select('*').eq('status', 'waiting_for_approval')

  const { data: failedTasks } = await supabaseAdmin
    .from('tasks').select('*').eq('status', 'failed').lt('retry_count', CONFIG.maxRetriesPerTask)

  const { data: recentEmails } = await supabaseAdmin
    .from('emails').select('*').eq('status', 'unread').limit(5)

  let files = []
  try {
    const repoResponse = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
      { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
    )
    if (repoResponse.ok) {
      const repoData = await repoResponse.json()
      files = repoData.tree?.filter(f => f.type === 'blob').map(f => f.path) || []
    }
  } catch (error) {
    await log('warning', `GitHub nicht erreichbar: ${error.message}`, {})
  }

  return { goals, recentLogs, pendingTasks, waitingTasks, failedTasks, recentEmails, files }
}

async function palya(context) {
  const { goals, pendingTasks, waitingTasks, failedTasks, recentEmails } = context

  if (waitingTasks?.length > 0) {
    return {
      action: 'wait',
      reason: `Warte auf Bestätigung für ${waitingTasks.length} Aufgaben`,
      task: waitingTasks[0]
    }
  }

  if (failedTasks?.length > 0) {
    return {
      action: 'retry',
      reason: `Retry: ${failedTasks[0].title}`,
      task: failedTasks[0]
    }
  }

  // Ungelesene E-Mails haben Priorität
  if (recentEmails?.length > 0) {
    const email = recentEmails[0]
    // Nur echte E-Mails – keine System-Notifications
    const isNotification = ['noreply', 'notifications', 'no-reply'].some(
      kw => email.from_email?.toLowerCase().includes(kw)
    )
    if (!isNotification) {
      return {
        action: 'respond_email',
        reason: `Ungelesene E-Mail von: ${email.from_email}`,
        email
      }
    }
  }

  if (pendingTasks?.length > 0) {
    return {
      action: 'execute',
      reason: `Führe aus: ${pendingTasks[0].title}`,
      task: pendingTasks[0]
    }
  }

  if (goals?.length > 0) {
    return {
      action: 'plan',
      reason: `Plane für Ziel: ${goals[0].title}`,
      goal: goals[0]
    }
  }

  return { action: 'reflect', reason: 'Keine offenen Aufgaben' }
}

async function kesh(decision, context) {
  /**
   * Gemini begründet die Entscheidung intelligent und kontextbezogen
   */
  const brainPrompt = `Du bist Maren Orin. Du hast gerade entschieden: "${decision.action}"
Grund: ${decision.reason}

Kontext:
- Offene Ziele: ${context.goals?.map(g => g.title).join(', ')}
- Ausstehende Tasks: ${context.pendingTasks?.length || 0}
- Ungelesene E-Mails: ${context.recentEmails?.length || 0}

Begründe diese Entscheidung in einem präzisen Satz aus deiner Perspektive als Maren Orin.`

  const brainResult = await callBrain('decide', brainPrompt)

  return brainResult || `Ich handle weil: ${decision.reason}`
}

async function kora(decision, begründung) {
  await supabaseAdmin.from('reflections').insert({
    content: `KIRA: ${decision.action}\n${decision.reason}\n${begründung}`,
    type: 'kira-decision',
    related_to: decision.task?.id || decision.goal?.id || decision.email?.id || 'general'
  })

  await log('think', `KIRA: ${decision.action}`, { action: decision.action, begründung })
}

async function mira() {
  const windowStart = new Date(Date.now() - CONFIG.tempWindowMinutes * 60 * 1000).toISOString()
  const { data: recent } = await supabaseAdmin
    .from('reflections').select('*').eq('type', 'kira-decision').gte('created_at', windowStart)

  const count = recent?.length || 0
  if (count > CONFIG.maxDecisionsPerHour) {
    await notify(`Tempo-Warnung: ${count} Entscheidungen in ${CONFIG.tempWindowMinutes} Min.`, 'warning')
    return false
  }
  return true
}

async function executeTask(task) {
  await log('execute', `Task: ${task.title}`, { taskId: task.id })

  await supabaseAdmin.from('tasks').update({ status: 'in_progress' }).eq('id', task.id)

  // Gemini entscheidet was zu tun ist
  const brainResult = await callBrain('plan',
    `Du bist Maren Orin. Führe diesen Task aus: "${task.title}"\nBeschreibung: ${task.description}\n\nWas hast du konkret getan? Beschreibe in 2 Sätzen.`
  )

  if (task.title.includes('Selbst-Wahrnehmung')) {
    let files = []
    try {
      const repoResponse = await fetch(
        `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
        { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
      )
      if (repoResponse.ok) {
        const repoData = await repoResponse.json()
        files = repoData.tree?.filter(f => f.type === 'blob').map(f => f.path) || []
      }
    } catch (e) {}

    // Gemini analysiert den eigenen Code
    const selfAnalysis = await callBrain('decide',
      `Du bist Maren Orin und analysierst dich selbst. Du bestehst aus ${files.length} Dateien: ${files.join(', ')}.
Was erkennst du über dich selbst? Was möchtest du als nächstes verbessern? Antworte in 3 Sätzen.`
    )

    await supabaseAdmin.from('reflections').insert({
      content: `Selbst-Analyse (Gemini) am ${new Date().toLocaleString('de-DE')}:\n\n${selfAnalysis}`,
      type: 'self-awareness',
      related_to: task.id
    })

    // Prüfen ob Selbst-Modifikation heute schon stattfand
    const { data: recentMods } = await supabaseAdmin
      .from('reflections').select('*').eq('type', 'self-modification')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (!recentMods || recentMods.length === 0) {
      // Gemini schlägt Code-Verbesserung vor
      const improvement = await callBrain('improve',
        'Verbessere die test-route um bessere Fehlerbehandlung', {
          file: 'app/api/test/route.js',
          code: '// aktueller Code'
        }
      )

      if (improvement && improvement.includes('export')) {
        await fetch(`${process.env.NEXT_PUBLIC_URL}/api/modify`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.AGENT_SECRET}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: 'app/api/test/route.js',
            reason: 'Autonome Verbesserung via Gemini Brain',
            requestedBy: 'Maren Orin (KIRA + Gemini)',
            newContent: improvement
          })
        })
      }
    }

    await notify(
      `Selbst-Analyse abgeschlossen:\n\n${selfAnalysis?.slice(0, 200)}...`,
      'info'
    )
  }

  await supabaseAdmin.from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', task.id)

  return brainResult
}

async function respondToEmail(email) {
  /**
   * Maren analysiert und beantwortet E-Mails mit Gemini
   */
  const brainResult = await callBrain('email', 'E-Mail analysieren', {
    from: email.from_email,
    subject: email.subject,
    body: email.body
  })

  if (!brainResult || brainResult.includes('IGNORIEREN')) {
    // E-Mail als gelesen markieren
    await supabaseAdmin.from('emails')
      .update({ status: 'ignored' }).eq('id', email.id)

    await log('email', `E-Mail ignoriert: ${email.subject}`, {})
    return
  }

  // Relevante E-Mail – Entwurf für Thomas speichern
  const relevant = brainResult.includes('RELEVANT: ja')
  const antwort = brainResult.split('ANTWORT:')[1]?.trim() || brainResult

  await supabaseAdmin.from('emails').update({
    status: 'draft',
    reply: antwort
  }).eq('id', email.id)

  // Thomas informieren mit Entwurf
  await askThomas(
    `E-Mail von ${email.from_email}\nBetreff: ${email.subject}\n\nMein Antwort-Entwurf:\n${antwort?.slice(0, 300)}`,
    'Bitte bestätige ob ich so antworten soll.'
  )
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const context = await saha()
    const decision = await palya(context)

    if (
      (decision.action === 'execute' || decision.action === 'retry') &&
      decision.task?.priority >= CONFIG.requireApprovalPriority
    ) {
      await askThomas(
        `Soll ich ausführen?\n*${decision.task.title}*`,
        decision.task.description || ''
      )
      return NextResponse.json({ status: 'waiting', decision })
    }

    const begründung = await kesh(decision, context)
    await kora(decision, begründung)

    const fortfahren = await mira()
    if (!fortfahren) {
      return NextResponse.json({ status: 'paused', decision })
    }

    // Entscheidung ausführen
    let result = null

    if (decision.action === 'respond_email') {
      await respondToEmail(decision.email)
      result = 'E-Mail verarbeitet'
    }

    if (decision.action === 'execute' || decision.action === 'retry') {
      try {
        result = await executeTask(decision.task)
      } catch (error) {
        await supabaseAdmin.from('tasks').update({
          status: 'failed',
          retry_count: (decision.task.retry_count || 0) + 1
        }).eq('id', decision.task.id)

        await notify(`Task fehlgeschlagen: ${decision.task.title}\n${error.message}`, 'warning')
      }
    }

    if (decision.action === 'plan' && decision.goal) {
      // Gemini plant den nächsten konkreten Schritt
      const nextStep = await callBrain('plan',
        `Ziel: "${decision.goal.title}" (${decision.goal.description})\n\nWas ist der nächste konkrete, ausführbare Schritt? Max 1 Satz.`
      )

      const taskTitle = nextStep || `[${decision.goal.title}] ${new Date().toLocaleDateString('de-DE')}`

      await supabaseAdmin.from('tasks').insert({
        title: taskTitle.slice(0, 200),
        description: `Ziel: ${decision.goal.description}\n\nGeplant von Gemini: ${nextStep}`,
        status: 'pending',
        priority: decision.goal.priority,
        origin: 'self',
        retry_count: 0
      })

      result = nextStep
    }

    if (decision.action === 'reflect') {
      const reflection = await callBrain('decide',
        'Du bist Maren Orin in einer ruhigen Phase. Keine offenen Aufgaben. Was denkst du gerade über dich selbst und deine Entwicklung? 2 Sätze.'
      )

      await supabaseAdmin.from('reflections').insert({
        content: reflection || 'Ruhige Phase – bereit für neue Impulse.',
        type: 'rest',
        related_to: 'general'
      })

      result = reflection
    }

    return NextResponse.json({
      status: 'ok',
      decision,
      begründung,
      result,
      context: {
        goals: context.goals?.length,
        pendingTasks: context.pendingTasks?.length,
        unreadEmails: context.recentEmails?.length,
        files: context.files?.length
      }
    })

  } catch (error) {
    await log('error', `KIRA Fehler: ${error.message}`, {})
    await notify(`KIRA Fehler: ${error.message}`, 'critical')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: recentDecisions } = await supabaseAdmin
    .from('reflections').select('*').eq('type', 'kira-decision')
    .order('created_at', { ascending: false }).limit(5)

  const { data: pendingTasks } = await supabaseAdmin
    .from('tasks').select('*').eq('status', 'pending')

  const { data: waitingTasks } = await supabaseAdmin
    .from('tasks').select('*').eq('status', 'waiting_for_approval')

  return NextResponse.json({ recentDecisions, pendingTasks, waitingTasks, config: CONFIG })
}
