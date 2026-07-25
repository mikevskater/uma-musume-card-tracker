/**
 * Scenario regression tests.
 *
 * Guards two failure modes that a data re-extraction can silently introduce:
 *   1. A newly released scenario appearing in the UI under its placeholder
 *      name (`scenario_<id>`) because SCENARIO_NAMES in scripts/config.py
 *      has no entry for it.
 *   2. A scenario present in the training data but missing from
 *      SCENARIO_WEIGHTS, which makes the Deck Finder silently score it with
 *      URA's weights.
 */

const {
    FIXTURE_DECK_IDS, applyFixtureCollection, resetFixtures, getCardById,
} = require('../fixtures');

beforeEach(() => resetFixtures());

describe('scenario data integrity', () => {
    test('every scenario has a real localized name, not a placeholder', () => {
        const scenarios = getAvailableScenarios();
        expect(scenarios.length).toBeGreaterThan(0);
        for (const s of scenarios) {
            expect(s.name).toBeTruthy();
            expect(s.name).not.toMatch(/^scenario_\d+$/);
        }
    });

    test('every scenario in the data has Deck Finder scoring weights', () => {
        for (const s of getAvailableScenarios()) {
            expect(SCENARIO_WEIGHTS[s.id]).toBeDefined();
            expect(SCENARIO_WEIGHTS[s.id].name).toBe(s.name);
        }
    });

    test('every scenario resolves a race stat reward table', () => {
        for (const s of getAvailableScenarios()) {
            expect(getRaceBonusTable(s.id).length).toBeGreaterThan(0);
        }
    });

    test('every scenario has base training values for all five facilities', () => {
        for (const s of getAvailableScenarios()) {
            for (const t of ['speed', 'stamina', 'power', 'guts', 'intelligence']) {
                const v = getBaseTrainingValues(t, s.id, 5);
                expect(v).toBeTruthy();
                expect(v.skill_pt).toBeGreaterThan(0);
            }
        }
    });
});

describe('Grand Concert (scenario 3)', () => {
    test('is present and named', () => {
        const gc = getAvailableScenarios().find(s => s.id === '3');
        expect(gc).toBeDefined();
        expect(gc.name).toBe('Grand Concert');
    });

    test('Wit training gains energy instead of costing it', () => {
        // Distinctive to Grand Concert — a useful canary that scenario 3's
        // training values came from the DB rather than a fallback.
        expect(getBaseTrainingValues('intelligence', '3', 5).energy).toBeGreaterThan(0);
        expect(getBaseTrainingValues('speed', '3', 5).energy).toBeLessThan(0);
    });

    test('deprioritizes Race Bonus and promotes Skill Point Bonus vs URA', () => {
        const gc = getActiveWeights('3');
        const ura = getActiveWeights('1');
        expect(gc.raceBonus).toBeLessThan(ura.raceBonus);
        expect(gc.statBonus).toBeGreaterThan(ura.statBonus * 2);
        expect(SCENARIO_WEIGHTS['3'].raceBreakpoint).toBeLessThan(SCENARIO_WEIGHTS['1'].raceBreakpoint);
    });

    test('scores a deck distinctly from the other scenarios', () => {
        applyFixtureCollection();
        const cache = precomputeCardEffects(FIXTURE_DECK_IDS.map(getCardById), null, true);
        const norms = computeMetricNorms(cache);
        const scoreFor = (id) => scoreDeck(
            FIXTURE_DECK_IDS,
            { ...getDefaultFinderFilters(), scenario: id },
            cache, null, norms
        ).score;

        const gcScore = scoreFor('3');
        expect(Number.isFinite(gcScore)).toBe(true);
        expect(gcScore).toBeGreaterThan(0);
        for (const other of ['1', '2', '4']) {
            expect(gcScore).not.toBe(scoreFor(other));
        }
    });
});
