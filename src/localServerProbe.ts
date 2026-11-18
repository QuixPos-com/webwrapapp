const LOCAL_SERVER_PROBE_TIMEOUT_MS = 5000

/** Probe one host; isolated fn so minified builds keep the correct URL per candidate. */
function probeLocalServerCandidate(
  serverUrl: string,
  timeoutMs: number,
  onSuccess: (url: string) => void,
  onFailure: () => void,
): () => void {
  let finished = false
  const controller = new AbortController()
  const timer = setTimeout(() => {
    if (finished) {
      return
    }
    finished = true
    controller.abort()
    onFailure()
  }, timeoutMs)

  fetch(`${serverUrl}/`, { method: 'GET', signal: controller.signal })
    .then((response) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      if (response.ok) {
        onSuccess(serverUrl)
      } else {
        console.log('local server probe failed:', serverUrl, response.status)
        onFailure()
      }
    })
    .catch((error: unknown) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      const message = error instanceof Error ? error.message : String(error)
      console.log('local server probe failed:', serverUrl, message)
      onFailure()
    })

  return () => {
    if (!finished) {
      finished = true
      clearTimeout(timer)
      controller.abort()
    }
  }
}

/** Race HTTP probes; first host that answers wins. */
export function probeFirstReachableLocalServer(
  candidates: readonly string[],
  timeoutMs = LOCAL_SERVER_PROBE_TIMEOUT_MS,
): Promise<string | null> {
  if (candidates.length === 0) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false
    const cancelers: Array<() => void> = []

    const finish = (url: string | null) => {
      if (settled) {
        return
      }
      settled = true
      for (const cancel of cancelers) {
        cancel()
      }
      resolve(url)
    }

    let failures = 0
    const onFailure = () => {
      failures += 1
      if (failures >= candidates.length) {
        finish(null)
      }
    }

    for (const serverUrl of candidates) {
      cancelers.push(
        probeLocalServerCandidate(
          serverUrl,
          timeoutMs,
          (url) => finish(url),
          onFailure,
        ),
      )
    }
  })
}
