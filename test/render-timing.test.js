'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRenderTiming } = require('../src/render-timing.js');
const { framesForBurst, framesForCycle } = require('../src/scheduler.js');

for (const fps of [12, 15, 18, 20, 24, 30]) {
  test(`${fps} FPS pacing on a 60 Hz display preserves fractional deadlines`, () => {
    const clock = createRenderTiming(fps);
    let count = 0;
    for (let tick = 0; tick < 600; tick += 1) {
      const due = clock.due(tick * 1000 / 60);
      assert.equal(typeof due, 'boolean');
      if (due) count += 1;
    }
    assert.equal(count, fps * 10);
  });
}

test('200–500 ms stalls skip deadlines without catch-up data frames', () => {
  for (const stall of [200, 500]) {
    const clock = createRenderTiming(30);
    assert.equal(clock.due(0), true);
    assert.equal(clock.due(stall), true);
    assert.equal(clock.due(stall), false);
    assert.equal(clock.due(stall + 1), false);
    assert.equal(clock.due(stall + 34), true);
  }
});

test('actual measurement uses submissions, expires and resets across pause', () => {
  const clock = createRenderTiming(30);
  assert.equal(clock.measurement(0), null);
  for (let i = 0; i <= 15; i += 1) clock.record(i * 1000 / 15);
  assert.ok(Math.abs(clock.measurement(1000).fps - 15) < 1e-9);
  assert.ok(clock.measurement(1500).fps < 15);
  assert.equal(clock.measurement(4000), null);
  clock.reset();
  assert.equal(clock.measurement(10000), null);
  assert.equal(clock.due(10000), true);
  clock.record(10000);
  assert.equal(clock.measurement(10000), null);
});

for (const factor of [1.2, 1.5, 2, 3]) {
  test(`burst factor ${factor} uses the unchanged formula and 30-frame minimum`, () => {
    assert.equal(framesForBurst(750000, factor), Math.ceil(100 * factor));
    assert.equal(framesForBurst(1, factor), 30);
  });
}

test('invalid redundancy is rejected', () => {
  for (const factor of [0, 0.99, -1, NaN, Infinity]) {
    assert.throws(() => framesForBurst(1, factor), /at least 1/);
  }
});

test('cycle estimates include one manifest per chunk, including short final chunks', () => {
  const chunks = [{ size: 750000 }, { size: 1 }];
  assert.equal(framesForCycle(1, chunks, 2), 30 + 200 + 30 + 30);
  assert.equal(framesForCycle(1, chunks, 2, 0), 230);
  assert.equal(framesForCycle(1, chunks, 2, 1), 60);
});
