'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { TRANSLATIONS, detectLanguage, translate, errorTranslationKey } = require('../src/i18n.js');
const html = fs.readFileSync(require('node:path').join(__dirname, '../send.html'), 'utf8');
const app = fs.readFileSync(require('node:path').join(__dirname, '../src/app.js'), 'utf8');

test('both dictionaries cover all DOM, literal runtime and required dynamic keys', () => {
  assert.deepEqual(Object.keys(TRANSLATIONS.en).sort(), Object.keys(TRANSLATIONS['zh-Hans']).sort());
  const keys = [
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
    ...[...app.matchAll(/\bt\('([^']+)'[,)]/g)].map((m) => m[1]),
    ...['idle', 'preparing', 'ready', 'sending', 'paused', 'error'].map((s) => `status.${s}`),
    'resume', 'focusEstimate', 'estimate', 'factor12', 'actualFps', 'visibilityNotice',
    'wakeOff', 'wakeHeld', 'wakeUnavailable', 'wakePending',
  ];
  for (const language of ['en', 'zh-Hans']) {
    for (const key of keys) assert.ok(TRANSLATIONS[language][key], `${language}: ${key}`);
    for (const [key, value] of Object.entries(TRANSLATIONS.en)) {
      assert.deepEqual(value.match(/\{\w+\}/g), TRANSLATIONS['zh-Hans'][key].match(/\{\w+\}/g), key);
    }
  }
  assert.match(html, /id="language"/);
});

test('manual preference overrides browser detection', () => {
  assert.equal(detectLanguage(null, 'zh-CN'), 'zh-Hans');
  assert.equal(detectLanguage(null, 'zh-TW'), 'zh-Hans');
  assert.equal(detectLanguage(null, 'en-US'), 'en');
  assert.equal(detectLanguage('en', 'zh-CN'), 'en');
  assert.equal(detectLanguage('zh-Hans', 'en'), 'zh-Hans');
  assert.equal(detectLanguage('invalid', 'fr'), 'en');
  assert.equal(translate('zh-Hans', 'chunk', { index: 7 }), '分块 7');
});

test('common file errors have localized messages', () => {
  for (const [message, key] of [
    ['Cannot prepare an empty file', 'errorEmpty'],
    ['filename is not safe for the AirGapFree Receiver', 'errorFilename'],
    ['File exceeds the AirGap BigFile v1 limit of 120 × 10 MiB', 'errorLimit'],
    ['Short ranged read at 0', 'errorRead'],
    ['libcimbar rejected x', 'errorEncoder'],
  ]) assert.equal(errorTranslationKey(new Error(message)), key);
  assert.equal(errorTranslationKey(null), 'errorGeneric');
});
