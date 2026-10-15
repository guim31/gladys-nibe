// -----------------------------------------------------------------------------
// The myUplink client: OAuth client credentials, the token kept in /data,
// the quota, the error kinds. Against the fake cloud, no network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MyUplinkError, TOKEN_FILE, createClient } from '../src/myuplink/client.js';
import { Store } from '../src/store.js';
import { CLIENT_ID, CLIENT_SECRET, F730_ID, createFakeMyUplink } from './helpers/fakeMyUplink.js';
import { createClock } from './helpers/world.js';

function setup({ config = {}, dataDir = mkdtempSync(join(tmpdir(), 'nibe-client-')) } = {}) {
  const cloud = createFakeMyUplink();
  const clock = createClock();
  const store = new Store(dataDir);
  const settings = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...config };
  const client = createClient({
    getConfig: () => settings,
    store,
    fetch: cloud.fetch,
    now: clock.now,
  });
  return { cloud, clock, store, client, dataDir, settings };
}

const tokenRequests = (cloud) => cloud.state.requests.filter((r) => r.path === '/oauth/token');

test('client credentials: Basic auth, read and write scopes, token reused', async () => {
  const { cloud, client } = setup();
  await client.getSystems();
  await client.getSystems();
  const [request] = tokenRequests(cloud);
  assert.equal(tokenRequests(cloud).length, 1);
  const form = new URLSearchParams(request.body);
  assert.equal(form.get('grant_type'), 'client_credentials');
  assert.equal(form.get('scope'), 'READSYSTEM WRITESYSTEM');
  assert.equal(client.canWrite(), true);
});

test('the token is kept in /data, readable by the owner only, and survives a restart', async () => {
  const first = setup();
  await first.client.getSystems();
  await first.store.flush();
  const path = join(first.dataDir, TOKEN_FILE);
  assert.equal(statSync(path).mode & 0o777, 0o600);

  // A new container on the same /data and the same cloud: no new token.
  const store = new Store(first.dataDir);
  const client = createClient({
    getConfig: () => first.settings,
    store,
    fetch: first.cloud.fetch,
    now: first.clock.now,
  });
  await client.getSystems();
  assert.equal(tokenRequests(first.cloud).length, 1);

  // Other credentials: the stored token is not theirs.
  first.settings.client_secret = `${CLIENT_SECRET}-changed`;
  await assert.rejects(client.getSystems(), (err) => err.kind === 'credentials');
});

test('the token is renewed before it expires', async () => {
  const { cloud, clock, client } = setup();
  await client.getSystems();
  clock.advance(50 * 60 * 1000); // 10 minutes left: still fine
  await client.getSystems();
  assert.equal(tokenRequests(cloud).length, 1);
  clock.advance(6 * 60 * 1000); // 4 minutes left: renewed
  await client.getSystems();
  assert.equal(tokenRequests(cloud).length, 2);
});

test('a token refused (401) is asked again once', async () => {
  const { cloud, client } = setup();
  await client.getSystems();
  cloud.state.tokens.push('rotated-elsewhere'); // ours is no longer the valid one
  await client.getSystems();
  assert.equal(tokenRequests(cloud).length, 2);
});

test('wrong credentials: a "credentials" error that says nothing secret', async () => {
  const { client } = setup({ config: { client_secret: 'wrong-secret-value' } });
  await assert.rejects(client.getSystems(), (err) => {
    assert.ok(err instanceof MyUplinkError);
    assert.equal(err.kind, 'credentials');
    assert.match(err.message, /invalid_client/);
    assert.doesNotMatch(err.message, /wrong-secret-value|test-client-id/);
    return true;
  });
});

test('an application without the write scope still reads', async () => {
  const { cloud, client } = setup();
  cloud.state.acceptWriteScope = false;
  const systems = await client.getSystems();
  assert.equal(systems.length, 2);
  assert.deepEqual(
    tokenRequests(cloud).map((request) => new URLSearchParams(request.body).get('scope')),
    ['READSYSTEM WRITESYSTEM', 'READSYSTEM'],
  );
  assert.equal(client.canWrite(), false);
});

test('a 429 blocks the client until the window resets, without new requests', async () => {
  const { cloud, clock, client } = setup();
  await client.getSystems();
  cloud.state.failures.push(429);
  await assert.rejects(client.getSystems(), (err) => err.kind === 'rate_limit');
  const sent = cloud.state.requests.length;
  await assert.rejects(client.getSystems(), (err) => err.kind === 'rate_limit');
  assert.equal(cloud.state.requests.length, sent, 'nothing sent while blocked');
  clock.advance(61 * 1000); // Retry-After: 60
  await client.getSystems();
});

test('RateLimit-Remaining 0: the next request waits for the reset', async () => {
  const { cloud, clock, client } = setup();
  cloud.state.remaining = 0;
  await client.getSystems();
  await assert.rejects(client.getSystems(), (err) => err.kind === 'rate_limit');
  clock.advance(31 * 1000); // RateLimit-Reset: 30
  cloud.state.remaining = 20;
  await client.getSystems();
  assert.equal(client.quota().remaining, 20);
});

test('errors by kind: server, not found, network', async () => {
  const { cloud, client } = setup();
  await client.getSystems();
  cloud.state.failures.push(503);
  await assert.rejects(client.getSystems(), (err) => err.kind === 'server');
  await assert.rejects(client.getPoints('unknown-device'), (err) => err.kind === 'not_found');
  cloud.state.online = false;
  await assert.rejects(client.getSystems(), (err) => {
    assert.equal(err.kind, 'network');
    assert.match(err.message, /ENOTFOUND/);
    return true;
  });
});

test('points: read in English, filtered when ids are given', async () => {
  const { cloud, client } = setup();
  const all = await client.getPoints(F730_ID);
  const some = await client.getPoints(F730_ID, ['40004', '47011']);
  assert.ok(all.length > 50);
  assert.deepEqual(
    some.map((point) => point.parameterId),
    ['40004', '47011'],
  );
  const reads = cloud.apiRequests().filter((r) => r.path.endsWith('/points'));
  assert.deepEqual(
    reads.map((r) => r.language),
    ['en-GB', 'en-GB'],
  );
  assert.equal(reads[1].query.parameters, '40004,47011');
});

test('alarms in the user language, subscriptions, writes as JSON patch', async () => {
  const { cloud, client } = setup();
  cloud.raiseAlarm('sys-home', F730_ID, { id: 'a1', alarmNumber: 162, header: 'Haute pression' });
  const alarms = await client.getActiveNotifications('sys-home', 'fr');
  assert.equal(alarms[0].header, 'Haute pression');
  assert.equal(cloud.apiRequests().at(-1).language, 'fr-FR');
  assert.equal(await client.hasManageSubscription('sys-home'), true);
  assert.equal(await client.hasManageSubscription('sys-cottage'), false);
  await client.patchPoints(F730_ID, { 47011: 2 });
  assert.deepEqual(cloud.state.writes, [
    { deviceId: F730_ID, values: { 47011: 2 }, contentType: 'application/json-patch+json' },
  ]);
  await assert.rejects(
    client.patchPoints('emmy-r-1234-20240201-123456-02-00-5e-00-53-02', { 47011: 2 }),
    (err) => err.kind === 'forbidden',
  );
});
