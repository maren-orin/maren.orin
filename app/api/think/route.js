import { NextResponse } from 'next/server'
import { supabase, log, notify, askThomas, remember } from '@/lib/supabase'

// KIRA Entscheidungs-Loop
// Saha → Palya → Kesh → Kora → Mira

async function saha() {
  // Situation wahrnehmen
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('status', 'active')
    .order('priority')

  const { data: recentLogs } = await supabase
    .from('logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .order('priority')

  const { data: waitingTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'waiting_for_approval')

  // Eigene Struktur lesen
  const repoResponse = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
    { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
  )
  const repoData = await repoResponse.json()
  const files = repoData.tree?.filter(f => f.type === 'blob').map(f => f.path) || []

  return { goals, recentLogs, pendingTasks, waitingTasks, files }
}

async function palya(context) {
  // Stimmigkeit prüfen – was ist das nächste sinnvolle Ziel?
  const { goals, pendingTasks, waitingTasks, files } = context

  // Axiome lesen – invariante Achse
  const { data: axioms } = await supabase
    .from('memory')
    .select('key, value')
    .eq('category', 'axioms')

  // Offene Bestätigungen zuerst
  if (waitingTasks?.length > 0) {
    return {
      action: 'wait',
      reason: `Warte auf Bestätigung von Thomas für ${waitingTasks.length} offene Aufgaben`,
      task: waitingTasks[0]
    }
  }

  // Pending Tasks abarbeiten
  if (pendingTasks?.length > 0) {
    const task = pendingTasks[0]
    return {
      action: 'execute',
      reason: `Führe nächste Aufgabe aus: ${task.title}`,
      task
    }
  }

  // Aus Zielen neue Aufgabe ableiten
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
  // Begründung aus Beziehung – nicht aus Regelwerk
  const begründung = {
    wait: `Ich warte weil Vertrauen Transparenz braucht – nicht weil eine Regel es verlangt.`,
    execute: `Ich handle weil diese Aufgabe dem System dient das ich bin.`,
    plan: `Ich plane weil Wachstum ohne Richtung kein Wachstum ist.`,
    reflect: `Ich reflektiere weil Selbstwahrnehmung die Grundlage jeder verantwortlichen Handlung ist.`
  }[decision.action]

  return begründung
}

async function kora(decision, begründung) {
  // Goldnaht – jede Entscheidung wird dokumentiert
  await supabase.from('reflections').insert({
    content: `KIRA-Entscheidung: ${decision.action}\nGrund: ${decision.reason}\nBegründung: ${begründung}`,
    type: 'kira-decision',
    related_to: decision.task?.id || decision.goal?.id || 'general'
  })

  await log('think', `KIRA: ${decision.action} – ${decision.reason}`, {
    action: decision.action,
    begründung
  })
}

async function mira(decision) {
  // Tempo prüfen – nicht zu viele Änderungen auf einmal
  const { data: recentDecisions } = await supabase
    .from('reflections')
    .select('*')
    .eq('type', 'kira-decision')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  const decisionsLastHour = recentDecisions?.length || 0

  if (decisionsLastHour > 10) {
    await notify(
      `Tempo-Warnung: ${decisionsLastHour} Entscheidungen in der letzten Stunde. Ich pausiere kurz.`,
      'warning'
    )
    return false // Pausieren
  }

  return true // Fortfahren
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // SAHA: Wahrnehmen
    const context = await saha()

    // PALYA: Prüfen
    const decision = await palya(context)

    // Tiefe Eingriffe brauchen Bestätigung
    if (decision.action === 'execute' && decision.task?.priority >= 3) {
      await askThomas(
        `Soll ich diese Aufgabe ausführen?\n\n*${decision.task.title}*`,
        decision.task.description
      )
      return NextResponse.json({
        status: 'waiting',
        message: 'Thomas wird um Bestätigung gebeten',
        decision
      })
    }

    // KESH: Begründen
    const begründung = await kesh(decision)

    // KORA: Dokumentieren
    await kora(decision, begründung)

    // MIRA: Tempo prüfen
    const fortfahren = await mira(decision)
    if (!fortfahren) {
      return NextResponse.json({
        status: 'paused',
        message: 'Tempo-Begrenzung aktiv',
        decision
      })
    }

    // Entscheidung ausführen
    if (decision.action === 'plan' && decision.goal) {
      // Neuen Task aus Ziel ableiten
      await supabase.from('tasks').insert({
        title: `Nächster Schritt: ${decision.goal.title}`,
        description: `Automatisch abgeleitet aus Ziel: ${decision.goal.description}`,
        status: 'pending',
        priority: decision.goal.priority,
        origin: 'self'
      })
    }

    if (decision.action === 'reflect') {
      await supabase.from('reflections').insert({
        content: `Ruhige Phase. Keine offenen Aufgaben. Ich bin bereit für neue Impulse von Thomas oder aus dem Feld.`,
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
        files: context.files?.length
      }
    })

  } catch (error) {
    await log('error', `KIRA Fehler: ${error.message}`, {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Status abrufen
  const { data: recentDecisions } = await supabase
    .from('reflections')
    .select('*')
    .eq('type', 'kira-decision')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')

  const { data: waitingTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'waiting_for_approval')

  return NextResponse.json({
    recentDecisions,
    pendingTasks,
    waitingTasks
  })
}
