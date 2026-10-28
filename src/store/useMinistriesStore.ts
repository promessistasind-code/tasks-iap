import {useEffect, useRef, useState, useCallback} from 'react'
import {supabase} from '@/lib/supabase'
import type {Ministry, Membership} from '@/lib/people'

export interface MinistryWorkspace extends Ministry { membership?: Membership }

export function useMinistriesStore(isAdmin: boolean) {
  const [catalog, setCatalog] = useState<Ministry[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [ministriesLoading, setLoading] = useState(true)
  const [ministriesError, setError] = useState<string | null>(null)
  const reloadRef = useRef<() => void>(() => {})
  const reloadMinistries = useCallback(() => reloadRef.current(), [])
  useEffect(() => {
    let active = true, running = false, dirty = false
    const controller = new AbortController()
    async function load() {
      if (!active) return
      if (running) { dirty = true; return }
      running = true
      try {
        const [catalogResult, ownResult] = await Promise.all([
          supabase.rpc('people_portal', {op: 'catalog', payload: {}}).abortSignal(controller.signal),
          supabase.rpc('people_portal', {op: 'myMemberships', payload: {}}).abortSignal(controller.signal),
        ])
        if (catalogResult.error || ownResult.error) throw catalogResult.error ?? ownResult.error
        if (active) {
          setCatalog(catalogResult.data ?? [])
          setMemberships(ownResult.data ?? [])
          setError(null)
        }
      } catch {
        if (active) {
          // Do not keep a stale membership workspace visible after an access failure.
          setCatalog([]); setMemberships([])
          setError('Não foi possível verificar seus ministérios. Tente novamente.')
        }
      } finally {
        running = false
        if (active) {
          setLoading(false)
          if (dirty) { dirty = false; void load() }
        }
      }
    }
    const reload = () => { void load() }
    reloadRef.current = reload
    window.addEventListener('focus', reload)
    window.addEventListener('ministry-access-changed', reload)
    void load()
    return () => {
      active = false; controller.abort(); reloadRef.current = () => {}
      window.removeEventListener('focus', reload)
      window.removeEventListener('ministry-access-changed', reload)
    }
  }, [])
  const ministryCatalog: MinistryWorkspace[] = catalog
    .map(m => ({...m, membership: memberships.find(own => own.ministry_id === m.id && own.active)}))
  const ministries = ministryCatalog.filter(m => isAdmin || m.membership)
  return {ministries, ministryCatalog, ministriesLoading, ministriesError, reloadMinistries}
}
