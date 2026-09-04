'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scheduler = require('../src/scheduler.js');

function label(item) {
  return item.kind === scheduler.ITEM.MANIFEST ? 'M' : `C${item.index}`;
}

function take(instance, count) {
  return Array.from({ length: count }, () => label(instance.nextItem()));
}

test('normal sweep emits a manifest beacon before every chunk', () => {
  assert.deepEqual(take(scheduler.createScheduler(3), 6), ['M', 'C0', 'M', 'C1', 'M', 'C2']);
});

test('normal sweep loops after the final chunk and increments pass', () => {
  const instance = scheduler.createScheduler(2);
  assert.deepEqual(take(instance, 6), ['M', 'C0', 'M', 'C1', 'M', 'C0']);
  assert.equal(instance.snapshot().pass, 2);
});

test('focus mode repeatedly emits manifest and the selected chunk', () => {
  const instance = scheduler.createScheduler(10);
  instance.focus(7);
  assert.deepEqual(take(instance, 6), ['M', 'C7', 'M', 'C7', 'M', 'C7']);
});

test('returning from focus resumes normal sweep position', () => {
  const instance = scheduler.createScheduler(3);
  assert.deepEqual(take(instance, 2), ['M', 'C0']);
  instance.focus(2);
  assert.deepEqual(take(instance, 2), ['M', 'C2']);
  instance.sweep();
  assert.deepEqual(take(instance, 4), ['M', 'C1', 'M', 'C2']);
});

test('pause and resume do not advance logical scheduler state', () => {
  const instance = scheduler.createScheduler(2);
  assert.equal(label(instance.nextItem()), 'M');
  const before = instance.snapshot();
  instance.pause();
  assert.equal(instance.nextItem(), null);
  assert.equal(instance.snapshot().phase, before.phase);
  assert.deepEqual(instance.snapshot().current, before.current);
  instance.resume();
  assert.equal(label(instance.nextItem()), 'C0');
});

test('burst estimate has a conservative minimum and configurable length', () => {
  assert.equal(scheduler.framesForBurst(1, 1), 30);
  assert.equal(scheduler.framesForBurst(750000, 2), 200);
});
