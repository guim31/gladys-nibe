// -----------------------------------------------------------------------------
// The "Heat pump" widget: valid for the core (validateWidgetContent), within
// the content budget, bound to features that exist, and its buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildDevice } from '../src/devices.js';
import { MESSAGES, TEMPLATES } from '../src/i18n.js';
import { buildHeatPumpContent } from '../src/widgets.js';
import { CONFIG, createAll, createWorld, discovered } from './helpers/world.js';
import { F730_ID, POINTS, SMO20_ID, defaultAccount, system } from './helpers/fakeMyUplink.js';

const MINUTE = 60 * 1000;

async function widget(world, deviceId, language = 'fr') {
  const ack = await world.fake.widgetGet('heat_pump', {
    settings: { device: discovered(world, deviceId).external_id },
    language,
    units: 'metric',
  });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

const byType = (content, type) => content.components.filter((c) => c.type === type);

test('every content is valid for the core and bound to features of the device', async (t) => {
  const account = defaultAccount();
  account.systems.push(
    system({ systemId: 'sys-vvm', name: 'Garage', deviceId: 'vvm', product: 'VVM 320' }),
  );
  account.points.vvm = POINTS.heatMeters();
  const world = await createWorld({ account });
  t.after(() => world.app.stop());
  await createAll(world);
  for (const deviceId of [F730_ID, SMO20_ID, 'vvm']) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const content = await widget(world, deviceId, language);
      assert.deepEqual(validateWidgetContent(content), [], `${deviceId} ${language}`);
      assert.ok(content.components.length <= 8);
      assert.ok(byType(content, 'text').length <= 2);
      const entry = world.hub.entryByDevice(discovered(world, deviceId).external_id);
      const features = new Set(
        buildDevice(world.gladys, entry.pump, entry.profile, language).features.map(
          (f) => f.external_id,
        ),
      );
      for (const component of content.components) {
        if (component.device_feature) {
          assert.ok(features.has(component.device_feature), component.device_feature);
        }
      }
    }
  }
});

test('F730: four live tiles, the state, boost and offset buttons', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const content = await widget(world, F730_ID);
  assert.deepEqual(
    byType(content, 'value').map((tile) => tile.label),
    ['Extérieur', 'Départ', 'Eau chaude', 'Intérieur'],
  );
  const [status] = byType(content, 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['myUplink', 'Connectée'],
      ['Mode', 'Chauffage'],
      ['Compresseur', 'En marche · 57 Hz'],
      ['Décalage courbe', '+1'],
      ['Mode ECS', 'Économie'],
      ['Boost', 'Inactif'],
      ['Alarmes', 'Aucune alarme'],
    ],
  );
  const buttons = byType(content, 'button');
  assert.deepEqual(
    buttons.map((button) => button.label),
    ['Lancer le boost', 'Décalage −1', 'Décalage +1'],
  );
  // Distinct action keys: the core drops a button whose key is taken.
  const keys = buttons.filter((b) => b.action).map((b) => b.action.key);
  assert.equal(new Set(keys).size, keys.length);
  // The current choice is never told by the primary style (dark mode, #3153).
  assert.ok(buttons.every((button) => button.style !== 'primary'));
});

test('the offset buttons write myUplink and answer with a toast', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const settings = { device: discovered(world, F730_ID).external_id };
  const ack = await world.fake.widgetAction('heat_pump', 'offset_up', {}, { settings });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(world.cloud.state.writes.at(-1).values, { 47011: 2 });
  assert.equal(ack.data.message.fr, TEMPLATES.offsetSet.fr('+2'));
  for (const text of Object.values(ack.data.message)) {
    assert.ok(text.length <= 200);
  }
  await world.fake.widgetAction('heat_pump', 'offset_down', {}, { settings });
  assert.deepEqual(world.cloud.state.writes.at(-1).values, { 47011: 1 });
});

test('at the end of the range, the button disappears and the action says so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.cloud.setPoint(F730_ID, '47011', 10);
  await world.hub.discover();
  await createAll(world);
  const content = await widget(world, F730_ID);
  assert.deepEqual(
    byType(content, 'button').map((button) => button.label),
    ['Lancer le boost', 'Décalage −1'],
  );
  const settings = { device: discovered(world, F730_ID).external_id };
  const ack = await world.fake.widgetAction('heat_pump', 'offset_up', {}, { settings });
  assert.deepEqual(ack.data.message, MESSAGES.offsetLimit);
  assert.equal(world.cloud.state.writes.length, 0);
});

test('boost on: the button cancels it', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const device = discovered(world, F730_ID);
  const boost = device.features.find((f) => f.external_id.endsWith(':hot_water_boost'));
  await world.fake.setValue(device, boost, 1);
  const content = await widget(world, F730_ID);
  const button = byType(content, 'button')[0];
  assert.equal(button.label, 'Annuler le boost');
  assert.equal(button.value, 0);
  assert.equal(button.device_feature, boost.external_id);
});

test('no Premium Manage, or heat pump offline: no control button', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  assert.deepEqual(byType(await widget(world, SMO20_ID), 'button'), []);
  world.cloud.setConnected(F730_ID, false);
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  const content = await widget(world, F730_ID);
  assert.deepEqual(byType(content, 'button'), []);
  assert.equal(byType(content, 'status')[0].items[0].value, 'Déconnectée');
});

test('an alarm shows in the state list, in red', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  world.cloud.raiseAlarm('sys-home', F730_ID, {
    id: 'x',
    alarmNumber: 162,
    header: 'Haute pression du circuit frigorifique, arrêt du compresseur',
  });
  world.clock.advance(5 * MINUTE);
  await world.hub.refresh();
  const item = byType(await widget(world, F730_ID), 'status')[0].items.at(-1);
  assert.equal(item.color, 'danger');
  assert.ok(item.value.length <= 40);
  assert.match(item.value, /^162 – Haute pression/);
});

test('no device chosen, unknown device, not configured: one sentence', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const empty = await world.fake.widgetGet('heat_pump', { settings: {}, language: 'de' });
  assert.equal(empty.data.content.components[0].text, MESSAGES.pickDevice.de);
  assert.deepEqual(validateWidgetContent(empty.data.content), []);
  await world.fake.configUpdated({ ...CONFIG, client_id: '' });
  const off = await world.fake.widgetGet('heat_pump', { settings: {}, language: 'es' });
  assert.equal(off.data.content.components[0].text, MESSAGES.notConfigured.es);
});

test('a heat pump whose points could not be read: the widget waits politely', async (t) => {
  const account = defaultAccount();
  delete account.points[SMO20_ID]; // myUplink answers 404 for its points
  const world = await createWorld({ account });
  t.after(() => world.app.stop());
  await createAll(world);
  const content = await widget(world, SMO20_ID);
  assert.deepEqual(content.components, [
    { type: 'text', variant: 'body', text: MESSAGES.widgetNotReady.fr },
  ]);
  assert.equal(typeof buildHeatPumpContent, 'function');
});
