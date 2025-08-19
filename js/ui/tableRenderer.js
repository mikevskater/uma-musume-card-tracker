// Table Renderer Module (ENHANCED)
// Handles card table rendering and display updates with comparison mode support

// ===== TABLE RENDERING =====

// Render card table
function renderCards(cards = cardData) {
    // Store the filtered cards for modal navigation
    currentFilteredCards = cards;
    
    const tbody = document.getElementById('cardTableBody');
    tbody.innerHTML = '';

    cards.forEach(card => {
        const row = createCardTableRow(card);
        tbody.appendChild(row);
    });
}

// Create a single card table row (ENHANCED with comparison mode support)
function createCardTableRow(card) {
    const cardId = card.support_id;
    const isOwned = isCardOwned(cardId);
    const isSelected = selectedCards.includes(cardId);
    
    const row = createElement('tr', {
        className: `${isOwned ? 'owned' : 'unowned'} ${isSelected ? 'selected' : ''}`,
        style: 'cursor: pointer',
        'data-card-id': cardId
    });
    
    // Get effective level and limit break for display
    const effectiveLevel = getEffectiveLevel(card);
    let displayLimitBreak;
    if (globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned)) {
        displayLimitBreak = globalLimitBreakLevel;
    } else {
        displayLimitBreak = isOwned ? getOwnedCardLimitBreak(cardId) : 2;
    }
    
    // Create level display with potential indicator
    const levelDisplay = showMaxPotentialLevels && isOwned ? 
        `${effectiveLevel} <span class="max-potential-indicator">MAX</span>` : 
        effectiveLevel;
    
    // Get priority effects based on current level
    const priorityEffects = getPriorityEffects(card, 4, effectiveLevel);
    const mainEffectsDisplay = priorityEffects.join('<br>') || 'No effects';

    // Get hint skills (limit to 3)
    const hintSkills = card.hints?.hint_skills?.slice(0, 3).map(skill => 
        getSkillName(skill.id)
    ).join('<br>') || 'None';

    // ENHANCED: Determine control states with comparison mode consideration
    const shouldDisableLevel = !isOwned && globalLimitBreakLevel === null ||
                              globalLimitBreakLevel !== null && 
                              (globalLimitBreakOverrideOwned || !isOwned) ||
                              comparisonMode; // NEW: Disable in comparison mode

    const shouldDisableLB = !isOwned && globalLimitBreakLevel === null ||
                           globalLimitBreakLevel !== null && 
                           (globalLimitBreakOverrideOwned || !isOwned) ||
                           comparisonMode; // NEW: Disable in comparison mode

    const shouldDisableOwnership = comparisonMode; // NEW: Disable ownership checkbox in comparison mode

    // Build row HTML
    row.innerHTML = `
        <td class="ownership-checkbox ${comparisonMode ? 'comparison-mode-disabled' : ''}">
            ${createOwnershipCheckbox(cardId, isOwned, shouldDisableOwnership).outerHTML}
        </td>
        <td>
            ${createCardIcon(cardId, card.char_name).outerHTML}
        </td>
        <td class="card-name">${card.char_name || 'Unknown Card'}</td>
        <td>${createRarityBadge(card.rarity).outerHTML}</td>
        <td>${createTypeBadge(card.type).outerHTML}</td>
        <td class="${comparisonMode ? 'comparison-mode-disabled' : ''}">
            ${createLevelInput(
                cardId, 
                effectiveLevel, 
                limitBreaks[card.rarity][displayLimitBreak], 
                shouldDisableLevel
            ).outerHTML}
        </td>
        <td class="${comparisonMode ? 'comparison-mode-disabled' : ''}">
            ${createLimitBreakSelect(cardId, displayLimitBreak, card.rarity, shouldDisableLB).outerHTML}
        </td>
        <td class="effects-summary">${mainEffectsDisplay}</td>
        <td class="effects-summary">${hintSkills}</td>
        <td>${card.release_en || 'Unreleased'}</td>
    `;
    
    return row;
}

// Update card display when level changes
function updateCardDisplay(input) {
    const cardId = parseInt(input.dataset.cardId);
    const level = parseInt(input.value);
    const card = cardData.find(c => c.support_id === cardId);
    
    if (!card) return;
    
    const row = input.closest('tr');
    const isOwned = isCardOwned(cardId);
    
    // Determine which LB to display - respect global override settings
    let displayLimitBreak;
    if (globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned)) {
        displayLimitBreak = globalLimitBreakLevel;
    } else {
        displayLimitBreak = isOwned ? getOwnedCardLimitBreak(cardId) : 2;
    }
    
    // Update limit break display if needed
    const lbSelect = row.querySelector('.lb-select');
    if (lbSelect && lbSelect.value != displayLimitBreak) {
        lbSelect.value = displayLimitBreak;
    }
    
    // Recalculate and update priority effects using the typed level
    const priorityEffects = getPriorityEffects(card, 4, level);
    const mainEffectsDisplay = priorityEffects.join('<br>') || 'No effects';
    row.children[7].innerHTML = mainEffectsDisplay;
    
    // Update modal if it's open for this card
    if (currentModalCard && currentModalCard.support_id === cardId) {
        const modalLevelInput = document.getElementById('modalLevelInput');
        if (modalLevelInput && modalLevelInput.value != level) {
            modalLevelInput.value = level;
            updateModalDisplay(level);
        }
    }
}

// ===== ACTIVE FILTERS DISPLAY =====

// Render active filters display
function renderActiveFilters(filteredCount, totalCount) {
    const activeFiltersDiv = document.getElementById('activeFilters');
    const resultsCount = document.getElementById('resultsCount');
    const filterChips = document.getElementById('filterChips');
    
    // Update results count
    resultsCount.textContent = `Showing ${filteredCount} of ${totalCount} cards`;
    
    // Build filter chips
    const chips = buildFilterChips();
    
    // Render chips
    filterChips.innerHTML = chips.map(chip => 
        createFilterChip(chip.type, chip.label, chip.remove).outerHTML
    ).join('');
    
    // Store remove functions for chip removal
    filterChips.removeCallbacks = chips.reduce((acc, chip) => {
        acc[chip.type] = chip.remove;
        return acc;
    }, {});
    
    // Show/hide active filters section
    activeFiltersDiv.style.display = chips.length > 0 ? 'block' : 'none';
}

// Build filter chips data
function buildFilterChips() {
    const chips = [];
    
    // Sort layer chips
    multiSort.forEach((sort, index) => {
        const category = sortCategories[sort.category];
        const categoryName = category ? category.name : 'Unknown';
        let label = `Sort ${index + 1}: ${categoryName}`;
        
        if (sort.option) {
            label += ` (${getSortOptionLabel(sort.category, sort.option)})`;
        }
        label += ` ${sort.direction === 'asc' ? '↑' : '↓'}`;
        
        chips.push({
            type: `sort-${index}`,
            label: label,
            remove: () => removeSortLayer(index)
        });
    });
    
    // Basic filter chips
    addBasicFilterChips(chips);
    
    // Advanced filter chips
    addAdvancedFilterChips(chips);
    
    return chips;
}

// Add basic filter chips
function addBasicFilterChips(chips) {
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
        const typeLabels = selectedTypes.map(type => getTypeDisplayName(type));
        chips.push({
            type: 'type',
            label: `Type: ${typeLabels.join(', ')}`,
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
    
    const showUnreleased = document.getElementById('releasedFilter').checked;
    if (showUnreleased) {
        chips.push({
            type: 'released',
            label: 'Show Unreleased',
            remove: () => { document.getElementById('releasedFilter').checked = false; }
        });
    }
}

// Add advanced filter chips
function addAdvancedFilterChips(chips) {
    // Effect filters
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
    
    // Skill filters
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
    
    if (advancedFilters.includeSkillTypes.length > 0) {
        const typeNames = advancedFilters.includeSkillTypes.map(typeId => getSkillTypeDescription(typeId));
        chips.push({
            type: 'includeSkillTypes',
            label: `Include Types: ${typeNames.join(', ')}`,
            remove: () => {
                advancedFilters.includeSkillTypes = [];
                document.querySelectorAll('#includeSkillTypeDropdown input').forEach(input => input.checked = false);
                updateMultiSelectText('includeSkillTypeFilter', 'Any Skill Types');
            }
        });
    }
    
    if (advancedFilters.excludeSkillTypes.length > 0) {
        const typeNames = advancedFilters.excludeSkillTypes.map(typeId => getSkillTypeDescription(typeId));
        chips.push({
            type: 'excludeSkillTypes',
            label: `Exclude Types: ${typeNames.join(', ')}`,
            remove: () => {
                advancedFilters.excludeSkillTypes = [];
                document.querySelectorAll('#excludeSkillTypeDropdown input').forEach(input => input.checked = false);
                updateMultiSelectText('excludeSkillTypeFilter', 'No Exclusions');
            }
        });
    }
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

// ===== MULTI-SORT RENDERING =====

// Render multi-sort interface
function renderMultiSort() {
    const container = document.getElementById('multiSortContainer');
    
    if (multiSort.length === 0) {
        container.innerHTML = `
            <div class="no-sorts-message">
                Click "Add Sort Layer" to start sorting cards by different criteria.
            </div>
        `;
        return;
    }
    
    container.innerHTML = multiSort.map((sort, index) => 
        createSortLayer(sort, index, multiSort.length).outerHTML
    ).join('');
}

// ===== SELECTION CONTAINER RENDERING =====

// Render selection container for comparison mode
function renderSelectionContainer() {
    const selectionCount = document.getElementById('selectionCount');
    const selectedCardsList = document.getElementById('selectedCardsList');
    const compareBtn = document.getElementById('compareSelectedBtn');
    
    // Update count
    selectionCount.textContent = `${selectedCards.length} selected`;
    
    // Enable/disable compare button
    compareBtn.disabled = selectedCards.length === 0;
    
    // Render selected cards
    if (selectedCards.length === 0) {
        selectedCardsList.innerHTML = '<div class="no-selected-cards">No cards selected</div>';
        return;
    }
    
    selectedCardsList.innerHTML = selectedCards.map(cardId => {
        const card = cardData.find(c => c.support_id === cardId);
        if (!card) return '';
        
        return createSelectedCardItem(card).outerHTML;
    }).filter(html => html).join('');
}

// ===== SELECTION STATE MANAGEMENT =====

// Update card selection states in table
function updateCardSelectionStates() {
    document.querySelectorAll('#cardTableBody tr').forEach(row => {
        const cardId = parseInt(row.dataset.cardId);
        if (selectedCards.includes(cardId)) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });
}

// ===== SKILL FILTER UPDATES =====

// Update effect filter placeholders with current ranges
function updateEffectFilterPlaceholders(effectRanges) {
    document.querySelectorAll('.effect-filter-input').forEach(input => {
        const effectId = parseInt(input.dataset.effectId);
        const effect = effectsData[effectId];
        
        if (effect) {
            const symbol = effect.symbol === 'percent' ? '%' : '';
            const range = effectRanges[effectId];
            
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
    
    updateSkillDropdownLabels('#hintSkillDropdown', hintSkillCounts);
    updateSkillDropdownLabels('#eventSkillDropdown', eventSkillCounts);
    updateSkillTypeDropdownLabels('#includeSkillTypeDropdown', skillTypeCounts);
    updateSkillTypeDropdownLabels('#excludeSkillTypeDropdown', skillTypeCounts);
    
    // Re-bind event listeners after updating innerHTML
    rebindSkillFilterEvents();
}

// Update individual skill dropdown labels
function updateSkillDropdownLabels(selector, skillCounts) {
    document.querySelectorAll(`${selector} label`).forEach(label => {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const skillId = parseInt(checkbox.value);
            const skillName = getSkillName(skillId);
            const count = skillCounts[skillId] || 0;
            const isChecked = checkbox.checked;
            
            label.innerHTML = `<input type="checkbox" value="${skillId}" ${isChecked ? 'checked' : ''}> ${skillName} (${count})`;
            label.style.opacity = count > 0 ? '1' : '0.5';
        }
    });
}

// Update skill type dropdown labels
function updateSkillTypeDropdownLabels(selector, skillTypeCounts) {
    document.querySelectorAll(`${selector} label`).forEach(label => {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const typeId = checkbox.value;
            const typeName = getSkillTypeDescription(typeId);
            const count = skillTypeCounts[typeId] || 0;
            const isChecked = checkbox.checked;
            
            label.innerHTML = `<input type="checkbox" value="${typeId}" ${isChecked ? 'checked' : ''}> ${typeName} (${count})`;
            label.style.opacity = count > 0 ? '1' : '0.5';
        }
    });
}

// Re-bind skill filter event listeners after updating labels
function rebindSkillFilterEvents() {
    const skillFilterConfigs = [
        { 
            dropdownId: 'hintSkillDropdown', 
            filterId: 'hintSkillFilter', 
            filterKey: 'hintSkills', 
            defaultText: 'Any Hint Skills',
            parseValue: parseInt 
        },
        { 
            dropdownId: 'eventSkillDropdown', 
            filterId: 'eventSkillFilter', 
            filterKey: 'eventSkills', 
            defaultText: 'Any Event Skills',
            parseValue: parseInt 
        },
        { 
            dropdownId: 'includeSkillTypeDropdown', 
            filterId: 'includeSkillTypeFilter', 
            filterKey: 'includeSkillTypes', 
            defaultText: 'Any Skill Types',
            parseValue: (val) => val 
        },
        { 
            dropdownId: 'excludeSkillTypeDropdown', 
            filterId: 'excludeSkillTypeFilter', 
            filterKey: 'excludeSkillTypes', 
            defaultText: 'No Exclusions',
            parseValue: (val) => val 
        }
    ];
    
    skillFilterConfigs.forEach(config => {
        const dropdown = document.getElementById(config.dropdownId);
        if (dropdown) {
            dropdown.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    advancedFilters[config.filterKey] = Array.from(dropdown.querySelectorAll('input:checked'))
                        .map(input => config.parseValue(input.value));
                    updateMultiSelectText(config.filterId, config.defaultText);
                    debouncedFilterAndSort();
                });
            });
        }
    });
}

// ===== UTILITY FUNCTIONS =====

// Clear multi-select dropdown
function clearMultiSelect(multiSelectId) {
    document.querySelectorAll(`#${multiSelectId} input[type="checkbox"]`).forEach(input => {
        input.checked = false;
    });
    const defaultTexts = {
        'rarityFilter': 'All Rarities',
        'typeFilter': 'All Types'
    };
    updateMultiSelectText(multiSelectId, defaultTexts[multiSelectId]);
}

// ===== EXPORTS =====

window.TableRenderer = {
    renderCards,
    createCardTableRow,
    updateCardDisplay,
    renderActiveFilters,
    removeFilterChip,
    renderMultiSort,
    renderSelectionContainer,
    updateCardSelectionStates,
    updateEffectFilterPlaceholders,
    updateSkillFilterLabels,
    clearMultiSelect
};

// Export individual functions to global scope for backward compatibility
Object.assign(window, window.TableRenderer);