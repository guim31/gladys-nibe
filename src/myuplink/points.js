// -----------------------------------------------------------------------------
// From the myUplink data points to the few that matter.
//
// A NIBE heat pump exposes hundreds of points (a SMO 20 dump holds 668), most
// of them service settings and schedules. The integration keeps a fixed set of
// roles — outdoor temperature, supply line, hot water, compressor, heating
// offset, hot water mode and boost, produced heat — and finds, on each heat
// pump, the point that plays each role:
//
//   1. a known parameter id (the NIBE register numbers myUplink keeps on the
//      F-series and on the indoor modules: 40004 outdoor BT1, 40008 supply BT2...);
//   2. else a myUplink "smart home category" (sh-outdoorTemp...), which the API
//      sets on some points whatever the model;
//   3. else, for a few roles, the English name of the point (the points are
//      always read in English, whatever the integration language, so the
//      names are stable).
//
// The value -32768 is NIBE's "no sensor": such a point never plays a role.
// The roles found are kept in /data (the profile), so a sensor briefly
// missing at a later start does not make a feature disappear.
// -----------------------------------------------------------------------------

/** NIBE's value for an absent sensor. */
export const NO_SENSOR = -32768;

/** Feature kinds, decided by the role and by the shape of the point. */
export const KIND = {
  TEMPERATURE: 'temperature',
  FREQUENCY: 'frequency', // text "57 Hz": Gladys has no hertz unit
  ENUM_TEXT: 'enum_text', // read-only enumeration shown as a translated text
  OFFSET: 'offset', // writable integer offset, offered as a select
  SELECT: 'select', // writable enumeration
  BOOST: 'boost', // 0/1 switch
  HEAT: 'heat', // cumulated produced heat, kWh
};

const clean = (name) =>
  String(name ?? '')
    .replace(/\u00ad/g, '') // soft hyphens: "Tempo-rary lux" with U+00AD
    .replace(/\s+/g, ' ')
    .trim();

const isTemperatureUnit = (unit) => /°\s*C/i.test(String(unit ?? ''));

/** A point's enumeration, as `[{ value: number, raw: string, text: string }]`. */
export function enumOf(point) {
  return (Array.isArray(point?.enumValues) ? point.enumValues : [])
    .map((entry) => ({
      value: Number(entry?.value),
      raw: String(entry?.value ?? ''),
      text: clean(entry?.text),
    }))
    .filter((entry) => entry.raw !== '' && Number.isFinite(entry.value));
}

/** A 0/1 point: enumeration {0, 1}, or 0..1 bounds without enumeration. */
export function isBinary(point) {
  const values = enumOf(point)
    .map((entry) => entry.value)
    .sort();
  if (values.length > 0) {
    return values.length === 2 && values[0] === 0 && values[1] === 1;
  }
  return Number(point?.minValue) === 0 && Number(point?.maxValue) === 1;
}

/**
 * The roles, in the order of the device features. `ids`: known parameter ids,
 * best first. `categories`: myUplink smart home categories. `name`: a test on
 * the cleaned English name, for the points of models whose ids are unknown.
 * `accept`: what the point must look like to play the role.
 */
export const ROLES = [
  {
    key: 'outdoor_temperature',
    kind: KIND.TEMPERATURE,
    ids: ['40004'],
    categories: ['sh-outdoorTemp'],
    name: (n) => /^(current )?outd(oor)?\.? temp/i.test(n),
    accept: (p) => isTemperatureUnit(p.parameterUnit) && !p.writable,
  },
  {
    key: 'supply_temperature',
    kind: KIND.TEMPERATURE,
    ids: ['40008'],
    categories: ['sh-supplyTemp'],
    name: (n) => /^supply line\b/i.test(n),
    // "Calculated supply" carries sh-supplyTemp on some models: a target, not a reading.
    accept: (p) =>
      isTemperatureUnit(p.parameterUnit) && !p.writable && !/calculated/i.test(p.parameterName),
  },
  {
    key: 'return_temperature',
    kind: KIND.TEMPERATURE,
    ids: ['40012'],
    categories: ['sh-returnTemp'],
    name: (n) => /^return line\b/i.test(n),
    accept: (p) => isTemperatureUnit(p.parameterUnit) && !p.writable,
  },
  {
    key: 'hot_water_top_temperature',
    kind: KIND.TEMPERATURE,
    ids: ['40013'],
    categories: [],
    name: (n) => /^hot water top\b/i.test(n),
    accept: (p) => isTemperatureUnit(p.parameterUnit) && !p.writable,
  },
  {
    key: 'hot_water_charging_temperature',
    kind: KIND.TEMPERATURE,
    ids: ['40014'],
    categories: ['sh-hwTemp'],
    name: (n) => /^hot water (charging|load)\b/i.test(n),
    accept: (p) => isTemperatureUnit(p.parameterUnit) && !p.writable,
  },
  {
    key: 'indoor_temperature',
    kind: KIND.TEMPERATURE,
    ids: ['40033'],
    categories: ['sh-indoorTemp'],
    name: (n) => /^room temp(erature)?\b/i.test(n),
    accept: (p) => isTemperatureUnit(p.parameterUnit) && !p.writable,
  },
  {
    key: 'compressor_frequency',
    kind: KIND.FREQUENCY,
    // 41778 F730/F750, 43136 F1x45/F1x55/VVM, 44701 outdoor unit of a SMO.
    ids: ['41778', '43136', '44701'],
    categories: [],
    name: (n) =>
      /(current|actual) (cpr|compressor) freq|compressor freq\w*,? (current|actual)/i.test(n),
    accept: (p) => /^hz$/i.test(String(p.parameterUnit ?? '').trim()) && !p.writable,
  },
  {
    key: 'compressor_status',
    kind: KIND.ENUM_TEXT,
    ids: ['43427', '44064'],
    categories: [],
    name: (n) => /^(status compressor|compressor (status|state))\b/i.test(n),
    accept: (p) => enumOf(p).length > 0 && !p.writable,
  },
  {
    key: 'operating_mode',
    kind: KIND.ENUM_TEXT,
    ids: ['49994'],
    categories: [],
    name: (n) => /^priority$/i.test(n),
    accept: (p) => enumOf(p).length > 0 && !p.writable,
  },
  {
    key: 'heating_offset',
    kind: KIND.OFFSET,
    ids: ['47011'],
    categories: ['sh-indoorSpOffsHeat'],
    name: (n) => /^heat(ing)? offset climate system 1$/i.test(n),
    accept: (p) =>
      enumOf(p).length === 0 &&
      Number.isFinite(Number(p.minValue)) &&
      Number.isFinite(Number(p.maxValue)) &&
      p.minValue !== null &&
      p.maxValue !== null &&
      Number(p.minValue) < Number(p.maxValue) &&
      Number(p.maxValue) - Number(p.minValue) <= 40,
  },
  {
    key: 'hot_water_mode',
    kind: KIND.SELECT,
    ids: ['47041'],
    categories: [],
    name: (n) => /^(hot water )?(comfort mode|demand mode|hot water demand)$/i.test(n),
    accept: (p) => enumOf(p).length > 1,
  },
  {
    key: 'hot_water_boost',
    kind: KIND.BOOST,
    // 50004 "Temporary lux" (on/off); 48132 "temporary lux" (3/6/12 h) on a SMO 20.
    ids: ['50004', '48132'],
    categories: [],
    name: (n) => /^(temporary lux|more hot water)$/i.test(n),
    accept: (p) => isBinary(p) || enumOf(p).length > 1,
  },
  {
    key: 'heat_produced_heating',
    kind: KIND.HEAT,
    // Heat meter, heating, compressor + additional heat; else compressor only.
    ids: ['44300', '44308'],
    categories: [],
    accept: (p) => /^kwh$/i.test(String(p.parameterUnit ?? '').trim()) && !p.writable,
  },
  {
    key: 'heat_produced_hot_water',
    kind: KIND.HEAT,
    ids: ['44298', '44306'],
    categories: [],
    accept: (p) => /^kwh$/i.test(String(p.parameterUnit ?? '').trim()) && !p.writable,
  },
];

export const ROLE_KEYS = ROLES.map((role) => role.key);
export const roleByKey = (key) => ROLES.find((role) => role.key === key);

/** A point that can carry a value: known value, not NIBE's "no sensor". */
const hasValue = (point) =>
  point.value !== null &&
  point.value !== undefined &&
  point.value !== '' &&
  Number(point.value) !== NO_SENSOR;

/**
 * What the integration keeps of a point for a role: enough to build the
 * feature and to write it back, without the whole point.
 */
export function describePoint(role, point) {
  const entry = {
    parameterId: String(point.parameterId),
    kind: role.kind,
    writable: point.writable === true,
  };
  if (role.kind === KIND.OFFSET) {
    const step = Number(point.stepValue) > 0 ? Number(point.stepValue) : 1;
    const scale = Number(point.scaleValue) > 0 ? Number(point.scaleValue) : 1;
    // minValue/maxValue are raw register bounds: the scale gives the real ones.
    entry.min = Math.round(Number(point.minValue) * scale * 10) / 10;
    entry.max = Math.round(Number(point.maxValue) * scale * 10) / 10;
    entry.step = Math.max(1, Math.round(step * scale));
  }
  if (role.kind === KIND.BOOST && !isBinary(point)) {
    entry.kind = KIND.SELECT; // durations (3 h, 6 h...): a select, not an on/off
  }
  if ([KIND.ENUM_TEXT, KIND.SELECT].includes(entry.kind) || role.kind === KIND.BOOST) {
    entry.options = enumOf(point).map(({ raw, text }) => ({ value: raw, text }));
  }
  return entry;
}

/**
 * Finds, among the points of one heat pump, the one of each role.
 * @param {object[]} points the API point list (read in English)
 * @returns {Record<string, ReturnType<typeof describePoint>>} role key -> point
 */
export function classifyPoints(points) {
  const valid = [];
  const seen = new Set();
  for (const raw of Array.isArray(points) ? points : []) {
    const id = String(raw?.parameterId ?? '');
    // Garbage entry several firmwares send, and the duplicates of a dump.
    if (id === '' || id === '65535' || seen.has(id)) {
      continue;
    }
    seen.add(id);
    valid.push({ ...raw, parameterId: id, parameterName: clean(raw.parameterName) });
  }

  const profile = {};
  const taken = new Set();
  const usable = (role, point) =>
    !taken.has(point.parameterId) && hasValue(point) && role.accept(point);

  for (const role of ROLES) {
    const byId = role.ids
      .map((id) => valid.find((point) => point.parameterId === id))
      .find((point) => point && usable(role, point));
    const byCategory =
      byId ??
      valid.find(
        (point) =>
          Array.isArray(point.smartHomeCategories) &&
          point.smartHomeCategories.some((category) => role.categories.includes(category)) &&
          usable(role, point),
      );
    const found =
      byCategory ??
      (role.name
        ? valid.find((point) => role.name(point.parameterName) && usable(role, point))
        : undefined);
    if (found) {
      taken.add(found.parameterId);
      profile[role.key] = describePoint(role, found);
    }
  }
  return profile;
}

/**
 * Merges a fresh classification into the stored profile: a role found before
 * keeps its point (its feature already exists in Gladys), its description is
 * refreshed when the same point is still there.
 */
export function mergeProfiles(stored = {}, fresh = {}) {
  const merged = {};
  for (const key of ROLE_KEYS) {
    const before = stored[key];
    const now = fresh[key];
    if (before && now && before.parameterId === now.parameterId) {
      merged[key] = now;
    } else if (before) {
      merged[key] = before;
    } else if (now) {
      merged[key] = now;
    }
  }
  return merged;
}

/** The number a point carries, or null (no sensor, not a number). */
export function numericValue(point) {
  if (!point || !hasValue(point)) {
    return null;
  }
  const value = Number(point.value);
  return Number.isFinite(value) ? value : null;
}

/** The enumeration entry matching a value (enum values may be "0.3"). */
export function optionFor(entry, value) {
  if (value === null || !Array.isArray(entry?.options)) {
    return null;
  }
  return entry.options.find((option) => Number(option.value) === Number(value)) ?? null;
}
