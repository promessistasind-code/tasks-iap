export async function withTimeout<T>(promise: PromiseLike<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms) }),
    ])
  } finally { clearTimeout(timer) }
}
