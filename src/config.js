// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`; this module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with a number typed as a string.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface: feature names, messages, widgets. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Refresh interval bounds, in minutes (see docs: myUplink quota). */
export const POLL_MINUTES = { min: 1, max: 60, default: 5 };

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  client_id: '',
  client_secret: '',
  poll_interval: POLL_MINUTES.default, // minutes
  language: 'fr',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const minutes = Math.round(Number(raw.poll_interval ?? DEFAULT_CONFIG.poll_interval));
  return {
    client_id: String(raw.client_id ?? '').trim(),
    // A secret pasted from the developer portal often carries a trailing space.
    client_secret: String(raw.client_secret ?? '').trim(),
    poll_interval: Number.isFinite(minutes)
      ? Math.min(POLL_MINUTES.max, Math.max(POLL_MINUTES.min, minutes))
      : DEFAULT_CONFIG.poll_interval,
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
  };
}

/** The integration can only reach myUplink once both credentials are set. */
export function isConfigured(config) {
  return Boolean(config.client_id && config.client_secret);
}

/** The refresh period, in milliseconds. */
export const pollPeriodMs = (config) => config.poll_interval * 60 * 1000;
