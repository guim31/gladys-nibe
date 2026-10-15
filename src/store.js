// -----------------------------------------------------------------------------
// Persistence under /data, the only writable volume of the container.
//
// Small JSON documents, one file each: the myUplink access token (so a restart
// does not ask for a new one), the point profile of each heat pump (so the
// features stay the same from one start to the next) and the alarms already
// announced (so a restart does not fire the scene trigger again).
// Writes go through a temporary file and a rename: a container stopped in the
// middle of a write never leaves a truncated file behind.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_DATA_DIR = process.env.DATA_DIR || '/data';

export class Store {
  /** @param {string} [dir] */
  constructor(dir = DEFAULT_DATA_DIR) {
    this.dir = dir;
    /** Writes in progress, chained per file. */
    this.queues = new Map();
  }

  /**
   * @param {string} name file name, without directory
   * @param {unknown} fallback returned when the file is missing or unreadable
   */
  async read(name, fallback) {
    try {
      return JSON.parse(await readFile(join(this.dir, name), 'utf8'));
    } catch {
      return fallback;
    }
  }

  /**
   * @param {string} name
   * @param {unknown} value
   * @param {{ secret?: boolean }} [options] secret: readable by the owner only
   */
  write(name, value, { secret = false } = {}) {
    const previous = this.queues.get(name) ?? Promise.resolve();
    const next = previous.then(async () => {
      await mkdir(this.dir, { recursive: true });
      const path = join(this.dir, name);
      const tmp = `${path}.tmp`;
      await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, {
        mode: secret ? 0o600 : 0o644,
      });
      await rename(tmp, path);
    });
    // A failed write must not block the next ones.
    this.queues.set(
      name,
      next.catch(() => {}),
    );
    return next;
  }

  /** Waits for the writes in progress (shutdown, tests). */
  async flush() {
    await Promise.all([...this.queues.values()]);
  }
}
