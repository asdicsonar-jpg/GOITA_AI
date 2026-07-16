const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function buildDom(htmlPath) {
  htmlPath = htmlPath || path.join(__dirname, "index.html");
  const html = fs.readFileSync(htmlPath, "utf-8");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "https://example.com/goita/",
    pretendToBeVisual: true,
    beforeParse(window) {
      // localStorage polyfill (jsdom's built-in one is used automatically via resources:"usable"
      // + url, but we defensively seed it here so tests can rely on it being present immediately).
      window.requestIdleCallback = window.requestIdleCallback || function (cb) { return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0); };
      window.cancelIdleCallback = window.cancelIdleCallback || function (id) { clearTimeout(id); };
      window.matchMedia = window.matchMedia || function (query) {
        return { matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
      };
      window.performance = window.performance || { now: () => Date.now() };
      window.navigator.wakeLock = window.navigator.wakeLock || { request: async () => ({ release: async () => {} }) };
      window.AudioContext = window.AudioContext || function () { return { createOscillator() { return { connect(){}, start(){}, stop(){}, frequency:{setValueAtTime(){}} }; }, createGain() { return { connect(){}, gain:{setValueAtTime(){}, linearRampToValueAtTime(){}} }; }, destination: {}, currentTime: 0, close(){} }; };
      window.addEventListener("error", (e) => { errors.push(e.error || e.message); });
    },
  });
  dom._errors = errors;
  return dom;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { buildDom, wait };
