// -----------------------------------------------------------------------------
// From a profile and a reading to the Gladys device and its states: the
// feature kinds, the translated texts, the values Gladys accepts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  alarmText,
  buildDevice,
  buildStates,
  deviceName,
  enumText,
  offsetValues,
  optionLabel,
  roleState,
} from '../src/devices.js';
import { writeValue } from '../src/hub.js';
import { KIND, classifyPoints } from '../src/myuplink/points.js';
import { POINTS } from './helpers/fakeMyUplink.js';

const gladys = createFakeGladys();
const pump = {
  id: 'emmy-r-1',
  systemId: 'sys',
  systemName: 'Maison',
  productName: 'F730 CU 3x400V',
  firmware: '9682R7',
  connected: true,
};
const readingOf = (points, alarms = []) => ({
  points: new Map(points.map((point) => [String(point.parameterId), point])),
  alarms,
});

test('device: stable external ids, a name, polled by the core once a minute', () => {
  const device = buildDevice(gladys, pump, classifyPoints(POINTS.f730()), 'fr');
  assert.equal(device.external_id, 'ext:test-integration:heatpump:emmy-r-1');
  assert.equal(device.name, 'F730 CU 3x400V (Maison)');
  assert.equal(device.should_poll, true);
  assert.equal(device.poll_frequency, 60000);
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    [
      'outdoor_temperature',
      'supply_temperature',
      'return_temperature',
      'hot_water_top_temperature',
      'hot_water_charging_temperature',
      'indoor_temperature',
      'compressor_frequency',
      'compressor_status',
      'operating_mode',
      'heating_offset',
      'hot_water_mode',
      'hot_water_boost',
      'active_alarms',
      'last_alarm',
    ],
  );
  // The external ids never depend on the language: names do.
  const english = buildDevice(gladys, pump, classifyPoints(POINTS.f730()), 'en');
  assert.deepEqual(
    english.features.map((f) => f.external_id),
    device.features.map((f) => f.external_id),
  );
  assert.equal(english.features[0].name, 'Outdoor temperature');
  assert.equal(device.features[0].name, 'Température extérieure');
});

test('device names: product and system, or the product alone', () => {
  assert.equal(deviceName({ productName: 'SMO 20', systemName: 'SMO 20' }), 'SMO 20');
  assert.equal(deviceName({ productName: '', systemName: '' }), 'NIBE');
});

test('controls follow the writable flag of myUplink', () => {
  const profile = classifyPoints(POINTS.f730());
  profile.hot_water_mode = { ...profile.hot_water_mode, writable: false };
  const device = buildDevice(gladys, pump, profile, 'fr');
  const feature = (key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));
  assert.equal(feature('hot_water_mode').read_only, true);
  assert.equal(feature('heating_offset').read_only, false);
  assert.equal(feature('hot_water_boost').read_only, false);
  assert.equal(feature('hot_water_boost').category, 'water-heater');
  assert.equal(feature('outdoor_temperature').read_only, true);
  // The offset is a select, never a thermostat setpoint (voice assistants).
  assert.equal(feature('heating_offset').category, 'text');
  assert.ok(device.features.every((f) => f.category !== 'thermostat'));
});

test('the offset select offers the range of the point, signed', () => {
  const values = offsetValues({ min: -10, max: 10, step: 1 });
  assert.equal(values.length, 21);
  const device = buildDevice(gladys, pump, classifyPoints(POINTS.f730()), 'fr');
  const offset = device.features.find((f) => f.external_id.endsWith(':heating_offset'));
  assert.deepEqual(offset.supported_options.slice(9, 12), [
    { value: '-1', label: '-1', sort_order: 9 },
    { value: '0', label: '0', sort_order: 10 },
    { value: '1', label: '+1', sort_order: 11 },
  ]);
});

test('hot water mode options are translated, unknown ones kept as myUplink wrote them', () => {
  assert.equal(optionLabel({ value: '2', text: 'luxury' }, 'fr'), 'Confort');
  assert.equal(optionLabel({ value: '2', text: 'luxury' }, 'de'), 'Komfort');
  assert.equal(optionLabel({ value: '1', text: 'Medium' }, 'es'), 'Medio');
  assert.equal(optionLabel({ value: '9', text: 'turbo mode' }, 'fr'), 'Turbo mode');
  const device = buildDevice(gladys, pump, classifyPoints(POINTS.f730()), 'es');
  const mode = device.features.find((f) => f.external_id.endsWith(':hot_water_mode'));
  assert.deepEqual(
    mode.supported_options.map((option) => option.label),
    ['Control inteligente', 'Económico', 'Normal', 'Confort'],
  );
});

test('states of the F730 fixture, in French', () => {
  const profile = classifyPoints(POINTS.f730());
  const states = buildStates(gladys, pump, profile, readingOf(POINTS.f730()), 'fr');
  const byKey = Object.fromEntries(
    states.map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.text ?? state.state,
    ]),
  );
  assert.deepEqual(byKey, {
    outdoor_temperature: -9.3,
    supply_temperature: 39.7,
    return_temperature: 34.4,
    hot_water_top_temperature: 46,
    hot_water_charging_temperature: 44.4,
    indoor_temperature: 21.2,
    compressor_frequency: '57 Hz',
    compressor_status: 'En marche',
    // 31 is not in the enumeration: a heating sub-state.
    operating_mode: 'Chauffage',
    heating_offset: '1',
    hot_water_mode: '0',
    hot_water_boost: 0,
    active_alarms: 0,
    last_alarm: 'Aucune alarme',
  });
});

test('produced heat: an integer number of kWh', () => {
  const profile = classifyPoints(POINTS.heatMeters());
  const states = buildStates(gladys, pump, profile, readingOf(POINTS.heatMeters()), 'en');
  const value = (key) =>
    states.find((state) => state.device_feature_external_id.endsWith(`:${key}`))?.state;
  assert.equal(value('heat_produced_heating'), 21877);
  assert.equal(value('heat_produced_hot_water'), 5123);
});

test('a missing value, or one outside the options, publishes nothing', () => {
  const profile = classifyPoints(POINTS.f730());
  const points = POINTS.f730().map((point) => {
    if (point.parameterId === '40004') {
      return { ...point, value: -32768 };
    }
    if (point.parameterId === '47041') {
      return { ...point, value: 7 };
    }
    return point;
  });
  const states = buildStates(gladys, pump, profile, readingOf(points, null), 'fr');
  const keys = states.map((state) => state.device_feature_external_id.split(':').pop());
  assert.ok(!keys.includes('outdoor_temperature'));
  assert.ok(!keys.includes('hot_water_mode'));
  // Alarms unknown this time (null): left as they were.
  assert.ok(!keys.includes('active_alarms'));
});

test('read-only enumerations in every language, unknown values said so', () => {
  const entry = { options: [{ value: '20', text: 'off' }] };
  assert.equal(enumText('compressor_status', entry, 60, 'de'), 'Läuft');
  assert.equal(enumText('operating_mode', entry, 20, 'es'), 'Agua caliente');
  assert.equal(enumText('operating_mode', entry, 62, 'en'), 'Cooling');
  assert.equal(enumText('compressor_status', entry, 77, 'fr'), 'Inconnu (77)');
});

test('the alarm text: the most recent one, number first', () => {
  assert.equal(alarmText([], 'de'), 'Kein Alarm');
  assert.equal(
    alarmText(
      [
        { alarmNumber: 1, header: 'Old', createdDatetime: '2026-10-01T00:00:00Z' },
        { alarmNumber: 183, header: 'Defrosting', createdDatetime: '2026-10-14T00:00:00Z' },
      ],
      'en',
    ),
    '183 – Defrosting',
  );
});

test('write values: only what the point accepts', () => {
  const profile = classifyPoints(POINTS.f730());
  assert.equal(writeValue(profile.heating_offset, '-3'), -3);
  assert.equal(writeValue(profile.heating_offset, '11'), null);
  assert.equal(writeValue(profile.hot_water_mode, '4'), '4');
  assert.equal(writeValue(profile.hot_water_mode, 'luxury'), null);
  assert.equal(writeValue(profile.hot_water_boost, 1), 1);
  assert.equal(writeValue(profile.hot_water_boost, '0'), 0);
  assert.equal(writeValue({ kind: KIND.TEMPERATURE }, 20), null);
  // A boost with durations is a select: the raw option value is written.
  const durations = classifyPoints(POINTS.heatMeters()).hot_water_boost;
  assert.equal(writeValue(durations, '2'), '2');
  assert.equal(
    roleState('hot_water_boost', durations, { value: 2 }, 'fr').text,
    '2',
    'the select state is the raw option value',
  );
});
