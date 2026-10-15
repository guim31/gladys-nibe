#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real myUplink API with the integration's own client, read only.
//
//   node scripts/probe.mjs
//       Fake credentials: walks the real OAuth flow up to the refusal, and
//       checks the public ping. Expected: "credentials refused (invalid_client)".
//
//   MYUPLINK_CLIENT_ID=... MYUPLINK_CLIENT_SECRET=... node scripts/probe.mjs
//       A real application: lists the heat pumps, the roles found among their
//       points, the alarms and the Premium Manage subscription, the quota
//       headers. Never writes anything.
//
// Prints no secret, no token, no serial number. The token is kept in a
// temporary directory, deleted at the end.
// -----------------------------------------------------------------------------

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_URL, MyUplinkError, createClient } from '../src/myuplink/client.js';
import { classifyPoints } from '../src/myuplink/points.js';
import { Store } from '../src/store.js';

const config = {
  client_id: process.env.MYUPLINK_CLIENT_ID || '00000000-0000-4000-8000-000000000000',
  client_secret: process.env.MYUPLINK_CLIENT_SECRET || 'not-a-real-secret-0000000000000000',
};
const real = Boolean(process.env.MYUPLINK_CLIENT_ID && process.env.MYUPLINK_CLIENT_SECRET);
const dir = mkdtempSync(join(tmpdir(), 'nibe-probe-'));
const client = createClient({ getConfig: () => config, store: new Store(dir) });

const say = (...parts) => console.log('-', ...parts);
let exitCode = 0;

try {
  // 1. The public ping: is api.myuplink.com reachable at all?
  try {
    const response = await fetch(`${API_URL}/v2/ping`, { signal: AbortSignal.timeout(15_000) });
    say(`ping: HTTP ${response.status}`);
  } catch (err) {
    say(`ping: unreachable (${err.cause?.code ?? err.message})`);
    exitCode = 2;
  }

  // 2. OAuth client credentials, then the systems of the account.
  try {
    const systems = await client.getSystems();
    say(`token: granted, write scope ${client.canWrite() ? 'yes' : 'no'}`);
    say(`systems: ${systems.length}`);
    for (const system of systems) {
      const premium = await client
        .hasManageSubscription(system.systemId)
        .catch((err) => `unknown (${err.kind})`);
      say(`system "${system.name}": hasAlarm ${system.hasAlarm}, Premium Manage ${premium}`);
      if (system.hasAlarm) {
        const alarms = await client.getActiveNotifications(system.systemId, 'en');
        for (const alarm of alarms) {
          say(`  alarm ${alarm.alarmNumber}: ${alarm.header}`);
        }
      }
      for (const device of system.devices ?? []) {
        const points = await client.getPoints(device.id);
        const profile = classifyPoints(points);
        say(
          `  ${device.product?.name} (${device.connectionState}, fw ${device.currentFwVersion}):` +
            ` ${points.length} points`,
        );
        for (const [role, entry] of Object.entries(profile)) {
          const point = points.find(
            (candidate) => String(candidate.parameterId) === entry.parameterId,
          );
          say(
            `    ${role} <- ${entry.parameterId} "${String(point?.parameterName).replace(/\u00ad/g, '')}"` +
              ` = ${point?.value} ${point?.parameterUnit ?? ''}${entry.writable ? ' (writable)' : ''}`,
          );
        }
      }
    }
    say('quota:', JSON.stringify(client.quota()));
  } catch (err) {
    if (err instanceof MyUplinkError && err.kind === 'credentials') {
      say(`credentials refused: ${err.message} (HTTP ${err.status})`);
      exitCode = real ? 1 : 0;
    } else {
      say(`error: ${err.kind ?? 'unexpected'} - ${err.message}`);
      exitCode = 1;
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (!real) {
  say('fake credentials: a refusal above is the expected result');
}
process.exit(exitCode);
