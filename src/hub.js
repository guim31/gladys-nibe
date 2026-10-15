// -----------------------------------------------------------------------------
// The account: what myUplink says, what Gladys gets.
//
// - discover(): the systems of the account, the full point list of each heat
//   pump (1 + N requests), the roles found (src/myuplink/points.js), the
//   devices published to Gladys;
// - refresh(): one reading cycle — the system list (connection state, alarm
//   flag) and the role points of each heat pump the user added to Gladys,
//   1 + N requests; the active alarms only when myUplink flags one;
// - setValue(): a command from Gladys, written to myUplink.
//
// The heat pumps the user did not add are not read: Gladys would drop their
// states, and the quota is better kept for the others.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { buildDevice, buildStates, deviceIds, offsetValues } from './devices.js';
import { MESSAGES, TEMPLATES, pick } from './i18n.js';
import { createIssueLog } from './issues.js';
import { MyUplinkError } from './myuplink/client.js';
import { KIND, ROLE_KEYS, classifyPoints, mergeProfiles } from './myuplink/points.js';

export const PROFILES_FILE = 'profiles.json';
export const ALARMS_FILE = 'alarms.json';

/** Scene trigger fired when a heat pump raises a new alarm (key frozen once published). */
export const ALARM_TRIGGER = 'alarm_raised';

// Re-send an unchanged value this often, so Gladys never shows "no recent
// value" for a temperature that holds still (it does past 48 hours).
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;

// Ask myUplink again for the Premium Manage subscription after this long.
const SUBSCRIPTION_TTL_MS = 24 * 60 * 60 * 1000;

const logger = createLogger({ name: 'myuplink' });

/** The pump data the rest of the code needs, from a system device entry. */
function pumpOf(system, device) {
  return {
    id: String(device.id),
    systemId: String(system.systemId),
    systemName: String(system.name ?? ''),
    productName: String(device.product?.name ?? ''),
    firmware: String(device.currentFwVersion ?? ''),
    connected: device.connectionState === 'Connected',
    hasAlarm: system.hasAlarm === true,
  };
}

const pumpsOf = (systems) =>
  systems.flatMap((system) =>
    (Array.isArray(system.devices) ? system.devices : [])
      .filter((device) => device?.id)
      .map((device) => pumpOf(system, device)),
  );

/** Error raised to Gladys, in the integration language. */
const userError = (message, language) => new Error(pick(message, language));

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration
 * @param {ReturnType<import('./myuplink/client.js').createClient>} options.client
 * @param {import('./store.js').Store} options.store
 * @param {() => object} options.getConfig
 * @param {() => number} [options.now]
 */
export function createHub({ gladys, client, store, getConfig, now = () => Date.now() }) {
  const issues = createIssueLog(logger);
  /** myUplink device id -> { pump, profile, reading } */
  const pumps = new Map();
  /** systemId -> { manage: true|false|null, at } */
  const subscriptions = new Map();
  /** myUplink device id -> Set of notification ids already announced */
  let announced = null;
  /** device external id -> transport last published */
  const transports = new Map();
  /** myUplink device id -> connected, to log the losses and the returns */
  const connectedBefore = new Map();
  let storedProfiles = null;
  let discovered = false;
  let lastStatus = null;
  let lastRefreshAt = null;
  let refreshing = null;
  let discovering = null;

  const language = () => getConfig().language;

  async function profiles() {
    storedProfiles ??= await store.read(PROFILES_FILE, {});
    return storedProfiles;
  }

  async function announcedAlarms() {
    if (!announced) {
      const saved = await store.read(ALARMS_FILE, {});
      announced = new Map(
        Object.entries(saved).map(([id, list]) => [id, new Set(Array.isArray(list) ? list : [])]),
      );
    }
    return announced;
  }

  /** Connection status in the Configuration screen, sent on change only. */
  async function setStatus(connected, message) {
    const key = connected ? 'ok' : JSON.stringify(message ?? null);
    if (key === lastStatus) {
      return;
    }
    lastStatus = key;
    await gladys.setConnectionStatus(connected, message).catch((err) => {
      lastStatus = null;
      logger.debug(`setConnectionStatus failed (${err.message})`);
    });
  }

  /** One log line and the matching connection status for an API failure. */
  async function reportFailure(context, err) {
    if (!(err instanceof MyUplinkError)) {
      throw err;
    }
    issues.fail('api', `${context}: ${err.message}`);
    if (err.kind === 'credentials') {
      await setStatus(false, MESSAGES.credentials);
    } else if (err.kind === 'rate_limit') {
      await setStatus(false, MESSAGES.rateLimited);
    } else {
      await setStatus(false, MESSAGES.unreachable);
    }
  }

  const apiRecovered = () => issues.ok('api', 'myUplink answers again');

  /** The heat pumps the user added to Gladys. */
  function createdPumps() {
    const created = new Set((gladys.devices ?? []).map((device) => device.external_id));
    return [...pumps.values()].filter(({ pump }) => created.has(deviceIds(gladys, pump).device));
  }

  async function checkSubscription(systemId, { force = false } = {}) {
    const known = subscriptions.get(systemId);
    if (!force && known && now() - known.at < SUBSCRIPTION_TTL_MS) {
      return known.manage;
    }
    let manage;
    try {
      manage = await client.hasManageSubscription(systemId);
    } catch (err) {
      // Not every account may read its subscriptions: the write will tell.
      logger.debug(`Subscription check failed (${err.message})`);
      manage = known?.manage ?? null;
    }
    subscriptions.set(systemId, { manage, at: now() });
    return manage;
  }

  async function publishDevices() {
    const devices = [...pumps.values()].map(({ pump, profile }) =>
      buildDevice(gladys, pump, profile, language()),
    );
    await gladys.publishDiscoveredDevices(devices);
  }

  /** Publishes the states of the added heat pumps (changes, and the heartbeat). */
  async function publishStates(entries) {
    const states = entries.flatMap(({ pump, profile, reading }) =>
      reading ? buildStates(gladys, pump, profile, reading, language()) : [],
    );
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }
  }

  async function publishTransports(entries) {
    const changed = [];
    for (const { pump } of entries) {
      const externalId = deviceIds(gladys, pump).device;
      const transport = pump.connected ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE;
      if (transports.get(externalId) !== transport) {
        changed.push({ external_id: externalId, transport });
      }
    }
    if (changed.length === 0) {
      return;
    }
    try {
      await gladys.publishTransports(changed);
      for (const entry of changed) {
        transports.set(entry.external_id, entry.transport);
      }
    } catch (err) {
      logger.debug(`publishTransports failed (${err.message})`);
    }
  }

  /** Logs a heat pump going offline or coming back, once each. */
  function noteConnection(pump) {
    const before = connectedBefore.get(pump.id);
    connectedBefore.set(pump.id, pump.connected);
    if (before === undefined) {
      if (!pump.connected) {
        logger.warn(`${pump.productName}: not connected to myUplink`);
      }
      return;
    }
    if (before && !pump.connected) {
      logger.warn(`${pump.productName}: lost its connection to myUplink`);
    } else if (!before && pump.connected) {
      logger.info(`${pump.productName}: connected to myUplink again`);
    }
  }

  /** Fires the scene trigger for the alarms not announced yet. */
  async function announceAlarms(entries) {
    const seen = await announcedAlarms();
    let changed = false;
    for (const { pump, reading } of entries) {
      if (!reading?.alarms) {
        continue;
      }
      const ids = reading.alarms.map((alarm) => String(alarm.id ?? '')).filter(Boolean);
      const known = seen.get(pump.id);
      if (!known) {
        // First reading of this heat pump: the alarms already there are the
        // baseline, announced to nobody (a fresh install must not fire them).
        seen.set(pump.id, new Set(ids));
        changed = true;
        continue;
      }
      for (const alarm of reading.alarms) {
        const id = String(alarm.id ?? '');
        if (!id || known.has(id)) {
          continue;
        }
        logger.info(`${pump.productName}: alarm ${alarm.alarmNumber ?? '?'} raised`);
        await gladys
          .publishSceneEvent(ALARM_TRIGGER, {
            device: deviceIds(gladys, pump).device,
            alarm_number: Number.isFinite(Number(alarm.alarmNumber))
              ? Number(alarm.alarmNumber)
              : null,
            header: String(alarm.header ?? '').slice(0, 1000),
            description: String(alarm.description ?? '').slice(0, 1000),
            severity: Number.isFinite(Number(alarm.severity)) ? Number(alarm.severity) : null,
          })
          .catch((err) => logger.warn(`Alarm scene trigger refused (${err.message})`));
      }
      // Forget the alarms that are gone: the same alarm raised again later is news.
      seen.set(pump.id, new Set(ids));
      changed ||= ids.length !== known.size || ids.some((id) => !known.has(id));
    }
    if (changed) {
      await store
        .write(ALARMS_FILE, Object.fromEntries([...seen].map(([id, set]) => [id, [...set]])))
        .catch((err) => logger.warn(`Could not save the announced alarms (${err.message})`));
    }
  }

  /** The active alarms of a pump: none without a request when myUplink says so. */
  async function readAlarms(pump, alarmsBySystem) {
    if (!pump.hasAlarm) {
      return [];
    }
    if (!alarmsBySystem.has(pump.systemId)) {
      alarmsBySystem.set(
        pump.systemId,
        client.getActiveNotifications(pump.systemId, language()).catch((err) => {
          logger.debug(`Active alarms unavailable (${err.message})`);
          return null;
        }),
      );
    }
    const list = await alarmsBySystem.get(pump.systemId);
    // A system notification without device id concerns the whole system.
    return list ? list.filter((alarm) => !alarm.deviceId || alarm.deviceId === pump.id) : null;
  }

  const readingOf = (points, alarms) => ({
    points: new Map(points.map((point) => [String(point.parameterId), point])),
    alarms,
    at: now(),
  });

  async function runDiscovery() {
    const config = getConfig();
    if (!isConfigured(config)) {
      logger.info('Not configured yet: waiting for the myUplink client ID and secret');
      pumps.clear();
      discovered = false;
      await setStatus(false, MESSAGES.notConfigured);
      return false;
    }
    let systems;
    try {
      systems = await client.getSystems();
    } catch (err) {
      await reportFailure('Discovery failed', err);
      return false;
    }
    apiRecovered();
    const found = pumpsOf(systems);
    const stored = await profiles();
    const alarmsBySystem = new Map();
    const fresh = new Map();
    for (const pump of found) {
      let points = null;
      try {
        points = await client.getPoints(pump.id);
      } catch (err) {
        logger.warn(`${pump.productName}: data points unavailable (${err.message})`);
      }
      const profile = mergeProfiles(stored[pump.id], points ? classifyPoints(points) : {});
      const previous = pumps.get(pump.id);
      const alarms = await readAlarms(pump, alarmsBySystem);
      fresh.set(pump.id, {
        pump,
        profile,
        reading: points ? readingOf(points, alarms) : (previous?.reading ?? null),
        // Points unreadable now: the next refresh reads them all and classifies.
        unclassified: !points,
      });
      stored[pump.id] = profile;
      noteConnection(pump);
      logger.debug(
        `${pump.productName}: roles ${Object.keys(profile).join(', ') || 'none'} ` +
          `(${points?.length ?? 0} points read)`,
      );
    }
    for (const systemId of new Set(found.map((pump) => pump.systemId))) {
      await checkSubscription(systemId);
    }
    pumps.clear();
    for (const [id, entry] of fresh) {
      pumps.set(id, entry);
    }
    await store
      .write(PROFILES_FILE, stored)
      .catch((err) => logger.warn(`Could not save the point profiles (${err.message})`));
    discovered = true;
    lastRefreshAt = now();

    if (found.length === 0) {
      logger.warn('myUplink account without any heat pump');
      await setStatus(false, MESSAGES.noSystem);
    } else {
      logger.info(`Connected to myUplink: ${found.length} heat pump(s)`);
      await setStatus(true);
    }
    try {
      await publishDevices();
    } catch (err) {
      logger.error(`Publishing the devices failed: ${err.message}`);
    }
    const created = createdPumps();
    await publishTransports(created);
    await announceAlarms(created);
    await publishStates(created).catch((err) =>
      logger.warn(`Publishing the states failed (${err.message})`),
    );
    return true;
  }

  async function runRefresh() {
    if (!discovered) {
      return runDiscovery();
    }
    let systems;
    try {
      systems = await client.getSystems();
    } catch (err) {
      await reportFailure('Refresh failed', err);
      return false;
    }
    apiRecovered();
    const found = pumpsOf(systems);
    if (found.some((pump) => !pumps.has(pump.id))) {
      // A heat pump joined the account: read its points and show it.
      logger.info('New heat pump on the myUplink account');
      return runDiscovery();
    }
    if (found.length > 0) {
      await setStatus(true);
    }
    const foundIds = new Set(found.map((pump) => pump.id));
    for (const pump of found) {
      const entry = pumps.get(pump.id);
      entry.pump = pump;
      noteConnection(pump);
    }
    const created = createdPumps().filter(({ pump }) => foundIds.has(pump.id));
    const alarmsBySystem = new Map();
    let profilesChanged = false;
    for (const entry of created) {
      const ids = ROLE_KEYS.map((key) => entry.profile[key]?.parameterId).filter(Boolean);
      try {
        let points;
        if (entry.unclassified) {
          points = await client.getPoints(entry.pump.id);
          entry.profile = mergeProfiles(entry.profile, classifyPoints(points));
          entry.unclassified = false;
          (await profiles())[entry.pump.id] = entry.profile;
          profilesChanged = true;
        } else {
          points = ids.length > 0 ? await client.getPoints(entry.pump.id, ids) : [];
        }
        entry.reading = readingOf(points, await readAlarms(entry.pump, alarmsBySystem));
        issues.ok(
          `points:${entry.pump.id}`,
          `${entry.pump.productName}: data points readable again`,
        );
      } catch (err) {
        if (err instanceof MyUplinkError && err.kind === 'rate_limit') {
          await reportFailure('Refresh stopped', err);
          break;
        }
        issues.fail(
          `points:${entry.pump.id}`,
          `${entry.pump.productName}: data points unavailable (${err.message})`,
        );
      }
    }
    lastRefreshAt = now();
    if (profilesChanged) {
      await store
        .write(PROFILES_FILE, await profiles())
        .catch((err) => logger.warn(`Could not save the point profiles (${err.message})`));
      // Roles found late: the Discovery screen offers "Update".
      await publishDevices().catch((err) =>
        logger.error(`Publishing the devices failed: ${err.message}`),
      );
    }
    await publishTransports(created);
    await announceAlarms(created);
    // A heat pump offline keeps its last values: myUplink would only repeat them.
    await publishStates(created.filter(({ pump }) => pump.connected)).catch((err) =>
      logger.warn(`Publishing the states failed (${err.message})`),
    );
    logger.debug(`Refresh done: ${created.length} heat pump(s) read`, client.quota());
    return true;
  }

  const hub = {
    get lastRefreshAt() {
      return lastRefreshAt;
    },

    /** (Re)discovers the account and publishes the devices. */
    discover() {
      discovering ??= runDiscovery().finally(() => {
        discovering = null;
      });
      return discovering;
    },

    /** New credentials or language: start over. */
    reset() {
      pumps.clear();
      subscriptions.clear();
      discovered = false;
      lastStatus = null;
      client.forgetToken();
    },

    /**
     * One reading cycle, unless one ran less than `minAgeMs` ago. Never throws.
     * @param {{ minAgeMs?: number }} [options]
     */
    async refresh({ minAgeMs = 0 } = {}) {
      if (discovering) {
        await discovering.catch(() => {});
      }
      if (refreshing) {
        return refreshing;
      }
      if (minAgeMs > 0 && lastRefreshAt !== null && now() - lastRefreshAt < minAgeMs) {
        logger.debug(`Refreshed ${now() - lastRefreshAt} ms ago, skipped`);
        return false;
      }
      if (!isConfigured(getConfig())) {
        return false;
      }
      refreshing = runRefresh()
        .catch((err) => {
          logger.error(`Refresh failed: ${err.message}`);
          return false;
        })
        .finally(() => {
          refreshing = null;
        });
      return refreshing;
    },

    /**
     * A heat pump was just added to Gladys: its states now (the reading of
     * the discovery), not at the next cycle, then the widgets.
     */
    async deviceCreated(device) {
      const entry = hub.entryByDevice(device.external_id);
      if (!entry) {
        return;
      }
      transports.delete(device.external_id);
      if (!entry.reading) {
        await hub.refresh();
      } else {
        await publishTransports([entry]);
        await announceAlarms([entry]);
        await publishStates([entry]).catch((err) =>
          logger.warn(`Publishing the states failed (${err.message})`),
        );
      }
      gladys.requestWidgetRefresh?.(WIDGET_KEY);
    },

    /** The entry of a Gladys device, by its external id. */
    entryByDevice(externalId) {
      return (
        [...pumps.values()].find(({ pump }) => deviceIds(gladys, pump).device === externalId) ??
        null
      );
    },

    /** Whether writing may work on this heat pump: true, false or null (unknown). */
    canWrite(entry) {
      if (client.canWrite() === false) {
        return false;
      }
      return subscriptions.get(entry.pump.systemId)?.manage ?? null;
    },

    /**
     * A command from Gladys (or from the widget).
     * @param {string} deviceExternalId
     * @param {string} roleKey
     * @param {number|string} value
     */
    async setValue(deviceExternalId, roleKey, value) {
      const lang = language();
      const entry = hub.entryByDevice(deviceExternalId);
      if (!entry) {
        throw userError(MESSAGES.unknownDevice, lang);
      }
      const point = entry.profile[roleKey];
      if (!point || !point.writable) {
        throw userError(MESSAGES.readOnly, lang);
      }
      const payload = writeValue(point, value);
      if (payload === null) {
        throw userError(MESSAGES.invalidValue, lang);
      }
      if (client.canWrite() === false) {
        throw userError(MESSAGES.writeScopeMissing, lang);
      }
      if (subscriptions.get(entry.pump.systemId)?.manage === false) {
        // Maybe subscribed since: ask again before refusing.
        if ((await checkSubscription(entry.pump.systemId, { force: true })) === false) {
          throw userError(MESSAGES.premiumRequired, lang);
        }
      }
      if (!entry.pump.connected) {
        throw userError(MESSAGES.deviceOffline, lang);
      }
      try {
        await client.patchPoints(entry.pump.id, { [point.parameterId]: payload });
      } catch (err) {
        if (err instanceof MyUplinkError && err.kind === 'forbidden') {
          subscriptions.set(entry.pump.systemId, { manage: false, at: now() });
          logger.warn(`${entry.pump.productName}: ${roleKey} refused (no Premium Manage?)`);
          throw userError(MESSAGES.premiumRequired, lang);
        }
        logger.warn(`${entry.pump.productName}: ${roleKey} not written (${err.message})`);
        throw userError(
          err.kind === 'rate_limit' ? MESSAGES.rateLimited : MESSAGES.writeFailed,
          lang,
        );
      }
      logger.info(`${entry.pump.productName}: ${roleKey} set to ${payload}`);
      subscriptions.set(entry.pump.systemId, { manage: true, at: now() });
      // The heat pump applies it within a minute or two: show it now, the
      // next reading confirms (or corrects) it.
      if (entry.reading) {
        const previous = entry.reading.points.get(point.parameterId) ?? {};
        entry.reading.points.set(point.parameterId, {
          ...previous,
          parameterId: point.parameterId,
          value: Number(payload),
        });
        await publishStates([entry]).catch(() => {});
      }
      gladys.requestWidgetRefresh?.(WIDGET_KEY);
      return payload;
    },

    /** The "Test the connection" action: a sentence for the user. */
    async testConnection() {
      const lang = language();
      if (!isConfigured(getConfig())) {
        throw userError(MESSAGES.notConfigured, lang);
      }
      let systems;
      try {
        systems = await client.getSystems();
      } catch (err) {
        if (err instanceof MyUplinkError && err.kind === 'credentials') {
          throw userError(MESSAGES.credentials, lang);
        }
        if (err instanceof MyUplinkError && err.kind === 'rate_limit') {
          throw userError(MESSAGES.rateLimited, lang);
        }
        throw userError(MESSAGES.unreachable, lang);
      }
      const found = pumpsOf(systems);
      if (found.length === 0) {
        throw userError(MESSAGES.noSystem, lang);
      }
      const states = [];
      for (const systemId of new Set(found.map((pump) => pump.systemId))) {
        states.push(await checkSubscription(systemId, { force: true }));
      }
      const premium = states.every((state) => state === true)
        ? 'yes'
        : states.some((state) => state === false)
          ? 'no'
          : 'unknown';
      logger.info(`Connection test: ${found.length} heat pump(s), Premium Manage ${premium}`);
      return Object.fromEntries(
        Object.keys(TEMPLATES.connectionOk).map((code) => [
          code,
          TEMPLATES.connectionOk[code](found.length, TEMPLATES.premiumState[code](premium)),
        ]),
      );
    },

    /** For the tests and the widget. */
    entries: () => [...pumps.values()],
  };
  return hub;
}

/** Widget key, also nudged from here (key frozen once published). */
export const WIDGET_KEY = 'heat_pump';

/**
 * The value written to myUplink for a command, or null when the heat pump
 * would not accept it.
 */
export function writeValue(point, value) {
  if (point.kind === KIND.BOOST) {
    const number = Number(value);
    return number === 0 || number === 1 ? number : null;
  }
  if (point.kind === KIND.OFFSET) {
    const number = Number(String(value).replace(',', '.'));
    return Number.isInteger(number) && offsetValues(point).includes(number) ? number : null;
  }
  if (point.kind === KIND.SELECT) {
    const option = (point.options ?? []).find(
      (candidate) => candidate.value === String(value) || Number(candidate.value) === Number(value),
    );
    return option ? option.value : null;
  }
  return null;
}
