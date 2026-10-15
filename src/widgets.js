// -----------------------------------------------------------------------------
// The "Heat pump" dashboard widget: heating, hot water, outdoor, state.
//
// Pure builders (no I/O): the content is made from the last reading of the
// hub. Rules of the core worth knowing:
// - at most 8 components, 6 tiles, 2 texts, 1 status list, 4 buttons, cut
//   BEFORE the references are resolved: the content stays within them;
// - the tiles are bound to the device features (live, no refresh needed);
// - a button `device_feature` + `value` goes through onSetValue, like a
//   command from the device card; the offset buttons are `action`s with
//   distinct keys (the core drops a button whose action key is taken);
// - the current choice is never shown by the `primary` style, invisible in
//   dark mode (GladysAssistant/Gladys#3153): the labels say it.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { alarmText, deviceIds, offsetValues, optionLabel, roleState } from './devices.js';
import { MESSAGES, TEXT, pick } from './i18n.js';
import { KIND } from './myuplink/points.js';

/** Widget action keys (frozen once published). */
export const WIDGET_ACTIONS = { OFFSET_DOWN: 'offset_down', OFFSET_UP: 'offset_up' };

// The data moves every few minutes; the tiles are live anyway.
const TTL_SECONDS = 120;

const textContent = (message, language) => ({
  ttl_seconds: 60,
  components: [{ type: 'text', variant: 'body', text: pick(message, language) }],
});

export const pickDeviceContent = (language) => textContent(MESSAGES.pickDevice, language);
export const notReadyContent = (language) => textContent(MESSAGES.widgetNotReady, language);
export const notConfiguredContent = (language) => textContent(MESSAGES.notConfigured, language);

const short = (text) => (text.length > 40 ? `${text.slice(0, 39)}…` : text);

/** The current text of a role, or null. */
function stateText(entry, roleKey, language) {
  const point = entry.profile[roleKey];
  if (!point || !entry.reading) {
    return null;
  }
  const state = roleState(roleKey, point, entry.reading.points.get(point.parameterId), language);
  if (state === null) {
    return null;
  }
  return typeof state === 'number' ? state : state.text;
}

/** The label of a select role's current option (the state is the raw value). */
function selectLabel(entry, roleKey, language) {
  const raw = stateText(entry, roleKey, language);
  if (raw === null) {
    return null;
  }
  const point = entry.profile[roleKey];
  if (point.kind === KIND.OFFSET) {
    return Number(raw) > 0 ? `+${raw}` : String(raw);
  }
  const option = point.options?.find((candidate) => candidate.value === raw);
  // Same label as the select of the device card.
  return option ? optionLabel(option, language) : null;
}

/**
 * @param {object} options
 * @param {object} options.gladys
 * @param {{ pump, profile, reading }} options.entry
 * @param {string} options.language
 * @param {boolean|null} options.canWrite false: the controls would be refused
 */
export function buildHeatPumpContent({ gladys, entry, language, canWrite }) {
  const ids = deviceIds(gladys, entry.pump);
  const { profile } = entry;
  const components = [];

  // Tiles: what the user looks at first, at most 4 (one row of 4, or 2 × 2).
  const tiles = [
    ['outdoor_temperature', TEXT.outdoor],
    ['supply_temperature', TEXT.supply],
    [
      profile.hot_water_top_temperature
        ? 'hot_water_top_temperature'
        : 'hot_water_charging_temperature',
      TEXT.hotWater,
    ],
    ['indoor_temperature', TEXT.indoor],
  ];
  for (const [roleKey, label] of tiles) {
    if (profile[roleKey]) {
      components.push({
        type: 'value',
        label: pick(label, language),
        icon: 'thermometer',
        device_feature: ids.feature(roleKey),
      });
    }
  }

  // State: one list, every line with a value.
  const items = [];
  const push = (label, value, color, icon) => {
    if (value !== null && value !== undefined && value !== '') {
      items.push({
        label: pick(label, language),
        value: short(String(value)),
        ...(color ? { color } : {}),
        ...(icon ? { icon } : {}),
      });
    }
  };
  push(
    TEXT.connection,
    pick(entry.pump.connected ? TEXT.online : TEXT.offline, language),
    entry.pump.connected ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    'cloud',
  );
  push(TEXT.mode, stateText(entry, 'operating_mode', language), WIDGET_COLORS.INFO, 'activity');
  const compressor = [
    stateText(entry, 'compressor_status', language),
    stateText(entry, 'compressor_frequency', language),
  ].filter(Boolean);
  push(TEXT.compressor, compressor.join(' · ') || null, WIDGET_COLORS.NEUTRAL, 'cpu');
  push(
    TEXT.offset,
    selectLabel(entry, 'heating_offset', language),
    WIDGET_COLORS.NEUTRAL,
    'sliders',
  );
  push(
    TEXT.hotWaterMode,
    selectLabel(entry, 'hot_water_mode', language),
    WIDGET_COLORS.NEUTRAL,
    'droplet',
  );
  const boost = profile.hot_water_boost;
  if (boost?.kind === KIND.BOOST) {
    const on = stateText(entry, 'hot_water_boost', language);
    if (on !== null) {
      push(
        TEXT.boost,
        pick(on === 1 ? TEXT.active : TEXT.inactive, language),
        on === 1 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
        'zap',
      );
    }
  } else if (boost) {
    push(TEXT.boost, selectLabel(entry, 'hot_water_boost', language), WIDGET_COLORS.NEUTRAL, 'zap');
  }
  if (entry.reading?.alarms) {
    const count = entry.reading.alarms.length;
    push(
      TEXT.alarms,
      alarmText(entry.reading.alarms, language),
      count > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
      count > 0 ? 'alert-triangle' : 'check-circle',
    );
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }

  // Buttons: only for what myUplink lets this heat pump change.
  const controls = canWrite !== false && entry.pump.connected;
  if (controls && boost?.kind === KIND.BOOST && boost.writable) {
    const on = stateText(entry, 'hot_water_boost', language) === 1;
    components.push({
      type: 'button',
      label: pick(on ? TEXT.boostOff : TEXT.boostOn, language),
      icon: on ? 'x-circle' : 'zap',
      style: 'secondary',
      device_feature: ids.feature('hot_water_boost'),
      value: on ? 0 : 1,
    });
  }
  const offset = profile.heating_offset;
  if (controls && offset?.writable) {
    const values = offsetValues(offset);
    const current = Number(stateText(entry, 'heating_offset', language));
    if (Number.isFinite(current)) {
      if (values.includes(current - offset.step)) {
        components.push({
          type: 'button',
          label: pick(TEXT.offsetDown, language),
          icon: 'minus',
          style: 'secondary',
          action: { key: WIDGET_ACTIONS.OFFSET_DOWN },
        });
      }
      if (values.includes(current + offset.step)) {
        components.push({
          type: 'button',
          label: pick(TEXT.offsetUp, language),
          icon: 'plus',
          style: 'secondary',
          action: { key: WIDGET_ACTIONS.OFFSET_UP },
        });
      }
    }
  }

  return { ttl_seconds: TTL_SECONDS, components };
}
