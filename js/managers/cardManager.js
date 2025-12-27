// Card Manager Module (Refactored)
// Handles card ownership, data loading, and storage

// ===== STORAGE CONFIGURATION =====

const STORAGE_KEY = 'uma_owned_cards';

// ===== CARD OWNERSHIP MANAGEMENT =====

// Load owned cards from localStorage
function loadOwnedCards() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed === 'object' && parsed !== null) {
                ownedCards = parsed;
                console.log(`Loaded ${Object.keys(ownedCards).length} owned cards from storage`);
            } else {
                console.warn('Invalid owned cards data format, starting fresh');
                ownedCards = {};
            }
        }
    } catch (error) {
        console.error('Error loading owned cards from localStorage:', error);
        ownedCards = {};
        showToast('Error loading saved data. Starting fresh.', 'error');
    }
}

// Save owned cards to localStorage
function saveOwnedCards() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ownedCards));
    } catch (error) {
        console.error('Error saving owned cards to localStorage:', error);
        showToast('Error saving data to storage.', 'error');
    }
}

// Set card ownership status
function setCardOwnership(cardId, owned) {
    if (owned) {
        if (!ownedCards[cardId]) {
            const card = cardData.find(c => c.support_id === cardId);
            if (card) {
                ownedCards[cardId] = {
                    owned: true,
                    level: limitBreaks[card.rarity][4], // Default to LB 4 level
                    limitBreak: 4, // Default to LB 4
                    dateObtained: Date.now()
                };
            }
        } else {
            ownedCards[cardId].owned = true;
            // Ensure limitBreak exists for backwards compatibility
            if (ownedCards[cardId].limitBreak === undefined) {
                const card = cardData.find(c => c.support_id === cardId);
                if (card) {
                    // Guess limit break level from current level
                    const currentLevel = ownedCards[cardId].level;
                    ownedCards[cardId].limitBreak = getLimitBreakLevel(currentLevel, card.rarity);
                }
            }
        }
    } else {
        if (ownedCards[cardId]) {
            ownedCards[cardId].owned = false;
        }
    }
    saveOwnedCards();
}

// Set level for owned card
function setOwnedCardLevel(cardId, level) {
    if (ownedCards[cardId] && ownedCards[cardId].owned) {
        ownedCards[cardId].level = level;
        saveOwnedCards();
    }
}

// Set limit break level for owned card
function setOwnedCardLimitBreak(cardId, limitBreakLevel) {
    if (ownedCards[cardId] && ownedCards[cardId].owned) {
        const card = cardData.find(c => c.support_id === cardId);
        if (card) {
            const oldLimitBreak = ownedCards[cardId].limitBreak;
            const oldLevel = ownedCards[cardId].level;
            
            // Update limit break level
            ownedCards[cardId].limitBreak = limitBreakLevel;
            
            // ENHANCED: Calculate new max level and clamp if necessary
            const newMaxLevel = limitBreaks[card.rarity][limitBreakLevel];
            let newLevel = oldLevel;
            
            if (oldLevel > newMaxLevel) {
                newLevel = newMaxLevel;
                ownedCards[cardId].level = newLevel;
                console.log(`🔧 Level clamped for card ${cardId}: ${oldLevel} → ${newLevel} (LB ${oldLimitBreak} → ${limitBreakLevel})`);
            }
            
            saveOwnedCards();
            
            // ENHANCED: Return clamping info for UI updates
            return {
                oldLevel,
                newLevel,
                levelChanged: oldLevel !== newLevel,
                oldLimitBreak,
                newLimitBreak: limitBreakLevel,
                newMaxLevel
            };
        }
    }
    return null;
}

// ===== CARD OWNERSHIP QUERIES =====

// Check if card is owned
function isCardOwned(cardId) {
    return ownedCards[cardId] && ownedCards[cardId].owned;
}

// Get owned card level
function getOwnedCardLevel(cardId) {
    if (ownedCards[cardId] && ownedCards[cardId].owned) {
        return ownedCards[cardId].level;
    }
    return null;
}

// Get owned card limit break level
function getOwnedCardLimitBreak(cardId) {
    if (ownedCards[cardId] && ownedCards[cardId].owned) {
        return ownedCards[cardId].limitBreak !== undefined ? ownedCards[cardId].limitBreak : 2;
    }
    return null;
}

// ===== GLOBAL LEVEL CONTROLS =====

// Set global limit break level for all cards
function setGlobalLimitBreak(lbLevel) {
    globalLimitBreakLevel = lbLevel === '' ? null : parseInt(lbLevel);
    
    // Update all level inputs
    updateAllLevelInputs();
    
    // Update modal if open
    updateModalIfOpen();

    // Update potential displays when global LB changes
    updatePotentialIndicatorDisplay();
    
    // Trigger filter refresh to update effect ranges
    debouncedFilterAndSort();
}

// Set global limit break override setting
function setGlobalLimitBreakOverride(override) {
    globalLimitBreakOverrideOwned = override;
    
    // Refresh level inputs if global LB is set
    if (globalLimitBreakLevel !== null) {
        setGlobalLimitBreak(globalLimitBreakLevel);
    } else {
        debouncedFilterAndSort();
    }

    updatePotentialIndicatorDisplay();
}

// Set show max potential levels setting
function setShowMaxPotentialLevels(showMax) {
    showMaxPotentialLevels = showMax;
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
        if (showMax) {
            tableContainer.classList.add('table-max-potential-mode');
        } else {
            tableContainer.classList.remove('table-max-potential-mode');
        }
    }
    
    // Update all level inputs and displays
    updateAllLevelInputs();
    
    // Update modal if open
    updateModalIfOpen();
    
    // Update potential indicator in modal
    updatePotentialIndicatorDisplay();

    const modalToggle = document.getElementById('modalMaxPotentialToggle');
    if (modalToggle) {
        modalToggle.checked = showMax;
    }
    
    // Trigger filter refresh
    debouncedFilterAndSort();
}

function getEffectiveLimitBreak(cardId, isOwned) {
    // Check for global override first
    if (globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned)) {
        return globalLimitBreakLevel; // ✅ Use override
    } else if (isOwned) {
        return getOwnedCardLimitBreak(cardId); // ✅ Use owned
    } else {
        return 2; // Default for unowned cards
    }
}

// ===== LEVEL INPUT UPDATES =====

// Update all level inputs based on current settings
function updateAllLevelInputs() {
    document.querySelectorAll('.level-input').forEach(input => {
        const cardId = parseInt(input.dataset.cardId);
        const card = cardData.find(c => c.support_id === cardId);
        
        if (card) {
            const effectiveLevel = getEffectiveLevel(card);
            input.value = effectiveLevel;
            
            // Determine if input should be disabled
            const shouldDisable = globalLimitBreakLevel !== null && 
                                 (globalLimitBreakOverrideOwned || !isCardOwned(cardId));
            input.disabled = shouldDisable;
            
            updateCardDisplay(input);
        }
    });
}

// Update modal if open
function updateModalIfOpen() {
    if (currentModalCard) {
        const modalLevelInput = document.getElementById('modalLevelInput');
        if (modalLevelInput) {
            const effectiveLevel = getEffectiveLevel(currentModalCard);
            modalLevelInput.value = effectiveLevel;
            
            // Update modal toggle state
            const modalToggle = document.getElementById('modalMaxPotentialToggle');
            if (modalToggle) {
                modalToggle.checked = showMaxPotentialLevels;
            }
            
            // Update potential indicator
            updatePotentialIndicatorDisplay();
            
            // Refresh effects grid
            const effectsGrid = document.getElementById('effectsGrid');
            if (effectsGrid) {
                const newGrid = createEffectsGrid(currentModalCard, effectiveLevel);
                effectsGrid.innerHTML = newGrid.innerHTML;
            }
        }
    }
}

// ===== DATA EXPORT/IMPORT =====

// Export owned cards data
function exportOwnedCards() {
    // Build export data with card details
    const rarityMap = { 1: 'R', 2: 'SR', 3: 'SSR' };
    const exportCards = {};

    for (const [cardId, ownership] of Object.entries(ownedCards)) {
        if (!ownership.owned) continue;

        const card = cardData.find(c => c.support_id == cardId);
        const dateValue = ownership.dateObtained || Date.now();
        exportCards[cardId] = {
            owned: ownership.owned,
            level: ownership.level,
            limitBreak: ownership.limitBreak,
            dateObtained: new Date(dateValue).toISOString().split('T')[0],
            charName: card?.char_name || 'Unknown',
            rarity: rarityMap[card?.rarity] || 'Unknown',
            type: card?.type || 'Unknown'
        };
    }

    const exportData = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        ownedCards: exportCards
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = createElement('a', {
        href: url,
        download: `uma_cards_${new Date().toISOString().split('T')[0]}.json`
    });
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Collection exported successfully!', 'success');
}

// Import owned cards data
function importOwnedCards(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);

            // Validate import data structure
            validateImportData(importData);

            // Normalize imported data (strip extra fields, convert date strings to timestamps)
            const normalizedCards = {};
            for (const [cardId, cardData] of Object.entries(importData.ownedCards)) {
                normalizedCards[cardId] = {
                    owned: cardData.owned,
                    level: cardData.level,
                    limitBreak: cardData.limitBreak,
                    dateObtained: typeof cardData.dateObtained === 'string'
                        ? new Date(cardData.dateObtained).getTime()
                        : cardData.dateObtained
                };
            }

            ownedCards = normalizedCards;
            saveOwnedCards();
            
            // Refresh the display
            if (typeof debouncedFilterAndSort === 'function') {
                debouncedFilterAndSort();
            }
            
            const count = Object.values(ownedCards).filter(card => card.owned).length;
            showToast(`Successfully imported ${count} owned cards!`, 'success');
            
        } catch (error) {
            console.error('Error importing owned cards:', error);
            showToast(`Import failed: ${error.message}`, 'error');
        }
    };
    reader.readAsText(file);
}

// Validate import data structure
function validateImportData(importData) {
    if (!importData.ownedCards || typeof importData.ownedCards !== 'object') {
        throw new Error('Invalid file format: missing or invalid ownedCards data');
    }
    
    for (const [cardId, cardData] of Object.entries(importData.ownedCards)) {
        if (!cardData.owned || typeof cardData.level !== 'number') {
            throw new Error(`Invalid data for card ${cardId}`);
        }
    }
}

// Clear all owned cards data
function clearOwnedCards() {
    showConfirmDialog(
        'Clear All Data',
        'Are you sure you want to clear all owned card data? This action cannot be undone.',
        () => {
            ownedCards = {};
            saveOwnedCards();
            if (typeof debouncedFilterAndSort === 'function') {
                debouncedFilterAndSort();
            }
            showToast('All owned card data cleared.', 'success');
        }
    );
}

// ===== DATA LOADING =====

// Load all JSON data
async function loadData() {
    try {
        console.log('Loading data files...');
        
        const responses = await Promise.all([
            fetch('data/raw_cards.json'),
            fetch('data/raw_effects.json'),
            fetch('data/raw_skills.json'),
            fetch('data/raw_skillTypes.json'),
            fetch('data/raw_events.json'),
            fetch('data/raw_eventsChain.json'),
            fetch('data/raw_eventsSpecial.json')
        ]);

        const [cardsDataRaw, effects, skills, skillTypes, events, eventsChain, eventsSpecial] = 
            await Promise.all(responses.map(res => res.json()));

        console.log('Data loaded successfully');

        // Process data into global lookups
        processEffectsData(effects);
        processSkillsData(skills);
        processSkillTypesData(skillTypes);
        processEventsData(events, eventsChain, eventsSpecial);
        
        // Store card data
        cardData = cardsDataRaw.pageProps.supportData;
        
        for (let card of cardData) {
            for (let i = 0; i < card.hints.hint_skills.length; i++) {
                const hint = card.hints.hint_skills[i];
                if (skillsData[hint]) {
                    card.hints.hint_skills[i] = {
                        "id": hint,
                        "type": skillsData[hint].type,
                        "name_en": skillsData[hint].name_en,
                        "desc_en": skillsData[hint].desc_en
                    };
                } else {
                    card.hints.hint_skills[i] = {
                        "id": hint,
                        "type": "unknown",
                        "name_en": "Unknown Skill",
                        "desc_en": "No description available."
                    };
                }
            }

            for (let i = 0; i < card.event_skills.length; i++) {
                const event = card.event_skills[i];
                if (skillsData[event]) {
                    card.event_skills[i] = {
                        "id": event,
                        "type": skillsData[event].type,
                        "name_en": skillsData[event].name_en,
                        "desc_en": skillsData[event].desc_en
                    };
                } else {
                    card.event_skills[i] = {
                        "id": event,
                        "type": "unknown",
                        "name_en": "Unknown Event",
                        "desc_en": "No description available."
                    };
                }
            }
        }

        console.log(`Loaded ${cardData.length} cards`);
        
        // Load owned cards from storage
        loadOwnedCards();
        
        return true;

    } catch (error) {
        console.error('Error loading data:', error);
        showDataLoadError(error);
        return false;
    }
}

// ===== DATA PROCESSING =====

// Process effects data into lookup
function processEffectsData(effects) {
    effects.forEach(effect => {
        effectsData[effect.id] = effect;
    });
}

// Process skills data into lookup
function processSkillsData(skills) {
    skills.forEach(skill => {
        skillsData[skill.id] = skill;
    });
}

// Process skill types data into lookup
function processSkillTypesData(skillTypes) {
    skillTypes.forEach(skillType => {
        skillTypesData[skillType.id] = skillType.string;
    });
}

// Process events data
function processEventsData(events, eventsChain, eventsSpecial) {
    eventsData = {
        regular: events,
        chain: eventsChain,
        special: eventsSpecial
    };
}

// ===== ERROR HANDLING =====

// Show data loading error
function showDataLoadError(error) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Error loading data: ${error.message}`;
}

// ===== UTILITY FUNCTIONS =====

// Get character name from card
function getCharName(charId) {    
    const card = cardData.find(c => c.support_id === charId);
    return card ? card.char_name : 'Unknown Character';
}

// ===== EXPORTS =====

window.CardManager = {
    loadOwnedCards,
    saveOwnedCards,
    setCardOwnership,
    setOwnedCardLevel,
    setOwnedCardLimitBreak,
    isCardOwned,
    getOwnedCardLevel,
    getOwnedCardLimitBreak,
    setGlobalLimitBreak,
    setGlobalLimitBreakOverride,
    setShowMaxPotentialLevels,
    exportOwnedCards,
    importOwnedCards,
    clearOwnedCards,
    loadData,
    getCharName,
    getEffectiveLimitBreak
};

// Export individual functions to global scope for backward compatibility
Object.assign(window, window.CardManager);