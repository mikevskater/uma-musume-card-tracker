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

// ===== Import format detection =====

describe('detectImportFormat', () => {
    test('recognizes the app export format', () => {
        const appExport = {
            version: '2.0',
            exportDate: '2025-01-01T00:00:00.000Z',
            ownedCards: { '10001': { owned: true, level: 40, limitBreak: 4 } }
        };
        expect(detectImportFormat(appExport)).toBe('app');
    });

    test('recognizes the game support_card_data.json array format', () => {
        const game = [{ support_card_id: 10001, limit_break_count: 4, extra_data: { level: 25 } }];
        expect(detectImportFormat(game)).toBe('game');
    });

    test('treats an empty array as the game format', () => {
        expect(detectImportFormat([])).toBe('game');
    });

    test('rejects objects without ownedCards and non-object input', () => {
        expect(detectImportFormat({ foo: 1 })).toBe('unsupported');
        expect(detectImportFormat({ ownedCards: null })).toBe('unsupported');
        expect(detectImportFormat(null)).toBe('unsupported');
        expect(detectImportFormat(undefined)).toBe('unsupported');
        expect(detectImportFormat(42)).toBe('unsupported');
        expect(detectImportFormat('x')).toBe('unsupported');
    });
});

// ===== create_time parsing =====

describe('parseSupportCardCreateTime', () => {
    test('parses the space-separated date form to a timestamp', () => {
        expect(parseSupportCardCreateTime('2025-08-14 14:43:03')).toBe(Date.parse('2025-08-14 14:43:03'));
    });

    test('falls back to a finite timestamp for unparseable input', () => {
        const forNull = parseSupportCardCreateTime(null);
        const forMissing = parseSupportCardCreateTime(undefined);
        const forBad = parseSupportCardCreateTime('not a date');
        for (const value of [forNull, forMissing, forBad]) {
            expect(typeof value).toBe('number');
            expect(Number.isNaN(value)).toBe(false);
        }
    });
});

// ===== Support card data normalization =====

describe('normalizeSupportCardData', () => {
    test('extracts support_card_id, limit_break_count, and level for real cards', () => {
        const items = [
            { support_card_id: 10001, limit_break_count: 4, extra_data: { level: 25, max_level: 40 }, create_time: '2025-08-14 14:43:03' }, // R, current level 25 (max potential 40)
            { support_card_id: 20001, limit_break_count: 4, extra_data: { level: 45 }, create_time: '2025-08-31 03:39:26' }, // SR
            { support_card_id: 30041, limit_break_count: 4, extra_data: { level: 50 }, create_time: '2025-08-29 19:36:51' }, // SSR
            { support_card_id: 30020, limit_break_count: 0, extra_data: { level: 30 }, create_time: '2025-08-31 03:38:53' }   // SSR LB0
        ];

        const result = normalizeSupportCardData(items);

        expect(result['10001']).toEqual({ owned: true, level: 25, limitBreak: 4, dateObtained: Date.parse('2025-08-14 14:43:03') });
        expect(result['20001']).toEqual({ owned: true, level: 45, limitBreak: 4, dateObtained: Date.parse('2025-08-31 03:39:26') });
        expect(result['30041']).toEqual({ owned: true, level: 50, limitBreak: 4, dateObtained: Date.parse('2025-08-29 19:36:51') });
        expect(result['30020']).toEqual({ owned: true, level: 30, limitBreak: 0, dateObtained: Date.parse('2025-08-31 03:38:53') });
    });

    test('imports an unknown card by level without requiring it in cardData', () => {
        const result = normalizeSupportCardData([
            { support_card_id: 99999, limit_break_count: 2, extra_data: { level: 33 } }
        ]);
        expect(result['99999']).toMatchObject({ owned: true, level: 33 });
    });

    test('derives level from the rarity table when level is missing', () => {
        const result = normalizeSupportCardData([
            { support_card_id: 10001, limit_break_count: 2, extra_data: {} } // R, LB2 -> 30
        ]);
        expect(result['10001'].level).toBe(limitBreaks[1][2]);
    });

    test('falls back to level 1 for a card missing level', () => {
        const result = normalizeSupportCardData([
            { support_card_id: 99999, limit_break_count: 2, extra_data: {} }
        ]);
        expect(result['99999'].level).toBe(1);
    });

    test('skips records without a support_card_id', () => {
        const result = normalizeSupportCardData([
            { support_card_id: 10001, limit_break_count: 4, extra_data: { level: 25 } },
            { support_card_id: null, limit_break_count: 4, extra_data: { level: 25 } },
            { extra_data: { level: 25 } }
        ]);
        expect(result['10001']).toBeDefined();
        expect(result['null']).toBeUndefined();
        expect(Object.keys(result)).toHaveLength(1);
    });

    test('treats a non-finite limit_break_count as 0', () => {
        const result = normalizeSupportCardData([
            { support_card_id: 10001, limit_break_count: NaN, extra_data: { level: 25 } }
        ]);
        expect(result['10001'].limitBreak).toBe(0);
    });

    test('marks every imported card as owned', () => {
        const items = [
            { support_card_id: 10001, limit_break_count: 4, extra_data: { level: 25 } },
            { support_card_id: 20001, limit_break_count: 4, extra_data: { level: 45 } }
        ];
        const result = normalizeSupportCardData(items);
        for (const key of Object.keys(result)) {
            expect(result[key].owned).toBe(true);
        }
    });

    test('throws when not given an array', () => {
        expect(() => normalizeSupportCardData({})).toThrow(/array/);
    });
});

// ===== App export normalization (backward compatibility) =====

describe('normalizeAppImportData', () => {
    test('keeps owned/level/limitBreak, converts date string, strips extra fields', () => {
        const appExport = {
            version: '2.0',
            ownedCards: {
                '10001': {
                    owned: true,
                    level: 40,
                    limitBreak: 4,
                    dateObtained: '2025-08-14',
                    charName: 'Special Week',
                    rarity: 'R',
                    type: 'guts'
                }
            }
        };

        const result = normalizeAppImportData(appExport);
        expect(result['10001']).toEqual({
            owned: true,
            level: 40,
            limitBreak: 4,
            dateObtained: new Date('2025-08-14').getTime()
        });
        expect(result['10001'].charName).toBeUndefined();
        expect(result['10001'].rarity).toBeUndefined();
        expect(result['10001'].type).toBeUndefined();
    });
});

// ===== applyImportData integration (no FileReader) =====

describe('applyImportData', () => {
    // The real debouncedFilterAndSort schedules a timer that calls into
    // filterSort.js, which isn't fully wired in the jest env. Stub it for these
    // tests so the store/toast behavior can be verified in isolation.
    let realDebouncedFilterAndSort;
    beforeEach(() => {
        realDebouncedFilterAndSort = global.debouncedFilterAndSort;
        global.debouncedFilterAndSort = () => {};
    });
    afterEach(() => {
        global.debouncedFilterAndSort = realDebouncedFilterAndSort;
    });

    test('imports the app export format into the store', () => {
        const appExport = {
            version: '2.0',
            ownedCards: { '10001': { owned: true, level: 40, limitBreak: 4, dateObtained: '2025-08-14' } }
        };
        expect(() => applyImportData(appExport)).not.toThrow();
        expect(ownedCards['10001']).toMatchObject({ owned: true, level: 40, limitBreak: 4 });
    });

    test('imports the game format into the store', () => {
        const game = [{ support_card_id: 10001, limit_break_count: 4, extra_data: { level: 25 } }];
        expect(() => applyImportData(game)).not.toThrow();
        expect(ownedCards['10001']).toMatchObject({ owned: true, level: 25, limitBreak: 4 });
    });

    test('persists the imported collection to localStorage', () => {
        applyImportData([{ support_card_id: 10001, limit_break_count: 4, extra_data: { level: 25 } }]);
        const parsed = JSON.parse(localStorage.getItem('uma_owned_cards'));
        expect(parsed['10001']).toMatchObject({ owned: true, level: 25 });
    });

    test('rejects an unsupported format', () => {
        expect(() => applyImportData({ foo: 1 })).toThrow(/Unsupported file format/);
    });

    test('accepts an empty game array without importing anything', () => {
        expect(() => applyImportData([])).not.toThrow();
        expect(Object.keys(ownedCards).length).toBe(0);
    });
});

// ===== validateImportData (unchanged behavior) =====

describe('validateImportData', () => {
    test('accepts a well-formed app export', () => {
        const appExport = { ownedCards: { '10001': { owned: true, level: 40 } } };
        expect(() => validateImportData(appExport)).not.toThrow();
    });

    test('rejects a missing ownedCards map and a non-number level', () => {
        expect(() => validateImportData({})).toThrow(/ownedCards/);
        expect(() => validateImportData({ ownedCards: { '10001': { owned: true } } })).toThrow(/Invalid data/);
    });
});
