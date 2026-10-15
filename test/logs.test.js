// -----------------------------------------------------------------------------
// Quiet logs (maintainer's rule): a normal reading cycle writes nothing at the
// info level, a repeated error one line when it starts and one when it ends,
// and no secret of the config — client secret, token — ever reaches a log
// line, whatever the level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createAll, createWorld, discovered } from './helpers/world.js';
import { CLIENT_SECRET, F730_ID } from './helpers/fakeMyUplink.js';

const MINUTE = 60 * 1000;

/** Captures every log line (debug included) while `run` runs. */
async function captureLogs(t, run) {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const record = (...args) =>
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  try {
    await run();
  } finally {
    process.env.LOG_LEVEL = previous;
    t.mock.restoreAll();
  }
  return lines;
}

const atLeastInfo = (lines) => lines.filter((line) => /\[(INFO|WARN|ERROR)\]/.test(line));

test('a normal reading cycle writes nothing at the info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.cloud.setPoint(F730_ID, '40004', -2.5); // a value changes: still a normal cycle
  const lines = await captureLogs(t, async () => {
    world.clock.advance(5 * MINUTE);
    await world.app.poller.tick();
    world.clock.advance(MINUTE);
    await world.fake.poll(discovered(world, F730_ID));
  });
  assert.ok(lines.length > 0, 'the debug level shows the cycle');
  assert.deepEqual(atLeastInfo(lines), []);
});

test('a failure repeated over cycles: one warning, then one line when it ends', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const lines = await captureLogs(t, async () => {
    world.cloud.state.failures.push(503, 503, 503);
    for (let i = 0; i < 4; i += 1) {
      world.clock.advance(5 * MINUTE);
      await world.hub.refresh();
    }
  });
  const loud = atLeastInfo(lines);
  assert.equal(loud.filter((line) => /\[WARN\]/.test(line)).length, 1, loud.join('\n'));
  assert.equal(loud.filter((line) => /answers again/.test(line)).length, 1, loud.join('\n'));
});

test('no secret in any log line: start, refusal, commands, errors', async (t) => {
  let tokens = [];
  const lines = await captureLogs(t, async () => {
    const world = await createWorld();
    await createAll(world);
    const device = discovered(world, F730_ID);
    const offset = device.features.find((f) => f.external_id.endsWith(':heating_offset'));
    await world.fake.setValue(device, offset, '3');
    world.cloud.state.failures.push(401, 401);
    world.clock.advance(5 * MINUTE);
    await world.hub.refresh();
    await world.fake.configUpdated({ ...CONFIG, client_secret: 'wrong-secret-for-the-test' });
    await world.fake.action('test_connection', {});
    await world.app.stop();
    // The tokens the fake cloud handed out must not show either.
    tokens = world.cloud.state.tokens;
  });
  const secrets = [CLIENT_SECRET, 'wrong-secret-for-the-test', ...tokens];
  assert.ok(tokens.length > 0);
  assert.ok(lines.some((line) => /refused the client ID or secret \(invalid_client\)/.test(line)));
  for (const line of lines) {
    for (const secret of secrets) {
      assert.ok(!line.includes(secret), `a log line leaks a secret: ${line}`);
    }
    // Nor the Basic header that carries them.
    assert.doesNotMatch(line, /Basic [A-Za-z0-9+/=]{20,}|Bearer /);
  }
});
