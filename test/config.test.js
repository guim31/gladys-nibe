import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig, pollPeriodMs } from '../src/config.js';

test('defaults: French, every 5 minutes, not configured', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(config.language, 'fr');
  assert.equal(pollPeriodMs(config), 5 * 60 * 1000);
  assert.equal(isConfigured(config), false);
});

test('credentials trimmed, interval bounded and rounded, unknown language refused', () => {
  const config = normalizeConfig({
    client_id: '  abc ',
    client_secret: 'secret \n',
    poll_interval: '0.4',
    language: 'it',
  });
  assert.equal(config.client_id, 'abc');
  assert.equal(config.client_secret, 'secret');
  assert.equal(config.poll_interval, 1);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: 600 }).poll_interval, 60);
  assert.equal(normalizeConfig({ poll_interval: 'often' }).poll_interval, 5);
  assert.equal(isConfigured(config), true);
});
