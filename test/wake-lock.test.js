'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createScreenWakeLock } = require('../src/wake-lock.js');
function sentinel() {
  return {
    released: false, releases: 0, listener: null,
    addEventListener(_name, listener) { this.listener = listener; },
    async release() { this.releases += 1; this.released = true; if (this.listener) this.listener(); },
  };
}

test('unavailable or rejected screen lock never fails sending', async () => {
  for (const api of [undefined, { request: async () => { throw new Error('denied'); } }]) {
    const statuses = [];
    await createScreenWakeLock(api, (s) => statuses.push(s)).acquire();
    assert.equal(statuses.at(-1), 'wakeUnavailable');
  }
});

test('pause/stop releases and resume reacquires; browser release is visible', async () => {
  const locks = [];
  const statuses = [];
  const lock = createScreenWakeLock({ request: async (kind) => {
    assert.equal(kind, 'screen');
    const item = sentinel(); locks.push(item); return item;
  } }, (s) => statuses.push(s));
  await lock.acquire();
  assert.equal(statuses.at(-1), 'wakeHeld');
  await lock.release();
  assert.equal(locks[0].releases, 1);
  assert.equal(statuses.at(-1), 'wakeOff');
  await lock.acquire();
  assert.equal(locks.length, 2);
  await locks[1].release();
  assert.equal(statuses.at(-1), 'wakeUnavailable');
});

test('late acquisition after pause is released without clobbering resumed lock', async () => {
  let resolve;
  let calls = 0;
  const stale = sentinel();
  const current = sentinel();
  const statuses = [];
  const lock = createScreenWakeLock({ request: () => ++calls === 1
    ? new Promise((r) => { resolve = r; }) : Promise.resolve(current) }, (s) => statuses.push(s));
  const pending = lock.acquire();
  await lock.release();
  await lock.acquire();
  resolve(stale);
  await pending;
  assert.equal(stale.releases, 1);
  assert.equal(current.releases, 0);
  assert.equal(statuses.at(-1), 'wakeHeld');
});

test('release rejection remains nonfatal', async () => {
  const item = sentinel();
  item.release = async () => { throw new Error('already released'); };
  const lock = createScreenWakeLock({ request: async () => item }, () => {});
  await lock.acquire();
  await lock.release();
});
