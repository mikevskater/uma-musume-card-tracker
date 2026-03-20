// Deck Builder Manager
// State management, calculations, save/load for Deck Builder

const _logDeckBuilder = _debug.create('DeckBuilder');

// ===== CONSTANTS =====

const DECK_STORAGE_KEY = 'uma_deck_builder_decks';
const DECK_BUILDER_ONBOARDED_KEY = 'uma_deck_onboarded';

// Stat name mapping: training data key -> result array index
const STAT_KEYS = ['speed', 'stamina', 'power', 'guts', 'wisdom', 'skill_pt'];
const STAT_DISPLAY_KEYS = ['speed', 'stamina', 'power', 'guts', 'wit', 'skillPts'];

// Effect ID -> stat index mapping for stat bonuses
const STAT_BONUS_INDEX_MAP = {
    3: 0,   // Speed Bonus -> speed
    4: 1,   // Stamina Bonus -> stamina
    5: 2,   // Power Bonus -> power
    6: 3,   // Guts Bonus -> guts
    7: 4,   // Wit Bonus -> wisdom
    30: 5   // Skill Pt Bonus -> skill_pt
};

// Reverse: stat key -> effect ID
const STAT_TO_EFFECT_ID = {
    speed: 3, stamina: 4, power: 5, guts: 6, wisdom: 7, skill_pt: 30
};

// Card type -> which training they appear at
const CARD_TYPE_TRAINING_MAP = {
    speed: 'speed',
    stamina: 'stamina',
    power: 'power',
    guts: 'guts',
    intelligence: 'intelligence'
    // friend: appears at any (user toggle)
};

const MOOD_VALUES = {
    very_good: 0.20,
    good: 0.10,
    normal: 0.00,
    bad: -0.10,
    very_bad: -0.20
};

// ===== STATE =====

let deckBuilderState = {
    initialized: false,
    activeSlot: null,
    pickerOpen: false,
    slots: [null, null, null, null, null, null],
    deckName: 'New Deck',
    savedDecks: [],
    activeDeckId: null,
    previewMode: false,       // True when viewing an unsaved finder result
    dirty: false,             // True when there are unsaved changes
    _snapshot: null,          // Snapshot to revert to on Cancel
    pickerFilter: {
        types: ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'],
        search: '',
        ssrOnly: false,
        sortBy: 'effect_15',
        sortDirection: 'desc'
    },
    scenario: '1',      // Default to URA; '1'=URA, '2'=Aoharu, '4'=Trackblazer
    trainingLevel: 1,
    mood: 'very_good',
    friendshipTraining: true,
    selectedCharacter: null,
    // Per-training card assignments: which slot indices are present at each training
    // Default: all cards present at all trainings (user toggles to exclude)
    trainingAssignments: {
        speed: [true, true, true, true, true, true],
        stamina: [true, true, true, true, true, true],
        power: [true, true, true, true, true, true],
        guts: [true, true, true, true, true, true],
        intelligence: [true, true, true, true, true, true]
    }
};

// ===== DATA-DRIVEN TRAINING LOOKUPS =====

/**
 * Get base training values for a training type at a given facility level from loaded data.
 * Returns {speed, stamina, power, guts, wisdom, skill_pt, energy} or null.
 */
function getBaseTrainingValues(trainingType, scenarioId, trainingLevel) {
    const scenario = trainingData?.scenarios?.[scenarioId];
    if (!scenario) return null;

    const training = scenario.training[trainingType];
    if (!training) return null;

    const lvl = String(trainingLevel || 1);
    const base = training[lvl] || training['1'];
    if (!base) return null;

    return {
        speed: base.speed || 0,
        stamina: base.stamina || 0,
        power: base.power || 0,
        guts: base.guts || 0,
        wisdom: base.wisdom || 0,
        skill_pt: base.skill_pt || 0,
        energy: base.energy || 0
    };
}

/**
 * Derive which stat bonus effect IDs apply at a given training type.
 * A stat bonus applies if the base training has a non-zero value for that stat.
 */
function getApplicableBonusIds(trainingType, scenarioId, trainingLevel) {
    const base = getBaseTrainingValues(trainingType, scenarioId, trainingLevel);
    if (!base) return [];

    const ids = [];
    for (const [statKey, effectId] of Object.entries(STAT_TO_EFFECT_ID)) {
        if (base[statKey] > 0) {
            ids.push(effectId);
        }
    }
    // Skill point bonus always applies
    if (!ids.includes(30)) ids.push(30);
    return ids;
}

/**
 * Get available scenario options from loaded data.
 */
function getAvailableScenarios() {
    if (!scenarioData?.scenarios) return [];
    return Object.entries(scenarioData.scenarios).map(([id, data]) => ({
        id,
        name: data.name,
        turnCount: data.turn_count
    }));
}

// ===== INITIALIZATION =====

function initializeDeckBuilder() {
    if (deckBuilderState.initialized) return;

    loadSavedDecks();
    renderDeckBuilderShell();
    initializeDeckBuilderEvents();

    if (deckBuilderState.savedDecks.length > 0) {
        const lastDeckId = deckBuilderState.activeDeckId || deckBuilderState.savedDecks[0].id;
        switchToDeck(lastDeckId);
    } else {
        snapshotDeckState();
    }

    renderDeckSelect();

    deckBuilderState.initialized = true;
    _logDeckBuilder.info('Deck Builder initialized');
    console.log('Deck Builder initialized');
}

// ===== TAB SWITCHING =====

function switchAppTab(tabId) {
    _logDeckBuilder.info('switchAppTab', { tabId });
    document.querySelectorAll('.app-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
        btn.setAttribute('aria-selected', btn.dataset.tab === tabId ? 'true' : 'false');
    });

    document.querySelectorAll('.app-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.tab === tabId);
    });

    if (tabId === 'deckbuilder' && !deckBuilderState.initialized) {
        initializeDeckBuilder();
    }
}

// ===== SLOT MANAGEMENT =====

function setDeckSlot(slotIndex, cardId, level, lb) {
    _logDeckBuilder.info('setDeckSlot', { slotIndex, cardId, level, lb });
    deckBuilderState.slots[slotIndex] = {
        cardId: cardId,
        level: level,
        limitBreak: lb,
        isFriend: slotIndex === 5
    };

    // Reset training assignments for this slot (default: present everywhere)
    resetSlotAssignments(slotIndex, true);

    renderDeckSlots();
    recalculateDeck();
    markDeckDirty();
}

function removeDeckSlot(slotIndex) {
    _logDeckBuilder.info('removeDeckSlot', { slotIndex });
    deckBuilderState.slots[slotIndex] = null;
    resetSlotAssignments(slotIndex, false);
    renderDeckSlots();
    recalculateDeck();
    markDeckDirty();
}

// ===== CARD PICKER =====

// Track the element that triggered a modal so focus can return on close
let _pickerTriggerEl = null;

function openCardPicker(slotIndex) {
    _logDeckBuilder.info('openCardPicker', { slotIndex });
    _pickerTriggerEl = document.activeElement;
    deckBuilderState.activeSlot = slotIndex;
    deckBuilderState.pickerOpen = true;
    deckBuilderState.pickerFilter.search = '';
    renderCardPicker();
}

function closeCardPicker() {
    _logDeckBuilder.debug('closeCardPicker');
    deckBuilderState.pickerOpen = false;
    deckBuilderState.activeSlot = null;

    const overlay = document.getElementById('deckPickerOverlay');

    if (overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    }

    // Return focus to trigger element
    if (_pickerTriggerEl && _pickerTriggerEl.focus) {
        _pickerTriggerEl.focus();
        _pickerTriggerEl = null;
    }
}

function selectCardForSlot(slotIndex, cardId) {
    _logDeckBuilder.info('selectCardForSlot', { slotIndex, cardId });
    const card = cardData.find(c => c.support_id === cardId);
    if (!card) return;

    const isFriend = slotIndex === 5;
    let level, lb;

    if (isFriend) {
        lb = 4;
        level = limitBreaks[card.rarity][lb];
    } else if (isCardOwned(cardId)) {
        level = getOwnedCardLevel(cardId);
        lb = getOwnedCardLimitBreak(cardId);
    } else {
        lb = 4;
        level = limitBreaks[card.rarity][lb];
    }

    setDeckSlot(slotIndex, cardId, level, lb);
    closeCardPicker();
    showToast(`Added ${card.char_name || 'card'} to ${isFriend ? 'Friend slot' : 'Slot ' + (slotIndex + 1)}`, 'success');

    // Brief highlight on the filled slot
    requestAnimationFrame(() => {
        const slotEl = document.querySelector(`.deck-slot[data-slot-index="${slotIndex}"]`);
        if (slotEl) {
            slotEl.classList.add('deck-slot-placed');
            setTimeout(() => slotEl.classList.remove('deck-slot-placed'), 800);
        }
    });
}

// ===== EFFECT AGGREGATION =====

function aggregateDeckEffects(slots) {
    _logDeckBuilder.debug('aggregateDeckEffects', { slotCount: slots.filter(s => s !== null).length });
    const aggregated = {};

    slots.forEach(slot => {
        if (!slot) return;

        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card || !card.effects) return;

        card.effects.forEach(effectArray => {
            const effectId = effectArray[0];
            if (!effectId) return;

            const value = calculateEffectValue(effectArray, slot.level);
            if (value > 0) {
                aggregated[effectId] = (aggregated[effectId] || 0) + value;
            }
        });
    });

    return aggregated;
}

// ===== TRAINING CALCULATIONS =====

function calculateTrainingGains(trainingType, slots, aggregated, options) {
    const { trainingLevel, mood, friendshipTraining, scenario } = options;
    const scenarioId = scenario || '1';

    const baseValues = getBaseTrainingValues(trainingType, scenarioId, trainingLevel);
    if (!baseValues) return null;

    // Build base array: [speed, stamina, power, guts, wisdom, skill_pt]
    const base = [
        baseValues.speed, baseValues.stamina, baseValues.power,
        baseValues.guts, baseValues.wisdom, baseValues.skill_pt
    ];
    const energy = baseValues.energy;

    // Find which cards are present at this training (from user assignments)
    const assignments = deckBuilderState.trainingAssignments[trainingType];
    const presentCards = [];
    const presentSlots = [];

    slots.forEach((slot, idx) => {
        if (!slot) return;
        if (!assignments[idx]) return;
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card) return;

        presentCards.push(card.type);
        presentSlots.push(slot);
    });

    const supportCount = presentCards.length;

    // Calculate stat bonuses from present cards only
    const statBonuses = [0, 0, 0, 0, 0, 0];
    const applicableBonusIds = getApplicableBonusIds(trainingType, scenarioId, trainingLevel);

    presentSlots.forEach(slot => {
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card || !card.effects) return;

        card.effects.forEach(effectArray => {
            const effectId = effectArray[0];
            if (applicableBonusIds.includes(effectId) && STAT_BONUS_INDEX_MAP[effectId] !== undefined) {
                const value = calculateEffectValue(effectArray, slot.level);
                if (value > 0) {
                    statBonuses[STAT_BONUS_INDEX_MAP[effectId]] += value;
                }
            }
        });
    });

    // Training Effectiveness and Mood Effect -- only from present cards
    let trainingEff = 0;
    let moodEffect = 0;
    presentSlots.forEach(slot => {
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card || !card.effects) return;
        card.effects.forEach(effectArray => {
            if (effectArray[0] === 8) {
                const val = calculateEffectValue(effectArray, slot.level);
                if (val > 0) trainingEff += val;
            } else if (effectArray[0] === 2) {
                const val = calculateEffectValue(effectArray, slot.level);
                if (val > 0) moodEffect += val;
            }
        });
    });

    const moodBase = MOOD_VALUES[mood] || 0;
    const moodMultiplier = 1 + moodBase * (1 + moodEffect / 100);
    const trainingEffMultiplier = 1 + trainingEff / 100;

    // Support count multiplier
    const supportMultiplier = 1 + 0.05 * supportCount;

    // Friendship multiplier
    let friendshipMultiplier = 1;
    if (friendshipTraining && supportCount > 0) {
        presentSlots.forEach(slot => {
            const card = cardData.find(c => c.support_id === slot.cardId);
            if (!card || !card.effects) return;

            const isMatchingType = card.type === 'friend' || CARD_TYPE_TRAINING_MAP[card.type] === trainingType;
            if (!isMatchingType) return;

            card.effects.forEach(effectArray => {
                if (effectArray[0] === 1) {
                    const val = calculateEffectValue(effectArray, slot.level);
                    if (val > 0) {
                        friendshipMultiplier *= (1 + val / 100);
                    }
                }
            });
        });
    }

    // Growth rate multiplier from selected character
    const growthRates = getSelectedCharacterGrowthRates();

    // Calculate final stat gains
    const result = {
        speed: 0, stamina: 0, power: 0, guts: 0, wit: 0, skillPts: 0, energy: energy,
        presentCards: presentCards
    };

    // Growth rate indices: speed, stamina, power, guts, wisdom (not skill_pt)
    const growthKeys = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
    const resultKeys = ['speed', 'stamina', 'power', 'guts', 'wit', 'skillPts'];
    for (let i = 0; i < 6; i++) {
        const statBase = base[i] + statBonuses[i];
        if (statBase > 0) {
            let gain = statBase * moodMultiplier * trainingEffMultiplier * supportMultiplier * friendshipMultiplier;
            // Apply growth rate for stats (not skill_pt)
            if (i < 5 && growthRates) {
                gain *= (1 + growthRates[growthKeys[i]] / 100);
            }
            result[resultKeys[i]] = Math.floor(gain);
        }
    }

    // Apply energy cost reduction (deck-wide effect ID 28)
    if (energy < 0) {
        const energyReduction = aggregated[28] || 0;
        if (energyReduction > 0) {
            result.energyReduced = Math.floor(energy * (1 - energyReduction / 100));
        }
    }

    return result;
}

function calculateAllTraining() {
    const aggregated = aggregateDeckEffects(deckBuilderState.slots);
    const options = {
        trainingLevel: deckBuilderState.trainingLevel,
        mood: deckBuilderState.mood,
        friendshipTraining: deckBuilderState.friendshipTraining,
        scenario: deckBuilderState.scenario
    };

    const results = {};
    ['speed', 'stamina', 'power', 'guts', 'intelligence'].forEach(type => {
        results[type] = calculateTrainingGains(type, deckBuilderState.slots, aggregated, options);
    });

    return { aggregated, results };
}

function computePerTrainingEffects(slots) {
    const trainingTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    const scenarioId = deckBuilderState.scenario || '1';
    const perTraining = {};

    trainingTypes.forEach(trainingType => {
        const assignments = deckBuilderState.trainingAssignments[trainingType];
        const presentSlots = [];
        const presentCardTypes = [];
        slots.forEach((slot, idx) => {
            if (!slot) return;
            if (!assignments[idx]) return;
            const card = cardData.find(c => c.support_id === slot.cardId);
            if (!card) return;
            presentSlots.push(slot);
            presentCardTypes.push(card.type);
        });

        const statBonuses = [0, 0, 0, 0, 0, 0];
        const applicableBonusIds = getApplicableBonusIds(trainingType, scenarioId, deckBuilderState.trainingLevel);
        let trainingEff = 0;
        let moodEffect = 0;
        let friendshipMultiplier = 1;

        presentSlots.forEach(slot => {
            const card = cardData.find(c => c.support_id === slot.cardId);
            if (!card || !card.effects) return;
            const isMatchingType = card.type === 'friend' || CARD_TYPE_TRAINING_MAP[card.type] === trainingType;
            card.effects.forEach(eff => {
                const id = eff[0];
                const val = calculateEffectValue(eff, slot.level);
                if (val <= 0) return;

                if (id === 8) trainingEff += val;
                else if (id === 2) moodEffect += val;
                else if (id === 1 && isMatchingType) friendshipMultiplier *= (1 + val / 100);
                else if (applicableBonusIds.includes(id) && STAT_BONUS_INDEX_MAP[id] !== undefined) {
                    statBonuses[STAT_BONUS_INDEX_MAP[id]] += val;
                }
            });
        });

        perTraining[trainingType] = {
            supportCount: presentSlots.length,
            presentCardTypes,
            statBonuses,
            applicableBonusIds,
            trainingEff,
            moodEffect,
            friendshipMultiplier
        };
    });

    return perTraining;
}

function recalculateDeck() {
    _logDeckBuilder.time('recalculateDeck');
    const { aggregated, results } = calculateAllTraining();
    const perTraining = computePerTrainingEffects(deckBuilderState.slots);
    const uniqueEffects = aggregateUniqueEffects(deckBuilderState.slots);
    const deckSkills = aggregateDeckSkills(deckBuilderState.slots);
    const failureRates = getTrainingFailureRates();

    renderDeckSummary(aggregated, perTraining);
    renderTrainingBreakdown(results, aggregated, failureRates);
    renderScenarioInfo(aggregated);
    renderUniqueEffectsSection(uniqueEffects);
    renderDeckSkillsSection(deckSkills);
    renderCharacterInfoSection();
    _logDeckBuilder.timeEnd('recalculateDeck');
}

// ===== TRAINING ASSIGNMENTS =====

function resetSlotAssignments(slotIndex, present) {
    const types = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    types.forEach(type => {
        deckBuilderState.trainingAssignments[type][slotIndex] = present;
    });
}

function resetAllAssignments() {
    const types = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    types.forEach(type => {
        deckBuilderState.trainingAssignments[type] = [true, true, true, true, true, true];
    });
}

function openTrainingAssignmentModal(trainingType) {
    renderTrainingAssignmentModal(trainingType);
}

function saveTrainingAssignment(trainingType, assignments) {
    _logDeckBuilder.info('saveTrainingAssignment', { trainingType, assignments });
    deckBuilderState.trainingAssignments[trainingType] = [...assignments];
    recalculateDeck();
}

// Race bonus stat gain calculation — correct formula
// actual_gain = floor(base_gain × (1 + race_bonus / 100))
function calculateRaceBonusGain(baseGain, raceBonusPct) {
    return Math.floor(baseGain * (1 + raceBonusPct / 100));
}

// Race stat gains — loaded from training_config.json race_stat_rewards
function getRaceBonusTable(scenarioId) {
    const rsr = trainingConfigData?.race_stat_rewards;
    if (!rsr) return [];

    // Find the group whose scenario_ids contains our scenarioId
    for (const group of Object.values(rsr)) {
        if (group.scenario_ids && group.scenario_ids.includes(scenarioId)) {
            return group.races.map(r => ({
                label: r.label,
                baseStats: r.base_stats,
                baseSkillPt: r.base_skill_pt,
                allStats: r.all_stats,
                note: r.notes || ''
            }));
        }
    }
    // Fallback to standard
    if (rsr.standard) {
        return rsr.standard.races.map(r => ({
            label: r.label,
            baseStats: r.base_stats,
            baseSkillPt: r.base_skill_pt,
            allStats: r.all_stats,
            note: r.notes || ''
        }));
    }
    return [];
}

// ===== CHARACTER SELECTION =====

function getSelectedCharacterGrowthRates() {
    const charId = deckBuilderState.selectedCharacter;
    if (!charId || !charactersData || !charactersData[charId]) return null;
    return charactersData[charId].growth_rates;
}

function getSelectedCharacterData() {
    const charId = deckBuilderState.selectedCharacter;
    if (!charId || !charactersData || !charactersData[charId]) return null;
    return charactersData[charId];
}

// ===== UNIQUE EFFECTS AGGREGATION =====

function aggregateUniqueEffects(slots) {
    const effects = [];
    slots.forEach(slot => {
        if (!slot) return;
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card || !card.unique_effect) return;
        const ue = card.unique_effect;
        effects.push({
            cardName: card.char_name || 'Unknown',
            cardId: card.support_id,
            name: ue.name,
            description: ue.description,
            unlockLevel: ue.level,
            active: slot.level >= ue.level,
            effects: ue.effects || [],
            cardLevel: slot.level
        });
    });
    return effects;
}

// ===== DECK SKILLS AGGREGATION =====

function aggregateDeckSkills(slots) {
    const hintSkills = new Map();
    const eventSkills = new Map();

    slots.forEach(slot => {
        if (!slot) return;
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card) return;

        // Hint skills
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                if (!skill.id) return;
                if (!hintSkills.has(skill.id)) {
                    const fullSkill = skillsData[skill.id];
                    hintSkills.set(skill.id, {
                        id: skill.id,
                        name: skill.name || fullSkill?.name || `Skill ${skill.id}`,
                        type: skill.type || fullSkill?.type || [],
                        description: skill.description || fullSkill?.description || '',
                        cost: fullSkill?.cost || null,
                        sources: [card.char_name]
                    });
                } else {
                    hintSkills.get(skill.id).sources.push(card.char_name);
                }
            });
        }

        // Event skills
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                if (!skill.id) return;
                if (!eventSkills.has(skill.id)) {
                    const fullSkill = skillsData[skill.id];
                    eventSkills.set(skill.id, {
                        id: skill.id,
                        name: skill.name || fullSkill?.name || `Skill ${skill.id}`,
                        type: skill.type || fullSkill?.type || [],
                        description: skill.description || fullSkill?.description || '',
                        cost: fullSkill?.cost || null,
                        sources: [card.char_name]
                    });
                } else {
                    eventSkills.get(skill.id).sources.push(card.char_name);
                }
            });
        }
    });

    return {
        hintSkills: Array.from(hintSkills.values()),
        eventSkills: Array.from(eventSkills.values()),
        totalUnique: hintSkills.size + eventSkills.size
    };
}

// ===== FAILURE RATE =====

function getTrainingFailureRates() {
    if (!trainingConfigData?.training_failure) return null;
    const level = String(deckBuilderState.trainingLevel);
    const aggregated = aggregateDeckEffects(deckBuilderState.slots);
    const failProt = aggregated[27] || 0;

    const COMMAND_IDS = { speed: '101', power: '102', guts: '103', stamina: '105', intelligence: '106' };
    const rates = {};
    for (const [type, cmdId] of Object.entries(COMMAND_IDS)) {
        const data = trainingConfigData.training_failure[cmdId];
        if (!data || !data[level]) continue;
        const baseRate = data[level].failure_rate / 100; // permyriad to percent
        const effectiveRate = failProt > 0
            ? Math.floor(baseRate * (1 - failProt / 100) * 100) / 100
            : baseRate;
        rates[type] = { baseRate, effectiveRate, maxChara: data[level].max_chara };
    }
    return rates;
}

// ===== SAVE/LOAD =====

function loadSavedDecks() {
    try {
        const stored = localStorage.getItem(DECK_STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            deckBuilderState.savedDecks = data.decks || [];
            deckBuilderState.activeDeckId = data.activeDeckId || null;
            _logDeckBuilder.info('Loaded saved decks', { count: deckBuilderState.savedDecks.length });
        }
    } catch (error) {
        console.error('Error loading saved decks:', error);
        _logDeckBuilder.error('Error loading saved decks', error);
        deckBuilderState.savedDecks = [];
    }
}

function saveDeckToStorage() {
    try {
        if (deckBuilderState.activeDeckId) {
            const deck = deckBuilderState.savedDecks.find(d => d.id === deckBuilderState.activeDeckId);
            if (deck) {
                deck.slots = [...deckBuilderState.slots];
                deck.name = deckBuilderState.deckName;
                deck.selectedCharacter = deckBuilderState.selectedCharacter || null;
                deck.lastModified = Date.now();
            }
        }

        const data = {
            decks: deckBuilderState.savedDecks,
            activeDeckId: deckBuilderState.activeDeckId
        };
        localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(data));
        // Show brief save indicator
        const indicator = document.getElementById('deckSaveIndicator');
        if (indicator) {
            indicator.textContent = 'Saved';
            indicator.classList.add('visible');
            clearTimeout(indicator._hideTimeout);
            indicator._hideTimeout = setTimeout(() => indicator.classList.remove('visible'), 1500);
        }
    } catch (error) {
        console.error('Error saving decks:', error);
        showToast('Failed to save deck.', 'error');
    }
}

// Auto-save removed — saving is now explicit via Save button.
// Function kept for API compatibility but does nothing.
function debouncedSaveDeck() {}

function createNewDeck(name) {
    _logDeckBuilder.info('createNewDeck', { name });
    const deckId = 'deck_' + Date.now();
    const carrySlots = deckBuilderState.slots.some(s => s !== null)
        ? [...deckBuilderState.slots]
        : [null, null, null, null, null, null];
    const newDeck = {
        id: deckId,
        name: name || 'New Deck',
        slots: carrySlots,
        selectedCharacter: deckBuilderState.selectedCharacter || null,
        lastModified: Date.now()
    };

    deckBuilderState.savedDecks.push(newDeck);
    switchToDeck(deckId);
    saveDeckToStorage();    // Persist the new deck immediately
    renderDeckSelect();
    snapshotDeckState();
    updateDeckHeaderButtons();
    showToast(`Created deck "${newDeck.name}"`, 'success');
}

function deleteDeck(deckId) {
    _logDeckBuilder.info('deleteDeck', { deckId });
    const idx = deckBuilderState.savedDecks.findIndex(d => d.id === deckId);
    if (idx < 0) return;

    const deckName = deckBuilderState.savedDecks[idx].name;
    deckBuilderState.savedDecks.splice(idx, 1);

    if (deckBuilderState.activeDeckId === deckId) {
        if (deckBuilderState.savedDecks.length > 0) {
            switchToDeck(deckBuilderState.savedDecks[0].id);
        } else {
            deckBuilderState.activeDeckId = null;
            deckBuilderState.deckName = 'New Deck';
            deckBuilderState.slots = [null, null, null, null, null, null];
            renderDeckSlots();
            recalculateDeck();
            snapshotDeckState();
            updateDeckHeaderButtons();
        }
    }

    saveDeckToStorage();
    renderDeckSelect();
    showToast(`Deleted deck "${deckName}"`, 'success');
}

// ===== UNSAVED CHANGES / PREVIEW MODE =====

// Snapshot the current saved state so Cancel can revert to it
function snapshotDeckState() {
    deckBuilderState._snapshot = {
        slots: deckBuilderState.slots.map(s => s ? { ...s } : null),
        activeDeckId: deckBuilderState.activeDeckId,
        deckName: deckBuilderState.deckName,
        selectedCharacter: deckBuilderState.selectedCharacter
    };
    deckBuilderState.dirty = false;
}

function markDeckDirty() {
    deckBuilderState.dirty = true;
    updateDeckHeaderButtons();
}

function enterPreviewMode(slots, selectedCharacter) {
    _logDeckBuilder.info('enterPreviewMode');
    // Snapshot so Cancel reverts to whatever was active before
    snapshotDeckState();

    deckBuilderState.previewMode = true;
    deckBuilderState.dirty = false;
    deckBuilderState.activeDeckId = null;
    deckBuilderState.deckName = '';
    deckBuilderState.slots = slots;
    deckBuilderState.selectedCharacter = selectedCharacter || null;
    resetAllAssignments();

    if (typeof updateCharacterPickLabel === 'function') updateCharacterPickLabel();
    renderDeckSlots();
    recalculateDeck();
    renderDeckSelect();
    updateDeckHeaderButtons();
}

function saveDeckChanges() {
    _logDeckBuilder.info('saveDeckChanges');

    if (deckBuilderState.previewMode || !deckBuilderState.activeDeckId) {
        // No saved deck — prompt for a name and create one
        const name = prompt('Enter deck name:', 'New Deck');
        if (name === null || !name.trim()) return;

        deckBuilderState.previewMode = false;
        createNewDeck(name.trim());
    } else {
        // Save changes to the existing deck
        saveDeckToStorage();
    }

    snapshotDeckState();
    updateDeckHeaderButtons();
}

function cancelDeckChanges() {
    _logDeckBuilder.info('cancelDeckChanges');
    const snapshot = deckBuilderState._snapshot;

    deckBuilderState.previewMode = false;
    deckBuilderState.dirty = false;

    if (snapshot && snapshot.activeDeckId) {
        // Reload the saved deck from storage (source of truth)
        switchToDeck(snapshot.activeDeckId);
    } else if (snapshot) {
        // No saved deck was active — restore empty/snapshot state
        deckBuilderState.slots = snapshot.slots;
        deckBuilderState.activeDeckId = null;
        deckBuilderState.deckName = snapshot.deckName;
        deckBuilderState.selectedCharacter = snapshot.selectedCharacter;
        resetAllAssignments();

        if (typeof updateCharacterPickLabel === 'function') updateCharacterPickLabel();
        renderDeckSlots();
        recalculateDeck();
        renderDeckSelect();
        snapshotDeckState();
        updateDeckHeaderButtons();
    }

    showToast('Changes discarded', 'info');
}

function updateDeckHeaderButtons() {
    const saveBtn = document.getElementById('deckSavePreviewBtn');
    const cancelBtn = document.getElementById('deckCancelPreviewBtn');
    const indicator = document.getElementById('deckPreviewIndicator');

    const showSaveCancel = deckBuilderState.previewMode || deckBuilderState.dirty;

    if (saveBtn) saveBtn.style.display = showSaveCancel ? '' : 'none';
    if (cancelBtn) cancelBtn.style.display = showSaveCancel ? '' : 'none';

    if (indicator) {
        if (deckBuilderState.previewMode) {
            indicator.style.display = '';
            indicator.textContent = 'Preview';
        } else if (deckBuilderState.dirty) {
            indicator.style.display = '';
            indicator.textContent = 'Unsaved';
        } else {
            indicator.style.display = 'none';
        }
    }
}

function renameDeck(deckId, newName) {
    _logDeckBuilder.info('renameDeck', { deckId, newName });
    const deck = deckBuilderState.savedDecks.find(d => d.id === deckId);
    if (!deck) return;

    deck.name = newName;
    if (deckBuilderState.activeDeckId === deckId) {
        deckBuilderState.deckName = newName;
    }

    saveDeckToStorage();
    renderDeckSelect();
    showToast(`Deck renamed to "${newName}"`, 'success');
}

function switchToDeck(deckId) {
    _logDeckBuilder.info('switchToDeck', { deckId });
    const deck = deckBuilderState.savedDecks.find(d => d.id === deckId);
    if (!deck) return;

    deckBuilderState.activeDeckId = deckId;
    deckBuilderState.deckName = deck.name;
    deckBuilderState.slots = deck.slots ? [...deck.slots] : [null, null, null, null, null, null];
    deckBuilderState.selectedCharacter = deck.selectedCharacter || null;
    deckBuilderState.previewMode = false;
    resetAllAssignments();

    // Update character picker button label to match restored state
    if (typeof updateCharacterPickLabel === 'function') updateCharacterPickLabel();

    renderDeckSlots();
    recalculateDeck();
    renderDeckSelect();
    snapshotDeckState();
    updateDeckHeaderButtons();

    // Brief highlight animation on deck switch
    const slotsContainer = document.getElementById('deckSlots');
    if (slotsContainer) {
        slotsContainer.classList.add('deck-switch-flash');
        setTimeout(() => slotsContainer.classList.remove('deck-switch-flash'), 600);
    }
}

// ===== DECK BUILDER EVENTS =====

function initializeDeckBuilderEvents() {
    const newBtn = document.getElementById('deckNewBtn');
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            const name = prompt('Enter deck name:', 'New Deck');
            if (name !== null && name.trim()) {
                createNewDeck(name.trim());
            }
        });
    }

    const renameBtn = document.getElementById('deckRenameBtn');
    if (renameBtn) {
        renameBtn.addEventListener('click', () => {
            if (!deckBuilderState.activeDeckId) {
                showToast('Create a deck first.', 'warning');
                return;
            }
            const name = prompt('Enter new deck name:', deckBuilderState.deckName);
            if (name !== null && name.trim()) {
                renameDeck(deckBuilderState.activeDeckId, name.trim());
            }
        });
    }

    const findBestBtn = document.getElementById('deckFindBestBtn');
    if (findBestBtn) {
        findBestBtn.addEventListener('click', () => {
            openDeckFinder();
        });
    }

    const deleteBtn = document.getElementById('deckDeleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!deckBuilderState.activeDeckId) {
                showToast('No deck to delete.', 'warning');
                return;
            }
            const confirmed = await showConfirmDialog(
                'Delete Deck',
                `Delete "${deckBuilderState.deckName}"? This cannot be undone.`,
                { confirmLabel: 'Delete', destructive: true }
            );
            if (confirmed) deleteDeck(deckBuilderState.activeDeckId);
        });
    }

    const savePreviewBtn = document.getElementById('deckSavePreviewBtn');
    if (savePreviewBtn) {
        savePreviewBtn.addEventListener('click', () => saveDeckChanges());
    }

    const cancelPreviewBtn = document.getElementById('deckCancelPreviewBtn');
    if (cancelPreviewBtn) {
        cancelPreviewBtn.addEventListener('click', () => cancelDeckChanges());
    }

    const deckSelect = document.getElementById('deckSelect');
    if (deckSelect) {
        deckSelect.addEventListener('change', (e) => {
            const deckId = e.target.value;
            if (deckId !== 'default' && deckId !== 'preview') {
                // switchToDeck handles clearing preview/dirty state
                switchToDeck(deckId);
            }
        });
    }

    // Scenario selector
    const scenarioSelect = document.getElementById('scenarioSelect');
    if (scenarioSelect) {
        scenarioSelect.addEventListener('change', (e) => {
            _logDeckBuilder.info('Scenario changed', { scenario: e.target.value });
            deckBuilderState.scenario = e.target.value;
            recalculateDeck();
        });
    }

    // Character selector
    const characterPickBtn = document.getElementById('characterPickBtn');
    if (characterPickBtn) {
        characterPickBtn.addEventListener('click', () => {
            openTraineePicker(deckBuilderState.selectedCharacter, (selectedId) => {
                _logDeckBuilder.info('Character changed', { character: selectedId || null });
                deckBuilderState.selectedCharacter = selectedId || null;
                updateCharacterPickLabel();
                recalculateDeck();
                if (selectedId && typeof charactersData !== 'undefined' && charactersData[selectedId]) {
                    const charName = charactersData[selectedId].name || selectedId;
                    showToast(`Selected ${charName}`, 'success');
                }
            });
        });
    }

    // Facility level buttons (arrow key navigation)
    const facilityContainer = document.getElementById('facilityLevelBtns');
    if (facilityContainer) {
        const facilityBtns = [...facilityContainer.querySelectorAll('.facility-level-btn')];
        facilityContainer.setAttribute('role', 'radiogroup');
        facilityContainer.setAttribute('aria-label', 'Facility level');
        facilityBtns.forEach((btn, i) => {
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', btn.classList.contains('active') ? 'true' : 'false');
            btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
            btn.addEventListener('click', () => {
                _logDeckBuilder.info('Training level changed', { level: btn.dataset.level });
                deckBuilderState.trainingLevel = parseInt(btn.dataset.level);
                facilityBtns.forEach(b => {
                    b.classList.toggle('active', b === btn);
                    b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
                    b.setAttribute('tabindex', b === btn ? '0' : '-1');
                });
                recalculateDeck();
            });
            btn.addEventListener('keydown', (e) => {
                let next = -1;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    next = (i + 1) % facilityBtns.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    next = (i - 1 + facilityBtns.length) % facilityBtns.length;
                }
                if (next >= 0) {
                    e.preventDefault();
                    facilityBtns[next].click();
                    facilityBtns[next].focus();
                }
            });
        });
    }

    // Mood buttons (radio group pattern with arrow key navigation)
    const moodBtnRow = document.getElementById('moodBtnRow');
    if (moodBtnRow) {
        const moodBtns = [...moodBtnRow.querySelectorAll('.mood-btn')];
        moodBtnRow.setAttribute('role', 'radiogroup');
        moodBtnRow.setAttribute('aria-label', 'Mood selection');
        moodBtns.forEach((btn, i) => {
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', btn.classList.contains('active') ? 'true' : 'false');
            btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
            btn.addEventListener('click', () => {
                const mood = btn.dataset.mood;
                _logDeckBuilder.info('Mood changed', { mood });
                deckBuilderState.mood = mood;
                moodBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                    b.setAttribute('tabindex', '-1');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                btn.setAttribute('tabindex', '0');
                recalculateDeck();
            });
            btn.addEventListener('keydown', (e) => {
                let next = -1;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    next = (i + 1) % moodBtns.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    next = (i - 1 + moodBtns.length) % moodBtns.length;
                }
                if (next >= 0) {
                    e.preventDefault();
                    moodBtns[next].click();
                    moodBtns[next].focus();
                }
            });
        });
    }

    // Friendship toggle
    const friendshipToggle = document.getElementById('friendshipToggle');
    if (friendshipToggle) {
        friendshipToggle.addEventListener('change', (e) => {
            _logDeckBuilder.info('Friendship training toggled', { enabled: e.target.checked });
            deckBuilderState.friendshipTraining = e.target.checked;
            recalculateDeck();
        });
    }
}

// ===== EXPORTS =====

window.DeckBuilderManager = {
    deckBuilderState,
    initializeDeckBuilder,
    switchAppTab,
    setDeckSlot,
    removeDeckSlot,
    openCardPicker,
    closeCardPicker,
    selectCardForSlot,
    aggregateDeckEffects,
    calculateTrainingGains,
    calculateAllTraining,
    computePerTrainingEffects,
    recalculateDeck,
    loadSavedDecks,
    saveDeckToStorage,
    createNewDeck,
    deleteDeck,
    renameDeck,
    switchToDeck,
    getAvailableScenarios,
    getBaseTrainingValues,
    getApplicableBonusIds,
    aggregateUniqueEffects,
    aggregateDeckSkills,
    getSelectedCharacterData,
    getSelectedCharacterGrowthRates,
    getTrainingFailureRates,
    DECK_STORAGE_KEY,
    getRaceBonusTable
};

Object.assign(window, {
    deckBuilderState,
    initializeDeckBuilder,
    switchAppTab,
    setDeckSlot,
    removeDeckSlot,
    openCardPicker,
    closeCardPicker,
    selectCardForSlot,
    aggregateDeckEffects,
    computePerTrainingEffects,
    recalculateDeck,
    loadSavedDecks,
    saveDeckToStorage,
    createNewDeck,
    deleteDeck,
    renameDeck,
    switchToDeck,
    debouncedSaveDeck,
    getAvailableScenarios,
    getBaseTrainingValues,
    getApplicableBonusIds,
    openTrainingAssignmentModal,
    saveTrainingAssignment,
    resetAllAssignments,
    calculateRaceBonusGain,
    aggregateUniqueEffects,
    aggregateDeckSkills,
    getSelectedCharacterData,
    getSelectedCharacterGrowthRates,
    getTrainingFailureRates,
    STAT_BONUS_INDEX_MAP,
    getRaceBonusTable,
    enterPreviewMode,
    saveDeckChanges,
    cancelDeckChanges,
    snapshotDeckState,
    markDeckDirty,
    updateDeckHeaderButtons
});
