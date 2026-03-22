/**
 * Test Fixtures — hardcoded card IDs, collections, and expected values
 * for deterministic regression testing.
 *
 * Card IDs reference real cards in data/cards.json.
 * Expected values are computed once and frozen — if these break after
 * an optimization change, it means the change introduced a regression.
 */

// ===== CARD IDS BY TYPE (SSR) =====

const FIXTURE_CARDS = {
    speed:        [30002, 30003, 30014, 30015],
    stamina:      [30004, 30008, 30009, 30016],
    power:        [30005, 30007, 30017, 30024],
    guts:         [30001, 30006, 30011, 30012],
    intelligence: [30010, 30013, 30031, 30041],
    friend:       [30021, 30036, 30080],
};

const FIXTURE_SR_IDS = [20001, 20002];
const FIXTURE_R_IDS  = [10001, 10002];

// ===== HARDCODED OWNED COLLECTION =====
// Mix of SSR/SR/R at various levels and limit breaks

const FIXTURE_COLLECTION = {
    // SSR cards — 2 per training type + 1 friend = 11 cards
    30002: { owned: true, level: 50, limitBreak: 4 },  // speed SSR (max)
    30003: { owned: true, level: 40, limitBreak: 2 },  // speed SSR (mid)
    30004: { owned: true, level: 50, limitBreak: 4 },  // stamina SSR (max)
    30008: { owned: true, level: 35, limitBreak: 1 },  // stamina SSR (low)
    30005: { owned: true, level: 50, limitBreak: 4 },  // power SSR (max)
    30007: { owned: true, level: 45, limitBreak: 3 },  // power SSR
    30001: { owned: true, level: 50, limitBreak: 4 },  // guts SSR (max)
    30006: { owned: true, level: 50, limitBreak: 4 },  // guts SSR (max)
    30010: { owned: true, level: 50, limitBreak: 4 },  // int SSR (max)
    30013: { owned: true, level: 40, limitBreak: 2 },  // int SSR
    30021: { owned: true, level: 50, limitBreak: 4 },  // friend SSR (max)
    // SR cards
    20001: { owned: true, level: 45, limitBreak: 4 },  // SR (max)
    20002: { owned: true, level: 35, limitBreak: 2 },  // SR (mid)
    // R cards
    10001: { owned: true, level: 30, limitBreak: 2 },  // R
    10002: { owned: true, level: 25, limitBreak: 1 },  // R
};

// ===== SAMPLE DECK (6 cards, one per type slot) =====
// Used for deck builder and finder scoring tests

const FIXTURE_DECK_IDS = [30002, 30004, 30005, 30001, 30010, 30021];
// speed, stamina, power, guts, intelligence, friend — all SSR max level

// A second deck for comparison
const FIXTURE_DECK_IDS_2 = [30003, 30008, 30007, 30006, 30013, 30021];

// ===== KNOWN EFFECT VALUES =====
// Pre-computed at specific levels for regression testing.
// Format: { cardId, effectId, level, expectedValue }

// Card 10001 (R, guts): effects include [1, 5, -1, -1, 10, 10, -1, -1, 15, -1, -1, -1]
// Effect ID 1 (Friendship Bonus) at various levels:
//   level 1 → 5 (exact milestone)
//   level 15 → 10 (exact milestone, index 3)
//   level 20 → 10 (exact milestone, index 4)
//   level 35 → 15 (exact milestone, index 7, but val is -1... need to check)

// Card 30002 (SSR, speed): first effect [1, 10, -1, -1, -1, -1, -1, 25, -1, -1, 35]
// Effect 1: level 1 → 10, level 35 → 25, level 50 → 35

// ===== HELPER FUNCTIONS =====

function applyFixtureCollection() {
    global.ownedCards = {};
    for (const [id, data] of Object.entries(FIXTURE_COLLECTION)) {
        global.ownedCards[id] = { ...data, dateObtained: Date.now() };
    }
    if (typeof saveOwnedCards === 'function') {
        saveOwnedCards();
    }
}

function resetFixtures() {
    __resetTestState();
}

function getCardById(id) {
    return cardData.find(c => c.support_id === id);
}

module.exports = {
    FIXTURE_CARDS,
    FIXTURE_SR_IDS,
    FIXTURE_R_IDS,
    FIXTURE_COLLECTION,
    FIXTURE_DECK_IDS,
    FIXTURE_DECK_IDS_2,
    applyFixtureCollection,
    resetFixtures,
    getCardById,
};
