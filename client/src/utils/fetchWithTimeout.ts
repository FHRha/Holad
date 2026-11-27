export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Wrapper around fetch() that aborts requests after `timeoutMs` (default 8000ms)
 * while cleanly forwarding any caller-provided AbortSignal.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = init;

  const controller = new AbortController();
  let timedOut = false;

  const onCallerAbort = () => {
    controller.abort((callerSignal as any)?.reason);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort((callerSignal as any).reason);
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    return await fetch(input, {
      ...rest,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (timedOut && err?.name === 'AbortError') {
      const timeoutErr = new Error(`Request timeout after ${timeoutMs}ms`);
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}
