'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'send.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const preparation = fs.readFileSync(path.join(root, 'src', 'preparation.js'), 'utf8');

test('sender UI exposes one-file AirGapFree workflow only', () => {
  assert.match(html, /AirGapFree/);
  assert.match(html, /Focused resend/);
  assert.match(html, /Local only/);
  assert.doesNotMatch(html, /\bCFC\b|ACTION_CREATE_DOCUMENT|completedChunks|bundle|folder/i);
  assert.match(html, /<input id="fileInput" type="file">/);
  assert.doesNotMatch(html, /id="fileInput"[^>]*\bmultiple\b/);
});

test('every runtime script reference is local and ordered before libcimbar glue', () => {
  const sources = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(sources.length >= 8);
  assert.equal(sources.every((source) => !/^(?:https?:)?\/\//.test(source)), true);
  assert.equal(sources.at(-1), 'vendor/cimbar-wasm-v0.6.4/cimbar_js.2026-01-20T0312.js');
  assert.ok(sources.indexOf('src/app.js') < sources.length - 1);
});

test('app DOM references exist in the HTML shell', () => {
  const referencedIds = [...app.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]);
  for (const id of new Set(referencedIds)) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('production preparation has no whole-file file.arrayBuffer call', () => {
  assert.doesNotMatch(preparation, /\bfile\.arrayBuffer\s*\(/);
  assert.match(preparation, /file\.slice\s*\(/);
});
