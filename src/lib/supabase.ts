import { createClient } from "@supabase/supabase-js"
import { processLock } from "@supabase/auth-js"

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// fetch com timeout real via AbortController: sem isso, uma requisição que
// nunca resolve (rede instável, aba em background, etc.) deixa o
// processLock permanentemente ocupado — todo Promise.race de timeout no
// app só para de *esperar*, mas a chamada original continua presa por
// baixo, então a próxima operação também trava e falha do mesmo jeito.
// Abortar de verdade libera o lock e o app volta a funcionar na tentativa seguinte.
function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal }).finally(() => clearTimeout(timer))
  }
}

// processLock (em vez do padrão navigatorLock) evita que uma aba travada
// (ex: sessão presa em navigator.locks) prenda pra sempre a sessão de
// qualquer outra aba/janela aberta na mesma origem — cada aba passa a
// gerenciar seu próprio refresh de token de forma independente.
export const supabase = createClient(url, key, {
  auth: { lock: processLock },
  global: { fetch: fetchWithTimeout(8000) },
})
