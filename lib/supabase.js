import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Einen Log-Eintrag schreiben
export async function log(type, message, metadata = {}) {
  await supabase.from('logs').insert({ type, message, metadata })
}

// Eine Task erstellen
export async function createTask(title, description, priority = 1) {
  const { data } = await supabase
    .from('tasks')
    .insert({ title, description, priority })
    .select()
  return data?.[0]
}

// Aus dem Gedächtnis lesen
export async function remember(key) {
  const { data } = await supabase
    .from('memory')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value
}

// Ins Gedächtnis schreiben
export async function memorize(key, value, category = 'general') {
  await supabase
    .from('memory')
    .upsert({ key, value, category, updated_at: new Date().toISOString() })
}
