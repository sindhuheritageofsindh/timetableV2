import { createClient } from '@supabase/supabase-js'

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

const placeholder = (value: string) => !value || /YOUR_PROJECT|YOUR_ANON_KEY|YOUR_PUBLISHABLE_KEY/i.test(value)
const validUrl = /^https:\/\/[^\s]+\.supabase\.co$/i.test(rawUrl)

export const supabaseConfig = {
  url: rawUrl,
  key: rawKey,
  configured: !placeholder(rawUrl) && !placeholder(rawKey) && validUrl,
}

export const supabaseEnabled = supabaseConfig.configured

export const supabase = supabaseEnabled ? createClient(rawUrl, rawKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}) : null

const unavailableKey = 'timetable-supabase-unavailable'
let runtimeUnavailable = sessionStorage.getItem(unavailableKey) === '1'

export function markSupabaseUnavailable(error?: unknown) {
  runtimeUnavailable = true
  sessionStorage.setItem(unavailableKey, '1')
  if (error) console.error('Supabase connection disabled for this browser session.', error)
}

export function clearSupabaseUnavailable() {
  runtimeUnavailable = false
  sessionStorage.removeItem(unavailableKey)
}

export function isSupabaseAvailable() {
  return supabaseEnabled && !runtimeUnavailable && Boolean(supabase)
}

export function getSupabaseStatus() {
  if (!supabaseEnabled) return { ok: false, label: 'Local mode', detail: 'Supabase environment variables are not configured.' }
  if (runtimeUnavailable) return { ok: false, label: 'Supabase disconnected', detail: 'Supabase rejected a request. Local mode is active for this browser session.' }
  return { ok: true, label: 'Supabase configured', detail: 'Database credentials are loaded.' }
}
