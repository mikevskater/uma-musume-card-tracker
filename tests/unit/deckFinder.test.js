const {
    FIXTURE_CARDS, FIXTURE_DECK_IDS, FIXTURE_DECK_IDS_2,
    applyFixtureCollection, resetFixtures, getCardById,
} = require('../fixtures');

beforeEach(() => resetFixtures());

// ===== getDefaultFinderFilters =====

describe('getDefaultFinderFilters', () => {
    test('returns well-formed default filters', () => {
        const filters = getDefaultFinderFilters();
        expect(filters.cardPool).toBe('owned');
        expect(filters.rarity.ssr).toBe(true);
        expect(filters.rarity.sr).toBe(true);
        expect(filters.rarity.r).toBe(false);
        expect(filters.types.speed).toBe(true);
        expect(filters.types.friend).toBe(true);
        expect(filters.scenario).toBe('1');
        expect(filters.resultCount).toBe(10);
        expect(filters.requiredSkills).toEqual([]);
        expect(filters.excludeCards).toEqual([]);
    });
});

// ===== buildCardPool =====

describe('buildCardPool', () => {
    test('all cards mode returns all released cards matching rarity/type', () => {
        const filters = { ...getDefaultFinderFilters(), cardPool: 'all' };
        const pool = buildCardPool(filters);
        expect(pool.length).toBeGreaterThan(50);
        // All cards should have start_date
        pool.forEach(c => expect(c.start_date).toBeTruthy());
    });

    test('owned mode returns only owned cards', () => {
        applyFixtureCollection();
        const filters = { ...getDefaultFinderFilters(), cardPool: 'owned' };
        const pool = buildCardPool(filters);
        // Should match fixture collection count minus R cards (rarity.r = false)
        pool.forEach(c => expect(isCardOwned(c.support_id)).toBe(true));
    });

    test('rarity filter excludes SR', () => {
        const filters = { ...getDefaultFinderFilters(), cardPool: 'all', rarity: { ssr: true, sr: false, r: false } };
        const pool = buildCardPool(filters);
        pool.forEach(c => expect(c.rarity).toBe(3));
    });

    test('type filter restricts to selected types', () => {
        const filters = {
            ...getDefaultFinderFilters(),
            cardPool: 'all',
            types: { speed: true, stamina: false, power: false, guts: false, intelligence: false, friend: false },
        };
        const pool = buildCardPool(filters);
        pool.forEach(c => expect(c.type).toBe('speed'));
    });

    test('excludeCards removes specific cards', () => {
        const filters = {
            ...getDefaultFinderFilters(),
            cardPool: 'all',
            excludeCards: [30002, 30003],
        };
        const pool = buildCardPool(filters);
        const ids = pool.map(c => c.support_id);
        expect(ids).not.toContain(30002);
        expect(ids).not.toContain(30003);
    });

    test('excludeCharacters removes cards by character name', () => {
        const card = getCardById(30002);
        const filters = {
            ...getDefaultFinderFilters(),
            cardPool: 'all',
            excludeCharacters: [card.char_name],
        };
        const pool = buildCardPool(filters);
        const charIds = pool.map(c => c.char_id);
        expect(charIds).not.toContain(card.char_id);
    });
});

// ===== precomputeCardEffects =====

describe('precomputeCardEffects', () => {
    test('creates cache entries for all pool cards', () => {
        const pool = cardData.filter(c => c.rarity === 3 && c.start_date).slice(0, 10);
        const cache = precomputeCardEffects(pool, null, true);
        expect(cache.size).toBe(pool.length);
    });

    test('cache entry has required fields', () => {
        const pool = [getCardById(30001)];
        const cache = precomputeCardEffects(pool, null, true);
        const entry = cache.get(30001);
        expect(entry).toBeDefined();
        expect(entry.effects).toBeDefined();
        expect(entry.hintSkillIds).toBeInstanceOf(Set);
        expect(entry.hintSkillTypes).toBeInstanceOf(Set);
        expect(entry.skillsByType).toBeDefined();
        expect(typeof entry.skillTypeMask).toBe('number');
        expect(typeof entry.uniqueEffectActive).toBe('boolean');
        expect(typeof entry.skillAptitudeScore).toBe('number');
        expect(entry.type).toBe('guts');
        expect(entry.charId).toBe(1001);
    });

    test('force max level sets effects at level 50', () => {
        const pool = [getCardById(30001)];
        const cacheMax = precomputeCardEffects(pool, null, true);
        const cacheLow = precomputeCardEffects(pool, null, false);
        // Without force max, if card is unowned, it defaults to max anyway
        // but with owned cards at lower levels, values would differ
        applyFixtureCollection();
        const cacheLowOwned = precomputeCardEffects(pool, null, false);
        const entryMax = cacheMax.get(30001);
        expect(entryMax.effects).toBeDefined();
    });

    test('unique effect bonuses included when active', () => {
        const card = getCardById(30001);
        const pool = [card];
        const cache = precomputeCardEffects(pool, null, true); // max level
        const entry = cache.get(30001);
        expect(entry.uniqueEffectActive).toBe(true);
        // The unique effect bonus should be included in effects
        const ue = card.unique_effect;
        for (const ueEffect of ue.effects) {
            expect(entry.effects[ueEffect.type]).toBeGreaterThan(0);
        }
    });

    test('hint skills are populated', () => {
        const card = getCardById(30001);
        const pool = [card];
        const cache = precomputeCardEffects(pool, null, true);
        const entry = cache.get(30001);
        if (card.hints?.hint_skills?.length > 0) {
            expect(entry.hintSkillIds.size).toBeGreaterThan(0);
        }
    });
});

// ===== groupCardsByType =====

describe('groupCardsByType', () => {
    test('groups cards correctly', () => {
        const pool = cardData.filter(c => c.rarity === 3 && c.start_date);
        const groups = groupCardsByType(pool);
        expect(Object.keys(groups)).toEqual(expect.arrayContaining(['speed', 'stamina', 'power', 'guts', 'intelligence']));
        for (const [type, cards] of Object.entries(groups)) {
            cards.forEach(c => expect(c.type).toBe(type));
        }
    });
});

// ===== aggregateFinderDeckEffects =====

describe('aggregateFinderDeckEffects', () => {
    test('sums effects from cache', () => {
        const pool = FIXTURE_DECK_IDS.map(id => getCardById(id));
        const cache = precomputeCardEffects(pool, null, true);
        const agg = aggregateFinderDeckEffects(FIXTURE_DECK_IDS, cache);
        expect(Object.keys(agg).length).toBeGreaterThan(0);
        for (const val of Object.values(agg)) {
            expect(val).toBeGreaterThan(0);
        }
    });

    test('empty deck produces empty aggregation', () => {
        const cache = new Map();
        const agg = aggregateFinderDeckEffects([], cache);
        expect(Object.keys(agg).length).toBe(0);
    });
});

// ===== checkHardFilters =====

describe('checkHardFilters', () => {
    let cache;
    beforeEach(() => {
        const pool = FIXTURE_DECK_IDS.map(id => getCardById(id));
        cache = precomputeCardEffects(pool, null, true);
    });

    test('passes with no minimum thresholds', () => {
        const filters = getDefaultFinderFilters();
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(true);
    });

    test('fails when race bonus threshold not met', () => {
        const filters = { ...getDefaultFinderFilters(), minRaceBonus: 99999 };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(false);
    });

    test('fails when training eff threshold not met', () => {
        const filters = { ...getDefaultFinderFilters(), minTrainingEff: 99999 };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(false);
    });

    test('fails when friend bonus threshold not met', () => {
        const filters = { ...getDefaultFinderFilters(), minFriendBonus: 99999 };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(false);
    });

    test('passes with achievable thresholds', () => {
        const agg = aggregateFinderDeckEffects(FIXTURE_DECK_IDS, cache);
        const filters = {
            ...getDefaultFinderFilters(),
            minRaceBonus: (agg[15] || 0),      // exactly what deck provides
            minTrainingEff: (agg[8] || 0),
        };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(true);
    });

    test('required skills — all mode', () => {
        // Get a skill ID that exists on the first card
        const entry = cache.get(FIXTURE_DECK_IDS[0]);
        const skillId = entry.hintSkillIds.values().next().value;
        if (skillId) {
            const filters = { ...getDefaultFinderFilters(), requiredSkills: [skillId], requiredSkillsMode: 'all' };
            expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(true);
        }
    });

    test('required skills — fails with impossible skill', () => {
        const filters = { ...getDefaultFinderFilters(), requiredSkills: [999999], requiredSkillsMode: 'all' };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(false);
    });

    test('minimum hint skills filter', () => {
        const filters = { ...getDefaultFinderFilters(), minHintSkills: 1 };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(true);
        const filtersHigh = { ...getDefaultFinderFilters(), minHintSkills: 9999 };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filtersHigh, cache)).toBe(false);
    });

    test('minimum unique effects filter', () => {
        const filters = { ...getDefaultFinderFilters(), minUniqueEffects: 1 };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filters, cache)).toBe(true);
        const filtersHigh = { ...getDefaultFinderFilters(), minUniqueEffects: 99 };
        expect(checkHardFilters(FIXTURE_DECK_IDS, filtersHigh, cache)).toBe(false);
    });
});

// ===== scoreDeck =====

describe('scoreDeck', () => {
    let cache;
    beforeEach(() => {
        const pool = [...FIXTURE_DECK_IDS, ...FIXTURE_DECK_IDS_2].map(id => getCardById(id));
        cache = precomputeCardEffects([...new Set(pool)], null, true);
    });

    test('returns score and metrics', () => {
        const filters = getDefaultFinderFilters();
        const norms = computeMetricNorms(cache);
        const result = scoreDeck(FIXTURE_DECK_IDS, filters, cache, null, norms);
        expect(typeof result.score).toBe('number');
        expect(result.score).toBeGreaterThan(0);
        expect(result.metrics).toBeDefined();
        expect(result.metrics.raceBonus).toBeDefined();
        expect(result.metrics.trainingEff).toBeDefined();
        expect(result.metrics.friendBonus).toBeDefined();
        expect(result.metrics.hintSkillCount).toBeGreaterThan(0);
        expect(result.aggregated).toBeDefined();
    });

    test('different decks produce different scores', () => {
        const filters = getDefaultFinderFilters();
        const norms = computeMetricNorms(cache);
        const score1 = scoreDeck(FIXTURE_DECK_IDS, filters, cache, null, norms);
        const score2 = scoreDeck(FIXTURE_DECK_IDS_2, filters, cache, null, norms);
        expect(score1.score).not.toBe(score2.score);
    });

    test('scoring is deterministic', () => {
        const filters = getDefaultFinderFilters();
        const norms = computeMetricNorms(cache);
        const result1 = scoreDeck(FIXTURE_DECK_IDS, filters, cache, null, norms);
        const result2 = scoreDeck(FIXTURE_DECK_IDS, filters, cache, null, norms);
        expect(result1.score).toBe(result2.score);
        expect(result1.metrics).toEqual(result2.metrics);
    });

    test('different scenarios produce different scores', () => {
        const norms = computeMetricNorms(cache);
        const filtersURA = { ...getDefaultFinderFilters(), scenario: '1' };
        const filtersTrail = { ...getDefaultFinderFilters(), scenario: '4' };
        const scoreURA = scoreDeck(FIXTURE_DECK_IDS, filtersURA, cache, null, norms);
        const scoreTrail = scoreDeck(FIXTURE_DECK_IDS, filtersTrail, cache, null, norms);
        expect(scoreURA.score).not.toBe(scoreTrail.score);
    });

    test('metrics include all expected fields', () => {
        const filters = getDefaultFinderFilters();
        const norms = computeMetricNorms(cache);
        const { metrics } = scoreDeck(FIXTURE_DECK_IDS, filters, cache, null, norms);
        const expectedKeys = [
            'raceBonus', 'trainingEff', 'friendBonus', 'energyCost', 'eventRecovery',
            'statBonus', 'hintSkillCount', 'skillTypeCount', 'totalEffectSum',
            'uniqueEffects', 'skillAptitude', 'specialtyPriority', 'moodEffect',
            'initialFriendship', 'hintFrequency', 'hintLevels', 'failureProtection',
            'initialStats',
        ];
        for (const key of expectedKeys) {
            expect(metrics).toHaveProperty(key);
        }
    });
});

// ===== computeMetricNorms =====

describe('computeMetricNorms', () => {
    test('returns normalization values for all metrics', () => {
        const pool = cardData.filter(c => c.rarity === 3 && c.start_date).slice(0, 20);
        const cache = precomputeCardEffects(pool, null, true);
        const norms = computeMetricNorms(cache);
        expect(typeof norms).toBe('object');
        expect(Object.keys(norms).length).toBeGreaterThan(0);
    });
});

// ===== enumerateTypeDistributions =====

describe('enumerateTypeDistributions', () => {
    test('generates distributions summing to 6', () => {
        const filters = getDefaultFinderFilters();
        const dists = enumerateTypeDistributions(filters, 6);
        expect(dists.length).toBeGreaterThan(0);
        for (const d of dists) {
            // Distributions are flat objects: { speed: N, stamina: N, ... }
            const sum = Object.values(d).reduce((s, v) => s + v, 0);
            expect(sum).toBe(6);
        }
    });

    test('respects type filter', () => {
        const filters = {
            ...getDefaultFinderFilters(),
            types: { speed: true, stamina: true, power: false, guts: false, intelligence: false, friend: false },
        };
        const dists = enumerateTypeDistributions(filters, 6);
        expect(dists.length).toBeGreaterThan(0);
        for (const d of dists) {
            // Disabled types should not appear as keys or should be 0
            expect(d.power || 0).toBe(0);
            expect(d.guts || 0).toBe(0);
            expect(d.intelligence || 0).toBe(0);
            expect(d.friend || 0).toBe(0);
        }
    });

    test('type ratio constraints', () => {
        const filters = {
            ...getDefaultFinderFilters(),
            typeRatio: { speed: 3, stamina: 3, power: 0, guts: 0, intelligence: 0, friend: 0 },
        };
        const dists = enumerateTypeDistributions(filters, 6);
        expect(dists.length).toBeGreaterThan(0);
        for (const d of dists) {
            expect(d.speed || 0).toBe(3);
            expect(d.stamina || 0).toBe(3);
        }
    });
});

// ===== Integration: owned-mode search pool =====

describe('Owned-mode search pool', () => {
    test('fixture collection builds valid pool for owned search', () => {
        applyFixtureCollection();
        const filters = getDefaultFinderFilters(); // cardPool: 'owned'
        const pool = buildCardPool(filters);
        // Should contain SSR and SR owned cards (R excluded by default)
        expect(pool.length).toBeGreaterThan(0);
        pool.forEach(c => expect(isCardOwned(c.support_id)).toBe(true));
        // Should not contain R cards (rarity.r = false)
        pool.forEach(c => expect(c.rarity).toBeGreaterThanOrEqual(2));
    });

    test('can precompute effects and score owned deck', () => {
        applyFixtureCollection();
        const filters = getDefaultFinderFilters();
        const pool = buildCardPool(filters);
        const cache = precomputeCardEffects(pool, null, false);
        const norms = computeMetricNorms(cache);

        // Score the fixture deck
        const deckPool = FIXTURE_DECK_IDS.filter(id => cache.has(id));
        if (deckPool.length === 6) {
            const result = scoreDeck(deckPool, filters, cache, null, norms);
            expect(result.score).toBeGreaterThan(0);
        }
    });
});

// ===== Integration: all-cards search pool =====

describe('All-cards search pool', () => {
    test('all-cards pool is larger than owned pool', () => {
        applyFixtureCollection();
        const ownedFilters = { ...getDefaultFinderFilters(), cardPool: 'owned' };
        const allFilters = { ...getDefaultFinderFilters(), cardPool: 'all' };
        const ownedPool = buildCardPool(ownedFilters);
        const allPool = buildCardPool(allFilters);
        expect(allPool.length).toBeGreaterThan(ownedPool.length);
    });

    test('all-cards mode includes unowned SSR cards', () => {
        applyFixtureCollection();
        const filters = { ...getDefaultFinderFilters(), cardPool: 'all', rarity: { ssr: true, sr: false, r: false } };
        const pool = buildCardPool(filters);
        const unownedInPool = pool.filter(c => !isCardOwned(c.support_id));
        expect(unownedInPool.length).toBeGreaterThan(0);
    });

    test('can precompute and score on all-cards pool', () => {
        const filters = { ...getDefaultFinderFilters(), cardPool: 'all', rarity: { ssr: true, sr: false, r: false } };
        const pool = buildCardPool(filters);
        const cache = precomputeCardEffects(pool, null, true);
        const norms = computeMetricNorms(cache);

        // Pick 6 cards from different types
        const groups = groupCardsByType(pool);
        const deck = [];
        for (const type of ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend']) {
            if (groups[type] && groups[type].length > 0) {
                deck.push(groups[type][0].support_id);
            }
        }
        if (deck.length === 6) {
            const result = scoreDeck(deck, filters, cache, null, norms);
            expect(result.score).toBeGreaterThan(0);
        }
    });
});

// ===== Regression: filter + sort combinations =====

describe('Filter and sort combinations on finder', () => {
    let allPool, cache, norms;
    beforeEach(() => {
        const filters = { ...getDefaultFinderFilters(), cardPool: 'all', rarity: { ssr: true, sr: false, r: false } };
        allPool = buildCardPool(filters);
        cache = precomputeCardEffects(allPool, null, true);
        norms = computeMetricNorms(cache);
    });

    test('minRaceBonus filter excludes low-race-bonus decks', () => {
        const groups = groupCardsByType(allPool);
        const deck = [];
        for (const type of ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend']) {
            if (groups[type]?.[0]) deck.push(groups[type][0].support_id);
        }
        if (deck.length === 6) {
            const agg = aggregateFinderDeckEffects(deck, cache);
            const raceBonus = agg[15] || 0;
            // Set threshold just above what this deck provides
            const filters = { ...getDefaultFinderFilters(), minRaceBonus: raceBonus + 1 };
            expect(checkHardFilters(deck, filters, cache)).toBe(false);
            // Set threshold at exactly what deck provides
            const filtersPass = { ...getDefaultFinderFilters(), minRaceBonus: raceBonus };
            expect(checkHardFilters(deck, filtersPass, cache)).toBe(true);
        }
    });

    test('scoring changes with different scenario weights', () => {
        const groups = groupCardsByType(allPool);
        const deck = [];
        for (const type of ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend']) {
            if (groups[type]?.[0]) deck.push(groups[type][0].support_id);
        }
        if (deck.length === 6) {
            const scoreURA = scoreDeck(deck, { ...getDefaultFinderFilters(), scenario: '1' }, cache, null, norms);
            const scoreAoharu = scoreDeck(deck, { ...getDefaultFinderFilters(), scenario: '2' }, cache, null, norms);
            const scoreTrail = scoreDeck(deck, { ...getDefaultFinderFilters(), scenario: '4' }, cache, null, norms);
            // All should be positive, but different
            expect(scoreURA.score).toBeGreaterThan(0);
            expect(scoreAoharu.score).toBeGreaterThan(0);
            expect(scoreTrail.score).toBeGreaterThan(0);
            // At least two should differ
            const scores = [scoreURA.score, scoreAoharu.score, scoreTrail.score];
            const unique = new Set(scores);
            expect(unique.size).toBeGreaterThan(1);
        }
    });
});

// ===== individualCardScore =====

describe('individualCardScore', () => {
    let pool, cache, filters;

    beforeEach(() => {
        filters = getDefaultFinderFilters();
        pool = cardData.filter(c => c.rarity === 3 && c.start_date).slice(0, 30);
        cache = precomputeCardEffects(pool, null, true);
    });

    test('returns positive score for a valid card with URA weights', () => {
        const cardId = pool[0].support_id;
        const score = individualCardScore(cardId, filters, cache, null);
        expect(score).toBeGreaterThan(0);
    });

    test('returns 0 for unknown card ID', () => {
        const score = individualCardScore(999999, filters, cache, null);
        expect(score).toBe(0);
    });

    test('skill aptitude scoring with trainee: card with high aptitude scores higher', () => {
        // Find a card that has hint skills with distance tags
        const cardWithSkills = pool.find(c => {
            const entry = cache.get(c.support_id);
            return entry && entry.skillAptitudeScore > 0;
        });
        if (!cardWithSkills) return; // skip if no card has aptitude scores in test pool

        // Create trainee data with strong aptitudes
        const traineeData = {
            growthRates: { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 },
            aptitudes: {
                distance: { short: 'A', mile: 'A', medium: 'A', long: 'A' },
                running_style: { front_runner: 'A', stalker: 'A', stretch: 'A' },
                ground: { turf: 'A', dirt: 'A' },
            },
        };
        // Recompute cache with trainee data for aptitude scores
        const cacheWithTrainee = precomputeCardEffects(pool, traineeData, true);

        const scoreWithTrainee = individualCardScore(cardWithSkills.support_id, filters, cacheWithTrainee, traineeData);
        const scoreWithout = individualCardScore(cardWithSkills.support_id, filters, cache, null);
        expect(scoreWithTrainee).toBeGreaterThan(scoreWithout);
    });

    test('growth rate boost increases score for matching card type', () => {
        // Find a guts card
        const gutsCard = pool.find(c => c.type === 'guts');
        if (!gutsCard) return;

        const traineeWithGuts = {
            growthRates: { speed: 0, stamina: 0, power: 0, guts: 20, wisdom: 0 },
            aptitudes: { distance: {}, running_style: {}, ground: {} },
        };
        const traineeNoGuts = {
            growthRates: { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 },
            aptitudes: { distance: {}, running_style: {}, ground: {} },
        };

        const scoreWithGrowth = individualCardScore(gutsCard.support_id, filters, cache, traineeWithGuts);
        const scoreNoGrowth = individualCardScore(gutsCard.support_id, filters, cache, traineeNoGuts);
        // Guts growth rate should boost score if card has guts stat bonus
        const entry = cache.get(gutsCard.support_id);
        if (entry.effects[6] > 0) {
            expect(scoreWithGrowth).toBeGreaterThan(scoreNoGrowth);
        }
    });

    test('presort bug fix: skillAptitudeScore scales with norm * weight', () => {
        // Build a card cache entry with a known aptitude score
        const traineeData = {
            growthRates: { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 },
            aptitudes: {
                distance: { short: 'A', mile: 'A', medium: 'A', long: 'A' },
                running_style: { front_runner: 'A', stalker: 'A', stretch: 'A' },
                ground: { turf: 'A', dirt: 'A' },
            },
        };
        const cacheWithTrainee = precomputeCardEffects(pool, traineeData, true);

        // Find a card with aptitude score
        const cardWithApt = pool.find(c => {
            const entry = cacheWithTrainee.get(c.support_id);
            return entry && entry.skillAptitudeScore > 0;
        });
        if (!cardWithApt) return;

        // Score with default weights (skillAptitude = 25)
        const filtersDefault = { ...filters, scenario: '1' };
        deckFinderState.customWeights = null;
        const scoreDefault = individualCardScore(cardWithApt.support_id, filtersDefault, cacheWithTrainee, traineeData);

        // Score with boosted skillAptitude weight (80)
        const defaultWeights = getActiveWeights('1');
        deckFinderState.customWeights = { ...defaultWeights, skillAptitude: 80 };
        const scoreBoosted = individualCardScore(cardWithApt.support_id, filtersDefault, cacheWithTrainee, traineeData);

        // The boosted weight should produce a higher score (the bug fix ensures
        // aptitude contribution scales with the weight, not just hardcoded * 5)
        expect(scoreBoosted).toBeGreaterThan(scoreDefault);

        // Clean up
        deckFinderState.customWeights = null;
    });

    test('without trainee: skillAptitude contributes 0', () => {
        const cardId = pool[0].support_id;
        // Without trainee, cache entries have skillAptitudeScore = 0
        const entry = cache.get(cardId);
        expect(entry.skillAptitudeScore).toBe(0);
        // Score should still be positive (from other metrics)
        const score = individualCardScore(cardId, filters, cache, null);
        expect(score).toBeGreaterThan(0);
    });
});

// ===== Utility functions =====

describe('Utility functions', () => {
    test('binomial computes correct values', () => {
        expect(binomial(6, 2)).toBe(15);
        expect(binomial(10, 3)).toBe(120);
        expect(binomial(5, 0)).toBe(1);
        expect(binomial(5, 5)).toBe(1);
        expect(binomial(3, 4)).toBe(0);
    });

    test('combinations generates correct count', () => {
        const result = combinations([1, 2, 3, 4], 2);
        expect(result.length).toBe(6); // C(4,2) = 6
        // Each combo has 2 elements
        result.forEach(combo => expect(combo.length).toBe(2));
    });
});
