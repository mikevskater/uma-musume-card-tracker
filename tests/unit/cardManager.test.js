const { applyFixtureCollection, resetFixtures, getCardById } = require('../fixtures');

beforeEach(() => resetFixtures());

// ===== Ownership CRUD =====

describe('Card ownership', () => {
    test('setCardOwnership marks card as owned', () => {
        expect(isCardOwned(30002)).toBeFalsy();
        setCardOwnership(30002, true);
        expect(isCardOwned(30002)).toBe(true);
    });

    test('setCardOwnership with false removes ownership', () => {
        setCardOwnership(30002, true);
        setCardOwnership(30002, false);
        expect(isCardOwned(30002)).toBe(false);
    });

    test('getOwnedCardLevel returns level for owned card', () => {
        setCardOwnership(30002, true);
        expect(getOwnedCardLevel(30002)).toBeGreaterThan(0);
    });

    test('getOwnedCardLevel returns null for unowned card', () => {
        expect(getOwnedCardLevel(99999)).toBeNull();
    });
});

// ===== Level management =====

describe('Card level management', () => {
    test('setOwnedCardLevel updates level', () => {
        setCardOwnership(30002, true);
        setOwnedCardLevel(30002, 42);
        expect(getOwnedCardLevel(30002)).toBe(42);
    });

    test('getOwnedCardLimitBreak returns limit break', () => {
        setCardOwnership(30002, true);
        expect(getOwnedCardLimitBreak(30002)).toBeDefined();
    });

    test('setOwnedCardLimitBreak updates LB and adjusts level', () => {
        setCardOwnership(30002, true);
        const result = setOwnedCardLimitBreak(30002, 4);
        expect(result).toBeDefined();
        expect(getOwnedCardLimitBreak(30002)).toBe(4);
    });
});

// ===== Fixture collection =====

describe('Fixture collection', () => {
    test('applyFixtureCollection populates ownedCards', () => {
        applyFixtureCollection();
        expect(isCardOwned(30002)).toBe(true);
        expect(isCardOwned(30004)).toBe(true);
        expect(isCardOwned(20001)).toBe(true);
        expect(isCardOwned(10001)).toBe(true);
        expect(getOwnedCardLevel(30002)).toBe(50);
        expect(getOwnedCardLevel(30003)).toBe(40);
    });

    test('fixture collection has correct number of cards', () => {
        applyFixtureCollection();
        const ownedCount = Object.values(ownedCards).filter(c => c.owned).length;
        expect(ownedCount).toBe(15);
    });
});

// ===== localStorage persistence =====

describe('localStorage persistence', () => {
    test('saveOwnedCards persists to localStorage', () => {
        setCardOwnership(30002, true);
        const stored = localStorage.getItem('uma_owned_cards');
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored);
        expect(parsed[30002]).toBeDefined();
        expect(parsed[30002].owned).toBe(true);
    });

    test('loadOwnedCards restores from localStorage', () => {
        setCardOwnership(30002, true);
        setOwnedCardLevel(30002, 42);
        // Reset in-memory state
        global.ownedCards = {};
        expect(isCardOwned(30002)).toBeFalsy();
        // Reload
        loadOwnedCards();
        expect(isCardOwned(30002)).toBe(true);
        expect(getOwnedCardLevel(30002)).toBe(42);
    });
});

// ===== getEffectiveLimitBreak =====

describe('getEffectiveLimitBreak', () => {
    test('returns owned LB when card is owned', () => {
        applyFixtureCollection();
        expect(getEffectiveLimitBreak(30002, true)).toBe(4);
        expect(getEffectiveLimitBreak(30003, true)).toBe(2);
    });

    test('returns global LB for unowned cards', () => {
        global.globalLimitBreakLevel = 2;
        expect(getEffectiveLimitBreak(99999, false)).toBe(2);
    });

    test('returns default 2 when no global LB set for unowned cards', () => {
        expect(getEffectiveLimitBreak(99999, false)).toBe(2);
    });
});
