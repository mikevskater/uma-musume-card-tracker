const { FIXTURE_DECK_IDS, resetFixtures, getCardById } = require('../fixtures');

beforeEach(() => resetFixtures());

// ===== aggregateDeckEffects =====

describe('aggregateDeckEffects', () => {
    function buildSlots(cardIds, level = 50) {
        return cardIds.map(id => ({ cardId: id, level }));
    }

    test('sums effects across all cards in deck', () => {
        const slots = buildSlots(FIXTURE_DECK_IDS);
        const agg = aggregateDeckEffects(slots);
        // Should have accumulated effect values
        expect(Object.keys(agg).length).toBeGreaterThan(0);
        // All values should be positive numbers
        for (const val of Object.values(agg)) {
            expect(val).toBeGreaterThan(0);
        }
    });

    test('empty slots produce empty aggregation', () => {
        const slots = [null, null, null, null, null, null];
        const agg = aggregateDeckEffects(slots);
        expect(Object.keys(agg).length).toBe(0);
    });

    test('single card slot produces that card\'s effects', () => {
        const card = getCardById(FIXTURE_DECK_IDS[0]);
        const slots = [{ cardId: card.support_id, level: 50 }, null, null, null, null, null];
        const agg = aggregateDeckEffects(slots);
        expect(Object.keys(agg).length).toBeGreaterThan(0);
    });

    test('includes unique effect bonuses at sufficient level', () => {
        // Card 30001 has unique_effect at level 30 with guts bonus (type 6)
        const card = getCardById(30001);
        const ue = card.unique_effect;
        expect(ue).not.toBeNull();

        // At level 50 (>= 30): unique effect should be active
        const slotsHigh = [{ cardId: 30001, level: 50 }, null, null, null, null, null];
        const aggHigh = aggregateDeckEffects(slotsHigh);
        const ueEffectId = ue.effects[0].type;

        // At level 20 (< 30): unique effect should NOT be active
        const slotsLow = [{ cardId: 30001, level: 20 }, null, null, null, null, null];
        const aggLow = aggregateDeckEffects(slotsLow);

        // The high-level aggregation should include the UE bonus
        const diff = (aggHigh[ueEffectId] || 0) - (aggLow[ueEffectId] || 0);
        expect(diff).toBe(ue.effects[0].value);
    });

    test('aggregation is deterministic', () => {
        const slots = buildSlots(FIXTURE_DECK_IDS);
        const agg1 = aggregateDeckEffects(slots);
        const agg2 = aggregateDeckEffects(slots);
        expect(agg1).toEqual(agg2);
    });

    test('level affects effect values', () => {
        const slots50 = buildSlots([FIXTURE_DECK_IDS[0]], 50);
        const slots30 = buildSlots([FIXTURE_DECK_IDS[0]], 30);
        const agg50 = aggregateDeckEffects(slots50);
        const agg30 = aggregateDeckEffects(slots30);
        // Higher level should have higher or equal values
        for (const key of Object.keys(agg50)) {
            expect(agg50[key]).toBeGreaterThanOrEqual(agg30[key] || 0);
        }
    });
});

// ===== getBaseTrainingValues =====

describe('getBaseTrainingValues', () => {
    test('returns values for URA scenario', () => {
        const values = getBaseTrainingValues('speed', '1', 1);
        expect(values).not.toBeNull();
        expect(values.speed).toBeDefined();
        expect(values.energy).toBeDefined();
    });

    test('returns values for Aoharu scenario', () => {
        const values = getBaseTrainingValues('speed', '2', 1);
        expect(values).not.toBeNull();
    });

    test('returns values for Trailblazer scenario', () => {
        const values = getBaseTrainingValues('speed', '4', 1);
        expect(values).not.toBeNull();
    });

    test('higher training level gives higher base values', () => {
        const level1 = getBaseTrainingValues('speed', '1', 1);
        const level5 = getBaseTrainingValues('speed', '1', 5);
        if (level1 && level5) {
            expect(level5.speed).toBeGreaterThanOrEqual(level1.speed);
        }
    });

    test('returns null for invalid training type', () => {
        const values = getBaseTrainingValues('invalid_type', '1', 1);
        expect(values).toBeNull();
    });
});

// ===== calculateTrainingGains =====

describe('calculateTrainingGains', () => {
    function setupDeckState(cardIds) {
        deckBuilderState.slots = cardIds.map((id, i) => ({
            cardId: id,
            level: 50,
            limitBreak: 4,
        }));
        // Assign all cards to speed training
        deckBuilderState.trainingAssignments = {
            speed: cardIds.map(() => true),
            stamina: cardIds.map(() => false),
            power: cardIds.map(() => false),
            guts: cardIds.map(() => false),
            intelligence: cardIds.map(() => false),
        };
        deckBuilderState.scenario = '1';
        deckBuilderState.trainingLevel = 1;
        deckBuilderState.mood = 'very_good';
        deckBuilderState.friendshipTraining = true;
    }

    test('produces non-null result with valid setup', () => {
        setupDeckState(FIXTURE_DECK_IDS);
        const aggregated = aggregateDeckEffects(deckBuilderState.slots);
        const result = calculateTrainingGains('speed', deckBuilderState.slots, aggregated, {
            trainingLevel: 1,
            mood: 'very_good',
            friendshipTraining: true,
            scenario: '1',
        });
        expect(result).not.toBeNull();
        expect(result.speed).toBeGreaterThan(0);
    });

    test('mood affects training gains', () => {
        setupDeckState(FIXTURE_DECK_IDS);
        const aggregated = aggregateDeckEffects(deckBuilderState.slots);
        const opts = { trainingLevel: 1, friendshipTraining: true, scenario: '1' };

        const resultGood = calculateTrainingGains('speed', deckBuilderState.slots, aggregated, { ...opts, mood: 'very_good' });
        const resultBad = calculateTrainingGains('speed', deckBuilderState.slots, aggregated, { ...opts, mood: 'very_bad' });
        expect(resultGood.speed).toBeGreaterThan(resultBad.speed);
    });

    test('no present cards returns minimal gains', () => {
        setupDeckState(FIXTURE_DECK_IDS);
        // Unassign all cards from speed
        deckBuilderState.trainingAssignments.speed = FIXTURE_DECK_IDS.map(() => false);
        const aggregated = aggregateDeckEffects(deckBuilderState.slots);
        const result = calculateTrainingGains('speed', deckBuilderState.slots, aggregated, {
            trainingLevel: 1,
            mood: 'normal',
            friendshipTraining: false,
            scenario: '1',
        });
        expect(result).not.toBeNull();
        expect(result.presentCards.length).toBe(0);
    });
});

// ===== calculateRaceBonusGain =====

describe('calculateRaceBonusGain', () => {
    test('applies race bonus percentage to base gain', () => {
        const result = calculateRaceBonusGain(100, 50);
        expect(result).toBeGreaterThan(100);
    });

    test('zero race bonus returns base gain', () => {
        const result = calculateRaceBonusGain(100, 0);
        expect(result).toBe(100);
    });

    test('handles negative base gain', () => {
        const result = calculateRaceBonusGain(-10, 50);
        expect(typeof result).toBe('number');
    });
});
