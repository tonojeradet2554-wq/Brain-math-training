export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let unauthorizedHandler = null;

/** Called when the server says the session is gone (expired, logged out elsewhere). */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

/** Single-file build: the "server" runs inside the page (see local/localBackend.js). */
async function localRequest(method, path, body) {
  const { handleLocal } = await import('../local/localBackend.js');
  // Clone the body so the in-page backend can't share objects with React state.
  const { status, payload } = await handleLocal(method, path, body === undefined ? undefined : structuredClone(body));
  return { ok: status >= 200 && status < 300, status, payload: structuredClone(payload) };
}

async function httpRequest(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection and try again.');
  }

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  return { ok: res.ok, status: res.status, payload };
}

async function request(method, path, body) {
  const res =
    import.meta.env.MODE === 'single' ? await localRequest(method, path, body) : await httpRequest(method, path, body);
  const { payload } = res;

  if (!res.ok) {
    const err = payload?.error ?? {};
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.();
    throw new ApiError(err.message || `Request failed (${res.status})`, {
      status: res.status,
      code: err.code || 'HTTP_ERROR',
      data: err,
    });
  }
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
};
