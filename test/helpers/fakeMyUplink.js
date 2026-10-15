// -----------------------------------------------------------------------------
// A fake myUplink cloud, behind a `fetch` function the client receives.
//
// The heat pumps answer with real point lists published by the Home Assistant
// tests (test/fixtures/myuplink/, Apache-2.0): a NIBE F730, a NIBE SMO 20 and
// a CTC i555. The OAuth endpoint, the quota headers, the subscriptions, the
// alarms and the writes follow what the API documents and what the openHAB
// binding and the jaroschek/home-assistant-myuplink component rely on.
// No network: every request stays in memory and is recorded.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/myuplink/${name}`, import.meta.url), 'utf8'));

export const CLIENT_ID = 'test-client-id';
export const CLIENT_SECRET = 'test-client-secret-0123456789';

export const POINTS = {
  f730: () => fixture('points-f730.json'),
  smo20: () => fixture('points-smo20.json'),
  ctc: () => fixture('points-ctc-i555.json'),
  heatMeters: () => fixture('points-heat-meters.json'),
  sSeries: () => fixture('points-s-series-names.json'),
};

/** A system with one heat pump, myUplink's `systems/me` shape. */
export function system({
  systemId,
  name,
  deviceId,
  product,
  serial = '100001',
  connected = true,
  hasAlarm = false,
}) {
  return {
    systemId,
    name,
    securityLevel: 'admin',
    hasAlarm,
    country: 'France',
    devices: [
      {
        id: deviceId,
        connectionState: connected ? 'Connected' : 'Disconnected',
        currentFwVersion: '9682R7',
        product: { serialNumber: serial, name: product },
      },
    ],
  };
}

// Device ids follow the myUplink shape; the MAC part is a documentation one.
export const F730_ID = 'emmy-r-1234-20240201-123456-02-00-5e-00-53-01';
export const SMO20_ID = 'emmy-r-1234-20240201-123456-02-00-5e-00-53-02';
export const CTC_ID = 'ctc-r-1234-20240201-123456-02-00-5e-00-53-03';

/** The default account: an F730 at home, a SMO 20 at the cottage. */
export const defaultAccount = () => ({
  systems: [
    system({ systemId: 'sys-home', name: 'Maison', deviceId: F730_ID, product: 'F730 CU 3x400V' }),
    system({ systemId: 'sys-cottage', name: 'Chalet', deviceId: SMO20_ID, product: 'SMO 20' }),
  ],
  points: { [F730_ID]: POINTS.f730(), [SMO20_ID]: POINTS.smo20() },
  notifications: {},
  subscriptions: { 'sys-home': ['manage'], 'sys-cottage': [] },
});

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/**
 * @param {object} [account] systems, points (by device id), notifications (by
 *   system id), subscriptions (by system id: list of types)
 */
export function createFakeMyUplink(account = defaultAccount()) {
  const state = {
    ...account,
    /** Every request: { method, path, query, body, language }. */
    requests: [],
    /** Tokens issued, the last one valid. */
    tokens: [],
    tokenLifetime: 3600,
    acceptWriteScope: true,
    /** Status forced on the next requests (e.g. [500, 500]), whatever they ask. */
    failures: [],
    /** RateLimit-Remaining sent; null: no header. */
    remaining: null,
    writes: [],
    online: true,
  };

  const pointsOf = (deviceId) => state.points[deviceId] ?? [];

  async function handle(url, init) {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const record = {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      language: headers['accept-language'],
      body: init.body,
    };
    state.requests.push(record);
    const rate =
      state.remaining === null
        ? {}
        : {
            'RateLimit-Limit': '25',
            'RateLimit-Remaining': String(state.remaining),
            'RateLimit-Reset': '30',
          };
    if (state.failures.length > 0) {
      const status = state.failures.shift();
      return json(status, { error: 'forced' }, status === 429 ? { 'Retry-After': '60' } : rate);
    }

    if (url.pathname === '/oauth/token' && method === 'POST') {
      const expected = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      if (headers.authorization !== `Basic ${expected}`) {
        return json(400, { error: 'invalid_client' });
      }
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') !== 'client_credentials') {
        return json(400, { error: 'unsupported_grant_type' });
      }
      if (!state.acceptWriteScope && /WRITESYSTEM/.test(form.get('scope'))) {
        return json(400, { error: 'invalid_scope' });
      }
      const token = `fake-token-${state.tokens.length + 1}`;
      state.tokens.push(token);
      return json(200, {
        access_token: token,
        token_type: 'Bearer',
        expires_in: state.tokenLifetime,
        scope: form.get('scope'),
      });
    }

    if (headers.authorization !== `Bearer ${state.tokens.at(-1)}`) {
      return json(401, { error: 'invalid_token' }, rate);
    }

    let match;
    if (url.pathname === '/v2/systems/me' && method === 'GET') {
      return json(
        200,
        {
          page: 1,
          itemsPerPage: Number(url.searchParams.get('itemsPerPage') ?? 10),
          numItems: state.systems.length,
          systems: state.systems,
        },
        rate,
      );
    }
    if ((match = url.pathname.match(/^\/v2\/devices\/([^/]+)\/points$/))) {
      const deviceId = decodeURIComponent(match[1]);
      if (!state.points[deviceId]) {
        return json(404, { error: 'not found' }, rate);
      }
      if (method === 'GET') {
        const wanted = url.searchParams.get('parameters')?.split(',');
        const list = pointsOf(deviceId).filter(
          (point) => !wanted || wanted.includes(String(point.parameterId)),
        );
        return json(200, list, rate);
      }
      if (method === 'PATCH') {
        const systemId = state.systems.find((sys) =>
          sys.devices.some((device) => device.id === deviceId),
        )?.systemId;
        if (!(state.subscriptions[systemId] ?? []).includes('manage')) {
          return json(403, { error: 'premium subscription required' }, rate);
        }
        const values = JSON.parse(init.body);
        state.writes.push({ deviceId, values, contentType: headers['content-type'] });
        for (const [id, value] of Object.entries(values)) {
          for (const point of pointsOf(deviceId)) {
            if (String(point.parameterId) === id) {
              point.value = Number(value);
            }
          }
        }
        return json(
          200,
          Object.fromEntries(Object.keys(values).map((id) => [id, 'modified'])),
          rate,
        );
      }
    }
    if ((match = url.pathname.match(/^\/v2\/systems\/([^/]+)\/notifications\/active$/))) {
      const list = state.notifications[decodeURIComponent(match[1])] ?? [];
      return json(
        200,
        { page: 1, itemsPerPage: 20, numItems: list.length, notifications: list },
        rate,
      );
    }
    if ((match = url.pathname.match(/^\/v2\/systems\/([^/]+)\/subscriptions$/))) {
      const types = state.subscriptions[decodeURIComponent(match[1])] ?? [];
      return json(
        200,
        {
          subscriptions: types.map((type) => ({ type, validUntil: '2027-01-01T00:00:00+00:00' })),
        },
        rate,
      );
    }
    return json(404, { error: 'unknown route' }, rate);
  }

  return {
    state,

    /** The `fetch` the client receives. */
    fetch: async (input, init = {}) => {
      if (!state.online) {
        throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
      }
      return handle(new URL(String(input)), init);
    },

    /** Requests to myUplink, token requests excluded. */
    apiRequests: () => state.requests.filter((request) => request.path !== '/oauth/token'),

    /** Sets a point value, as the heat pump would. */
    setPoint(deviceId, parameterId, value) {
      for (const point of pointsOf(deviceId)) {
        if (String(point.parameterId) === String(parameterId)) {
          point.value = value;
        }
      }
    },

    /** Raises an alarm on a system (hasAlarm true, one active notification). */
    raiseAlarm(systemId, deviceId, alarm) {
      const sys = state.systems.find((candidate) => candidate.systemId === systemId);
      sys.hasAlarm = true;
      state.notifications[systemId] = [
        ...(state.notifications[systemId] ?? []),
        {
          id: alarm.id,
          deviceId,
          alarmNumber: alarm.alarmNumber,
          severity: alarm.severity ?? 1,
          status: 'Active',
          createdDatetime: alarm.createdDatetime ?? '2026-10-15T06:12:00+00:00',
          header: alarm.header,
          description: alarm.description ?? '',
          equipName: '',
        },
      ];
    },

    clearAlarms(systemId) {
      const sys = state.systems.find((candidate) => candidate.systemId === systemId);
      sys.hasAlarm = false;
      state.notifications[systemId] = [];
    },

    setConnected(deviceId, connected) {
      for (const sys of state.systems) {
        for (const device of sys.devices) {
          if (device.id === deviceId) {
            device.connectionState = connected ? 'Connected' : 'Disconnected';
          }
        }
      }
    },
  };
}
