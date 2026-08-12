import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const core = require("../src/core.js");
const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, "../src/app.js"), "utf8");

class ClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class Element {
  constructor(document, attributes = {}) {
    this.document = document;
    this.attributes = { ...attributes };
    this.classList = new ClassList();
    this.hidden = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type });
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  focus() {
    if (this.document.activeElement === this) return;
    this.document.activeElement = this;
    this.dispatch("focus");
  }
}

function createHarness() {
  const document = { activeElement: null };
  const tiles = ["abc", "cbs", "nbc", "roar"].map(
    (channel) => new Element(document, { "data-channel": channel })
  );
  const grid = new Element(document);
  const playback = new Element(document);
  playback.hidden = true;
  const spinner = new Element(document);
  const error = new Element(document);
  error.hidden = true;
  const video = new Element(document);
  video.pauseCalls = 0;
  video.loadCalls = 0;
  video.playCalls = 0;
  video.pause = () => { video.pauseCalls += 1; };
  video.load = () => { video.loadCalls += 1; };
  video.play = () => {
    video.playCalls += 1;
    return Promise.resolve();
  };

  const byId = { grid, playback, spinner, error, video };
  document.querySelectorAll = (selector) => (selector === ".tile" ? tiles : []);
  document.getElementById = (id) => byId[id];

  const windowListeners = new Map();
  const window = {
    GNewsCore: core,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout,
    clearTimeout,
    closeCalls: 0,
    close() { this.closeCalls += 1; },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  vm.runInNewContext(appSource, { window, document, console, Promise });

  function key(keyCode) {
    let prevented = false;
    let stopped = false;
    windowListeners.get("keydown")({
      keyCode,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
    });
    return { prevented, stopped };
  }

  return { document, tiles, grid, playback, spinner, error, video, window, key };
}

test("remote navigation, playback, and Back preserve the selected tile", async () => {
  const app = createHarness();
  assert.equal(app.document.activeElement, app.tiles[0]);
  assert.equal(app.tiles[0].classList.contains("is-focused"), true);

  assert.equal(app.key(core.KEYS.RIGHT).prevented, true);
  assert.equal(app.document.activeElement, app.tiles[1]);
  app.key(core.KEYS.ENTER);
  assert.equal(app.grid.hidden, true);
  assert.equal(app.playback.hidden, false);
  assert.equal(app.spinner.hidden, false);

  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.video.src, /kv2Ka1pgQUWzWHpBmOkQiA/);
  assert.equal(app.video.playCalls, 1);
  app.video.dispatch("playing");
  assert.equal(app.spinner.hidden, true);
  assert.equal(app.playback.classList.contains("is-playing"), true);

  const back = app.key(core.KEYS.BACK);
  assert.deepEqual(back, { prevented: true, stopped: true });
  assert.equal(app.grid.hidden, false);
  assert.equal(app.playback.hidden, true);
  assert.equal(app.video.pauseCalls > 0, true);
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(app.document.activeElement, app.tiles[1]);
});

test("a media error produces the exact minimal failure state", async () => {
  const app = createHarness();
  app.key(core.KEYS.ENTER);
  await new Promise((resolve) => setImmediate(resolve));
  app.video.dispatch("error");
  assert.equal(app.spinner.hidden, true);
  assert.equal(app.error.hidden, false);
  assert.equal(app.playback.classList.contains("is-playing"), false);
});
