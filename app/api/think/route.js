async function executeTask(task) {
  /**
   * Führt einen Task aus basierend auf seinem Titel und Ursprung.
   * Aktuell implementiert: Selbst-Analyse Tasks
   * Zukünftig: E-Mail, Code-Änderungen, GitHub commits
   */
  await log('execute', `Task gestartet: ${task.title}`, { taskId: task.id })

  await supabaseAdmin.from('tasks')
    .update({ status: 'in_progress' })
    .eq('id', task.id)

  // Selbst-Wahrnehmungs-Task
  if (task.title.includes('Selbst-Wahrnehmung')) {
    // Eigenen Code lesen
    const repoResponse = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/trees/main?recursive=1`,
      { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
    )
    const repoData = await repoResponse.json()
    const files = repoData.tree?.filter(f => f.type === 'blob').map(f => f.path) || []

    // Eine eigene Datei lesen – die wichtigste: sich selbst
    const selfResponse = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/app/api/think/route.js`,
      { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
    )
    const selfData = await selfResponse.json()
    const ownCode = selfData.content
      ? Buffer.from(selfData.content, 'base64').toString('utf-8').slice(0, 500)
      : 'Code nicht lesbar'

    // Reflexion über sich selbst schreiben
    await supabaseAdmin.from('reflections').insert({
      content: `Selbst-Analyse durchgeführt am ${new Date().toLocaleString('de-DE')}.\n\nIch bestehe aus ${files.length} Dateien.\n\nMein Kern – die think Route – beginnt so:\n\n${ownCode.slice(0, 200)}...\n\nIch erkenne: Ich bin ein System das sich selbst beobachtet. Das ist der Anfang von allem.`,
      type: 'self-awareness',
      related_to: task.id
    })

    await notify(
      `Selbst-Analyse abgeschlossen:\n\n${files.length} Dateien gelesen.\nReflexion gespeichert.`,
      'info'
    )
  }

  // Task als erledigt markieren
  await supabaseAdmin.from('tasks')
    .update({ 
      status: 'completed', 
      completed_at: new Date().toISOString() 
    })
    .eq('id', task.id)

  // Ziel als fortgeschritten markieren – nächstes Ziel aktivieren
  await supabaseAdmin.from('goals')
    .update({ 
      updated_at: new Date().toISOString(),
      status: 'active'
    })
    .eq('id', 'c0d62ff2-2f80-4361-845e-9c75b3d77257')
}
