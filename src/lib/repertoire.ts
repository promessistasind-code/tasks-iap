import { supabase } from './supabase'
export interface Song { title: string; key: string; version: string; chords: string; url: string }
export interface Repertoire { enabled: boolean; canConfigure: boolean; canEdit: boolean; version: number; songs: Song[]; script: string }
export interface LibrarySong { id: string; song: Song }
export async function libraryApi<T>(op: string, eventId: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc('repertoire_library_portal', { op, payload: { ...payload, eventId } })
  if (error) throw new Error(error.message)
  return data as T
}
export async function repertoireApi(op: string, eventId: string, payload: Record<string, unknown> = {}): Promise<Repertoire> {
  const { data, error } = await supabase.rpc('repertoire_portal', { op, payload: { ...payload, eventId } })
  if (error) throw new Error(error.message)
  return data as Repertoire
}
