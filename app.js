// Global data storage
let cardData = [];
let effectsData = {};
let skillsData = {};
let eventsData = {};
let ownedCards = {}; // Owned card tracking
let currentModalCard = null;
let currentSort = { column: '', direction: '' };
let globalLimitBreakLevel = null;
let globalLimitBreakOverrideOwned = true; // New: toggle for applying global LB to owned cards

// Advanced filtering state
let advancedFilters = {
    effects: {}, // effectId: { min: value, max: value }
    hintSkills: [], // array of skill IDs
    eventSkills: [] // array of skill IDs
};

// Filter debounce timer
let filterDebounceTimer = null;

// Limit break requirements by rarity
const limitBreaks = {
    1: [1, 25, 30, 35, 40],  // R
    2: [1, 30, 35, 40, 45],  // SR
    3: [1, 35, 40, 45, 50]   // SSR
};

// Storage key for localStorage
const STORAGE_KEY = 'uma_owned_cards';

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
                    level: limitBreaks[card.rarity][2], // Default to LB 2
                    dateObtained: Date.now()
                };
            }
        } else {
            ownedCards[cardId].owned = true;
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
            debouncedFilterAndSort();
            
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
            debouncedFilterAndSort();
            showToast('All owned card data cleared.', 'success');
        }
    );
}

// Show confirmation dialog
function showConfirmDialog(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleElement = document.getElementById('confirmTitle');
    const messageElement = document.getElementById('confirmMessage');
    const okButton = document.getElementById('confirmOk');
    const cancelButton = document.getElementById('confirmCancel');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    
    // Remove existing event listeners
    const newOkButton = okButton.cloneNode(true);
    const newCancelButton = cancelButton.cloneNode(true);
    okButton.parentNode.replaceChild(newOkButton, okButton);
    cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);
    
    // Add new event listeners
    newOkButton.addEventListener('click', () => {
        modal.style.display = 'none';
        onConfirm();
    });
    
    newCancelButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    modal.style.display = 'block';
}

// Show toast notification
function showToast(message, type = 'success') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize advanced filters UI
function initializeAdvancedFilters() {
    // Build effect filters
    buildEffectFilters();
    
    // Build skill filters
    buildSkillFilters();
    
    // Initialize advanced section toggle
    const advancedToggle = document.getElementById('advancedToggle');
    const advancedContent = document.getElementById('advancedContent');
    
    advancedToggle.addEventListener('click', () => {
        const isExpanded = advancedContent.style.display !== 'none';
        
        if (isExpanded) {
            advancedContent.style.display = 'none';
            advancedToggle.classList.remove('expanded');
        } else {
            advancedContent.style.display = 'block';
            advancedToggle.classList.add('expanded');
        }
    });
}

// Build effect filters dynamically
function buildEffectFilters() {
    const effectFiltersContainer = document.getElementById('effectFilters');
    
    // Get all available effects and sort them by name
    const allEffects = Object.values(effectsData)
        .filter(effect => effect.name_en) // Only include effects with English names
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
    
    effectFiltersContainer.innerHTML = allEffects.map(effect => {
        const symbol = effect.symbol === 'percent' ? '%' : '';
        
        return `
            <div class="effect-filter-item">
                <label>${effect.name_en}:</label>
                <input type="number" 
                       class="effect-filter-input" 
                       data-effect-id="${effect.id}"
                       placeholder="Min${symbol}" 
                       min="0">
            </div>
        `;
    }).join('');
    
    // Add event listeners for effect filters
    document.querySelectorAll('.effect-filter-input').forEach(input => {
        input.addEventListener('input', () => {
            const effectId = parseInt(input.dataset.effectId);
            const value = parseFloat(input.value);
            
            if (isNaN(value) || value <= 0) {
                delete advancedFilters.effects[effectId];
            } else {
                advancedFilters.effects[effectId] = { min: value };
            }
            
            debouncedFilterAndSort();
        });
    });
}

// Build skill filters dynamically
function buildSkillFilters() {
    // Get all unique hint skills
    const hintSkills = new Set();
    const eventSkills = new Set();
    
    cardData.forEach(card => {
        // Collect hint skills
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                hintSkills.add(skill.id);
            });
        }
        
        // Collect event skills
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                eventSkills.add(skill.id);
            });
        }
    });
    
    // Build hint skill dropdown
    const hintSkillDropdown = document.getElementById('hintSkillDropdown');
    hintSkillDropdown.innerHTML = Array.from(hintSkills)
        .sort((a, b) => getSkillName(a).localeCompare(getSkillName(b)))
        .map(skillId => `
            <label>
                <input type="checkbox" value="${skillId}"> 
                ${getSkillName(skillId)}
            </label>
        `).join('');
    
    // Build event skill dropdown
    const eventSkillDropdown = document.getElementById('eventSkillDropdown');
    eventSkillDropdown.innerHTML = Array.from(eventSkills)
        .sort((a, b) => getSkillName(a).localeCompare(getSkillName(b)))
        .map(skillId => `
            <label>
                <input type="checkbox" value="${skillId}"> 
                ${getSkillName(skillId)}
            </label>
        `).join('');
    
    // Add event listeners for skill filters
    hintSkillDropdown.addEventListener('change', () => {
        advancedFilters.hintSkills = Array.from(hintSkillDropdown.querySelectorAll('input:checked'))
            .map(input => parseInt(input.value));
        updateMultiSelectText('hintSkillFilter', 'Any Hint Skills');
        debouncedFilterAndSort();
    });
    
    eventSkillDropdown.addEventListener('change', () => {
        advancedFilters.eventSkills = Array.from(eventSkillDropdown.querySelectorAll('input:checked'))
            .map(input => parseInt(input.value));
        updateMultiSelectText('eventSkillFilter', 'Any Event Skills');
        debouncedFilterAndSort();
    });
}

// Clear advanced filters
function clearAdvancedFilters() {
    // Clear effect filters
    advancedFilters.effects = {};
    document.querySelectorAll('.effect-filter-input').forEach(input => {
        input.value = '';
    });
    
    // Clear skill filters
    advancedFilters.hintSkills = [];
    advancedFilters.eventSkills = [];
    
    document.querySelectorAll('#hintSkillDropdown input[type="checkbox"]').forEach(input => {
        input.checked = false;
    });
    
    document.querySelectorAll('#eventSkillDropdown input[type="checkbox"]').forEach(input => {
        input.checked = false;
    });
    
    updateMultiSelectText('hintSkillFilter', 'Any Hint Skills');
    updateMultiSelectText('eventSkillFilter', 'Any Event Skills');
    
    debouncedFilterAndSort();
}

// Render active filters display
function renderActiveFilters(filteredCount, totalCount) {
    const activeFiltersDiv = document.getElementById('activeFilters');
    const resultsCount = document.getElementById('resultsCount');
    const filterChips = document.getElementById('filterChips');
    
    // Calculate correct total count based on release filter
    const showUnreleased = document.getElementById('releasedFilter').checked;
    const actualTotal = showUnreleased ? cardData.length : cardData.filter(card => card.release_en).length;
    
    // Update results count
    resultsCount.textContent = `Showing ${filteredCount} of ${actualTotal} cards`;
    
    // Build filter chips
    const chips = [];
    
    // Basic filters
    const selectedRarities = getSelectedValues('rarityFilter');
    if (selectedRarities.length > 0) {
        chips.push({
            type: 'rarity',
            label: `Rarity: ${selectedRarities.map(r => ['', 'R', 'SR', 'SSR'][r]).join(', ')}`,
            remove: () => clearMultiSelect('rarityFilter')
        });
    }
    
    const selectedTypes = getSelectedValues('typeFilter');
    if (selectedTypes.length > 0) {
        chips.push({
            type: 'type',
            label: `Type: ${selectedTypes.join(', ')}`,
            remove: () => clearMultiSelect('typeFilter')
        });
    }
    
    const ownedFilter = document.getElementById('ownedFilter').value;
    if (ownedFilter) {
        chips.push({
            type: 'owned',
            label: `${ownedFilter === 'owned' ? 'Owned Only' : 'Unowned Only'}`,
            remove: () => { document.getElementById('ownedFilter').value = ''; }
        });
    }
    
    const nameFilter = document.getElementById('nameFilter').value;
    if (nameFilter) {
        chips.push({
            type: 'name',
            label: `Name: "${nameFilter}"`,
            remove: () => { document.getElementById('nameFilter').value = ''; }
        });
    }
    
    const showUnreleasedChip = document.getElementById('releasedFilter').checked;
    if (showUnreleasedChip) {
        chips.push({
            type: 'released',
            label: 'Show Unreleased',
            remove: () => { document.getElementById('releasedFilter').checked = false; }
        });
    }
    
    const effectSort = document.getElementById('effectSort').value;
    if (effectSort) {
        const effectName = getEffectName(parseInt(effectSort));
        chips.push({
            type: 'effectSort',
            label: `Sorted by: ${effectName}`,
            remove: () => { 
                document.getElementById('effectSort').value = '';
                currentSort = { column: '', direction: '' };
            }
        });
    }
    
    // Advanced filters
    Object.entries(advancedFilters.effects).forEach(([effectId, filter]) => {
        const effect = effectsData[effectId];
        if (effect) {
            const symbol = effect.symbol === 'percent' ? '%' : '';
            chips.push({
                type: 'effect',
                label: `${effect.name_en} ≥ ${filter.min}${symbol}`,
                remove: () => {
                    delete advancedFilters.effects[effectId];
                    const input = document.querySelector(`[data-effect-id="${effectId}"]`);
                    if (input) input.value = '';
                }
            });
        }
    });
    
    if (advancedFilters.hintSkills.length > 0) {
        chips.push({
            type: 'hintSkills',
            label: `Hint Skills: ${advancedFilters.hintSkills.length} selected`,
            remove: () => {
                advancedFilters.hintSkills = [];
                document.querySelectorAll('#hintSkillDropdown input').forEach(input => input.checked = false);
                updateMultiSelectText('hintSkillFilter', 'Any Hint Skills');
            }
        });
    }
    
    if (advancedFilters.eventSkills.length > 0) {
        chips.push({
            type: 'eventSkills',
            label: `Event Skills: ${advancedFilters.eventSkills.length} selected`,
            remove: () => {
                advancedFilters.eventSkills = [];
                document.querySelectorAll('#eventSkillDropdown input').forEach(input => input.checked = false);
                updateMultiSelectText('eventSkillFilter', 'Any Event Skills');
            }
        });
    }
    
    // Render chips
    filterChips.innerHTML = chips.map(chip => `
        <div class="filter-chip" data-filter-type="${chip.type}">
            ${chip.label}
            <button class="remove-chip" onclick="removeFilterChip('${chip.type}')">&times;</button>
        </div>
    `).join('');
    
    // Store remove functions for chip removal
    filterChips.removeCallbacks = chips.reduce((acc, chip) => {
        acc[chip.type] = chip.remove;
        return acc;
    }, {});
    
    // Show/hide active filters section
    activeFiltersDiv.style.display = chips.length > 0 ? 'block' : 'none';
}

// Remove individual filter chip
function removeFilterChip(filterType) {
    const filterChips = document.getElementById('filterChips');
    const callback = filterChips.removeCallbacks?.[filterType];
    if (callback) {
        callback();
        debouncedFilterAndSort();
    }
}

// Clear multi-select dropdown
function clearMultiSelect(multiSelectId) {
    document.querySelectorAll(`#${multiSelectId} input[type="checkbox"]`).forEach(input => {
        input.checked = false;
    });
    const defaultText = multiSelectId === 'rarityFilter' ? 'All Rarities' : 'All Types';
    updateMultiSelectText(multiSelectId, defaultText);
}

// Clear all filters
function clearAllFilters() {
    // Clear basic filters
    clearMultiSelect('rarityFilter');
    clearMultiSelect('typeFilter');
    document.getElementById('ownedFilter').value = '';
    document.getElementById('nameFilter').value = '';
    document.getElementById('releasedFilter').checked = false;
    
    // Clear advanced filters
    clearAdvancedFilters();
}

// Load all JSON data
async function loadData() {
    try {
        console.log('Loading data files...');
        
        // Load all JSON files
        const [cardsRes, effectsRes, skillsRes, eventsRes, eventsChainRes, eventsSpecialRes] = await Promise.all([
            fetch('data/raw_cards.json'),
            fetch('data/raw_effects.json'),
            fetch('data/raw_skills.json'),
            fetch('data/raw_events.json'),
            fetch('data/raw_eventsChain.json'),
            fetch('data/raw_eventsSpecial.json')
        ]);

        // Parse JSON
        const cardsData = await cardsRes.json();
        const effects = await effectsRes.json();
        const skills = await skillsRes.json();
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

        // Store card data
        cardData = cardsData.pageProps.supportData;

        // Process events data
        eventsData = {
            regular: events,
            chain: eventsChain,
            special: eventsSpecial
        };

        console.log(`Loaded ${cardData.length} cards`);
        
        // Load owned cards from storage
        loadOwnedCards();
        
        // Initialize the interface
        initializeInterface();

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = `Error loading data: ${error.message}`;
    }
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

// Get skill description (English only)
function getSkillDescription(skillId) {
    return skillsData[skillId]?.desc_en || skillsData[skillId]?.endesc || '';
}

// Get effective level for a card (considering ownership, global LB, and individual settings)
function getEffectiveLevel(card) {
    const cardId = card.support_id;
    
    // If global limit break is set
    if (globalLimitBreakLevel !== null) {
        // Check if we should override owned cards
        if (globalLimitBreakOverrideOwned || !isCardOwned(cardId)) {
            return limitBreaks[card.rarity][globalLimitBreakLevel];
        }
    }
    
    // If card is owned, use owned card level
    if (isCardOwned(cardId)) {
        return getOwnedCardLevel(cardId);
    }
    
    // Default to LB 2 for unowned cards in display
    return limitBreaks[card.rarity][2];
}

// Set global limit break level for all cards
function setGlobalLimitBreak(lbLevel) {
    globalLimitBreakLevel = lbLevel === '' ? null : parseInt(lbLevel);
    
    // Update all level inputs
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
    
    // Update modal if open
    if (currentModalCard) {
        const modalLevelInput = document.getElementById('modalLevelInput');
        if (modalLevelInput) {
            const effectiveLevel = getEffectiveLevel(currentModalCard);
            modalLevelInput.value = effectiveLevel;
            
            const shouldDisable = globalLimitBreakLevel !== null && 
                                 (globalLimitBreakOverrideOwned || !isCardOwned(currentModalCard.support_id));
            modalLevelInput.disabled = shouldDisable;
            
            updateModalDisplay(effectiveLevel);
        }
    }
}

// Set global limit break override setting
function setGlobalLimitBreakOverride(override) {
    globalLimitBreakOverrideOwned = override;
    
    // Refresh level inputs if global LB is set
    if (globalLimitBreakLevel !== null) {
        setGlobalLimitBreak(globalLimitBreakLevel);
    }
}

// Debounced filter and sort function
function debouncedFilterAndSort() {
    if (filterDebounceTimer) {
        clearTimeout(filterDebounceTimer);
    }
    
    filterDebounceTimer = setTimeout(() => {
        filterAndSortCards();
    }, 300);
}

// Check if card passes advanced filters
function passesAdvancedFilters(card) {
    const cardLevel = getEffectiveLevel(card);
    
    // Check effect filters
    for (const [effectId, filter] of Object.entries(advancedFilters.effects)) {
        const effectArray = card.effects?.find(effect => effect[0] == effectId);
        if (effectArray) {
            const value = calculateEffectValue(effectArray, cardLevel);
            if (value < filter.min) {
                return false;
            }
        } else {
            // Card doesn't have this effect, so it fails the filter
            return false;
        }
    }
    
    // Check hint skill filters
    if (advancedFilters.hintSkills.length > 0) {
        const cardHintSkills = card.hints?.hint_skills?.map(skill => skill.id) || [];
        const hasRequiredHintSkills = advancedFilters.hintSkills.some(skillId => 
            cardHintSkills.includes(skillId)
        );
        if (!hasRequiredHintSkills) {
            return false;
        }
    }
    
    // Check event skill filters
    if (advancedFilters.eventSkills.length > 0) {
        const cardEventSkills = card.event_skills?.map(skill => skill.id) || [];
        const hasRequiredEventSkills = advancedFilters.eventSkills.some(skillId => 
            cardEventSkills.includes(skillId)
        );
        if (!hasRequiredEventSkills) {
            return false;
        }
    }
    
    return true;
}

// Initialize effect sort dropdown
function initializeEffectSortDropdown() {
    const effectSortSelect = document.getElementById('effectSort');
    
    // Get all available effects and sort them by name
    const sortableEffects = Object.values(effectsData)
        .filter(effect => effect.name_en) // Only include effects with English names
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
    
    // Build options
    const options = ['<option value="">No Effect Sort</option>'];
    sortableEffects.forEach(effect => {
        const symbol = effect.symbol === 'percent' ? '%' : '';
        options.push(`<option value="${effect.id}">${effect.name_en}${symbol ? ' (%)' : ''}</option>`);
    });
    
    effectSortSelect.innerHTML = options.join('');
}

// Handle effect sort dropdown change
function handleEffectSort(e) {
    const effectId = e.target.value;
    
    if (effectId) {
        // Set effect-based sort
        currentSort = {
            column: `effect_${effectId}`,
            direction: 'desc' // Default to descending for effects (highest first)
        };
    } else {
        // Clear sort
        currentSort = { column: '', direction: '' };
    }
    
    // Update sort arrows (clear all since this is dropdown-based)
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    filterAndSortCards();
}

// Create fallback icon element
function createCardIconFallback() {
    const fallback = document.createElement('div');
    fallback.className = 'card-icon-fallback';
    fallback.textContent = '🔷';
    return fallback;
}

// Handle card icon load error
function handleCardIconError(img) {
    const fallback = createCardIconFallback();
    img.parentNode.replaceChild(fallback, img);
}

// Create fallback card image element
function createCardImageFallback() {
    const fallback = document.createElement('div');
    fallback.className = 'card-image-fallback';
    fallback.textContent = 'Card Image';
    return fallback;
}

// Handle card image load error
function handleCardImageError(img) {
    const fallback = createCardImageFallback();
    img.parentNode.replaceChild(fallback, img);
}

// Render card table
function renderCards(cards = cardData) {
    const tbody = document.getElementById('cardTableBody');
    tbody.innerHTML = '';

    cards.forEach(card => {
        const row = document.createElement('tr');
        const cardId = card.support_id;
        const isOwned = isCardOwned(cardId);
        
        // Add ownership class
        row.className = isOwned ? 'owned' : 'unowned';
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            // Don't open modal if clicking on checkbox or input
            if (e.target.type !== 'checkbox' && e.target.type !== 'number') {
                openCardDetails(cardId);
            }
        });
        
        // Get effective level for display
        const effectiveLevel = getEffectiveLevel(card);
        const limitBreakLevel = getLimitBreakLevel(effectiveLevel, card.rarity);
        
        // Calculate main effects
        const mainEffects = card.effects.slice(0, 3).map(effect => {
            if (effect[0] && effectsData[effect[0]]) {
                const value = calculateEffectValue(effect, effectiveLevel);
                const effectName = getEffectName(effect[0]);
                const symbol = effectsData[effect[0]].symbol;
                return `${effectName}: ${value}${symbol === 'percent' ? '%' : ''}`;
            }
            return '';
        }).filter(e => e).join('<br>');

        // Get hint skills
        const hintSkills = card.hints?.hint_skills?.slice(0, 3).map(skill => 
            getSkillName(skill.id)
        ).join('<br>') || 'None';

        // Determine if level input should be disabled
        const shouldDisableLevel = !isOwned && globalLimitBreakLevel === null ||
                                  globalLimitBreakLevel !== null && 
                                  (globalLimitBreakOverrideOwned || !isOwned);

        row.innerHTML = `
            <td class="ownership-checkbox">
                <input type="checkbox" ${isOwned ? 'checked' : ''} data-card-id="${cardId}" onclick="event.stopPropagation()">
            </td>
            <td>
                <img src="support_card_images/${cardId}_i.png" 
                     class="card-icon" 
                     alt="${card.char_name || 'Unknown Card'}"
                     onerror="handleCardIconError(this)"
                     loading="lazy">
            </td>
            <td class="card-name">${card.char_name || 'Unknown Card'}</td>
            <td><span class="rarity rarity-${card.rarity}">${['', 'R', 'SR', 'SSR'][card.rarity]}</span></td>
            <td><span class="type type-${card.type}">${card.type}</span></td>
            <td><input type="number" class="level-input" value="${effectiveLevel}" min="1" max="${limitBreaks[card.rarity][4]}" data-card-id="${cardId}" onclick="event.stopPropagation()" ${shouldDisableLevel ? 'disabled' : ''}></td>
            <td>${limitBreakLevel}</td>
            <td class="effects-summary">${mainEffects}</td>
            <td class="effects-summary">${hintSkills}</td>
            <td>${card.release_en || 'Unreleased'}</td>
        `;
        
        tbody.appendChild(row);
    });

    // Add event listeners for ownership checkboxes
    document.querySelectorAll('.ownership-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const cardId = parseInt(e.target.dataset.cardId);
            const owned = e.target.checked;
            setCardOwnership(cardId, owned);
            
            // Update the row class and level input state
            const row = e.target.closest('tr');
            row.className = owned ? 'owned' : 'unowned';
            
            const levelInput = row.querySelector('.level-input');
            const shouldDisableLevel = !owned && globalLimitBreakLevel === null ||
                                      globalLimitBreakLevel !== null && 
                                      (globalLimitBreakOverrideOwned || !owned);
            levelInput.disabled = shouldDisableLevel;
            
            if (owned) {
                levelInput.value = getOwnedCardLevel(cardId);
            } else {
                const card = cardData.find(c => c.support_id === cardId);
                levelInput.value = getEffectiveLevel(card);
            }
            updateCardDisplay(levelInput);
        });
    });

    // Add event listeners for level inputs
    document.querySelectorAll('.level-input').forEach(input => {
        input.addEventListener('change', (e) => {
            updateCardDisplay(e.target);
            
            // Update owned card level if card is owned and not overridden by global LB
            const cardId = parseInt(e.target.dataset.cardId);
            if (isCardOwned(cardId) && 
                (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
                setOwnedCardLevel(cardId, parseInt(e.target.value));
            }
        });
    });
}

// Update card display when level changes
function updateCardDisplay(input) {
    const cardId = parseInt(input.dataset.cardId);
    const level = parseInt(input.value);
    const card = cardData.find(c => c.support_id === cardId);
    
    if (!card) return;
    
    const row = input.closest('tr');
    const limitBreakLevel = getLimitBreakLevel(level, card.rarity);
    
    // Update limit break display
    row.children[6].textContent = limitBreakLevel;
    
    // Recalculate and update main effects
    const mainEffects = card.effects.slice(0, 3).map(effect => {
        if (effect[0] && effectsData[effect[0]]) {
            const value = calculateEffectValue(effect, level);
            const effectName = getEffectName(effect[0]);
            const symbol = effectsData[effect[0]].symbol;
            return `${effectName}: ${value}${symbol === 'percent' ? '%' : ''}`;
        }
        return '';
    }).filter(e => e).join('<br>');
    
    row.children[7].innerHTML = mainEffects;
    
    // Update modal if it's open for this card
    if (currentModalCard && currentModalCard.support_id === cardId) {
        const modalLevelInput = document.getElementById('modalLevelInput');
        if (modalLevelInput && modalLevelInput.value != level) {
            modalLevelInput.value = level;
            updateModalDisplay(level);
        }
    }
}

// Open card details modal
function openCardDetails(cardId) {
    const card = cardData.find(c => c.support_id === cardId);
    if (!card) return;
    
    currentModalCard = card;
    
    // Get current effective level
    const currentLevel = getEffectiveLevel(card);
    
    renderCardDetails(card, currentLevel);
    
    const modal = document.getElementById('cardModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Close card details modal
function closeCardDetails() {
    const modal = document.getElementById('cardModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentModalCard = null;
}

// Render card details in modal
function renderCardDetails(card, level) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = `${card.char_name || 'Unknown Card'}`;
    
    const cardId = card.support_id;
    const isOwned = isCardOwned(cardId);
    const limitBreakLevel = getLimitBreakLevel(level, card.rarity);
    
    modalBody.innerHTML = `
        <div class="card-detail-header">
            <img src="support_card_images/${cardId}.png" 
                 class="card-image rarity-${card.rarity}" 
                 alt="${card.char_name || 'Unknown Card'}"
                 onerror="handleCardImageError(this)"
                 loading="lazy">
            <div class="card-basic-info">
                <h3>${card.char_name || 'Unknown Card'}</h3>
                <div class="character-name">Card Name: ${card.name_en || 'Not Available'}</div>
                <div class="card-badges">
                    <span class="rarity rarity-${card.rarity}">${['', 'R', 'SR', 'SSR'][card.rarity]}</span>
                    <span class="type type-${card.type}">${card.type}</span>
                </div>
                <div class="release-info">
                    English Release: ${card.release_en || 'Not Released'}<br>
                    ${card.release ? `Original Release: ${card.release}<br>` : ''}
                    Obtained: ${card.obtained || 'Unknown'}
                </div>
            </div>
            <div class="level-control-panel">
                <div class="ownership-controls">
                    <label>
                        <input type="checkbox" id="modalOwnershipToggle" ${isOwned ? 'checked' : ''}> 
                        Owned
                    </label>
                    <span class="ownership-status ${isOwned ? 'owned' : 'unowned'}">
                        ${isOwned ? '✓ Owned' : '✗ Not Owned'}
                    </span>
                </div>
                <div class="level-controls">
                    <label for="modalLevelInput">Level:</label>
                    <input type="number" id="modalLevelInput" class="modal-level-input" 
                           value="${level}" min="1" max="${limitBreaks[card.rarity][4]}" 
                           ${!isOwned && globalLimitBreakLevel === null ? 'disabled' : ''} 
                           ${globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned) ? 'disabled' : ''}>
                    <span class="lb-indicator">LB ${limitBreakLevel}</span>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h4>Effects</h4>
            <div class="effects-grid" id="effectsGrid">
                ${renderEffectsGrid(card, level)}
            </div>
        </div>
        
        <div class="detail-section">
            <h4>Hint Skills</h4>
            <div class="skills-grid" id="hintSkillsGrid">
                ${renderHintSkills(card)}
            </div>
        </div>
        
        ${card.event_skills && card.event_skills.length > 0 ? `
        <div class="detail-section">
            <h4>Event Skills</h4>
            <div class="skills-grid">
                ${renderEventSkills(card)}
            </div>
        </div>
        ` : ''}
        
        <div class="detail-section">
            <h4>Character Events</h4>
            <div class="events-list">
                ${renderCharacterEvents(card)}
            </div>
        </div>
    `;
    
    // Add event listener for modal ownership toggle
    const modalOwnershipToggle = document.getElementById('modalOwnershipToggle');
    modalOwnershipToggle.addEventListener('change', (e) => {
        const owned = e.target.checked;
        setCardOwnership(cardId, owned);
        
        // Update ownership status display
        const statusElement = document.querySelector('.ownership-status');
        statusElement.className = `ownership-status ${owned ? 'owned' : 'unowned'}`;
        statusElement.textContent = owned ? '✓ Owned' : '✗ Not Owned';
        
        // Update level input state
        const modalLevelInput = document.getElementById('modalLevelInput');
        const shouldDisableLevel = !owned && globalLimitBreakLevel === null ||
                                  globalLimitBreakLevel !== null && 
                                  (globalLimitBreakOverrideOwned || !owned);
        modalLevelInput.disabled = shouldDisableLevel;
        
        if (owned) {
            modalLevelInput.value = getOwnedCardLevel(cardId);
            updateModalDisplay(getOwnedCardLevel(cardId));
        } else {
            modalLevelInput.value = getEffectiveLevel(card);
            updateModalDisplay(getEffectiveLevel(card));
        }
        
        // Update table display
        debouncedFilterAndSort();
    });
    
    // Add event listener for modal level input
    const modalLevelInput = document.getElementById('modalLevelInput');
    modalLevelInput.addEventListener('change', (e) => {
        const newLevel = parseInt(e.target.value);
        updateModalDisplay(newLevel);
        
        // Update owned card level and table input
        if (isOwned && 
            (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
            setOwnedCardLevel(cardId, newLevel);
            
            const tableInput = document.querySelector(`input[data-card-id="${cardId}"]`);
            if (tableInput) {
                tableInput.value = newLevel;
                updateCardDisplay(tableInput);
            }
        }
    });
}

// Update modal display when level changes
function updateModalDisplay(level) {
    if (!currentModalCard) return;
    
    const limitBreakLevel = getLimitBreakLevel(level, currentModalCard.rarity);
    const lbIndicator = document.querySelector('.lb-indicator');
    if (lbIndicator) {
        lbIndicator.textContent = `LB ${limitBreakLevel}`;
    }
    
    const effectsGrid = document.getElementById('effectsGrid');
    if (effectsGrid) {
        effectsGrid.innerHTML = renderEffectsGrid(currentModalCard, level);
    }
}

// Render effects grid
function renderEffectsGrid(card, level) {
    if (!card.effects || card.effects.length === 0) {
        return '<div class="no-data">No effects data available</div>';
    }
    
    return card.effects.map(effect => {
        if (!effect[0] || !effectsData[effect[0]]) return '';
        
        const effectId = effect[0];
        const effectInfo = effectsData[effectId];
        const isLocked = isEffectLocked(effect, level);
        const value = isLocked ? 0 : calculateEffectValue(effect, level);
        const symbol = effectInfo.symbol === 'percent' ? '%' : '';
        
        return `
            <div class="effect-item ${isLocked ? 'effect-locked' : ''}">
                <div class="effect-name">${effectInfo.name_en}</div>
                <div class="effect-value">${isLocked ? 'Locked' : `${value}${symbol}`}</div>
                <div class="effect-description">${effectInfo.desc_en || ''}</div>
            </div>
        `;
    }).filter(html => html).join('');
}

// Render hint skills
function renderHintSkills(card) {
    if (!card.hints?.hint_skills || card.hints.hint_skills.length === 0) {
        return '<div class="no-data">No hint skills available</div>';
    }
    
    return card.hints.hint_skills.map(skill => {
        const skillInfo = skillsData[skill.id];
        const skillName = skillInfo?.name_en || skillInfo?.enname || skill.name_en || `Skill ${skill.id}`;
        
        return `
            <div class="skill-item">
                <div class="skill-header">
                    <div class="skill-name">${skillName}</div>
                    <div class="skill-types">
                        ${(skill.type || []).map(type => `<span class="skill-type">${type}</span>`).join('')}
                    </div>
                </div>
                <div class="skill-description">${getSkillDescription(skill.id)}</div>
            </div>
        `;
    }).filter(html => html).join('');
}

// Render event skills
function renderEventSkills(card) {
    if (!card.event_skills || card.event_skills.length === 0) {
        return '<div class="no-data">No event skills available</div>';
    }
    
    return card.event_skills.map(skill => {
        const skillInfo = skillsData[skill.id];
        const skillName = skillInfo?.name_en || skillInfo?.enname || skill.name_en || `Skill ${skill.id}`;
        
        return `
            <div class="skill-item">
                <div class="skill-header">
                    <div class="skill-name">${skillName}</div>
                    <div class="skill-types">
                        ${(skill.type || []).map(type => `<span class="skill-type">${type}</span>`).join('')}
                        <span class="skill-type">Rarity ${skill.rarity || 1}</span>
                    </div>
                </div>
                <div class="skill-description">${getSkillDescription(skill.id)}</div>
            </div>
        `;
    }).join('');
}

// Render character events
function renderCharacterEvents(card) {
    // Look for events by character ID
    let characterEvents = [];
    
    // Check regular events
    if (eventsData.regular) {
        const charEvents = eventsData.regular.find(eventGroup => eventGroup[0] === card.char_id);
        if (charEvents && charEvents[1]) {
            characterEvents = characterEvents.concat(charEvents[1]);
        }
    }
    
    // Check special events if this is a special character
    if (eventsData.special) {
        const specialEvents = eventsData.special.find(eventGroup => eventGroup[0] === card.char_id);
        if (specialEvents && specialEvents[1]) {
            characterEvents = characterEvents.concat(specialEvents[1]);
        }
    }
    
    if (characterEvents.length === 0) {
        return '<div class="no-data">No character events found</div>';
    }
    
    return characterEvents.slice(0, 5).map(event => {
        // Try to get English title from array index 103
        let eventTitle = 'Unknown Event';
        
        // Look for English title at index 103 in the localization array
        if (Array.isArray(event) && event.length > 3 && Array.isArray(event[3])) {
            const localizationArray = event[3];
            // Find index 103 in the array
            for (let i = 0; i < localizationArray.length; i += 2) {
                if (localizationArray[i] === 103) {
                    eventTitle = localizationArray[i + 1];
                    break;
                }
            }
        }
        
        // Fallback to first element if no English title found
        if (eventTitle === 'Unknown Event' && event[0]) {
            eventTitle = event[0];
        }
        
        const choices = event[1] || [];
        
        return `
            <div class="event-item">
                <div class="event-title">${eventTitle}</div>
                <div class="event-choices">
                    ${choices.map((choice, index) => `
                        <div class="event-choice">
                            <strong>Choice ${index + 1}:</strong> ${choice[0] || 'No description'}
                            <div class="choice-effects">
                                ${formatEventEffects(choice[1] || [])}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// Format event effects for display
function formatEventEffects(effects) {
    if (!effects || effects.length === 0) return 'No effects';
    
    return effects.map(effect => {
        const [type, value, skillId] = effect;
        
        switch(type) {
            case 'sp': return `Speed ${value}`;
            case 'st': return `Stamina ${value}`;
            case 'pt': return `Power ${value}`;
            case 'gu': return `Guts ${value}`;
            case 'in': return `Wisdom ${value}`;
            case 'en': return `Energy ${value}`;
            case 'mo': return `Mood ${value}`;
            case 'bo': return `Bond ${value}`;
            case 'sk': return `Skill: ${getSkillName(skillId)}`;
            default: return `${type}: ${value}`;
        }
    }).join(', ');
}

// Get selected values from multi-select dropdown
function getSelectedValues(multiSelectId) {
    const checkboxes = document.querySelectorAll(`#${multiSelectId} input[type="checkbox"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
}

// Update multi-select display text
function updateMultiSelectText(multiSelectId, defaultText) {
    const multiSelect = document.getElementById(multiSelectId);
    const selectedValues = getSelectedValues(multiSelectId);
    const textElement = multiSelect.querySelector('.multi-select-text');
    
    if (selectedValues.length === 0) {
        textElement.textContent = defaultText;
    } else if (selectedValues.length === 1) {
        textElement.textContent = selectedValues[0].toUpperCase();
    } else {
        textElement.textContent = `${selectedValues.length} selected`;
    }
}

// Sort table data
function sortCards(cards, column, direction) {
    return cards.sort((a, b) => {
        let valueA, valueB;
        
        switch (column) {
            case 'name':
                valueA = (a.char_name || 'Unknown Card').toLowerCase();
                valueB = (b.char_name || 'Unknown Card').toLowerCase();
                break;
            case 'rarity':
                valueA = a.rarity;
                valueB = b.rarity;
                break;
            case 'type':
                valueA = a.type.toLowerCase();
                valueB = b.type.toLowerCase();
                break;
            case 'release':
                valueA = new Date(a.release_en || a.release || '2099-12-31');
                valueB = new Date(b.release_en || b.release || '2099-12-31');
                break;
            default:
                // Check if it's an effect-based sort
                if (column.startsWith('effect_')) {
                    const effectId = parseInt(column.replace('effect_', ''));
                    const levelA = getEffectiveLevel(a);
                    const levelB = getEffectiveLevel(b);
                    
                    const effectArrayA = a.effects?.find(effect => effect[0] == effectId);
                    const effectArrayB = b.effects?.find(effect => effect[0] == effectId);
                    
                    valueA = effectArrayA ? calculateEffectValue(effectArrayA, levelA) : -1;
                    valueB = effectArrayB ? calculateEffectValue(effectArrayB, levelB) : -1;
                } else {
                    return 0;
                }
        }
        
        if (direction === 'asc') {
            return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        } else {
            return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
        }
    });
}

// Handle column header clicks for sorting
function handleSort(column) {
    if (currentSort.column === column) {
        // Toggle direction
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // New column
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    
    // Update sort arrows
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    const currentHeader = document.querySelector(`th[data-sort="${column}"]`);
    if (currentHeader) {
        currentHeader.classList.add(`sort-${currentSort.direction}`);
    }
    
    filterAndSortCards();
}

// Filter and sort cards
function filterAndSortCards() {
    const selectedRarities = getSelectedValues('rarityFilter');
    const selectedTypes = getSelectedValues('typeFilter');
    const nameFilter = document.getElementById('nameFilter').value.toLowerCase();
    const showUnreleased = document.getElementById('releasedFilter').checked;
    const ownedFilter = document.getElementById('ownedFilter').value;

    let filtered = cardData.filter(card => {
        // Filter by release status (default: only show released cards)
        if (!showUnreleased && !card.release_en) return false;
        
        // Filter by rarity
        if (selectedRarities.length > 0 && !selectedRarities.includes(card.rarity.toString())) return false;
        
        // Filter by type
        if (selectedTypes.length > 0 && !selectedTypes.includes(card.type)) return false;
        
        // Filter by name
        if (nameFilter && !(card.char_name || '').toLowerCase().includes(nameFilter) && 
            !(card.name_en || '').toLowerCase().includes(nameFilter)) return false;
        
        // Filter by ownership status
        if (ownedFilter === 'owned' && !isCardOwned(card.support_id)) return false;
        if (ownedFilter === 'unowned' && isCardOwned(card.support_id)) return false;
        
        // Apply advanced filters
        if (!passesAdvancedFilters(card)) return false;
        
        return true;
    });

    // Apply sorting if set
    if (currentSort.column) {
        filtered = sortCards(filtered, currentSort.column, currentSort.direction);
    }

    renderCards(filtered);
    renderActiveFilters(filtered.length, cardData.length);
}

// Initialize interface
function initializeInterface() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('controls').style.display = 'block';
    document.getElementById('cardTable').style.display = 'block';

    // Initialize multi-select dropdowns
    initializeMultiSelects();
    
    // Initialize advanced filters
    initializeAdvancedFilters();
    
    // Initialize effect sort dropdown
    initializeEffectSortDropdown();

    // Add event listeners for filters
    document.getElementById('nameFilter').addEventListener('input', debouncedFilterAndSort);
    document.getElementById('releasedFilter').addEventListener('change', debouncedFilterAndSort);
    document.getElementById('ownedFilter').addEventListener('change', debouncedFilterAndSort);
    document.getElementById('globalLimitBreak').addEventListener('change', (e) => {
        setGlobalLimitBreak(e.target.value);
    });
    document.getElementById('globalOverrideOwned').addEventListener('change', (e) => {
        setGlobalLimitBreakOverride(e.target.checked);
    });
    document.getElementById('effectSort').addEventListener('change', handleEffectSort);

    // Add event listeners for data management buttons
    document.getElementById('exportBtn').addEventListener('click', exportOwnedCards);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            importOwnedCards(file);
        }
        e.target.value = ''; // Reset file input
    });
    document.getElementById('clearBtn').addEventListener('click', clearOwnedCards);

    // Add event listeners for advanced filters
    document.getElementById('clearAdvancedBtn').addEventListener('click', clearAdvancedFilters);
    document.getElementById('clearAllFilters').addEventListener('click', () => {
        clearAllFilters();
        debouncedFilterAndSort();
    });

    // Add sorting event listeners
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            handleSort(column);
        });
    });

    // Add modal event listeners
    document.getElementById('modalClose').addEventListener('click', closeCardDetails);
    document.getElementById('modalOverlay').addEventListener('click', closeCardDetails);
    document.getElementById('confirmClose').addEventListener('click', () => {
        document.getElementById('confirmModal').style.display = 'none';
    });
    document.getElementById('confirmOverlay').addEventListener('click', () => {
        document.getElementById('confirmModal').style.display = 'none';
    });
    
    // Add keyboard event listeners
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCardDetails();
            document.getElementById('confirmModal').style.display = 'none';
        }
    });

    // Initial render
    filterAndSortCards();
}

// Initialize multi-select dropdown functionality
function initializeMultiSelects() {
    const multiSelects = ['rarityFilter', 'typeFilter', 'hintSkillFilter', 'eventSkillFilter'];
    
    multiSelects.forEach(id => {
        const multiSelect = document.getElementById(id);
        const trigger = multiSelect.querySelector('.multi-select-trigger');
        const dropdown = multiSelect.querySelector('.multi-select-dropdown');
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        
        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Close other dropdowns
            multiSelects.forEach(otherId => {
                if (otherId !== id) {
                    document.getElementById(otherId).classList.remove('open');
                }
            });
            
            multiSelect.classList.toggle('open');
        });
        
        // Handle checkbox changes
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                let defaultText;
                switch(id) {
                    case 'rarityFilter': defaultText = 'All Rarities'; break;
                    case 'typeFilter': defaultText = 'All Types'; break;
                    case 'hintSkillFilter': defaultText = 'Any Hint Skills'; break;
                    case 'eventSkillFilter': defaultText = 'Any Event Skills'; break;
                }
                updateMultiSelectText(id, defaultText);
                
                if (id === 'rarityFilter' || id === 'typeFilter') {
                    debouncedFilterAndSort();
                }
            });
        });
        
        // Prevent dropdown from closing when clicking inside
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        multiSelects.forEach(id => {
            document.getElementById(id).classList.remove('open');
        });
    });
}

// Load data when page loads
document.addEventListener('DOMContentLoaded', loadData);