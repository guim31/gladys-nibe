// -----------------------------------------------------------------------------
// Which point plays which role, on real myUplink answers (Home Assistant
// fixtures) and on two synthetic lists (heat meters, unknown ids).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND,
  NO_SENSOR,
  classifyPoints,
  enumOf,
  isBinary,
  mergeProfiles,
  optionFor,
} from '../src/myuplink/points.js';
import { POINTS } from './helpers/fakeMyUplink.js';

const ids = (profile) =>
  Object.fromEntries(Object.entries(profile).map(([key, entry]) => [key, entry.parameterId]));

test('NIBE F730: the registers of the F-series', () => {
  const profile = classifyPoints(POINTS.f730());
  assert.deepEqual(ids(profile), {
    outdoor_temperature: '40004',
    supply_temperature: '40008',
    return_temperature: '40012',
    hot_water_top_temperature: '40013',
    hot_water_charging_temperature: '40014',
    indoor_temperature: '40033',
    compressor_frequency: '41778',
    compressor_status: '43427',
    operating_mode: '49994',
    heating_offset: '47011',
    hot_water_mode: '47041',
    hot_water_boost: '50004',
  });
  assert.deepEqual(profile.heating_offset, {
    parameterId: '47011',
    kind: KIND.OFFSET,
    writable: true,
    min: -10,
    max: 10,
    step: 1,
  });
  assert.equal(profile.hot_water_mode.kind, KIND.SELECT);
  assert.deepEqual(
    profile.hot_water_mode.options.map((option) => option.value),
    ['4', '0', '1', '2'],
  );
  assert.equal(profile.hot_water_boost.kind, KIND.BOOST);
  assert.equal(profile.compressor_status.writable, false);
});

test('NIBE SMO 20: absent sensors skipped, smart home categories used', () => {
  const profile = classifyPoints(POINTS.smo20());
  // 40008/40012 do not exist and BT61/BT62 read -32768: the external
  // supply/return lines (sh-supplyTemp, sh-returnTemp) take their place.
  assert.equal(profile.supply_temperature.parameterId, '40071');
  assert.equal(profile.return_temperature.parameterId, '40152');
  assert.equal(profile.outdoor_temperature.parameterId, '40004');
  assert.equal(profile.hot_water_charging_temperature.parameterId, '40014');
  assert.equal(profile.compressor_frequency.parameterId, '44701');
  assert.equal(profile.compressor_status.parameterId, '44064');
  assert.equal(profile.hot_water_boost.parameterId, '50004');
  // No room sensor, no hot water comfort mode on this one.
  assert.equal(profile.indoor_temperature, undefined);
  assert.equal(profile.hot_water_mode, undefined);
  // "Heating offset (Smart Price Adaption)" is a reading, not the curve offset.
  assert.equal(profile.heating_offset.parameterId, '47011');
});

test('CTC i555: none of its two points plays a role', () => {
  assert.deepEqual(classifyPoints(POINTS.ctc()), {});
});

test('heat meters: compressor + additional heat first, durations make a select', () => {
  const profile = classifyPoints(POINTS.heatMeters());
  assert.equal(profile.heat_produced_heating.parameterId, '44300');
  assert.equal(profile.heat_produced_hot_water.parameterId, '44298');
  assert.equal(profile.heat_produced_heating.kind, KIND.HEAT);
  // 48132 "temporary lux": 3 h, 6 h, 12 h... is not an on/off.
  assert.equal(profile.hot_water_boost.parameterId, '48132');
  assert.equal(profile.hot_water_boost.kind, KIND.SELECT);
  assert.equal(profile.hot_water_boost.options.length, 5);
  // The room sensor reads -32768: not installed.
  assert.equal(profile.indoor_temperature, undefined);
  assert.equal(profile.compressor_frequency.parameterId, '43136');
});

test('unknown ids: the English names find the roles, never a setpoint or a target', () => {
  const profile = classifyPoints(POINTS.sSeries());
  assert.deepEqual(ids(profile), {
    outdoor_temperature: '1',
    supply_temperature: '2', // not 4, "Calculated supply" (a target)
    return_temperature: '3',
    hot_water_charging_temperature: '6', // 5 reads -32768
    indoor_temperature: '7', // not 8, the room setpoint
    compressor_frequency: '10', // not 9, the requested frequency
    compressor_status: '11',
    heating_offset: '12', // not 15, the Smart Price Adaption reading
    hot_water_mode: '13',
    hot_water_boost: '14',
  });
});

test('the garbage point 65535 and duplicates are ignored', () => {
  const points = POINTS.f730();
  const garbage = points.find((point) => point.parameterId === '65535');
  assert.ok(garbage, 'the fixture holds the garbage point');
  const profile = classifyPoints([...points, ...points]);
  assert.deepEqual(ids(profile), ids(classifyPoints(points)));
});

test('a point reading -32768 never plays a role', () => {
  const points = POINTS.f730().map((point) =>
    point.parameterId === '40004' ? { ...point, value: NO_SENSOR } : point,
  );
  assert.equal(classifyPoints(points).outdoor_temperature, undefined);
});

test('a profile keeps the roles it found before', () => {
  const before = classifyPoints(POINTS.f730());
  // The room sensor is briefly missing: the feature must not vanish.
  const now = classifyPoints(
    POINTS.f730().map((point) =>
      point.parameterId === '40033' ? { ...point, value: NO_SENSOR } : point,
    ),
  );
  assert.equal(now.indoor_temperature, undefined);
  assert.deepEqual(mergeProfiles(before, now).indoor_temperature, before.indoor_temperature);
  // A new role appears: added.
  const merged = mergeProfiles({ outdoor_temperature: before.outdoor_temperature }, now);
  assert.ok(merged.hot_water_mode);
});

test('enumerations: numeric matching, decimal values, 0/1 shapes', () => {
  const [lower, upper] = POINTS.ctc();
  assert.deepEqual(
    enumOf(upper)
      .slice(0, 3)
      .map((entry) => entry.raw),
    ['0.0', '0.3', '0.6'],
  );
  assert.equal(optionFor({ options: [{ value: '0.3', text: '0.3' }] }, 0.3).value, '0.3');
  assert.equal(optionFor({ options: [{ value: '60', text: 'runs' }] }, 60).text, 'runs');
  assert.equal(optionFor({ options: [] }, 1), null);
  assert.equal(isBinary(lower), false);
  assert.equal(isBinary({ enumValues: [{ value: '1' }, { value: '0' }] }), true);
  assert.equal(isBinary({ enumValues: [], minValue: 0, maxValue: 1 }), true);
});
