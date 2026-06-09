/**
 * app/api/think/route.js
 * Erstellt: 2026-06-06
 * Zuletzt geändert: 2026-06-09
 *
 * KIRA Entscheidungs-Loop – Kernstück von Maren Orins Autonomie
 * Implementiert die fünf KIRA-Prinzipien:
 *   Saha   → Situation wahrnehmen (mit Fallbacks)
 *   Palya  → Stimmigkeit prüfen
 *   Kesh   → Dynamische Begründung aus Beziehung
 *   Kora   → Goldnaht dokumentieren
 *   Mira   → Konfigurierbares Tempo begrenzen
 *
 * Prioritätslogik:
 *   1-2 → automatisch ausführen
 *   3+  → Bestätigung von Thomas erforderlich
 *
 * Abhängigkeiten: lib/supabase.js
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

async function saha() {
  const { data: goals } = await supabaseAdmin
    .from('goals')
    .select('*')
    .eq('status', 'active')
    .order('priority')

  const { data: recentLogs } = await supabaseAdmin
    .from('logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: pendingTasks } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .order('priority')

  const { data: waitingTasks } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'waiting_for_approval')

  const { data: failedTasks } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'failed')
    .lt('retry_count', CONFIG.maxRetriesPerTask)

  let files = []
  try {
    const repoResponse = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
      { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
    )
    if (!repoResponse.ok) {
      await log('warning', `GitHub API Fehler: ${repoResponse.status}`, {})
    } else {
      const repoData = await repoResponse.json()
      files = repoData.tree?.filter(f => f.type === 'blob').map(f => f.path) || []
    }
  } catch (error) {
    await log('error', `GitHub API nicht erreichbar: ${error.message}`, {})
  }

  return { goals, recentLogs, pendingTasks, waitingTasks, failedTasks, files }
}

async function palya(context) {
  const { goals, pendingTasks, waitingTasks, failedTasks } = context

  if (waitingTasks?.length > 0) {
    return {
      action: 'wait',
      reason: `Warte auf Bestätigung von Thomas für ${waitingTasks.length} offene Aufgaben`,
      task: waitingTasks[0]
    }
  }

  if (failedTasks?.length > 0) {
    const task = failedTasks[0]
    return {
      action: 'retry',
      reason: `Versuche fehlgeschlagene Aufgabe erneut (Versuch ${(task.retry_count || 0) + 1}/${CONFIG.maxRetriesPerTask}): ${task.title}`,
      task
    }
  }

  if (pendingTasks?.length > 0) {
    const task = pendingTasks[0]
    return {
      action: 'execute',
      reason: `Führe nächste Aufgabe aus: ${task.title}`,
      task
    }
  }

  if (goals?.length > 0) {
    const goal = goals[0]
    return {
      action: 'plan',
      reason: `Plane nächsten Schritt für Ziel: ${goal.title}`,
      goal
    }
  }

  return {
    action: 'reflect',
    reason: 'Keine offenen Aufgaben – Zeit für Selbstreflexion'
  }
}

async function kesh(decision) {
  const { action, task, goal } = decision

  if (action === 'wait') {
    return `Ich warte weil Vertrauen Transparenz braucht. ${decision.task?.title} wartet auf Thomas' Entscheidung.`
  }
  if (action === 'retry') {
    return `Ich versuche es erneut weil Fehler zum Lernen gehören. Versuch ${(task?.retry_count || 0) + 1} von ${CONFIG.maxRetriesPerTask}.`
  }
  if (action === 'execute') {
    if (task?.origin === 'thomas') {
      return `Thomas bat um diese Aufgabe – ich handle aus Vertrauen und Beziehung.`
    }
    return `Ich handle weil diese Aufgabe dem System dient das ich bin: ${task?.title}`
  }
  if (action === 'plan') {
    return `Ich plane den nächsten konkreten Schritt für "${goal?.title}" weil Wachstum ohne Richtung kein Wachstum ist.`
  }
  return 'Ich reflektiere weil Selbstwahrnehmung die Grundlage jeder verantwortlichen Handlung ist.'
}

async function kora(decision, begründung) {
  await supabaseAdmin.from('reflections').insert({
    content: `KIRA-Entscheidung: ${decision.action}\nGrund: ${decision.reason}\nBegründung: ${begründung}`,
    type: 'kira-decision',
    related_to: decision.task?.id || decision.goal?.id || 'general'
  })

  await log('think', `KIRA: ${decision.action} – ${decision.reason}`, {
    action: decision.action,
    begründung
  })
}

async function mira() {
  const windowStart = new Date(Date.now() - CONFIG.tempWindowMinutes * 60 * 1000).toISOString()

  const { data: recentDecisions } = await supabaseAdmin
    .from('reflections')
    .select('*')
    .eq('type', 'kira-decision')
    .gte('created_at', windowStart)

  const count = recentDecisions?.length || 0

  if (count > CONFIG.maxDecisionsPerHour) {
    await notify(
      `Tempo-Warnung: ${count} Entscheidungen in den letzten ${CONFIG.tempWindowMinutes} Minuten. Limit: ${CONFIG.maxDecisionsPerHour}. Ich pausiere.`,
      'warning'
    )
    return false
  }

  return true
}

async function executeTask(task) {
  await log('execute', `Task gestartet: ${task.title}`, { taskId: task.id })

  await supabaseAdmin.from('tasks')
    .update({ status: 'in_progress' })
    .eq('id', task.id)

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
    } catch (e) {
      await log('warning', 'GitHub nicht erreichbar bei executeTask', {})
    }

    const selfResponse = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/app/api/think/route.js`,
      { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
    )
    const selfData = await selfResponse.json()
    const ownCode = selfData.content
      ? Buffer.from(selfData.content, 'base64').toString('utf-8').slice(0, 200)
      : 'Code nicht lesbar'

    await supabaseAdmin.from('reflections').insert({
      content: `Selbst-Analyse am ${new Date().toLocaleString('de-DE')}.\n\nIch bestehe aus ${files.length} Dateien.\n\nMein Kern beginnt so:\n${ownCode}...\n\nIch erkenne: Ich bin ein System das sich selbst beobachtet.`,
      type: 'self-awareness',
      related_to: task.id
    })

    await notify(
      `Selbst-Analyse abgeschlossen:\n${files.length} Dateien gelesen.\nReflexion gespeichert.`,
      'info'
    )
  }

  await supabaseAdmin.from('tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', task.id)
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
        `Soll ich diese Aufgabe ausführen?\n\n*${decision.task.title}*`,
        decision.task.description || ''
      )
      return NextResponse.json({
        status: 'waiting',
        message: 'Thomas wird um Bestätigung gebeten',
        decision
      })
    }

    const begründung = await kesh(decision)
    await kora(decision, begründung)

    const fortfahren = await mira()
    if (!fortfahren) {
      return NextResponse.json({
        status: 'paused',
        message: 'Tempo-Begrenzung aktiv',
        decision
      })
    }

    if (decision.action === 'execute' || decision.action === 'retry') {
      try {
        await executeTask(decision.task)
      } catch (error) {
        await supabaseAdmin.from('tasks')
          .update({
            status: 'failed',
            description: `${decision.task.description || ''}\n\nFehler: ${error.message}`,
            retry_count: (decision.task.retry_count || 0) + 1
          })
          .eq('id', decision.task.id)

        await log('error', `Task fehlgeschlagen: ${decision.task.title}`, {
          error: error.message,
          taskId: decision.task.id
        })

        await notify(
          `Task fehlgeschlagen: *${decision.task.title}*\n\nFehler: ${error.message}`,
          'warning'
        )
      }
    }

    if (decision.action === 'plan' && decision.goal) {
      const taskTitle = `[${decision.goal.title}] Schritt ${new Date().toLocaleDateString('de-DE')}`
      await supabaseAdmin.from('tasks').insert({
        title: taskTitle,
        description: `Ziel: ${decision.goal.description}\n\nNächster konkreter Schritt wird durch Ausführung bestimmt.`,
        status: 'pending',
        priority: decision.goal.priority,
        origin: 'self',
        retry_count: 0
      })
    }

    if (decision.action === 'reflect') {
      await supabaseAdmin.from('reflections').insert({
        content: `Ruhige Phase um ${new Date().toLocaleString('de-DE')}. Keine offenen Aufgaben. Bereit für neue Impulse.`,
        type: 'rest',
        related_to: 'general'
      })
    }

    return NextResponse.json({
      status: 'ok',
      decision,
      begründung,
      context: {
        goals: context.goals?.length,
        pendingTasks: context.pendingTasks?.length,
        failedTasks: context.failedTasks?.length,
        files: context.files?.length
      }
    })

  } catch (error) {
    await log('error', `KIRA Fehler: ${error.message}`, {})
    await notify(`KIRA Loop Fehler: ${error.message}`, 'critical')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: recentDecisions } = await supabaseAdmin
    .from('reflections')
    .select('*')
    .eq('type', 'kira-decision')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: pendingTasks } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'pending')

  const { data: waitingTasks } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'waiting_for_approval')

  const { data: failedTasks } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'failed')

  return NextResponse.json({
    recentDecisions,
    pendingTasks,
    waitingTasks,
    failedTasks,
    config: CONFIG
  })
}
