/**
 * Jest Global Setup — bootstraps the vanilla JS app environment.
 *
 * Loads JSON data and evaluates the source files in order, exposing
 * all functions on `global` (mimicking the browser's `window`).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ---------- Minimal DOM / browser stubs ----------

global.window = global;
global.self = global;
global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        style: {},
        dataset: {},
        children: [],
        setAttribute() {},
        getAttribute() {},
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        removeChild() {},
        remove() {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        querySelector: () => null,
        querySelectorAll: () => [],
    }),
    body: { appendChild() {}, removeChild() {} },
    activeElement: null,
    addEventListener() {},
};
global.localStorage = (() => {
    const store = {};
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
        _store: store,
    };
})();
global.location = { search: '' };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.setTimeout = global.setTimeout;
global.console = global.console; // keep node console
global.Worker = class MockWorker { postMessage() {} terminate() {} };
global.URLSearchParams = URLSearchParams;

// ---------- Load JSON data files ----------

function loadJSON(relPath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf-8'));
}

global.cardData = loadJSON('data/cards.json');
global.effectsData = {};
global.skillsData = {};
global.skillTypesData = {};
global.eventsData = [];
global.trainingData = {};
global.scenarioData = {};
global.charactersData = {};
global.trainingConfigData = {};

// These get populated by the source files via processXxxData helpers,
// but we pre-load the raw data so the processing functions can consume it.
const rawEffects = loadJSON('data/effects.json');
const rawSkills = loadJSON('data/skills.json');
const rawSkillTypes = loadJSON('data/skill_types.json');

try { global.eventsData = loadJSON('data/events.json'); } catch (e) { /* optional */ }
try { global.trainingData = loadJSON('data/training_values.json'); } catch (e) {}
try { global.scenarioData = loadJSON('data/scenario_data.json'); } catch (e) {}
try { global.charactersData = loadJSON('data/characters.json'); } catch (e) {}
try { global.trainingConfigData = loadJSON('data/training_config.json'); } catch (e) {}

// ---------- Globals that source files depend on ----------

global.ownedCards = {};
global.multiSort = [];
global.advancedFilters = { effects: {}, hintSkills: [], eventSkills: [], includeSkillTypes: [], excludeSkillTypes: [] };
global.selectedCards = [];
global.comparisonMode = false;
global.globalLimitBreakLevel = null;
global.globalLimitBreakOverrideOwned = false;
global.showMaxPotentialLevels = false;

// Stub UI functions that source files may call at parse time
global.showToast = () => {};
global.trapFocus = () => {};
global.renderCardTable = () => {};
global.filterAndSortCards = () => {};
global.renderMultiSort = () => {};
global.debouncedFilterAndSort = () => {};
global.updateCardRow = () => {};

// ---------- Evaluate source files in load order ----------

const SOURCE_FILES = [
    'js/utils/debug.js',
    'js/utils/dataUtils.js',
    'js/managers/cardManager.js',
    'js/ui/filterSort.js',
    'js/managers/deckBuilderManager.js',
    'js/managers/deckFinderManager.js',
];

// Jest's sandbox may not propagate all globals to the vm context.
// Use vm.createContext with the global object to ensure everything is accessible.
const context = vm.createContext(global);

for (const relPath of SOURCE_FILES) {
    const filePath = path.join(ROOT, relPath);
    const code = fs.readFileSync(filePath, 'utf-8');
    const script = new vm.Script(code, { filename: relPath });
    script.runInContext(context);
}

// Copy any new globals from the context back to global
// (function declarations in vm.runInContext go into the context object)
for (const key of Object.getOwnPropertyNames(context)) {
    if (!(key in global) || (typeof context[key] === 'function' && typeof global[key] !== 'function')) {
        try { global[key] = context[key]; } catch (e) { /* skip read-only */ }
    }
}

// ---------- Post-load data processing ----------

// Process raw data through the app's processing functions (if they loaded)
if (typeof processEffectsData === 'function') {
    processEffectsData(rawEffects);
} else {
    global.effectsData = rawEffects;
}

if (typeof processSkillsData === 'function') {
    processSkillsData(rawSkills);
} else {
    global.skillsData = rawSkills;
}

if (typeof processSkillTypesData === 'function') {
    processSkillTypesData(rawSkillTypes);
} else {
    global.skillTypesData = rawSkillTypes;
}

// ---------- Helper to reset state between tests ----------

global.__resetTestState = function () {
    global.ownedCards = {};
    global.multiSort = [];
    global.advancedFilters = { effects: {}, hintSkills: [], eventSkills: [], includeSkillTypes: [], excludeSkillTypes: [] };
    global.selectedCards = [];
    global.comparisonMode = false;
    global.globalLimitBreakLevel = null;
    global.globalLimitBreakOverrideOwned = false;
    global.showMaxPotentialLevels = false;
    localStorage.clear();
    // Reset the effect value cache if it exists
    if (typeof effectValueCache !== 'undefined' && effectValueCache instanceof Map) {
        effectValueCache.clear();
    }
};
