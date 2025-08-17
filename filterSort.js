// Filter and Sort Module
// Handles advanced filtering, multi-layer sorting, and search functionality

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
    level: { 
        name: 'Level', 
        hasOptions: false 
    },
    ownership: { 
        name: 'Ownership', 
        hasOptions: false 
    },
    rarity: { 
        name: 'Rarity', 
        hasOptions: false 
    },
    type: { 
        name: 'Type', 
        hasOptions: false 
    },
    hintSkillCount: { 
        name: 'Hint Skills', 
        hasOptions: false 
    },
    eventSkillCount: { 
        name: 'Event Skills', 
        hasOptions: false 
    },
    releaseDate: { 
        name: 'Release Date', 
        hasOptions: false 
    }
};

// Debounced filter and sort function
function debouncedFilterAndSort() {
    if (filterDebounceTimer) {
        clearTimeout(filterDebounceTimer);
    }
    
    filterDebounceTimer = setTimeout(() => {
        filterAndSortCards();
    }, 300);
}

// Helper function to get all skill types from a card
function getCardSkillTypes(card) {
    const skillTypes = new Set();
    
    // Check hint skills
    if (card.hints?.hint_skills) {
        card.hints.hint_skills.forEach(skill => {
            if (skill.type && Array.isArray(skill.type)) {
                skill.type.forEach(type => skillTypes.add(type));
            }
        });
    }
    
    // Check event skills
    if (card.event_skills) {
        card.event_skills.forEach(skill => {
            if (skill.type && Array.isArray(skill.type)) {
                skill.type.forEach(type => skillTypes.add(type));
            }
        });
    }
    
    return Array.from(skillTypes);
}

// Check if card passes advanced filters
function passesAdvancedFilters(card) {
    const cardLevel = getEffectiveLevel(card);
    
    // Check effect filters
    for (const [effectId, filter] of Object.entries(advancedFilters.effects)) {
        const effectArray = card.effects?.find(effect => effect[0] == effectId);
        if (effectArray) {
            // Check if effect is locked at current level
            const isLocked = isEffectLocked(effectArray, cardLevel);
            const value = isLocked ? 0 : calculateEffectValue(effectArray, cardLevel);
            
            if (value < filter.min) {
                return false;
            }
        } else {
            // Card doesn't have this effect at all, so it fails the filter (value = 0)
            if (0 < filter.min) {
                return false;
            }
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
    
    // Check include skill type filters
    if (advancedFilters.includeSkillTypes.length > 0) {
        const cardSkillTypes = getCardSkillTypes(card);
        const hasRequiredSkillTypes = advancedFilters.includeSkillTypes.some(typeId => 
            cardSkillTypes.includes(typeId)
        );
        if (!hasRequiredSkillTypes) {
            return false;
        }
    }
    
    // Check exclude skill type filters
    if (advancedFilters.excludeSkillTypes.length > 0) {
        const cardSkillTypes = getCardSkillTypes(card);
        const hasExcludedSkillTypes = advancedFilters.excludeSkillTypes.some(typeId => 
            cardSkillTypes.includes(typeId)
        );
        if (hasExcludedSkillTypes) {
            return false;
        }
    }
    
    return true;
}

// Multi-layer sort cards by multiple criteria
function sortCardsByMultipleCriteria(cards) {
    return cards.sort((a, b) => {
        for (const sort of multiSort) {
            let valueA, valueB;
            
            switch (sort.category) {
                case 'effect':
                    if (!sort.option) continue;
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
                    
                case 'releaseDate':
                    valueA = new Date(a.release_en || a.release || '2099-12-31');
                    valueB = new Date(b.release_en || b.release || '2099-12-31');
                    break;
                    
                default:
                    continue;
            }
            
            // Compare values
            let comparison = 0;
            if (valueA < valueB) comparison = -1;
            else if (valueA > valueB) comparison = 1;
            
            // Apply direction
            if (sort.direction === 'desc') comparison = -comparison;
            
            // If values are different, return the comparison
            if (comparison !== 0) return comparison;
        }
        
        // If all sort criteria are equal, maintain original order
        return 0;
    });
}

// Sort table data (legacy column sorting)
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

// Handle column header clicks for sorting
function handleSort(column) {
    // Clear multi sort when using column sorting
    clearAllSorts();
    
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

    // Apply all filters including advanced filters
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

    // Calculate effect ranges from the fully filtered set and update placeholders
    const effectRanges = calculateEffectRanges(filtered);
    updateEffectFilterPlaceholders(effectRanges);
    
    // Calculate skill counts from the fully filtered set and update labels
    const skillCounts = calculateSkillCounts(filtered);
    updateSkillFilterLabels(skillCounts);

    // Apply sorting
    if (multiSort.length > 0) {
        // Use multi-layer sorting
        filtered = sortCardsByMultipleCriteria(filtered);
        
        // Clear column sorting indicators when using multi-sort
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        currentSort.column = '';
        currentSort.direction = '';
    } else if (currentSort.column) {
        // Sort by column header
        filtered = sortCards(filtered, currentSort.column, currentSort.direction);
    }

    // Calculate total available cards based on release filter
    const totalAvailable = showUnreleased ? cardData.length : cardData.filter(card => card.release_en).length;

    renderCards(filtered);
    renderActiveFilters(filtered.length, totalAvailable);
}

// Calculate min/max effect values for currently filtered cards (excluding advanced filters)
function calculateEffectRanges(cards) {
    const ranges = {};
    
    // Use the same effects as sort options - all effects with English names
    const availableEffects = Object.values(effectsData)
        .filter(effect => effect.name_en)
        .map(effect => effect.id);
    
    availableEffects.forEach(effectId => {
        const values = [];
        
        cards.forEach(card => {
            const effectArray = card.effects?.find(effect => effect[0] == effectId);
            if (effectArray) {
                const level = getEffectiveLevel(card);
                const value = calculateEffectValue(effectArray, level);
                if (value > 0) { // Only include values > 0
                    values.push(value);
                }
            }
        });
        
        if (values.length > 0) {
            ranges[effectId] = {
                min: Math.min(...values),
                max: Math.max(...values)
            };
        } else {
            ranges[effectId] = { min: 0, max: 0 };
        }
    });
    
    return ranges;
}

// Calculate skill counts for currently filtered cards
function calculateSkillCounts(cards) {
    const hintSkillCounts = {};
    const eventSkillCounts = {};
    const skillTypeCounts = {};
    
    cards.forEach(card => {
        // Count hint skills
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                hintSkillCounts[skill.id] = (hintSkillCounts[skill.id] || 0) + 1;
                
                // Count skill types from hint skills
                if (skill.type && Array.isArray(skill.type)) {
                    skill.type.forEach(type => {
                        skillTypeCounts[type] = (skillTypeCounts[type] || 0) + 1;
                    });
                }
            });
        }
        
        // Count event skills
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                eventSkillCounts[skill.id] = (eventSkillCounts[skill.id] || 0) + 1;
                
                // Count skill types from event skills
                if (skill.type && Array.isArray(skill.type)) {
                    skill.type.forEach(type => {
                        skillTypeCounts[type] = (skillTypeCounts[type] || 0) + 1;
                    });
                }
            });
        }
    });
    
    return { hintSkillCounts, eventSkillCounts, skillTypeCounts };
}

// Update effect filter placeholders with current ranges
function updateEffectFilterPlaceholders(effectRanges) {
    document.querySelectorAll('.effect-filter-input').forEach(input => {
        const effectId = parseInt(input.dataset.effectId);
        const effect = effectsData[effectId];
        
        if (effect) {
            const symbol = effect.symbol === 'percent' ? '%' : '';
            const range = effectRanges[effectId];
            
            // Create placeholder text with range info
            let placeholderText = `Min${symbol}`;
            if (range && range.max > 0) {
                placeholderText = `Min (${range.min} - ${range.max})${symbol}`;
            }
            
            input.placeholder = placeholderText;
        }
    });
}

// Update skill filter labels with current counts
function updateSkillFilterLabels(skillCounts) {
    const { hintSkillCounts, eventSkillCounts, skillTypeCounts } = skillCounts;
    
    // Update hint skill labels
    document.querySelectorAll('#hintSkillDropdown label').forEach(label => {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const skillId = parseInt(checkbox.value);
            const skillName = getSkillName(skillId);
            const count = hintSkillCounts[skillId] || 0;
            const isChecked = checkbox.checked;
            
            if (count > 0) {
                label.innerHTML = `<input type="checkbox" value="${skillId}" ${isChecked ? 'checked' : ''}> ${skillName} (${count})`;
                label.style.opacity = '1';
            } else {
                label.innerHTML = `<input type="checkbox" value="${skillId}" ${isChecked ? 'checked' : ''}> ${skillName} (0)`;
                label.style.opacity = '0.5';
            }
        }
    });
    
    // Update event skill labels
    document.querySelectorAll('#eventSkillDropdown label').forEach(label => {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const skillId = parseInt(checkbox.value);
            const skillName = getSkillName(skillId);
            const count = eventSkillCounts[skillId] || 0;
            const isChecked = checkbox.checked;
            
            if (count > 0) {
                label.innerHTML = `<input type="checkbox" value="${skillId}" ${isChecked ? 'checked' : ''}> ${skillName} (${count})`;
                label.style.opacity = '1';
            } else {
                label.innerHTML = `<input type="checkbox" value="${skillId}" ${isChecked ? 'checked' : ''}> ${skillName} (0)`;
                label.style.opacity = '0.5';
            }
        }
    });
    
    // Update skill type labels
    document.querySelectorAll('#includeSkillTypeDropdown label, #excludeSkillTypeDropdown label').forEach(label => {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const typeId = checkbox.value;
            const typeName = getSkillTypeDescription(typeId);
            const count = skillTypeCounts[typeId] || 0;
            const isChecked = checkbox.checked;
            
            if (count > 0) {
                label.innerHTML = `<input type="checkbox" value="${typeId}" ${isChecked ? 'checked' : ''}> ${typeName} (${count})`;
                label.style.opacity = '1';
            } else {
                label.innerHTML = `<input type="checkbox" value="${typeId}" ${isChecked ? 'checked' : ''}> ${typeName} (0)`;
                label.style.opacity = '0.5';
            }
        }
    });
    
    // Re-add event listeners after updating innerHTML
    rebindSkillFilterEvents();
}

// Re-bind skill filter event listeners after updating labels
function rebindSkillFilterEvents() {
    const hintSkillDropdown = document.getElementById('hintSkillDropdown');
    const eventSkillDropdown = document.getElementById('eventSkillDropdown');
    const includeSkillTypeDropdown = document.getElementById('includeSkillTypeDropdown');
    const excludeSkillTypeDropdown = document.getElementById('excludeSkillTypeDropdown');
    
    // Remove old event listeners by cloning and replacing
    const newHintDropdown = hintSkillDropdown.cloneNode(true);
    const newEventDropdown = eventSkillDropdown.cloneNode(true);
    const newIncludeTypeDropdown = includeSkillTypeDropdown.cloneNode(true);
    const newExcludeTypeDropdown = excludeSkillTypeDropdown.cloneNode(true);
    
    hintSkillDropdown.parentNode.replaceChild(newHintDropdown, hintSkillDropdown);
    eventSkillDropdown.parentNode.replaceChild(newEventDropdown, eventSkillDropdown);
    includeSkillTypeDropdown.parentNode.replaceChild(newIncludeTypeDropdown, includeSkillTypeDropdown);
    excludeSkillTypeDropdown.parentNode.replaceChild(newExcludeTypeDropdown, excludeSkillTypeDropdown);
    
    // Add new event listeners
    newHintDropdown.addEventListener('change', () => {
        advancedFilters.hintSkills = Array.from(newHintDropdown.querySelectorAll('input:checked'))
            .map(input => parseInt(input.value));
        updateMultiSelectText('hintSkillFilter', 'Any Hint Skills');
        debouncedFilterAndSort();
    });
    
    newEventDropdown.addEventListener('change', () => {
        advancedFilters.eventSkills = Array.from(newEventDropdown.querySelectorAll('input:checked'))
            .map(input => parseInt(input.value));
        updateMultiSelectText('eventSkillFilter', 'Any Event Skills');
        debouncedFilterAndSort();
    });
    
    newIncludeTypeDropdown.addEventListener('change', () => {
        advancedFilters.includeSkillTypes = Array.from(newIncludeTypeDropdown.querySelectorAll('input:checked'))
            .map(input => input.value);
        updateMultiSelectText('includeSkillTypeFilter', 'Any Skill Types');
        debouncedFilterAndSort();
    });
    
    newExcludeTypeDropdown.addEventListener('change', () => {
        advancedFilters.excludeSkillTypes = Array.from(newExcludeTypeDropdown.querySelectorAll('input:checked'))
            .map(input => input.value);
        updateMultiSelectText('excludeSkillTypeFilter', 'No Exclusions');
        debouncedFilterAndSort();
    });
}

// Build effect filters dynamically
function buildEffectFilters(effectRanges = {}) {
    const effectFiltersContainer = document.getElementById('effectFilters');
    
    // Use the same effects as sort options - all effects with English names
    const availableEffects = Object.values(effectsData)
        .filter(effect => effect.name_en)
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
    
    effectFiltersContainer.innerHTML = availableEffects.map(effect => {
        const symbol = effect.symbol === 'percent' ? '%' : '';
        const range = effectRanges[effect.id];
        
        // Create placeholder text with range info
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
    
    // Initial event listeners (will be rebound by rebindSkillFilterEvents)
    rebindSkillFilterEvents();
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
    advancedFilters.includeSkillTypes = [];
    advancedFilters.excludeSkillTypes = [];
    
    document.querySelectorAll('#hintSkillDropdown input[type="checkbox"]').forEach(input => {
        input.checked = false;
    });
    
    document.querySelectorAll('#eventSkillDropdown input[type="checkbox"]').forEach(input => {
        input.checked = false;
    });
    
    document.querySelectorAll('#includeSkillTypeDropdown input[type="checkbox"]').forEach(input => {
        input.checked = false;
    });
    
    document.querySelectorAll('#excludeSkillTypeDropdown input[type="checkbox"]').forEach(input => {
        input.checked = false;
    });
    
    updateMultiSelectText('hintSkillFilter', 'Any Hint Skills');
    updateMultiSelectText('eventSkillFilter', 'Any Event Skills');
    updateMultiSelectText('includeSkillTypeFilter', 'Any Skill Types');
    updateMultiSelectText('excludeSkillTypeFilter', 'No Exclusions');
    
    // Reset skill filter labels to original state (rebuild without counts)
    buildSkillFilters();
    
    debouncedFilterAndSort();
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
    
    // Clear sorts
    clearAllSorts();
    
    // Clear advanced filters (this will rebuild skill filters)
    clearAdvancedFilters();
}

// Get selected values from multi-select dropdown
function getSelectedValues(multiSelectId) {
    const checkboxes = document.querySelectorAll(`#${multiSelectId} input[type="checkbox"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
}