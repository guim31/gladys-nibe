// -----------------------------------------------------------------------------
// The container's own refresh timer.
//
// The devices are published with `should_poll: true` and a valid
// `poll_frequency` (one minute, the slowest Gladys schedules), but the core
// cannot be trusted to call onPoll: Gladys 5.2.0 skips devices created
// without `should_poll`, a device keeps the polling fields it was created
// with, and 5.2.1 does not fix it (GladysAssistant/Gladys#3198). So the
// container refreshes by itself, at the configured pace (5 minutes by
// default: myUplink is a cloud with a quota), and the core's onPoll stays a
// fallback.
//
// One refresh reads the whole account (src/hub.js), whatever the device the
// core asks about. No double work: the timer skips a cycle when a refresh
// ran less than half a period ago, the core's onPoll — once a minute — skips
// it when one ran less than 90 % of a period ago. While the timer runs, the
// core never reaches myUplink; it takes over only if the timer stalls.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { pollPeriodMs } from './config.js';

const logger = createLogger({ name: 'poller' });

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration
 * @param {ReturnType<import('./hub.js').createHub>} options.hub
 * @param {() => object} options.getConfig the current normalized config
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 */
export function createPoller({ gladys, hub, getConfig, timers = true }) {
  let timer = null;
  let stopped = false;

  const periodMs = () => pollPeriodMs(getConfig());

  async function cycle() {
    if (gladys.connected === false) {
      logger.debug('Gladys unreachable: refresh skipped');
      return;
    }
    await hub.refresh({ minAgeMs: periodMs() * 0.5 });
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await cycle();
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, periodMs());
    // Never keeps the process alive on its own (tests, shutdown).
    timer.unref?.();
  }

  const api = {
    /**
     * The core's onPoll (fallback), and the immediate states of a heat pump
     * the user just added or updated (the SDK forgot what it had published).
     */
    register() {
      gladys.onPoll(() => api.pollFromCore());
      gladys.onDeviceCreated((device) => hub.deviceCreated(device));
      gladys.onDeviceUpdated((device) => hub.deviceCreated(device));
    },

    /** (Re)start the timer: a new config, a (re)connection. */
    start() {
      stopped = false;
      schedule();
    },

    /** The core's onPoll: refreshes unless the timer just did. */
    async pollFromCore() {
      await hub.refresh({ minAgeMs: periodMs() * 0.9 });
    },

    /** One timer tick, for the tests. */
    tick: cycle,

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
  return api;
}
