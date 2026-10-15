// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake myUplink cloud, a
// temporary /data, and the integration wired on top through registerHandlers.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { CLIENT_ID, CLIENT_SECRET, createFakeMyUplink, defaultAccount } from './fakeMyUplink.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const CONFIG = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, language: 'fr' };

/** A controllable clock. */
export function createClock(start = Date.parse('2026-10-15T08:00:00Z')) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.account] fake myUplink account (defaultAccount())
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {string} [options.dataDir]
 */
export async function createWorld({
  account = defaultAccount(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-nibe-')),
  clock = createClock(),
} = {}) {
  const cloud = createFakeMyUplink(account);
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, {
    store,
    fetch: cloud.fetch,
    timers: false,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, cloud, app, hub: app.hub, store, dataDir, clock };
}

/** Adds every discovered device to Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** The discovered device of a myUplink device id. */
export const discovered = (world, deviceId) =>
  world.fake.discoveredDevices.find((device) => device.external_id.endsWith(`:${deviceId}`));

/** The external id of a feature of a heat pump. */
export const featureId = (world, deviceId, key) =>
  world.gladys.externalIds('heatpump', deviceId).feature(key);
