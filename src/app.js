// -----------------------------------------------------------------------------
// Wires the Gladys SDK to the myUplink account (src/hub.js), the refresh
// timer (src/poller.js) and the widget (src/widgets.js). Every handler is
// registered here, before connect().
//
// Takes the gladys client as a parameter: index.js passes the real one, the
// tests the SDK's fake Gladys (@gladysassistant/integration-sdk/testing).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './config.js';
import { deviceIds, offsetValues } from './devices.js';
import { WIDGET_KEY, createHub } from './hub.js';
import { MESSAGES, TEMPLATES, pick } from './i18n.js';
import { createClient } from './myuplink/client.js';
import { createPoller } from './poller.js';
import { Store } from './store.js';
import {
  WIDGET_ACTIONS,
  buildHeatPumpContent,
  notConfiguredContent,
  notReadyContent,
  pickDeviceContent,
} from './widgets.js';

/** Manifest action keys (frozen once published). */
export const ACTIONS = { TEST_CONNECTION: 'test_connection' };

const logger = createLogger({ name: 'app' });

/**
 * @param {object} gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {object} [options]
 * @param {Store} [options.store]
 * @param {typeof fetch} [options.fetch] myUplink transport (a fake one in tests)
 * @param {boolean} [options.timers] run the refresh timer
 * @param {() => number} [options.now]
 */
export function registerHandlers(gladys, { store = new Store(), fetch, timers = true, now } = {}) {
  let config = normalizeConfig();
  const getConfig = () => config;
  const client = createClient({ getConfig, store, fetch, now });
  const hub = createHub({ gladys, client, store, getConfig, now });
  const poller = createPoller({ gladys, hub, getConfig, timers });

  async function start() {
    await hub.discover();
    poller.start();
  }

  // --- Discovery: the Discovery screen asks for the list ----------------------
  gladys.onScanRequest(async () => {
    logger.debug('onScanRequest');
    await hub.discover();
  });

  // --- Commands: hot water mode, boost, heating offset -------------------------
  gladys.onSetValue(async (device, feature, value) => {
    const prefix = `${device.external_id}:`;
    const roleKey = feature.external_id.startsWith(prefix)
      ? feature.external_id.slice(prefix.length)
      : '';
    await hub.setValue(device.external_id, roleKey, value);
  });

  // --- Refresh: own timer, the core's onPoll as the fallback, new devices -------
  poller.register();

  // --- Manifest action: "Test the connection" ----------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, () => hub.testConnection());

  // --- Dashboard widget ----------------------------------------------------------
  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language } = {}) => {
    const lang = ['en', 'fr', 'de', 'es'].includes(language) ? language : config.language;
    if (!isConfigured(config)) {
      return notConfiguredContent(lang);
    }
    const entry = settings?.device ? hub.entryByDevice(settings.device) : null;
    if (!entry) {
      return pickDeviceContent(lang);
    }
    if (!entry.reading) {
      return notReadyContent(lang);
    }
    return buildHeatPumpContent({ gladys, entry, language: lang, canWrite: hub.canWrite(entry) });
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey, params, { settings } = {}) => {
    const lang = config.language;
    const entry = settings?.device ? hub.entryByDevice(settings.device) : null;
    if (!entry) {
      throw new Error(pick(MESSAGES.pickDevice, lang));
    }
    const offset = entry.profile.heating_offset;
    const direction = { [WIDGET_ACTIONS.OFFSET_DOWN]: -1, [WIDGET_ACTIONS.OFFSET_UP]: 1 }[
      actionKey
    ];
    if (!offset || !direction) {
      throw new Error(pick(MESSAGES.readOnly, lang));
    }
    logger.info(`Widget action ${actionKey}`);
    const point = entry.reading?.points.get(offset.parameterId);
    const current = Math.round(Number(point?.value));
    const target = current + direction * offset.step;
    if (!Number.isFinite(current) || !offsetValues(offset).includes(target)) {
      return MESSAGES.offsetLimit;
    }
    const written = await hub.setValue(
      deviceIds(gladys, entry.pump).device,
      'heating_offset',
      target,
    );
    const label = written > 0 ? `+${written}` : String(written);
    return Object.fromEntries(
      Object.entries(TEMPLATES.offsetSet).map(([code, render]) => [code, render(label)]),
    );
  });

  // --- Configuration updated by the user ----------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    config = normalizeConfig(newConfig);
    hub.reset();
    await start();
  });

  // --- Connection lifecycle --------------------------------------------------------
  // The SDK logs the WebSocket lifecycle itself; this only (re)initializes.
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, MESSAGES.initFailed).catch(() => {});
    }
  });

  return {
    hub,
    poller,
    client,
    store,
    getConfig,
    /** Graceful shutdown: no timer left, the last /data write finished. */
    async stop() {
      poller.stop();
      await store.flush();
    },
  };
}
