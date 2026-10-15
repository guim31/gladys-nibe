// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures: a NIBE F730 and a SMO 20 (real myUplink answers), a CTC i555
// without any known point, an indoor module with heat meters, a heat pump
// identified by its point names only — in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG, createWorld } from './helpers/world.js';
import { CTC_ID, POINTS, defaultAccount, system } from './helpers/fakeMyUplink.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

/** Every fixture heat pump on one account. */
function everyPump() {
  const account = defaultAccount();
  const more = [
    ['sys-ctc', 'Atelier', CTC_ID, 'CTC i555 Pro', POINTS.ctc()],
    ['sys-vvm', 'Garage', 'vvm-r-0001', 'VVM 320 E', POINTS.heatMeters()],
    ['sys-s', 'Grange', 's1255-r-0001', 'S1255-12 PC EM', POINTS.sSeries()],
  ];
  for (const [systemId, name, deviceId, product, points] of more) {
    account.systems.push(system({ systemId, name, deviceId, product }));
    account.points[deviceId] = points;
  }
  return account;
}

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`every discovered device follows the Gladys rules (${language})`, async (t) => {
    const world = await createWorld({ account: everyPump(), config: { ...CONFIG, language } });
    t.after(() => world.app.stop());
    const devices = world.fake.discoveredDevices;
    assert.equal(devices.length, 5);

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          const allowed = table.units_by_category[feature.category];
          if (allowed) {
            assert.ok(allowed.flat().includes(feature.unit), `${at}: ${feature.unit} not allowed`);
          }
        }
        if (feature.supported_options !== undefined) {
          const values = feature.supported_options.map((option) => String(option.value));
          assert.equal(new Set(values).size, values.length, `${at}: duplicate option values`);
          for (const option of feature.supported_options) {
            assert.ok(String(option.label).trim() !== '', `${at}: option without label`);
            if (typeof option.value === 'string') {
              assert.equal(`${feature.category}/${feature.type}`, 'text/select', `${at}`);
            }
          }
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}

test('the published states only ever target features of the discovered devices', async (t) => {
  const world = await createWorld({ account: everyPump() });
  t.after(() => world.app.stop());
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
  const known = new Set(
    world.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  assert.ok(world.fake.states.length > 30);
  for (const state of world.fake.states) {
    assert.ok(known.has(state.device_feature_external_id), state.device_feature_external_id);
    if (state.text !== undefined) {
      assert.ok(state.text.trim() !== '', `${state.device_feature_external_id}: empty text`);
    }
  }
});
