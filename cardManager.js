// Card Manager Module
// Handles card ownership, levels, data loading, and storage

// Storage key for localStorage
const STORAGE_KEY = 'uma_owned_cards';

// Limit break requirements by rarity
const limitBreaks = {
    1: [1, 25, 30, 35, 40],  // R
    2: [1, 30, 35, 40, 45],  // SR
    3: [1, 35, 40, 45, 50]   // SSR
};

// Load owned cards from localStorage
function loadOwnedCards() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Validate the data structure
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
                    level: limitBreaks[card.rarity][2], // Default to LB 2 level
                    limitBreak: 2, // Default to LB 2
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
            ownedCards[cardId].limitBreak = limitBreakLevel;
            // Ensure level doesn't exceed new limit break maximum
            const maxLevel = limitBreaks[card.rarity][limitBreakLevel];
            if (ownedCards[cardId].level > maxLevel) {
                ownedCards[cardId].level = maxLevel;
            }
            saveOwnedCards();
        }
    }
}

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

// Calculate limit break level based on card level and rarity
function getLimitBreakLevel(level, rarity) {
    const breaks = limitBreaks[rarity];
    if (!breaks) return 0;
    
    for (let i = breaks.length - 1; i >= 0; i--) {
        if (level >= breaks[i]) {
            return i;
        }
    }
    return 0;
}

// Get effective level for a card (considering ownership, global LB, and display mode)
function getEffectiveLevel(card) {
    const cardId = card.support_id;
    
    // If global limit break is set
    if (globalLimitBreakLevel !== null) {
        // Check if we should override owned cards
        if (globalLimitBreakOverrideOwned || !isCardOwned(cardId)) {
            const globalLevel = limitBreaks[card.rarity][globalLimitBreakLevel];
            return showMaxPotentialLevels ? globalLevel : globalLevel;
        }
    }
    
    // If card is owned, use owned card level/limit break
    if (isCardOwned(cardId)) {
        const currentLevel = getOwnedCardLevel(cardId);
        const currentLimitBreak = getOwnedCardLimitBreak(cardId);
        
        if (showMaxPotentialLevels) {
            // Show maximum level for current limit break
            return limitBreaks[card.rarity][currentLimitBreak];
        } else {
            // Show current level
            return currentLevel;
        }
    }
    
    // Default to LB 2 for unowned cards in display
    const defaultLB = 2;
    const defaultLevel = limitBreaks[card.rarity][defaultLB];
    return showMaxPotentialLevels ? defaultLevel : defaultLevel;
}

// Calculate effect value at specific level
function calculateEffectValue(effectArray, level) {
    if (!effectArray || effectArray.length < 2) return 0;
    
    const [effectId, ...values] = effectArray;
    
    // Map level to array index
    const levelMap = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    
    // Find the appropriate values to interpolate between
    let prevIndex = 0;
    let prevLevel = 1;
    let prevValue = values[0];
    
    for (let i = 0; i < levelMap.length; i++) {
        if (values[i] !== -1 && levelMap[i] <= level) {
            prevIndex = i;
            prevLevel = levelMap[i];
            prevValue = values[i];
        }
    }
    
    // Find next valid value
    let nextIndex = prevIndex;
    let nextLevel = prevLevel;
    let nextValue = prevValue;
    
    for (let i = prevIndex + 1; i < levelMap.length; i++) {
        if (values[i] !== -1) {
            nextIndex = i;
            nextLevel = levelMap[i];
            nextValue = values[i];
            break;
        }
    }
    
    // If we're at exact level, return that value
    if (level === prevLevel) return prevValue;
    if (level === nextLevel) return nextValue;
    
    // Interpolate between values
    if (nextLevel > prevLevel) {
        const ratio = (level - prevLevel) / (nextLevel - prevLevel);
        return Math.round(prevValue + (nextValue - prevValue) * ratio);
    }
    
    return prevValue;
}

// Check if effect is locked at current level
function isEffectLocked(effectArray, level) {
    if (!effectArray || effectArray.length < 2) return true;
    
    const [effectId, ...values] = effectArray;
    const levelMap = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    
    // Find the first level where effect becomes available
    for (let i = 0; i < levelMap.length; i++) {
        if (values[i] !== -1 && levelMap[i] <= level) {
            return false;
        }
    }
    
    return true;
}

// Get effect name (English only)
function getEffectName(effectId) {
    return effectsData[effectId]?.name_en || `Effect ${effectId}`;
}

// Get effect description (English only)
function getEffectDescription(effectId) {
    return effectsData[effectId]?.desc_en || '';
}

// Get skill name (English only)
function getSkillName(skillId) {
    return skillsData[skillId]?.name_en || skillsData[skillId]?.enname || `Skill ${skillId}`;
}

function getCharName(charId) {    
    const card = cardData.find(c => c.support_id === charId);
    return card ? card.char_name : 'Unknown Character';
}

// Get skill description (English only)
function getSkillDescription(skillId) {
    return skillsData[skillId]?.desc_en || skillsData[skillId]?.endesc || '';
}

// Get skill type description
function getSkillTypeDescription(typeId) {
    return skillTypesData[typeId] || typeId; // Fallback to original ID if not found
}

// Export owned cards data
function exportOwnedCards() {
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        ownedCards: ownedCards
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `uma_cards_${new Date().toISOString().split('T')[0]}.json`;
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
            if (!importData.ownedCards || typeof importData.ownedCards !== 'object') {
                throw new Error('Invalid file format: missing or invalid ownedCards data');
            }
            
            // Validate each owned card entry
            for (const [cardId, cardData] of Object.entries(importData.ownedCards)) {
                if (!cardData.owned || typeof cardData.level !== 'number') {
                    throw new Error(`Invalid data for card ${cardId}`);
                }
            }
            
            ownedCards = importData.ownedCards;
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

// Load all JSON data
async function loadData() {
    try {
        console.log('Loading data files...');
        
        // Load all JSON files
        const [cardsRes, effectsRes, skillsRes, skillTypesRes, eventsRes, eventsChainRes, eventsSpecialRes] = await Promise.all([
            fetch('data/raw_cards.json'),
            fetch('data/raw_effects.json'),
            fetch('data/raw_skills.json'),
            fetch('data/raw_skillTypes.json'),
            fetch('data/raw_events.json'),
            fetch('data/raw_eventsChain.json'),
            fetch('data/raw_eventsSpecial.json')
        ]);

        // Parse JSON
        const cardsDataRaw = await cardsRes.json();
        const effects = await effectsRes.json();
        const skills = await skillsRes.json();
        const skillTypes = await skillTypesRes.json();
        const events = await eventsRes.json();
        const eventsChain = await eventsChainRes.json();
        const eventsSpecial = await eventsSpecialRes.json();

        console.log('Data loaded successfully');

        // Process effects data into lookup
        effects.forEach(effect => {
            effectsData[effect.id] = effect;
        });

        // Process skills data into lookup
        skills.forEach(skill => {
            skillsData[skill.id] = skill;
        });

        // Process skill types data into lookup
        skillTypes.forEach(skillType => {
            skillTypesData[skillType.id] = skillType.string;
        });

        // Store card data
        cardData = cardsDataRaw.pageProps.supportData;

        // Process events data
        eventsData = {
            regular: events,
            chain: eventsChain,
            special: eventsSpecial
        };

        console.log(`Loaded ${cardData.length} cards`);
        
        // Load owned cards from storage
        loadOwnedCards();
        
        return true;

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = `Error loading data: ${error.message}`;
        return false;
    }
}

// Type display mapping
function getTypeDisplayName(type) {
    const typeMap = {
        'speed': 'Speed',
        'stamina': 'Stamina',
        'power': 'Power',
        'guts': 'Guts',
        'wisdom': 'Wit',
        'intelligence': 'Wit',
        'friend': 'Friend'
    };
    return typeMap[type] || type;
}