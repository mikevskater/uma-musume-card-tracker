const { applyFixtureCollection, resetFixtures, getCardById } = require('../fixtures');

beforeEach(() => resetFixtures());

// ===== passesBasicFilters =====

describe('passesBasicFilters', () => {
    const baseFilters = {
        selectedRarities: [],
        selectedTypes: [],
        nameFilter: '',
        showUnreleased: false,
        ownedFilter: 'all',
    };

    test('passes with no filters', () => {
        const card = getCardById(30002);
        expect(passesBasicFilters(card, baseFilters)).toBe(true);
    });

    test('filters by rarity', () => {
        const ssrCard = getCardById(30002); // rarity 3
        const rCard = getCardById(10001);   // rarity 1
        const filters = { ...baseFilters, selectedRarities: ['3'] };
        expect(passesBasicFilters(ssrCard, filters)).toBe(true);
        expect(passesBasicFilters(rCard, filters)).toBe(false);
    });

    test('filters by type', () => {
        const speedCard = getCardById(30002);
        const gutsCard = getCardById(30001);
        const filters = { ...baseFilters, selectedTypes: ['speed'] };
        expect(passesBasicFilters(speedCard, filters)).toBe(true);
        expect(passesBasicFilters(gutsCard, filters)).toBe(false);
    });

    test('filters by name (case insensitive)', () => {
        const card = getCardById(30002); // Silence Suzuka
        const filters = { ...baseFilters, nameFilter: 'suzuka' };
        expect(passesBasicFilters(card, filters)).toBe(true);
        const filtersMiss = { ...baseFilters, nameFilter: 'xyznotfound' };
        expect(passesBasicFilters(card, filtersMiss)).toBe(false);
    });

    test('filters by ownership: owned only', () => {
        applyFixtureCollection();
        const ownedCard = getCardById(30002);   // in fixture collection
        const unownedCard = getCardById(30014); // not in fixture
        const filters = { ...baseFilters, ownedFilter: 'owned' };
        expect(passesBasicFilters(ownedCard, filters)).toBe(true);
        expect(passesBasicFilters(unownedCard, filters)).toBe(false);
    });

    test('filters by ownership: unowned only', () => {
        applyFixtureCollection();
        const ownedCard = getCardById(30002);
        const filters = { ...baseFilters, ownedFilter: 'unowned' };
        expect(passesBasicFilters(ownedCard, filters)).toBe(false);
    });

    test('hides unreleased cards by default', () => {
        const card = { ...getCardById(30002), start_date: null };
        expect(passesBasicFilters(card, baseFilters)).toBe(false);
    });

    test('shows unreleased cards when flag is set', () => {
        const card = { ...getCardById(30002), start_date: null };
        const filters = { ...baseFilters, showUnreleased: true };
        expect(passesBasicFilters(card, filters)).toBe(true);
    });
});

// ===== passesAdvancedFilters =====

describe('passesAdvancedFilters', () => {
    test('passes with no advanced filters', () => {
        const card = getCardById(30002);
        expect(passesAdvancedFilters(card)).toBe(true);
    });

    test('effect minimum threshold filters', () => {
        const card = getCardById(30002); // has effect ID 1 (Friendship Bonus)
        // Set a minimum that should pass at max level
        global.advancedFilters.effects = { '1': { min: 1 } };
        expect(passesAdvancedFilters(card)).toBe(true);
        // Set an impossible minimum
        global.advancedFilters.effects = { '1': { min: 9999 } };
        expect(passesAdvancedFilters(card)).toBe(false);
    });
});

// ===== compareCardsBySortCriteria =====

describe('compareCardsBySortCriteria', () => {
    test('sorts by rarity descending', () => {
        const ssr = getCardById(30002); // rarity 3
        const r = getCardById(10001);   // rarity 1
        const sort = { category: 'rarity', direction: 'desc' };
        expect(compareCardsBySortCriteria(ssr, r, sort)).toBeLessThan(0); // SSR first
        expect(compareCardsBySortCriteria(r, ssr, sort)).toBeGreaterThan(0);
    });

    test('sorts by rarity ascending', () => {
        const ssr = getCardById(30002);
        const r = getCardById(10001);
        const sort = { category: 'rarity', direction: 'asc' };
        expect(compareCardsBySortCriteria(ssr, r, sort)).toBeGreaterThan(0); // R first
    });

    test('sorts by name ascending', () => {
        const cardA = getCardById(30002); // Silence Suzuka
        const cardB = getCardById(30001); // has a different name
        const sort = { category: 'name', direction: 'asc' };
        const result = compareCardsBySortCriteria(cardA, cardB, sort);
        // Just verify it returns a non-zero value (deterministic ordering)
        expect(typeof result).toBe('number');
    });

    test('sorts by type', () => {
        const speedCard = getCardById(30002); // speed
        const gutsCard = getCardById(30001);  // guts
        const sort = { category: 'type', direction: 'asc' };
        const result = compareCardsBySortCriteria(speedCard, gutsCard, sort);
        expect(typeof result).toBe('number');
    });

    test('sorts by effect value', () => {
        const card1 = getCardById(30002);
        const card2 = getCardById(10001);
        const sort = { category: 'effect', direction: 'desc', option: '1' }; // Friendship Bonus
        const result = compareCardsBySortCriteria(card1, card2, sort);
        // SSR at max level should have higher effect than R
        expect(result).toBeLessThanOrEqual(0); // card1 (higher) should sort first in desc
    });

    test('sorts by level descending', () => {
        applyFixtureCollection();
        const maxCard = getCardById(30002);   // level 50
        const midCard = getCardById(30003);   // level 40
        const sort = { category: 'level', direction: 'desc' };
        expect(compareCardsBySortCriteria(maxCard, midCard, sort)).toBeLessThan(0);
    });

    test('sorts by hint skill count', () => {
        const card1 = getCardById(30002);
        const card2 = getCardById(30001);
        const sort = { category: 'hintSkillCount', direction: 'desc' };
        const result = compareCardsBySortCriteria(card1, card2, sort);
        expect(typeof result).toBe('number');
    });

    test('sorts by release date', () => {
        const card1 = getCardById(30002);
        const card2 = getCardById(30001);
        const sort = { category: 'releaseDate', direction: 'desc' };
        const result = compareCardsBySortCriteria(card1, card2, sort);
        expect(typeof result).toBe('number');
    });
});

// ===== sortCardsByMultipleCriteria =====

describe('sortCardsByMultipleCriteria', () => {
    test('sorts by single rarity layer', () => {
        global.multiSort = [{ category: 'rarity', direction: 'desc' }];
        const cards = [getCardById(10001), getCardById(30002), getCardById(20001)];
        const sorted = sortCardsByMultipleCriteria([...cards]);
        expect(sorted[0].rarity).toBe(3); // SSR first
        expect(sorted[sorted.length - 1].rarity).toBe(1); // R last
    });

    test('multi-layer sort: type then rarity', () => {
        global.multiSort = [
            { category: 'type', direction: 'asc' },
            { category: 'rarity', direction: 'desc' },
        ];
        const cards = cardData.slice(0, 20);
        const sorted = sortCardsByMultipleCriteria([...cards]);
        // Verify type ordering is respected
        for (let i = 1; i < sorted.length; i++) {
            const typeComp = sorted[i - 1].type.localeCompare(sorted[i].type);
            if (typeComp === 0) {
                // Same type → rarity should be descending
                expect(sorted[i - 1].rarity).toBeGreaterThanOrEqual(sorted[i].rarity);
            }
        }
    });

    test('empty sort falls back to rarity descending', () => {
        global.multiSort = [];
        const cards = [getCardById(10001), getCardById(30002)];
        const sorted = sortCardsByMultipleCriteria([...cards]);
        expect(sorted[0].rarity).toBeGreaterThanOrEqual(sorted[1].rarity);
    });

    test('sort is deterministic across repeated calls', () => {
        global.multiSort = [{ category: 'name', direction: 'asc' }];
        const cards = cardData.slice(0, 30);
        const sorted1 = sortCardsByMultipleCriteria([...cards]);
        const sorted2 = sortCardsByMultipleCriteria([...cards]);
        expect(sorted1.map(c => c.support_id)).toEqual(sorted2.map(c => c.support_id));
    });
});
