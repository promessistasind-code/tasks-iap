interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  variant?: "default" | "destructive"
}

export interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: (value: boolean) => void
}

let current: ConfirmState | null = null
const listeners = new Set<() => void>()
export const getConfirmation = () => current
export function subscribeConfirmation(notify: () => void) {
  listeners.add(notify)
  return () => { listeners.delete(notify) }
}
export function closeConfirmation(result: boolean) {
  const previous = current
  current = null
  previous?.resolve(result)
  listeners.forEach(notify => notify())
}
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  if (!listeners.size) return Promise.resolve(false)
  current?.resolve(false)
  return new Promise(resolve => {
    current = { ...options, open: true, resolve }
    listeners.forEach(notify => notify())
  })
}
