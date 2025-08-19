// Filter and Sort Module (Refactored)
// Streamlined filtering, sorting, and search functionality

// ===== FILTER STATE =====

// Filter debounce timer
let filterDebounceTimer = null;

// Sort categories configuration
const sortCategories = {
    effect: { 
        name: 'Effect', 
        hasOptions: true,
        getOptions: () => Object.values(effectsData)
            .filter(effect => effect.name_en)
            .sort((a, b) => a.name_en.localeCompare(b.name_en))
            .map(effect => ({ value: effect.id, label: effect.name_en }))
    },
    level: { name: 'Level', hasOptions: false },
    ownership: { name: 'Ownership', hasOptions: false },
    rarity: { name: 'Rarity', hasOptions: false },
    type: { name: 'Type', hasOptions: false },
    hintSkillCount: { name: 'Hint Skills', hasOptions: false },
    eventSkillCount: { name: 'Event Skills', hasOptions: false },
    skillTypeCount: { name: 'Skill Type Count', hasOptions: false }, // NEW: Added Skill Type Count
    releaseDate: { name: 'Release Date', hasOptions: false }
};

// ===== DEBOUNCED FILTERING =====

// Debounced filter and sort function
function debouncedFilterAndSort() {
    if (filterDebounceTimer) {
        clearTimeout(filterDebounceTimer);
    }
    
    filterDebounceTimer = setTimeout(() => {
        filterAndSortCards();
    }, 300);
}

// ===== MAIN FILTER AND SORT =====

// Main filter and sort function
function filterAndSortCards() {
    // Get filter values
    const filters = getFilterValues();
    
    // Apply all filters
    let filtered = cardData.filter(card => passesAllFilters(card, filters));

    // Calculate dynamic ranges and counts for UI updates
    const effectRanges = calculateEffectRanges(filtered);
    const skillCounts = calculateSkillCounts(filtered);
    
    // Update UI with ranges and counts
    updateEffectFilterPlaceholders(effectRanges);
    updateSkillFilterLabels(skillCounts);

    // Apply sorting
    filtered = applySorting(filtered);

    // Calculate total available cards
    const totalAvailable = filters.showUnreleased ? cardData.length : 
                          cardData.filter(card => card.release_en).length;

    // Render results
    renderCards(filtered);
    renderActiveFilters(filtered.length, totalAvailable);
}

// ===== FILTER VALUE EXTRACTION =====

// Get all current filter values
function getFilterValues() {
    return {
        selectedRarities: getSelectedValues('rarityFilter'),
        selectedTypes: getSelectedValues('typeFilter'),
        nameFilter: document.getElementById('nameFilter').value.toLowerCase(),
        showUnreleased: document.getElementById('releasedFilter').checked,
        ownedFilter: document.getElementById('ownedFilter').value
    };
}

// ===== FILTER APPLICATION =====

// Check if card passes all filters
function passesAllFilters(card, filters) {
    return passesBasicFilters(card, filters) && passesAdvancedFilters(card);
}

// Check basic filters
function passesBasicFilters(card, filters) {
    // Release status filter
    if (!filters.showUnreleased && !card.release_en) return false;
    
    // Rarity filter
    if (filters.selectedRarities.length > 0 && 
        !filters.selectedRarities.includes(card.rarity.toString())) return false;
    
    // Type filter
    if (filters.selectedTypes.length > 0 && 
        !filters.selectedTypes.includes(card.type)) return false;
    
    // Name filter
    if (filters.nameFilter && 
        !(card.char_name || '').toLowerCase().includes(filters.nameFilter) && 
        !(card.name_en || '').toLowerCase().includes(filters.nameFilter)) return false;
    
    // Ownership filter
    if (filters.ownedFilter === 'owned' && !isCardOwned(card.support_id)) return false;
    if (filters.ownedFilter === 'unowned' && isCardOwned(card.support_id)) return false;
    
    return true;
}

// Check advanced filters (moved from original file)
function passesAdvancedFilters(card) {
    const cardLevel = getEffectiveLevel(card);
    
    // Effect filters
    for (const [effectId, filter] of Object.entries(advancedFilters.effects)) {
        const effectArray = card.effects?.find(effect => effect[0] == effectId);
        if (effectArray) {
            const isLocked = isEffectLocked(effectArray, cardLevel);
            const value = isLocked ? 0 : calculateEffectValue(effectArray, cardLevel);
            if (value < filter.min) return false;
        } else {
            if (0 < filter.min) return false;
        }
    }
    
    // Hint skill filters
    if (advancedFilters.hintSkills.length > 0) {
        const cardHintSkills = card.hints?.hint_skills?.map(skill => skill.id) || [];
        const hasRequiredHintSkills = advancedFilters.hintSkills.some(skillId => 
            cardHintSkills.includes(skillId));
        if (!hasRequiredHintSkills) return false;
    }
    
    // Event skill filters
    if (advancedFilters.eventSkills.length > 0) {
        const cardEventSkills = card.event_skills?.map(skill => skill.id) || [];
        const hasRequiredEventSkills = advancedFilters.eventSkills.some(skillId => 
            cardEventSkills.includes(skillId));
        if (!hasRequiredEventSkills) return false;
    }
    
    // Include skill type filters
    if (advancedFilters.includeSkillTypes.length > 0) {
        const cardSkillTypes = getCardSkillTypes(card);
        const hasRequiredSkillTypes = advancedFilters.includeSkillTypes.some(typeId => 
            cardSkillTypes.includes(typeId));
        if (!hasRequiredSkillTypes) return false;
    }
    
    // Exclude skill type filters
    if (advancedFilters.excludeSkillTypes.length > 0) {
        const cardSkillTypes = getCardSkillTypes(card);
        const hasExcludedSkillTypes = advancedFilters.excludeSkillTypes.some(typeId => 
            cardSkillTypes.includes(typeId));
        if (hasExcludedSkillTypes) return false;
    }
    
    return true;
}

// ===== SKILL TYPE COUNT UTILITY =====

// NEW: Get skill type count for a card based on current filters
function getSkillTypeCount(card) {
    let count = 0;
    const includeSkillTypes = advancedFilters.includeSkillTypes || [];
    
    // Count hint skills
    if (card.hints?.hint_skills) {
        card.hints.hint_skills.forEach(skill => {
            if (includeSkillTypes.length === 0) {
                // No filter - count all skills
                count++;
            } else if (skill.type && Array.isArray(skill.type)) {
                // Check if skill has any matching types
                const hasMatchingType = skill.type.some(type => includeSkillTypes.includes(type));
                if (hasMatchingType) count++;
            }
        });
    }
    
    // Count event skills
    if (card.event_skills) {
        card.event_skills.forEach(skill => {
            if (includeSkillTypes.length === 0) {
                // No filter - count all skills
                count++;
            } else if (skill.type && Array.isArray(skill.type)) {
                // Check if skill has any matching types
                const hasMatchingType = skill.type.some(type => includeSkillTypes.includes(type));
                if (hasMatchingType) count++;
            }
        });
    }
    
    return count;
}

// ===== SORTING =====

// Apply sorting based on current sort configuration
function applySorting(cards) {
    if (multiSort.length > 0) {
        // Use multi-layer sorting
        const sorted = sortCardsByMultipleCriteria(cards);
        clearColumnSortIndicators();
        return sorted;
    } else if (currentSort.column) {
        // Use column sorting
        return sortCards(cards, currentSort.column, currentSort.direction);
    }
    
    return cards;
}

// Multi-layer sort function
function sortCardsByMultipleCriteria(cards) {
    return cards.sort((a, b) => {
        for (const sort of multiSort) {
            const comparison = compareCardsBySortCriteria(a, b, sort);
            if (comparison !== 0) return comparison;
        }
        return 0; // Maintain original order if all criteria are equal
    });
}

// Compare two cards by sort criteria
function compareCardsBySortCriteria(a, b, sort) {
    let valueA, valueB;
    
    switch (sort.category) {
        case 'effect':
            if (!sort.option) return 0;
            const levelA = getEffectiveLevel(a);
            const levelB = getEffectiveLevel(b);
            const effectArrayA = a.effects?.find(effect => effect[0] == sort.option);
            const effectArrayB = b.effects?.find(effect => effect[0] == sort.option);
            valueA = effectArrayA ? calculateEffectValue(effectArrayA, levelA) : 0;
            valueB = effectArrayB ? calculateEffectValue(effectArrayB, levelB) : 0;
            break;
            
        case 'level':
            valueA = getEffectiveLevel(a);
            valueB = getEffectiveLevel(b);
            break;
            
        case 'ownership':
            valueA = isCardOwned(a.support_id) ? 1 : 0;
            valueB = isCardOwned(b.support_id) ? 1 : 0;
            break;
            
        case 'rarity':
            valueA = a.rarity;
            valueB = b.rarity;
            break;
            
        case 'type':
            valueA = a.type.toLowerCase();
            valueB = b.type.toLowerCase();
            break;
            
        case 'hintSkillCount':
            valueA = a.hints?.hint_skills?.length || 0;
            valueB = b.hints?.hint_skills?.length || 0;
            break;
            
        case 'eventSkillCount':
            valueA = a.event_skills?.length || 0;
            valueB = b.event_skills?.length || 0;
            break;
            
        case 'skillTypeCount': // NEW: Skill Type Count sorting
            valueA = getSkillTypeCount(a);
            valueB = getSkillTypeCount(b);
            break;
            
        case 'releaseDate':
            valueA = new Date(a.release_en || a.release || '2099-12-31');
            valueB = new Date(b.release_en || b.release || '2099-12-31');
            break;
            
        default:
            return 0;
    }
    
    // Compare values
    let comparison = 0;
    if (valueA < valueB) comparison = -1;
    else if (valueA > valueB) comparison = 1;
    
    // Apply direction
    return sort.direction === 'desc' ? -comparison : comparison;
}

// Legacy column sorting
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
                return 0;
        }
        
        if (direction === 'asc') {
            return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        } else {
            return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
        }
    });
}

// ===== SORT MANAGEMENT =====

// Handle column header clicks for sorting
function handleSort(column) {
    // Clear multi sort when using column sorting
    clearAllSorts();
    
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    
    updateSortArrows(column, currentSort.direction);
    filterAndSortCards();
}

// Update sort arrows in column headers
function updateSortArrows(column, direction) {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    const currentHeader = document.querySelector(`th[data-sort="${column}"]`);
    if (currentHeader) {
        currentHeader.classList.add(`sort-${direction}`);
    }
}

// Clear column sort indicators
function clearColumnSortIndicators() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    currentSort.column = '';
    currentSort.direction = '';
}

// ===== MULTI-SORT MANAGEMENT =====

// Add sort layer
function addSortLayer() {
    multiSort.push({
        category: 'effect',
        option: null,
        direction: 'desc'
    });
    renderMultiSort();
    debouncedFilterAndSort();
}

// Remove sort layer
function removeSortLayer(index) {
    multiSort.splice(index, 1);
    renderMultiSort();
    debouncedFilterAndSort();
}

// Move sort layer
function moveSortLayer(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= multiSort.length) return;
    
    const item = multiSort.splice(fromIndex, 1)[0];
    multiSort.splice(toIndex, 0, item);
    renderMultiSort();
    debouncedFilterAndSort();
}

// Update sort layer
function updateSortLayer(index, updates) {
    if (index < 0 || index >= multiSort.length) return;
    
    multiSort[index] = { ...multiSort[index], ...updates };
    renderMultiSort();
    debouncedFilterAndSort();
}

// Clear all sorts
function clearAllSorts() {
    multiSort = [];
    renderMultiSort();
    debouncedFilterAndSort();
}

// ===== FILTER BUILDING =====

// Build effect filters dynamically
function buildEffectFilters(effectRanges = {}) {
    const effectFiltersContainer = document.getElementById('effectFilters');
    
    const availableEffects = Object.values(effectsData)
        .filter(effect => effect.name_en)
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
    
    effectFiltersContainer.innerHTML = availableEffects.map(effect => {
        const symbol = effect.symbol === 'percent' ? '%' : '';
        const range = effectRanges[effect.id];
        
        let placeholderText = `Min${symbol}`;
        if (range && range.max > 0) {
            placeholderText = `Min (${range.min} - ${range.max})${symbol}`;
        }
        
        return `
            <div class="effect-filter-item">
                <label>${effect.name_en}:</label>
                <input type="number" 
                       class="effect-filter-input" 
                       data-effect-id="${effect.id}"
                       placeholder="${placeholderText}" 
                       min="0">
            </div>
        `;
    }).join('');
    
    // FIXED: Add event listeners immediately after building the HTML
    attachEffectFilterListeners();
}

// ADDED: Attach effect filter event listeners
function attachEffectFilterListeners() {
    document.querySelectorAll('.effect-filter-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const effectId = parseInt(e.target.dataset.effectId);
            const value = parseFloat(e.target.value);
            
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
    // Get all unique skills and skill types
    const { allHintSkills, allEventSkills, allSkillTypes } = collectAllSkillsAndTypes();
    
    // Build dropdowns
    buildSkillDropdown('hintSkillDropdown', allHintSkills, true);
    buildSkillDropdown('eventSkillDropdown', allEventSkills, false);
    buildSkillTypeDropdown('includeSkillTypeDropdown', allSkillTypes);
    buildSkillTypeDropdown('excludeSkillTypeDropdown', allSkillTypes);
    
    // Initial event listeners
    rebindSkillFilterEvents();
}

// Collect all skills and skill types from cards
function collectAllSkillsAndTypes() {
    const allHintSkills = new Set();
    const allEventSkills = new Set();
    const allSkillTypes = new Set();
    
    cardData.forEach(card => {
        // Collect hint skills
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                allHintSkills.add(skill.id);
                if (skill.type && Array.isArray(skill.type)) {
                    skill.type.forEach(type => allSkillTypes.add(type));
                }
            });
        }
        
        // Collect event skills
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                allEventSkills.add(skill.id);
                if (skill.type && Array.isArray(skill.type)) {
                    skill.type.forEach(type => allSkillTypes.add(type));
                }
            });
        }
    });
    
    return { allHintSkills, allEventSkills, allSkillTypes };
}

// Build skill dropdown
function buildSkillDropdown(dropdownId, skills, isHintSkill) {
    const dropdown = document.getElementById(dropdownId);
    dropdown.innerHTML = Array.from(skills)
        .sort((a, b) => getSkillName(a).localeCompare(getSkillName(b)))
        .map(skillId => `
            <label>
                <input type="checkbox" value="${skillId}"> 
                ${getSkillName(skillId)}
            </label>
        `).join('');
}

// Build skill type dropdown
function buildSkillTypeDropdown(dropdownId, skillTypes) {
    const dropdown = document.getElementById(dropdownId);
    dropdown.innerHTML = Array.from(skillTypes)
        .sort((a, b) => getSkillTypeDescription(a).localeCompare(getSkillTypeDescription(b)))
        .map(typeId => `
            <label>
                <input type="checkbox" value="${typeId}"> 
                ${getSkillTypeDescription(typeId)}
            </label>
        `).join('');
}

// ===== FILTER CLEARING =====

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
    advancedFilters.includeSkillTypes = [];
    advancedFilters.excludeSkillTypes = [];
    
    // Clear checkboxes and update multi-select texts
    const skillFilterConfigs = [
        { dropdownId: 'hintSkillDropdown', filterId: 'hintSkillFilter', defaultText: 'Any Hint Skills' },
        { dropdownId: 'eventSkillDropdown', filterId: 'eventSkillFilter', defaultText: 'Any Event Skills' },
        { dropdownId: 'includeSkillTypeDropdown', filterId: 'includeSkillTypeFilter', defaultText: 'Any Skill Types' },
        { dropdownId: 'excludeSkillTypeDropdown', filterId: 'excludeSkillTypeFilter', defaultText: 'No Exclusions' }
    ];
    
    skillFilterConfigs.forEach(config => {
        document.querySelectorAll(`#${config.dropdownId} input[type="checkbox"]`).forEach(input => {
            input.checked = false;
        });
        updateMultiSelectText(config.filterId, config.defaultText);
    });
    
    // Rebuild skill filters to reset counts
    buildSkillFilters();
    debouncedFilterAndSort();
}

// Clear all filters
function clearAllFilters() {
    // Clear basic filters
    clearMultiSelect('rarityFilter');
    clearMultiSelect('typeFilter');
    document.getElementById('ownedFilter').value = '';
    document.getElementById('nameFilter').value = '';
    document.getElementById('releasedFilter').checked = false;
    
    // Clear sorts
    clearAllSorts();
    
    // Clear advanced filters
    clearAdvancedFilters();
}

// ===== INITIALIZATION =====

// Initialize advanced filters UI
function initializeAdvancedFilters() {
    buildEffectFilters();
    buildSkillFilters();
}

// ===== EXPORTS =====

window.FilterSort = {
    debouncedFilterAndSort,
    filterAndSortCards,
    handleSort,
    addSortLayer,
    removeSortLayer,
    moveSortLayer,
    updateSortLayer,
    clearAllSorts,
    buildEffectFilters,
    buildSkillFilters,
    attachEffectFilterListeners,
    clearAdvancedFilters,
    clearAllFilters,
    initializeAdvancedFilters,
    sortCategories,
    getSkillTypeCount // NEW: Export the skill type count function
};

// Export individual functions to global scope for backward compatibility
Object.assign(window, window.FilterSort);