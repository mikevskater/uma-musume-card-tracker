const { getCardById, resetFixtures } = require('../fixtures');

beforeEach(() => resetFixtures());

// ===== linearInterpolate =====

describe('linearInterpolate', () => {
    test('returns y1 when x equals x1', () => {
        expect(linearInterpolate(10, 20, 30, 40, 10)).toBe(20);
    });

    test('returns y2 when x equals x2', () => {
        expect(linearInterpolate(10, 20, 30, 40, 30)).toBe(40);
    });

    test('returns midpoint at midpoint x', () => {
        expect(linearInterpolate(0, 0, 10, 100, 5)).toBe(50);
    });

    test('handles equal x1 and x2 without division by zero', () => {
        expect(linearInterpolate(5, 10, 5, 10, 5)).toBe(10);
    });
});

// ===== calculateEffectValue =====

describe('calculateEffectValue', () => {
    // Card 10001 (R, guts) effect: [1, 5, -1, -1, 10, 10, -1, -1, 15, -1, -1, -1]
    // Milestones:          level: [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
    // Values:                     [5, -1, -1, 10, 10, -1, -1, 15, -1, -1, -1]
    const card10001 = () => getCardById(10001);

    test('returns exact value at milestone level', () => {
        const effectArray = card10001().effects[0]; // Effect ID 1
        expect(calculateEffectValue(effectArray, 1)).toBe(5);
    });

    test('returns exact value at higher milestone', () => {
        const effectArray = card10001().effects[0];
        expect(calculateEffectValue(effectArray, 15)).toBe(10);
    });

    test('interpolates between milestones', () => {
        const effectArray = card10001().effects[0];
        // Between level 1 (val=5) and level 15 (val=10), at level 8
        const val = calculateEffectValue(effectArray, 8);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThanOrEqual(10);
    });

    test('clamps level to 1-50 range', () => {
        const effectArray = card10001().effects[0];
        expect(calculateEffectValue(effectArray, 0)).toBe(calculateEffectValue(effectArray, 1));
        expect(calculateEffectValue(effectArray, 999)).toBe(calculateEffectValue(effectArray, 50));
    });

    test('returns 0 for null/empty input', () => {
        expect(calculateEffectValue(null, 10)).toBe(0);
        expect(calculateEffectValue([], 10)).toBe(0);
        expect(calculateEffectValue([1], 10)).toBe(0);
    });

    // SSR card 30002 (speed): effect [1, 10, -1, -1, -1, -1, -1, 25, -1, -1, 35]
    test('SSR card effect at max level', () => {
        const card = getCardById(30002);
        const effectArray = card.effects[0];
        expect(calculateEffectValue(effectArray, 50)).toBe(35);
    });

    test('SSR card effect at level 35 interpolates between milestones', () => {
        const card = getCardById(30002);
        const effectArray = card.effects[0];
        // Effect [1, 10, -1, -1, -1, -1, -1, 25, -1, -1, -1, 35]
        // Level 35 has -1, so interpolates between level 30 (val=25) and level 50 (val=35)
        // 25 + (35-25) * (35-30)/(50-30) = 25 + 2.5 → floor = 27
        expect(calculateEffectValue(effectArray, 35)).toBe(27);
    });

    test('returns consistent results for same input (cache safe)', () => {
        const effectArray = card10001().effects[0];
        const val1 = calculateEffectValue(effectArray, 25);
        const val2 = calculateEffectValue(effectArray, 25);
        expect(val1).toBe(val2);
    });
});

// ===== findSurroundingMilestones =====

describe('findSurroundingMilestones', () => {
    test('finds exact milestone bounds', () => {
        // Effect with value at level 1 and level 15
        const effectArray = [1, 5, -1, -1, 10, 10, -1, -1, 15, -1, -1, -1];
        const result = findSurroundingMilestones(effectArray, 10);
        expect(result.lowerMilestone.value).toBe(5);
        expect(result.upperMilestone.value).toBe(10);
    });

    test('handles target before first valid milestone', () => {
        // Effect that starts at level 5
        const effectArray = [1, -1, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1];
        const result = findSurroundingMilestones(effectArray, 2);
        expect(result.lowerMilestone.level).toBe(0);
        expect(result.upperMilestone.level).toBe(5);
    });

    test('handles all -1 values', () => {
        const effectArray = [1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
        const result = findSurroundingMilestones(effectArray, 25);
        expect(result.lowerMilestone.value).toBe(0);
        expect(result.upperMilestone.value).toBe(0);
    });
});

// ===== isEffectLocked =====

describe('isEffectLocked', () => {
    test('unlocked when level meets milestone', () => {
        const effectArray = [1, -1, -1, -1, 10, 10, -1, -1, 15, -1, -1, -1];
        expect(isEffectLocked(effectArray, 15)).toBe(false);
    });

    test('locked when level is below all milestones', () => {
        const effectArray = [1, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1];
        expect(isEffectLocked(effectArray, 10)).toBe(true);
    });

    test('locked for null input', () => {
        expect(isEffectLocked(null, 10)).toBe(true);
    });

    test('locked for empty array', () => {
        expect(isEffectLocked([], 10)).toBe(true);
    });
});

// ===== getLimitBreakLevel =====

describe('getLimitBreakLevel', () => {
    test('SSR limit break levels', () => {
        // SSR breaks: [30, 35, 40, 45, 50]
        expect(getLimitBreakLevel(29, 3)).toBe(0);
        expect(getLimitBreakLevel(30, 3)).toBe(0);
        expect(getLimitBreakLevel(35, 3)).toBe(1);
        expect(getLimitBreakLevel(40, 3)).toBe(2);
        expect(getLimitBreakLevel(45, 3)).toBe(3);
        expect(getLimitBreakLevel(50, 3)).toBe(4);
    });

    test('SR limit break levels', () => {
        // SR breaks: [25, 30, 35, 40, 45]
        expect(getLimitBreakLevel(24, 2)).toBe(0);
        expect(getLimitBreakLevel(25, 2)).toBe(0);
        expect(getLimitBreakLevel(30, 2)).toBe(1);
        expect(getLimitBreakLevel(45, 2)).toBe(4);
    });

    test('R limit break levels', () => {
        // R breaks: [20, 25, 30, 35, 40]
        expect(getLimitBreakLevel(19, 1)).toBe(0);
        expect(getLimitBreakLevel(20, 1)).toBe(0);
        expect(getLimitBreakLevel(40, 1)).toBe(4);
    });

    test('unknown rarity returns 0', () => {
        expect(getLimitBreakLevel(50, 99)).toBe(0);
    });
});

// ===== isUniqueEffectActive =====

describe('isUniqueEffectActive', () => {
    test('active when level meets threshold', () => {
        const card = getCardById(30001); // SSR, has unique_effect.level = 30
        expect(card.unique_effect).not.toBeNull();
        expect(isUniqueEffectActive(card, card.unique_effect.level)).toBe(true);
        expect(isUniqueEffectActive(card, 50)).toBe(true);
    });

    test('inactive when level below threshold', () => {
        const card = getCardById(30001);
        expect(isUniqueEffectActive(card, card.unique_effect.level - 1)).toBe(false);
    });

    test('inactive when card has no unique effect', () => {
        const card = { unique_effect: null };
        expect(isUniqueEffectActive(card, 50)).toBe(false);
    });
});

// ===== getUniqueEffectBonus =====

describe('getUniqueEffectBonus', () => {
    test('returns bonus value when active and effect matches', () => {
        const card = getCardById(30001); // unique_effect.effects: [{type:6,value:1},{type:12,value:20}]
        const ue = card.unique_effect;
        expect(getUniqueEffectBonus(card, ue.level, ue.effects[0].type)).toBe(ue.effects[0].value);
    });

    test('returns 0 when level too low', () => {
        const card = getCardById(30001);
        expect(getUniqueEffectBonus(card, 1, card.unique_effect.effects[0].type)).toBe(0);
    });

    test('returns 0 for non-matching effect ID', () => {
        const card = getCardById(30001);
        expect(getUniqueEffectBonus(card, 50, 9999)).toBe(0);
    });

    test('returns 0 for card without unique effect', () => {
        expect(getUniqueEffectBonus({ unique_effect: null }, 50, 1)).toBe(0);
    });
});

// ===== getEffectiveLevel =====

describe('getEffectiveLevel', () => {
    test('default max level for unowned SSR', () => {
        const card = getCardById(30002);
        // SSR LB4 max = 50
        expect(getEffectiveLevel(card)).toBe(50);
    });

    test('owned card returns owned level', () => {
        const card = getCardById(30002);
        global.ownedCards[30002] = { owned: true, level: 40, limitBreak: 2 };
        expect(getEffectiveLevel(card)).toBe(40);
    });

    test('global limit break override', () => {
        const card = getCardById(30002);
        global.globalLimitBreakLevel = 0;
        // SSR LB0 = 30
        expect(getEffectiveLevel(card)).toBe(30);
    });

    test('global LB does not override owned when flag is false', () => {
        const card = getCardById(30002);
        global.ownedCards[30002] = { owned: true, level: 42, limitBreak: 2 };
        global.globalLimitBreakLevel = 0;
        global.globalLimitBreakOverrideOwned = false;
        expect(getEffectiveLevel(card)).toBe(42);
    });

    test('global LB overrides owned when flag is true', () => {
        const card = getCardById(30002);
        global.ownedCards[30002] = { owned: true, level: 42, limitBreak: 2 };
        global.globalLimitBreakLevel = 0;
        global.globalLimitBreakOverrideOwned = true;
        expect(getEffectiveLevel(card)).toBe(30);
    });

    test('max potential shows max level at current LB', () => {
        const card = getCardById(30002);
        global.ownedCards[30002] = { owned: true, level: 35, limitBreak: 2 };
        global.showMaxPotentialLevels = true;
        // SSR LB2 max = 40
        expect(getEffectiveLevel(card)).toBe(40);
    });
});

// ===== getTypeDisplayName =====

describe('getTypeDisplayName', () => {
    test('maps standard types', () => {
        expect(getTypeDisplayName('speed')).toBe('Speed');
        expect(getTypeDisplayName('intelligence')).toBe('Wit');
        expect(getTypeDisplayName('friend')).toBe('Friend');
    });

    test('returns input for unknown type', () => {
        expect(getTypeDisplayName('unknown')).toBe('unknown');
    });
});
