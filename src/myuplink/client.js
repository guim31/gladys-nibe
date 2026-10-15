// -----------------------------------------------------------------------------
// myUplink API client (https://api.myuplink.com, API v2).
//
// Authentication: OAuth2 "client credentials". The user creates an application
// on dev.myuplink.com with the account that owns the heat pump and pastes its
// client ID and secret; the token then gives access to that account's systems
// — no browser round trip, no redirect URL to reach Gladys (the openHAB
// binding and the myuplink-exporter use the same grant). The token lives about
// an hour: it is kept in /data and asked again shortly before it expires.
//
// Quota: myUplink answers with `RateLimit-Limit` / `RateLimit-Remaining` /
// `RateLimit-Reset` headers (25 requests per window of one minute at the time
// of writing) and 429 beyond. The client never sends a request it knows will
// be refused: an exhausted window or a 429 blocks the client until the reset.
//
// Nothing here logs: the errors carry a `kind` the caller turns into one log
// line and a message for the user. No secret, token or URL with credentials
// ever ends up in an error message.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export const API_URL = 'https://api.myuplink.com';
export const TOKEN_FILE = 'token.json';

// Write access is asked for too: without it the controls cannot work. An
// application refused the write scope still reads (see token()).
const SCOPES = ['READSYSTEM WRITESYSTEM', 'READSYSTEM'];

/** Accept-Language sent to myUplink, from the integration language. */
export const API_LANGUAGES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const REQUEST_TIMEOUT_MS = 20_000;
// Renew the token this long before myUplink says it expires.
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
// Wait this long after a 429 that does not say for how long.
const DEFAULT_BACKOFF_MS = 60 * 1000;

/**
 * kind: 'credentials' (client ID/secret refused), 'forbidden' (403, e.g. a
 * write without the Premium Manage subscription), 'not_found', 'rate_limit',
 * 'server' (5xx), 'network' (timeout, DNS...), 'http' (any other answer),
 * 'invalid' (a body that is not what the API documents).
 */
export class MyUplinkError extends Error {
  constructor(kind, message, { status, retryAt } = {}) {
    super(message);
    this.name = 'MyUplinkError';
    this.kind = kind;
    this.status = status;
    this.retryAt = retryAt;
  }
}

/** Identifies a credential pair without keeping it (cache key of the token). */
const credentialsFingerprint = (config) =>
  createHash('sha256').update(`${config.client_id}\n${config.client_secret}`).digest('hex');

/**
 * @param {object} options
 * @param {() => object} options.getConfig normalized config (client_id, client_secret)
 * @param {import('../store.js').Store} options.store
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {string} [options.baseUrl]
 */
export function createClient({
  getConfig,
  store,
  fetch: fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  baseUrl = API_URL,
}) {
  /** { fingerprint, access_token, expires_at, scope } */
  let token = null;
  let tokenLoaded = false;
  let tokenRequest = null;
  /** No request before this instant (exhausted window, 429). */
  let blockedUntil = 0;
  const rateLimit = { limit: null, remaining: null };
  let requestCount = 0;

  async function send(url, init) {
    requestCount += 1;
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new MyUplinkError('network', `myUplink unreachable (${reason})`);
    }
  }

  /** Reads the quota headers of any answer, the token endpoint included. */
  function noteRateLimit(response) {
    const header = (name) => {
      const value = Number.parseInt(response.headers.get(name) ?? '', 10);
      return Number.isFinite(value) ? value : null;
    };
    const limit = header('RateLimit-Limit');
    const remaining = header('RateLimit-Remaining');
    const reset = header('RateLimit-Reset');
    if (limit !== null) {
      rateLimit.limit = limit;
    }
    if (remaining !== null) {
      rateLimit.remaining = remaining;
      if (remaining <= 0 && reset !== null) {
        blockedUntil = Math.max(blockedUntil, now() + reset * 1000);
      }
    }
    if (response.status === 429) {
      const retryAfter = header('Retry-After') ?? reset;
      blockedUntil = Math.max(
        blockedUntil,
        now() + (retryAfter !== null ? retryAfter * 1000 : DEFAULT_BACKOFF_MS),
      );
    }
  }

  function checkQuota() {
    if (now() < blockedUntil) {
      const seconds = Math.ceil((blockedUntil - now()) / 1000);
      throw new MyUplinkError('rate_limit', `myUplink quota reached, next try in ${seconds} s`, {
        status: 429,
        retryAt: blockedUntil,
      });
    }
  }

  async function errorFor(response) {
    const { status } = response;
    if (status === 429) {
      return new MyUplinkError('rate_limit', 'myUplink quota reached (HTTP 429)', {
        status,
        retryAt: blockedUntil,
      });
    }
    if (status === 401) {
      return new MyUplinkError('credentials', 'myUplink refused the token (HTTP 401)', { status });
    }
    if (status === 403) {
      return new MyUplinkError('forbidden', 'myUplink refused the operation (HTTP 403)', {
        status,
      });
    }
    if (status === 404) {
      return new MyUplinkError('not_found', 'myUplink does not know this item (HTTP 404)', {
        status,
      });
    }
    if (status >= 500) {
      return new MyUplinkError('server', `myUplink server error (HTTP ${status})`, { status });
    }
    return new MyUplinkError('http', `myUplink answered HTTP ${status}`, { status });
  }

  async function loadToken() {
    if (!tokenLoaded) {
      tokenLoaded = true;
      const saved = await store.read(TOKEN_FILE, null);
      if (saved && typeof saved.access_token === 'string') {
        token = saved;
      }
    }
  }

  async function requestToken(config) {
    let lastError = null;
    for (const scope of SCOPES) {
      checkQuota();
      const basic = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
      const response = await send(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
      });
      noteRateLimit(response);
      const body = await response.json().catch(() => ({}));
      if (response.ok && typeof body.access_token === 'string') {
        const lifetime = Number(body.expires_in) > 0 ? Number(body.expires_in) * 1000 : 3600_000;
        return {
          fingerprint: credentialsFingerprint(config),
          access_token: body.access_token,
          expires_at: now() + lifetime,
          scope: typeof body.scope === 'string' ? body.scope : scope,
        };
      }
      // OAuth errors are 400 (RFC 6749 §5.2), sometimes 401 for the client.
      const code = typeof body.error === 'string' ? body.error : '';
      if (code === 'invalid_scope') {
        lastError = new MyUplinkError('credentials', 'myUplink refused the requested scope', {
          status: response.status,
        });
        continue;
      }
      if (response.status === 400 || response.status === 401) {
        throw new MyUplinkError(
          'credentials',
          `myUplink refused the client ID or secret${code ? ` (${code})` : ''}`,
          { status: response.status },
        );
      }
      throw await errorFor(response);
    }
    throw lastError;
  }

  /** A valid access token, asked to myUplink only when needed. */
  async function accessToken() {
    const config = getConfig();
    await loadToken();
    const fingerprint = credentialsFingerprint(config);
    if (token && token.fingerprint === fingerprint && token.expires_at - TOKEN_MARGIN_MS > now()) {
      return token.access_token;
    }
    // One request at a time: the poll and a command may both need a token.
    tokenRequest ??= (async () => {
      try {
        token = await requestToken(config);
        await store.write(TOKEN_FILE, token, { secret: true }).catch(() => {});
        return token;
      } finally {
        tokenRequest = null;
      }
    })();
    return (await tokenRequest).access_token;
  }

  /**
   * @param {string} method
   * @param {string} path e.g. '/v2/systems/me'
   * @param {object} [options]
   * @param {Record<string, string|number>} [options.query]
   * @param {unknown} [options.body] JSON body (PATCH)
   * @param {string} [options.language] integration language (en, fr, de, es)
   */
  async function request(method, path, { query, body, language = 'en' } = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const bearer = await accessToken();
      checkQuota();
      const headers = {
        authorization: `Bearer ${bearer}`,
        accept: 'application/json',
        'accept-language': API_LANGUAGES[language] ?? API_LANGUAGES.en,
      };
      if (body !== undefined) {
        headers['content-type'] = 'application/json-patch+json';
      }
      const response = await send(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      noteRateLimit(response);
      if (response.status === 401 && attempt === 0) {
        // Revoked or expired early: ask for a new token once.
        token = null;
        continue;
      }
      if (!response.ok) {
        throw await errorFor(response);
      }
      if (response.status === 204) {
        return null;
      }
      const text = await response.text();
      if (text.trim() === '') {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new MyUplinkError('invalid', `myUplink sent an unreadable answer to ${path}`);
      }
    }
    throw new MyUplinkError('credentials', 'myUplink refused the token (HTTP 401)', {
      status: 401,
    });
  }

  return {
    request,
    accessToken,

    /** The systems of the account, with their devices (one request). */
    async getSystems() {
      const body = await request('GET', '/v2/systems/me', {
        query: { page: 1, itemsPerPage: 50 },
      });
      if (!body || !Array.isArray(body.systems)) {
        throw new MyUplinkError('invalid', 'myUplink sent no system list');
      }
      return body.systems;
    },

    /**
     * The data points of a device, in English (stable names to classify).
     * @param {string} deviceId
     * @param {string[]} [parameterIds] only these points (smaller answer)
     */
    async getPoints(deviceId, parameterIds) {
      const query = parameterIds?.length ? { parameters: parameterIds.join(',') } : undefined;
      const body = await request('GET', `/v2/devices/${encodeURIComponent(deviceId)}/points`, {
        query,
        language: 'en',
      });
      if (!Array.isArray(body)) {
        throw new MyUplinkError('invalid', 'myUplink sent no point list');
      }
      return body;
    },

    /**
     * The active alarms of a system, in the user's language.
     * @param {string} systemId
     * @param {string} language
     */
    async getActiveNotifications(systemId, language) {
      const body = await request(
        'GET',
        `/v2/systems/${encodeURIComponent(systemId)}/notifications/active`,
        { query: { page: 1, itemsPerPage: 20 }, language },
      );
      return Array.isArray(body?.notifications) ? body.notifications : [];
    },

    /**
     * Whether the system has the "Premium Manage" subscription that writing
     * points requires: true, false, or null when myUplink does not say.
     * @param {string} systemId
     */
    async hasManageSubscription(systemId) {
      const body = await request(
        'GET',
        `/v2/systems/${encodeURIComponent(systemId)}/subscriptions`,
      );
      if (!Array.isArray(body?.subscriptions)) {
        return null;
      }
      return body.subscriptions.some(
        (subscription) => String(subscription?.type).toLowerCase() === 'manage',
      );
    },

    /**
     * Writes data points (myUplink expects the values as in the point list).
     * @param {string} deviceId
     * @param {Record<string, string|number>} values parameterId -> value
     */
    async patchPoints(deviceId, values) {
      return request('PATCH', `/v2/devices/${encodeURIComponent(deviceId)}/points`, {
        body: values,
      });
    },

    /** The token grants the write scope (false: the controls will be refused). */
    canWrite() {
      return token ? /WRITESYSTEM/.test(token.scope ?? '') : null;
    },

    /** Quota state, for the debug log. */
    quota() {
      return { ...rateLimit, blockedUntil, requests: requestCount };
    },

    /** Forget the token (new credentials). */
    forgetToken() {
      token = null;
    },
  };
}
