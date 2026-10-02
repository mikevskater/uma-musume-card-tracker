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

    test('returns values for Trackblazer scenario', () => {
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

// ===== Conditional unique effects (100-family) =====
//
// Regression coverage for the Tier A conditional UEs calculated from deck
// state (types 103, 105, 111, 113). Fixture cards:
//   30085 Agnes Digital   (power)        103: 5+ distinct types -> +15% TE
//   30088 Satono Diamond  (intelligence) 103: 4+ distinct types -> +10% TE
//   30090 Symboli Rudolf  (stamina)      105: +10 initial stats per 2 types
//   30107 Maruzensky      (speed)        111: level 5+ training -> +8% TE
//   30123 Narita Brian    (power)        111: level 5+ training -> +8% TE (v1.8.2)
//   30052 Light Hello     (friend)       113: friendship training -> -28% energy

describe('conditional unique effects (Tier A)', () => {
    function buildSlots(cardIds, level = 50) {
        const slots = cardIds.map(id => ({ cardId: id, level, limitBreak: 4 }));
        while (slots.length < 6) slots.push(null);
        return slots;
    }

    function setupSlotsWithAssignments(slots, assigned = true) {
        deckBuilderState.slots = slots;
        const len = slots.length;
        deckBuilderState.trainingAssignments = {
            speed: new Array(len).fill(assigned),
            stamina: new Array(len).fill(assigned),
            power: new Array(len).fill(assigned),
            guts: new Array(len).fill(assigned),
            intelligence: new Array(len).fill(assigned),
        };
        deckBuilderState.scenario = '1';
        deckBuilderState.trainingLevel = 1;
        deckBuilderState.mood = 'normal';
        deckBuilderState.friendshipTraining = false;
    }

    // ---- Type 103: TE bonus when deck has N+ distinct card types ----

    test('103 Digital: +15% TE at 5 distinct types, none at 4', () => {
        // 5 distinct: speed, stamina, power (Digital), guts, intelligence
        const slots5 = buildSlots([30002, 30004, 30085, 30001, 30010]);
        expect(getConditionalTrainingEff(slots5, 1)).toBe(15);

        // 4 distinct: duplicate speed, drop stamina
        const slots4 = buildSlots([30002, 30003, 30085, 30001, 30010]);
        expect(getConditionalTrainingEff(slots4, 1)).toBe(0);
    });

    test('103 Digital: bonus flows into per-training TE', () => {
        // 5-type deck (Suzuka's stamina slot) vs the same deck with a second
        // speed card (Teio) — neither speed card nor Seiun Sky carries TE, so
        // the TE delta must be exactly Digital's +15.
        setupSlotsWithAssignments(buildSlots([30002, 30008, 30085, 30001, 30010]));
        const eff5 = computePerTrainingEffects(deckBuilderState.slots).speed.trainingEff;

        setupSlotsWithAssignments(buildSlots([30002, 30003, 30085, 30001, 30010]));
        const eff4 = computePerTrainingEffects(deckBuilderState.slots).speed.trainingEff;

        expect(eff5 - eff4).toBe(15);
    });

    test('103 Diamond: +10% TE at 4 distinct types, none at 3', () => {
        // 4 distinct: speed, stamina, power, intelligence (Diamond)
        const slots4 = buildSlots([30002, 30004, 30005, 30088]);
        expect(getConditionalTrainingEff(slots4, 1)).toBe(10);

        // 3 distinct: duplicate speed
        const slots3 = buildSlots([30002, 30003, 30004, 30088]);
        expect(getConditionalTrainingEff(slots3, 1)).toBe(0);
    });

    test('103: unique effect below unlock level contributes nothing', () => {
        // Digital's UE unlocks at level 30; at level 20 it is inactive
        const slots = buildSlots([30002, 30004, 30085, 30001, 30010], 20);
        expect(getConditionalTrainingEff(slots, 1)).toBe(0);
    });

    // ---- Type 105: initial stat bonus per distinct card types ----

    test('105 Rudolf: +10 initial stats per 2 distinct types (all 5 stats)', () => {
        // 5 distinct types -> floor(5/2)*10 = 20
        const slots5 = buildSlots([30090, 30002, 30005, 30001, 30010]);
        expect(getConditionalInitialStatBonus(slots5)).toBe(20);

        // 4 distinct (Rudolf and Gold Ship both stamina) -> floor(4/2)*10 = 20
        const slots4 = buildSlots([30090, 30002, 30004, 30005, 30001]);
        expect(getConditionalInitialStatBonus(slots4)).toBe(20);

        // 3 distinct -> floor(3/2)*10 = 10
        const slots3 = buildSlots([30090, 30002, 30005]);
        expect(getConditionalInitialStatBonus(slots3)).toBe(10);
    });

    test('105 Rudolf: bonus is folded into calculateAllTraining initial stats', () => {
        setupSlotsWithAssignments(buildSlots([30090, 30002, 30005, 30001, 30010]));
        const { aggregated } = calculateAllTraining();

        // Base aggregation (no 100-family leakage) + the 20-point bonus
        const base = aggregateDeckEffects(deckBuilderState.slots);
        [9, 10, 11, 12, 13].forEach(id => {
            expect(aggregated[id] || 0).toBe((base[id] || 0) + 20);
        });
    });

    // ---- Type 111: TE bonus when training level is high enough ----

    test('111 Maruzensky: +8% TE at training level 5, none at level 4', () => {
        const slots = buildSlots([30107, 30004, 30005, 30001, 30010]);
        expect(getConditionalTrainingEff(slots, 5)).toBe(8);
        expect(getConditionalTrainingEff(slots, 4)).toBe(0);
    });

    test('111 Maruzensky: bonus flows into per-training TE at level 5', () => {
        setupSlotsWithAssignments(buildSlots([30107, 30004, 30005, 30001, 30010]));
        deckBuilderState.trainingLevel = 4;
        const effL4 = computePerTrainingEffects(deckBuilderState.slots).speed.trainingEff;

        deckBuilderState.trainingLevel = 5;
        const effL5 = computePerTrainingEffects(deckBuilderState.slots).speed.trainingEff;

        expect(effL5 - effL4).toBe(8);
    });

    // 30123 (added in the v1.8.2 data refresh) carries the same 111 shape as
    // Maruzensky — +8% TE from facility level 5. Guards against a future
    // extractor change swapping value/value_1 on new cards.
    test('111 Narita Brian: +8% TE at training level 5, none at level 4', () => {
        const slots = buildSlots([30123, 30004, 30005, 30001, 30010]);
        expect(getConditionalTrainingEff(slots, 5)).toBe(8);
        expect(getConditionalTrainingEff(slots, 4)).toBe(0);
    });

    test('111 Narita Brian: bonus flows into per-training TE at level 5', () => {
        setupSlotsWithAssignments(buildSlots([30123, 30004, 30005, 30001, 30010]));
        deckBuilderState.trainingLevel = 4;
        const effL4 = computePerTrainingEffects(deckBuilderState.slots).power.trainingEff;

        deckBuilderState.trainingLevel = 5;
        const effL5 = computePerTrainingEffects(deckBuilderState.slots).power.trainingEff;

        expect(effL5 - effL4).toBe(8);
    });

    // ---- Type 113: energy cost reduction during friendship training ----

    test('113 Light Hello: -28% energy only while friendship training is on', () => {
        // Friend card sits in slot 5
        const slots = buildSlots([30002, 30004, 30005, 30001, 30010, 30052]);
        expect(getConditionalEnergyReduction(slots, true)).toBe(28);
        expect(getConditionalEnergyReduction(slots, false)).toBe(0);
    });

    test('113 Light Hello: energy cost reduced in training gains', () => {
        const slots = buildSlots([30002, 30004, 30005, 30001, 30010, 30052]);
        setupSlotsWithAssignments(slots);
        const aggregated = aggregateDeckEffects(slots);
        // Light Hello also carries a FLAT energy-reduction effect (id 28):
        // -10% at level 50, always active. The 113 UE adds -28% on top,
        // only while friendship training is on.
        expect(aggregated[28]).toBe(10);
        const flatReduction = aggregated[28];

        const resultFT = calculateTrainingGains('speed', slots, aggregated, {
            trainingLevel: 1, mood: 'normal', friendshipTraining: true, scenario: '1',
        });
        const resultNoFT = calculateTrainingGains('speed', slots, aggregated, {
            trainingLevel: 1, mood: 'normal', friendshipTraining: false, scenario: '1',
        });

        expect(resultNoFT.energyReduced).toBe(Math.floor(resultNoFT.energy * (1 - flatReduction / 100)));
        expect(resultFT.energyReduced).toBe(Math.floor(resultFT.energy * (1 - (flatReduction + 28) / 100)));
    });

    // ---- Flat aggregation hygiene ----

    test('aggregateDeckEffects: 100-family UE values do not leak into flat map', () => {
        // Taiki Shuttle (101, value 80 = gauge threshold) at unlocked level
        const slots = buildSlots([30053, 30002, 30004, 30005, 30001, 30010]);
        const agg = aggregateDeckEffects(slots);
        for (const key of Object.keys(agg)) {
            expect(Number(key)).toBeLessThan(100);
        }
    });

    test('aggregateDeckEffects: 100-family card at low level also leaks nothing', () => {
        const slots = buildSlots([30085, 30002, 30004, 30005, 30001, 30010]);
        const agg = aggregateDeckEffects(slots);
        expect(agg[103]).toBeUndefined();
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
