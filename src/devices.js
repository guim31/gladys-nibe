// -----------------------------------------------------------------------------
// One Gladys device per heat pump: its features, built from the point profile
// (src/myuplink/points.js), and its states, built from a reading.
//
// Pure functions: no I/O, no SDK call besides gladys.externalIds.
//
// Choices worth knowing (Gladys core constraints):
// - the compressor frequency is a text ("57 Hz"): Gladys has no hertz unit,
//   and a counter would show as "Integer counter" on the dashboard;
// - the heating curve offset is a select (-10 ... +10), not a thermostat
//   setpoint: it is not a temperature, and a voice assistant asking for
//   "21 degrees" must never reach it;
// - the produced heat is a counter in kWh, not an energy index: an
//   `energy-sensor` index would be counted by Gladys as electricity drawn
//   from the main meter, and this is heat delivered to the house;
// - min/max are set on every feature, text ones included (0/0): without them
//   "Add to Gladys" fails with a 422.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { KIND, ROLES, numericValue, optionFor } from './myuplink/points.js';
import {
  COMPRESSOR_STATES,
  FEATURE_NAMES,
  OPERATING_MODES,
  OPTION_TEXTS,
  TEMPLATES,
  TEXT,
  pick,
} from './i18n.js';

/** Device type namespace of the external ids (never renamed). */
export const DEVICE_TYPE = 'heatpump';

/** Features every heat pump has, whatever its points. */
export const ALARM_FEATURES = { COUNT: 'active_alarms', LAST: 'last_alarm' };

// Wide enough for any heat pump reading, from a frozen outdoor sensor to a
// hot water tank in legionella cycle; the dashboard uses them for gauges only.
const TEMPERATURE_RANGE = { min: -50, max: 100 };
const HEAT_MAX = 100_000_000; // kWh
const ALARM_MAX = 100;

export const deviceIds = (gladys, pump) => gladys.externalIds(DEVICE_TYPE, pump.id);

/** "F730 CU 3x400V (Home)", or the product alone when the system has its name. */
export function deviceName(pump) {
  const product = String(pump.productName ?? '').trim() || 'NIBE';
  const system = String(pump.systemName ?? '').trim();
  return system && system !== product ? `${product} (${system})` : product;
}

const signed = (value) => (value > 0 ? `+${value}` : String(value));

/** The integer values a heating offset accepts, from its bounds and step. */
export function offsetValues(entry) {
  const values = [];
  const step = entry.step > 0 ? entry.step : 1;
  for (let value = Math.ceil(entry.min); value <= entry.max; value += step) {
    values.push(value);
  }
  return values;
}

/** The text of an enumeration option, translated when it is a known one. */
export function optionLabel(option, language) {
  const known = pick(OPTION_TEXTS, language)[option.text.toLowerCase()];
  if (known) {
    return known;
  }
  const text = option.text || option.value;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const baseFeature = (ids, key, language) => ({
  name: pick(FEATURE_NAMES, language)[key],
  external_id: ids.feature(key),
});

/** The Gladys feature of one role. */
function roleFeature(ids, role, entry, language) {
  const base = baseFeature(ids, role.key, language);
  switch (entry.kind) {
    case KIND.TEMPERATURE:
      return {
        ...base,
        category: CATEGORIES.TEMPERATURE_SENSOR,
        type: TYPES.SENSOR.DECIMAL,
        unit: UNITS.CELSIUS,
        ...TEMPERATURE_RANGE,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      };
    case KIND.HEAT:
      return {
        ...base,
        category: CATEGORIES.COUNTER_SENSOR,
        type: TYPES.SENSOR.INTEGER,
        min: 0,
        max: HEAT_MAX,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      };
    case KIND.BOOST:
      return {
        ...base,
        category: CATEGORIES.WATER_HEATER,
        type: TYPES.WATER_HEATER.BOOST,
        min: 0,
        max: 1,
        read_only: !entry.writable,
        has_feedback: true,
        keep_history: true,
      };
    case KIND.OFFSET:
      return {
        ...base,
        category: CATEGORIES.TEXT,
        type: TYPES.TEXT.SELECT,
        min: 0,
        max: 0,
        read_only: !entry.writable,
        has_feedback: true,
        keep_history: false,
        supported_options: offsetValues(entry).map((value, index) => ({
          value: String(value),
          label: signed(value),
          sort_order: index,
        })),
      };
    case KIND.SELECT:
      return {
        ...base,
        category: CATEGORIES.TEXT,
        type: TYPES.TEXT.SELECT,
        min: 0,
        max: 0,
        read_only: !entry.writable,
        has_feedback: true,
        keep_history: false,
        supported_options: entry.options.map((option, index) => ({
          value: option.value,
          label: optionLabel(option, language),
          sort_order: index,
        })),
      };
    default:
      // FREQUENCY, ENUM_TEXT: read-only texts.
      return {
        ...base,
        category: CATEGORIES.TEXT,
        type: TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      };
  }
}

/**
 * The device Gladys discovers for one heat pump.
 * @param {object} gladys GladysIntegration
 * @param {object} pump { id, systemId, systemName, productName, firmware }
 * @param {Record<string, object>} profile role key -> point description
 * @param {string} language
 */
export function buildDevice(gladys, pump, profile, language) {
  const ids = deviceIds(gladys, pump);
  const features = [];
  for (const role of ROLES) {
    const entry = profile[role.key];
    if (entry) {
      features.push(roleFeature(ids, role, entry, language));
    }
  }
  features.push(
    {
      ...baseFeature(ids, ALARM_FEATURES.COUNT, language),
      category: CATEGORIES.COUNTER_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      min: 0,
      max: ALARM_MAX,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
    {
      ...baseFeature(ids, ALARM_FEATURES.LAST, language),
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.TEXT,
      min: 0,
      max: 0,
      read_only: true,
      has_feedback: false,
      keep_history: false,
    },
  );
  return {
    name: deviceName(pump),
    external_id: ids.device,
    // The container polls by itself (src/poller.js): the core's onPoll, once
    // a minute when it works, is only the fallback.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: [
      { name: 'myuplink_system_id', value: pump.systemId },
      { name: 'firmware', value: pump.firmware || '-' },
    ],
    features,
  };
}

/** Readable text of a read-only enumeration (compressor, operating mode). */
export function enumText(roleKey, entry, value, language) {
  const tables = { compressor_status: COMPRESSOR_STATES, operating_mode: OPERATING_MODES };
  const table = tables[roleKey] ? pick(tables[roleKey], language) : null;
  if (table?.[value]) {
    return table[value];
  }
  // The operating mode reports sub-states (31: heating with a detail) that
  // are not in its enumeration: the tens give the mode.
  if (roleKey === 'operating_mode' && table?.[Math.floor(value / 10) * 10]) {
    return table[Math.floor(value / 10) * 10];
  }
  const option = optionFor(entry, value);
  if (option) {
    return optionLabel(option, language);
  }
  return pick(TEMPLATES.unknownValue, language)(value);
}

/**
 * The state of one role from the point read, or null (no value).
 * @returns {number | { text: string } | null}
 */
export function roleState(roleKey, entry, point, language) {
  const value = numericValue(point);
  if (value === null) {
    return null;
  }
  switch (entry.kind) {
    case KIND.TEMPERATURE:
      return Math.round(value * 10) / 10;
    case KIND.HEAT:
      return Math.round(value);
    case KIND.BOOST:
      return value !== 0 ? 1 : 0;
    case KIND.FREQUENCY:
      return { text: `${Math.round(value)} Hz` };
    case KIND.ENUM_TEXT:
      return { text: enumText(roleKey, entry, value, language) };
    case KIND.OFFSET: {
      const accepted = offsetValues(entry);
      const rounded = Math.round(value);
      return accepted.includes(rounded) ? { text: String(rounded) } : null;
    }
    case KIND.SELECT: {
      const option = optionFor(entry, value);
      return option ? { text: option.value } : null;
    }
    default:
      return null;
  }
}

/** Text of the alarm feature: the most recent active alarm, or "No alarm". */
export function alarmText(alarms, language) {
  if (!alarms.length) {
    return pick(TEXT.noAlarm, language);
  }
  const latest = [...alarms].sort((a, b) =>
    String(b.createdDatetime ?? '').localeCompare(String(a.createdDatetime ?? '')),
  )[0];
  const header = String(latest.header ?? '').trim() || pick(TEXT.unknown, language);
  const text = latest.alarmNumber !== undefined ? `${latest.alarmNumber} – ${header}` : header;
  return text.slice(0, 200);
}

/**
 * Every state of a heat pump, in the publishStates format.
 * @param {object} gladys
 * @param {object} pump
 * @param {Record<string, object>} profile
 * @param {{ points: Map<string, object>, alarms: object[] | null }} reading
 *   alarms null: unknown this time, left as they were
 * @param {string} language
 */
export function buildStates(gladys, pump, profile, reading, language) {
  const ids = deviceIds(gladys, pump);
  const states = [];
  for (const role of ROLES) {
    const entry = profile[role.key];
    if (!entry) {
      continue;
    }
    const state = roleState(role.key, entry, reading.points.get(entry.parameterId), language);
    if (state === null) {
      continue;
    }
    const feature = ids.feature(role.key);
    states.push(
      typeof state === 'number'
        ? { device_feature_external_id: feature, state }
        : { device_feature_external_id: feature, text: state.text },
    );
  }
  if (reading.alarms) {
    states.push(
      {
        device_feature_external_id: ids.feature(ALARM_FEATURES.COUNT),
        state: Math.min(ALARM_MAX, reading.alarms.length),
      },
      {
        device_feature_external_id: ids.feature(ALARM_FEATURES.LAST),
        text: alarmText(reading.alarms, language),
      },
    );
  }
  return states;
}
