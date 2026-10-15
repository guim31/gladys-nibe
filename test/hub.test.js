// -----------------------------------------------------------------------------
// The integration end to end: the SDK's fake Gladys, the fake myUplink cloud.
// Discovery, the refresh by the container's own timer (no onPoll needed),
// the quota per cycle, the alarms, the commands and their refusals.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ALARMS_FILE, HEARTBEAT_MS, PROFILES_FILE } from '../src/hub.js';
import { MESSAGES } from '../src/i18n.js';
import { CONFIG, createAll, createWorld, discovered, featureId } from './helpers/world.js';
import { F730_ID, SMO20_ID, defaultAccount } from './helpers/fakeMyUplink.js';

const MINUTE = 60 * 1000;

test('discovery: one device per heat pump, nothing read beyond 1 + 2N requests', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.name),
    ['F730 CU 3x400V (Maison)', 'SMO 20 (Chalet)'],
  );
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  // systems/me, the points of each pump, the subscription of each system.
  assert.deepEqual(
    world.cloud.apiRequests().map((request) => request.path),
    [
      '/v2/systems/me',
      `/v2/devices/${F730_ID}/points`,
      `/v2/devices/${SMO20_ID}/points`,
      '/v2/systems/sys-home/subscriptions',
      '/v2/systems/sys-cottage/subscriptions',
    ],
  );
  // Nothing is published for devices Gladys does not have.
  assert.equal(world.fake.states.length, 0);
  const profiles = JSON.parse(await readFile(join(world.dataDir, PROFILES_FILE), 'utf8'));
  assert.equal(profiles[F730_ID].outdoor_temperature.parameterId, '40004');
});

test('adding a heat pump publishes all its states at once, then nudges the widget', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = world.cloud.state.requests.length;
  await world.fake.deviceCreated(discovered(world, F730_ID));
  // From the discovery reading: no new request.
  assert.equal(world.cloud.state.requests.length, before);
  const value = (key) => world.fake.lastState(featureId(world, F730_ID, key));
  assert.equal(value('outdoor_temperature'), -9.3);
  assert.equal(value('supply_temperature'), 39.7);
  assert.equal(value('hot_water_top_temperature'), 46);
  assert.equal(value('compressor_frequency'), '57 Hz');
  assert.equal(value('compressor_status'), 'En marche');
  assert.equal(value('operating_mode'), 'Chauffage');
  assert.equal(value('heating_offset'), '1');
  assert.equal(value('hot_water_mode'), '0');
  assert.equal(value('hot_water_boost'), 0);
  assert.equal(value('active_alarms'), 0);
  assert.equal(value('last_alarm'), 'Aucune alarme');
  assert.ok(world.fake.widgetRefreshes.includes('heat_pump'));
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: discovered(world, F730_ID).external_id,
    transport: 'cloud',
  });
});

test('the states refresh on the container timer alone, without onPoll', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const outdoor = featureId(world, F730_ID, 'outdoor_temperature');
  world.cloud.setPoint(F730_ID, '40004', -4.2);

  // Half a period later: the timer skips (a refresh just ran).
  world.clock.advance(2 * MINUTE);
  await world.app.poller.tick();
  assert.equal(world.fake.lastState(outdoor), -9.3);

  world.clock.advance(4 * MINUTE);
  await world.app.poller.tick();
  assert.equal(world.fake.lastState(outdoor), -4.2);
  assert.ok(!world.fake.wsMessages.some((message) => message.type === 'device.poll'));
});

test('a refresh cycle: 1 + N requests, only the role points, only the added devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.deviceCreated(discovered(world, F730_ID));
  const sent = world.cloud.apiRequests().length;
  world.clock.advance(5 * MINUTE);
  await world.app.poller.tick();
  const cycle = world.cloud.apiRequests().slice(sent);
  assert.deepEqual(
    cycle.map((request) => request.path),
    ['/v2/systems/me', `/v2/devices/${F730_ID}/points`],
  );
  assert.equal(
    cycle[1].query.parameters,
    '40004,40008,40012,40013,40014,40033,41778,43427,49994,47011,47041,50004',
  );
});

test("the core's onPoll is a fallback: skipped while the timer keeps up", async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const device = discovered(world, F730_ID);
  const sent = world.cloud.apiRequests().length;
  world.clock.advance(MINUTE);
  assert.deepEqual(await world.fake.poll(device), { success: true });
  assert.equal(world.cloud.apiRequests().length, sent, 'refreshed a minute ago: skipped');
  world.clock.advance(4 * MINUTE + 30 * 1000); // 90 % of the period passed
  await world.fake.poll(device);
  assert.ok(world.cloud.apiRequests().length > sent, 'the timer stalled: onPoll reads');
});

test('only changes are published, and an unchanged value again past the heartbeat', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.deviceCreated(discovered(world, F730_ID));
  const count = world.fake.states.length;
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.equal(world.fake.states.length, count, 'nothing changed, nothing sent');
  world.cloud.setPoint(F730_ID, '40008', 41.3);
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.deepEqual(
    world.fake.states.slice(count).map((state) => state.device_feature_external_id),
    [featureId(world, F730_ID, 'supply_temperature')],
  );
  assert.ok(HEARTBEAT_MS <= 12 * 60 * MINUTE);
});

test('a new alarm fires the trigger once, in the user language; a cleared one resets', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.cloud.raiseAlarm('sys-home', F730_ID, {
    id: 'n-183',
    alarmNumber: 183,
    header: 'Dégivrage en cours',
    description: 'La PAC dégivre.',
    severity: 2,
  });
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'alarm_raised',
      data: {
        device: discovered(world, F730_ID).external_id,
        alarm_number: 183,
        header: 'Dégivrage en cours',
        description: 'La PAC dégivre.',
        severity: 2,
      },
    },
  ]);
  assert.equal(world.fake.lastState(featureId(world, F730_ID, 'active_alarms')), 1);
  assert.equal(
    world.fake.lastState(featureId(world, F730_ID, 'last_alarm')),
    '183 – Dégivrage en cours',
  );
  const alarmRead = world.cloud.apiRequests().find((r) => r.path.includes('notifications'));
  assert.equal(alarmRead.language, 'fr-FR');

  // Still active: not fired again.
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 1);

  // Cleared: back to "no alarm", without asking for the alarm list.
  world.cloud.clearAlarms('sys-home');
  const sent = world.cloud.apiRequests().length;
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.ok(
    !world.cloud
      .apiRequests()
      .slice(sent)
      .some((r) => r.path.includes('notifications')),
  );
  assert.equal(world.fake.lastState(featureId(world, F730_ID, 'active_alarms')), 0);
  const saved = JSON.parse(await readFile(join(world.dataDir, ALARMS_FILE), 'utf8'));
  assert.deepEqual(saved[F730_ID], []);
});

test('alarms already there at install, or announced before a restart, are not fired', async (t) => {
  const account = defaultAccount();
  const first = await createWorld({ account });
  t.after(() => first.app.stop());
  first.cloud.raiseAlarm('sys-home', F730_ID, { id: 'old', alarmNumber: 1, header: 'Ancienne' });
  await first.hub.discover();
  await createAll(first);
  assert.equal(first.fake.sceneEvents.length, 0, 'baseline at install');
  first.cloud.raiseAlarm('sys-home', F730_ID, { id: 'new', alarmNumber: 2, header: 'Nouvelle' });
  first.clock.advance(5 * MINUTE);
  await first.hub.refresh();
  assert.equal(first.fake.sceneEvents.length, 1);
  await first.app.stop();

  // Restart on the same /data and the same account.
  const second = await createWorld({
    account: first.cloud.state,
    dataDir: first.dataDir,
    devices: first.fake.discoveredDevices,
  });
  t.after(() => second.app.stop());
  second.clock.advance(5 * MINUTE);
  await second.hub.refresh();
  assert.equal(second.fake.sceneEvents.length, 0);
});

test('a heat pump losing myUplink: unreachable badge, last values kept, back to cloud', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const external = discovered(world, F730_ID).external_id;
  world.cloud.setConnected(F730_ID, false);
  world.cloud.setPoint(F730_ID, '40004', 12);
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: external,
    transport: 'unreachable',
  });
  assert.equal(world.fake.lastState(featureId(world, F730_ID, 'outdoor_temperature')), -9.3);
  world.cloud.setConnected(F730_ID, true);
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.equal(world.fake.transports.at(-1).transport, 'cloud');
  assert.equal(world.fake.lastState(featureId(world, F730_ID, 'outdoor_temperature')), 12);
});

test('myUplink down: status says so, the next cycle recovers', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.cloud.state.failures.push(503);
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.unreachable,
  });
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('wrong credentials, then not configured: the status tells the user what to do', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, client_secret: 'nope' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.credentials,
  });
  assert.equal(world.fake.discoveredDevices.length, 0);
  await world.fake.configUpdated({});
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.notConfigured,
  });
  await world.fake.configUpdated(CONFIG);
  assert.equal(world.fake.discoveredDevices.length, 2);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a heat pump joining the account appears without restart', async (t) => {
  const account = defaultAccount();
  const cottage = account.systems.pop();
  const world = await createWorld({ account });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  world.cloud.state.systems.push(cottage);
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  assert.equal(world.fake.discoveredDevices.length, 2);
});

// --- Commands --------------------------------------------------------------------

async function f730World(t, options) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createAll(world);
  const device = discovered(world, F730_ID);
  const feature = (key) =>
    device.features.find((candidate) => candidate.external_id.endsWith(`:${key}`));
  return { world, device, feature };
}

test('heating offset, hot water mode, boost: written to myUplink, shown at once', async (t) => {
  const { world, device, feature } = await f730World(t);
  assert.deepEqual(await world.fake.setValue(device, feature('heating_offset'), '-2'), {
    success: true,
  });
  await world.fake.setValue(device, feature('hot_water_mode'), '2');
  await world.fake.setValue(device, feature('hot_water_boost'), 1);
  assert.deepEqual(
    world.cloud.state.writes.map((write) => write.values),
    [{ 47011: -2 }, { 47041: '2' }, { 50004: 1 }],
  );
  assert.equal(world.fake.lastState(feature('heating_offset').external_id), '-2');
  assert.equal(world.fake.lastState(feature('hot_water_mode').external_id), '2');
  assert.equal(world.fake.lastState(feature('hot_water_boost').external_id), 1);
});

test('a value the heat pump would refuse never reaches myUplink', async (t) => {
  const { world, device, feature } = await f730World(t);
  for (const [key, value] of [
    ['heating_offset', '11'],
    ['heating_offset', '1.5'],
    ['hot_water_mode', '3'],
    ['hot_water_boost', 2],
    ['outdoor_temperature', 20],
  ]) {
    const ack = await world.fake.setValue(device, feature(key), value);
    assert.equal(ack.success, false, `${key} = ${value}`);
  }
  assert.equal(world.cloud.state.writes.length, 0);
});

test('without Premium Manage: a clear refusal, no write attempted', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const device = discovered(world, SMO20_ID);
  const offset = device.features.find((f) => f.external_id.endsWith(':heating_offset'));
  const ack = await world.fake.setValue(device, offset, '2');
  assert.equal(ack.success, false);
  assert.equal(ack.error, MESSAGES.premiumRequired.fr);
  assert.equal(world.cloud.state.writes.length, 0);
});

test('a 403 on write (subscription expired) gives the same clear message', async (t) => {
  const { world, device, feature } = await f730World(t);
  world.cloud.state.subscriptions['sys-home'] = [];
  const ack = await world.fake.setValue(device, feature('heating_offset'), '3');
  assert.equal(ack.success, false);
  assert.equal(ack.error, MESSAGES.premiumRequired.fr);
});

test('subscribed since: the write is allowed after a fresh check', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.cloud.state.subscriptions['sys-cottage'] = ['manage'];
  const device = discovered(world, SMO20_ID);
  const offset = device.features.find((f) => f.external_id.endsWith(':heating_offset'));
  assert.deepEqual(await world.fake.setValue(device, offset, '2'), { success: true });
});

test('an application without the write scope: the message names it', async (t) => {
  const account = defaultAccount();
  const world = await createWorld({ account, connect: false });
  t.after(() => world.app.stop());
  world.cloud.state.acceptWriteScope = false;
  await world.gladys.connect();
  await createAll(world);
  const device = discovered(world, F730_ID);
  const offset = device.features.find((f) => f.external_id.endsWith(':heating_offset'));
  const ack = await world.fake.setValue(device, offset, '2');
  assert.equal(ack.error, MESSAGES.writeScopeMissing.fr);
});

test('a heat pump offline refuses the command honestly', async (t) => {
  const { world, device, feature } = await f730World(t);
  world.cloud.setConnected(F730_ID, false);
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  const ack = await world.fake.setValue(device, feature('hot_water_boost'), 1);
  assert.equal(ack.error, MESSAGES.deviceOffline.fr);
});

test('"Test the connection" reports the heat pumps and the subscription', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /2 pompe\(s\) à chaleur .* Premium Manage : non/);
  assert.match(ack.data.message.de, /2 Wärmepumpe\(n\)/);
  world.cloud.state.subscriptions['sys-cottage'] = ['manage'];
  assert.match(
    (await world.fake.action('test_connection', {})).data.message.en,
    /Manage subscription: yes/,
  );
  await world.fake.configUpdated({ ...CONFIG, client_secret: 'bad' });
  const refused = await world.fake.action('test_connection', {});
  assert.equal(refused.success, false);
  assert.equal(refused.error, MESSAGES.credentials.fr);
});
