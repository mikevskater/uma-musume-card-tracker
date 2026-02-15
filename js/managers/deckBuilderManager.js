// Deck Builder Manager
// State management, calculations, save/load for MaNT Deck Builder

// ===== CONSTANTS =====

const DECK_STORAGE_KEY = 'uma_deck_builder_decks';

// Base training values (Facility Level 1): [speed, stamina, power, guts, wit, skillPts, energy]
const BASE_TRAINING_VALUES = {
    speed:        [10, 0, 3, 0, 0, 2, -21],
    stamina:      [0, 9, 0, 3, 0, 2, -19],
    power:        [0, 3, 8, 0, 0, 2, -20],
    guts:         [4, 0, 2, 8, 0, 2, -22],
    intelligence: [2, 0, 0, 0, 9, 10, 5]
};

// Which stat bonus effect IDs apply at which training type
// Effect IDs: 3=Speed, 4=Stamina, 5=Power, 6=Guts, 7=Wit, 30=SkillPt
const STAT_BONUS_TRAINING_MAP = {
    speed:        [3, 5, 30],       // Speed Bonus, Power Bonus, SkillPt
    stamina:      [4, 6, 30],       // Stamina Bonus, Guts Bonus, SkillPt
    power:        [4, 5, 30],       // Stamina Bonus, Power Bonus, SkillPt
    guts:         [3, 5, 6, 30],    // Speed, Power, Guts, SkillPt
    intelligence: [3, 7, 30]        // Speed Bonus, Wit Bonus, SkillPt
};

// Which stat index each bonus applies to in the training values array
const STAT_BONUS_INDEX_MAP = {
    3: 0,   // Speed Bonus → speed column
    4: 1,   // Stamina Bonus → stamina column
    5: 2,   // Power Bonus → power column
    6: 3,   // Guts Bonus → guts column
    7: 4,   // Wit Bonus → wit column
    30: 5   // Skill Pt Bonus → skillPts column
};

// Card type → which training they appear at
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
    pickerFilter: {
        types: ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'],
        search: ''
    },
    trainingLevel: 1,
    mood: 'very_good',
    friendshipTraining: true
};

// ===== INITIALIZATION =====

function initializeDeckBuilder() {
    if (deckBuilderState.initialized) return;

    // Load saved decks
    loadSavedDecks();

    // Render the shell
    renderDeckBuilderShell();

    // Wire deck header events
    initializeDeckBuilderEvents();

    // Restore last active deck
    if (deckBuilderState.savedDecks.length > 0) {
        const lastDeckId = deckBuilderState.activeDeckId || deckBuilderState.savedDecks[0].id;
        switchToDeck(lastDeckId);
    }

    renderDeckSelect();

    deckBuilderState.initialized = true;
    console.log('🏗️ Deck Builder initialized');
}

// ===== TAB SWITCHING =====

function switchAppTab(tabId) {
    // Update nav buttons
    document.querySelectorAll('.app-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
        btn.setAttribute('aria-selected', btn.dataset.tab === tabId ? 'true' : 'false');
    });

    // Show/hide panels
    document.querySelectorAll('.app-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.tab === tabId);
    });

    // Initialize deck builder on first switch
    if (tabId === 'deckbuilder' && !deckBuilderState.initialized) {
        initializeDeckBuilder();
    }
}

// ===== SLOT MANAGEMENT =====

function setDeckSlot(slotIndex, cardId, level, lb) {
    deckBuilderState.slots[slotIndex] = {
        cardId: cardId,
        level: level,
        limitBreak: lb,
        isFriend: slotIndex === 5
    };

    renderDeckSlots();
    recalculateDeck();
    debouncedSaveDeck();
}

function removeDeckSlot(slotIndex) {
    deckBuilderState.slots[slotIndex] = null;
    renderDeckSlots();
    recalculateDeck();
    debouncedSaveDeck();
}

// ===== CARD PICKER =====

function openCardPicker(slotIndex) {
    deckBuilderState.activeSlot = slotIndex;
    deckBuilderState.pickerOpen = true;
    deckBuilderState.pickerFilter = {
        types: ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'],
        search: ''
    };
    renderCardPicker();
}

function closeCardPicker() {
    deckBuilderState.pickerOpen = false;
    deckBuilderState.activeSlot = null;

    const picker = document.getElementById('deckCardPicker');
    const overlay = document.getElementById('deckPickerOverlay');

    if (picker) {
        picker.classList.remove('open');
        setTimeout(() => picker.remove(), 300);
    }
    if (overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
    }
}

function selectCardForSlot(slotIndex, cardId) {
    const card = cardData.find(c => c.support_id === cardId);
    if (!card) return;

    const isFriend = slotIndex === 5;
    let level, lb;

    if (isFriend) {
        // Friend slot: default to max (LB4)
        lb = 4;
        level = limitBreaks[card.rarity][lb];
    } else if (isCardOwned(cardId)) {
        // Owned: use owned level/LB
        level = getOwnedCardLevel(cardId);
        lb = getOwnedCardLimitBreak(cardId);
    } else {
        // Shouldn't happen for non-friend slots, but fallback
        lb = 4;
        level = limitBreaks[card.rarity][lb];
    }

    setDeckSlot(slotIndex, cardId, level, lb);
    closeCardPicker();
    showToast(`Added ${card.char_name || 'card'} to ${isFriend ? 'Friend slot' : 'Slot ' + (slotIndex + 1)}`, 'success');
}

// ===== EFFECT AGGREGATION =====

function aggregateDeckEffects(slots) {
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
    const { trainingLevel, mood, friendshipTraining } = options;

    const baseValues = BASE_TRAINING_VALUES[trainingType];
    if (!baseValues) return null;

    // Facility level adds to primary stat base
    const primaryStatIndex = ['speed', 'stamina', 'power', 'guts', 'intelligence'].indexOf(trainingType);
    const base = [...baseValues];
    base[primaryStatIndex] += (trainingLevel - 1);

    // Find which cards are present at this training
    const presentCards = [];
    const presentSlots = [];

    slots.forEach((slot, idx) => {
        if (!slot) return;
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card) return;

        if (card.type === 'friend') {
            // Friend cards can appear at any training (simplified)
            presentCards.push(card.type);
            presentSlots.push(slot);
        } else if (CARD_TYPE_TRAINING_MAP[card.type] === trainingType) {
            presentCards.push(card.type);
            presentSlots.push(slot);
        }
    });

    const supportCount = presentCards.length;

    // Calculate stat bonuses from present cards only
    const statBonuses = [0, 0, 0, 0, 0, 0]; // speed, stamina, power, guts, wit, skillPts
    const applicableBonusIds = STAT_BONUS_TRAINING_MAP[trainingType] || [];

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

    // Mood multiplier
    const moodEffect = aggregated[2] || 0; // Mood Effect %
    const moodBase = MOOD_VALUES[mood] || 0;
    const moodMultiplier = 1 + moodBase * (1 + moodEffect / 100);

    // Training Effectiveness
    const trainingEff = aggregated[8] || 0;
    const trainingEffMultiplier = 1 + trainingEff / 100;

    // Support count multiplier
    const supportMultiplier = 1 + 0.05 * supportCount;

    // Friendship multiplier (product of individual friendship bonuses)
    let friendshipMultiplier = 1;
    if (friendshipTraining && supportCount > 0) {
        presentSlots.forEach(slot => {
            const card = cardData.find(c => c.support_id === slot.cardId);
            if (!card || !card.effects) return;

            card.effects.forEach(effectArray => {
                if (effectArray[0] === 1) { // Friendship Bonus
                    const val = calculateEffectValue(effectArray, slot.level);
                    if (val > 0) {
                        friendshipMultiplier *= (1 + val / 100);
                    }
                }
            });
        });
    }

    // Calculate final stat gains
    const result = {
        speed: 0, stamina: 0, power: 0, guts: 0, wit: 0, skillPts: 0, energy: base[6],
        presentCards: presentCards
    };

    const statKeys = ['speed', 'stamina', 'power', 'guts', 'wit', 'skillPts'];
    for (let i = 0; i < 6; i++) {
        const statBase = base[i] + statBonuses[i];
        if (statBase > 0) {
            result[statKeys[i]] = Math.floor(
                statBase * moodMultiplier * trainingEffMultiplier * supportMultiplier * friendshipMultiplier
            );
        }
    }

    return result;
}

function calculateAllTraining() {
    const aggregated = aggregateDeckEffects(deckBuilderState.slots);
    const options = {
        trainingLevel: deckBuilderState.trainingLevel,
        mood: deckBuilderState.mood,
        friendshipTraining: deckBuilderState.friendshipTraining
    };

    const results = {};
    ['speed', 'stamina', 'power', 'guts', 'intelligence'].forEach(type => {
        results[type] = calculateTrainingGains(type, deckBuilderState.slots, aggregated, options);
    });

    return { aggregated, results };
}

function recalculateDeck() {
    const { aggregated, results } = calculateAllTraining();
    renderDeckSummary(aggregated);
    renderTrainingBreakdown(results);
    renderScenarioInfo(aggregated);
}

// ===== SAVE/LOAD =====

function loadSavedDecks() {
    try {
        const stored = localStorage.getItem(DECK_STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            deckBuilderState.savedDecks = data.decks || [];
            deckBuilderState.activeDeckId = data.activeDeckId || null;
        }
    } catch (error) {
        console.error('Error loading saved decks:', error);
        deckBuilderState.savedDecks = [];
    }
}

function saveDeckToStorage() {
    try {
        // Update current deck in savedDecks
        if (deckBuilderState.activeDeckId) {
            const deck = deckBuilderState.savedDecks.find(d => d.id === deckBuilderState.activeDeckId);
            if (deck) {
                deck.slots = [...deckBuilderState.slots];
                deck.name = deckBuilderState.deckName;
                deck.lastModified = Date.now();
            }
        }

        const data = {
            decks: deckBuilderState.savedDecks,
            activeDeckId: deckBuilderState.activeDeckId
        };
        localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error('Error saving decks:', error);
        showToast('Failed to save deck.', 'error');
    }
}

let saveDeckTimeout = null;
function debouncedSaveDeck() {
    clearTimeout(saveDeckTimeout);
    saveDeckTimeout = setTimeout(saveDeckToStorage, 500);
}

function createNewDeck(name) {
    const deckId = 'deck_' + Date.now();
    const newDeck = {
        id: deckId,
        name: name || 'New Deck',
        slots: [null, null, null, null, null, null],
        lastModified: Date.now()
    };

    deckBuilderState.savedDecks.push(newDeck);
    switchToDeck(deckId);
    saveDeckToStorage();
    renderDeckSelect();
    showToast(`Created deck "${newDeck.name}"`, 'success');
}

function deleteDeck(deckId) {
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
        }
    }

    saveDeckToStorage();
    renderDeckSelect();
    showToast(`Deleted deck "${deckName}"`, 'success');
}

function renameDeck(deckId, newName) {
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
    const deck = deckBuilderState.savedDecks.find(d => d.id === deckId);
    if (!deck) return;

    // Save current deck first
    if (deckBuilderState.activeDeckId && deckBuilderState.activeDeckId !== deckId) {
        saveDeckToStorage();
    }

    deckBuilderState.activeDeckId = deckId;
    deckBuilderState.deckName = deck.name;
    deckBuilderState.slots = deck.slots ? [...deck.slots] : [null, null, null, null, null, null];

    renderDeckSlots();
    recalculateDeck();
    renderDeckSelect();
}

// ===== DECK BUILDER EVENTS =====

function initializeDeckBuilderEvents() {
    // Deck header buttons
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

    const deleteBtn = document.getElementById('deckDeleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (!deckBuilderState.activeDeckId) {
                showToast('No deck to delete.', 'warning');
                return;
            }
            if (confirm(`Delete deck "${deckBuilderState.deckName}"?`)) {
                deleteDeck(deckBuilderState.activeDeckId);
            }
        });
    }

    // Deck select dropdown
    const deckSelect = document.getElementById('deckSelect');
    if (deckSelect) {
        deckSelect.addEventListener('change', (e) => {
            const deckId = e.target.value;
            if (deckId !== 'default') {
                switchToDeck(deckId);
            }
        });
    }

    // Facility level buttons
    document.querySelectorAll('#facilityLevelBtns .facility-level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            deckBuilderState.trainingLevel = parseInt(btn.dataset.level);
            document.querySelectorAll('#facilityLevelBtns .facility-level-btn').forEach(b =>
                b.classList.toggle('active', b === btn)
            );
            recalculateDeck();
        });
    });

    // Mood select
    const moodSelect = document.getElementById('moodSelect');
    if (moodSelect) {
        moodSelect.addEventListener('change', (e) => {
            deckBuilderState.mood = e.target.value;
            recalculateDeck();
        });
    }

    // Friendship toggle
    const friendshipToggle = document.getElementById('friendshipToggle');
    if (friendshipToggle) {
        friendshipToggle.addEventListener('change', (e) => {
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
    recalculateDeck,
    loadSavedDecks,
    saveDeckToStorage,
    createNewDeck,
    deleteDeck,
    renameDeck,
    switchToDeck,
    DECK_STORAGE_KEY
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
    recalculateDeck,
    loadSavedDecks,
    saveDeckToStorage,
    createNewDeck,
    deleteDeck,
    renameDeck,
    switchToDeck,
    debouncedSaveDeck
});
