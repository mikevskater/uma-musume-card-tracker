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
        className: `${isOwned ? 'owned' : 'unowned'}${isSelected ? ' selected' : ''}`,
        style: 'cursor: pointer',
        'data-card-id': cardId
    });
    
    // Calculate display values for form elements
    let displayLevel, displayLimitBreak;
    
    if (globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned)) {
        displayLimitBreak = globalLimitBreakLevel;
        displayLevel = limitBreaks[card.rarity][globalLimitBreakLevel];
    } else if (isOwned) {
        displayLevel = getOwnedCardLevel(cardId);
        displayLimitBreak = getOwnedCardLimitBreak(cardId);
    } else {
        displayLevel = limitBreaks[card.rarity][2];
        displayLimitBreak = 2;
    }
    
    // Calculate effective level for effects
    const effectiveLevelForEffects = getEffectiveLevel(card);
    
    // ENHANCED: Create level display with +X indicator for max potential
    let levelDisplayContent;
    const shouldDisableLevel = showMaxPotentialLevels || 
                              comparisonMode || 
                              (!isOwned && globalLimitBreakLevel === null) ||
                              (globalLimitBreakLevel !== null && 
                               (globalLimitBreakOverrideOwned || !isOwned));
    
    if (showMaxPotentialLevels && isOwned) {
        const currentLevel = getOwnedCardLevel(cardId);
        
        // 🔧 FIX: Use effective limit break instead of owned limit break
        const effectiveLimitBreak = getEffectiveLimitBreak(cardId, isOwned);
        const maxLevel = limitBreaks[card.rarity][effectiveLimitBreak];
        
        if (currentLevel < maxLevel) {
            const levelDiff = maxLevel - currentLevel;
            levelDisplayContent = `${maxLevel} <span class="level-diff">+${levelDiff}</span>`;
        } else {
            levelDisplayContent = `${maxLevel} <span class="max-potential-indicator">MAX</span>`;
        }
    } else {
        levelDisplayContent = displayLevel.toString();
    }
    
    // Get priority effects based on effective level
    const priorityEffects = getPriorityEffects(card, 4, effectiveLevelForEffects);
    const mainEffectsDisplay = priorityEffects.join('<br>') || 'No effects';
    
    // Get hint skills (limit to 3)
    const hintSkills = card.hints?.hint_skills?.slice(0, 3).map(skill => 
        getSkillName(skill.id)
    ).join('<br>') || 'None';
    
    // Control states
    const shouldDisableOwnership = comparisonMode;
    const shouldDisableLB = comparisonMode || 
                           (!isOwned && globalLimitBreakLevel === null) ||
                           (globalLimitBreakLevel !== null && 
                            (globalLimitBreakOverrideOwned || !isOwned));
    
    const maxLevelForInput = limitBreaks[card.rarity][displayLimitBreak];
    
    // Build row HTML with enhanced level display
    row.innerHTML = `
        <td class="ownership-checkbox${comparisonMode ? ' comparison-mode-disabled' : ''}">
            ${createOwnershipCheckbox(cardId, isOwned, shouldDisableOwnership).outerHTML}
        </td>
        <td>
            ${createCardIcon(cardId, card.char_name).outerHTML}
        </td>
        <td class="card-name">${card.char_name || 'Unknown Card'}</td>
        <td>${createRarityBadge(card.rarity).outerHTML}</td>
        <td>${createTypeBadge(card.type).outerHTML}</td>
        <td class="${comparisonMode ? 'comparison-mode-disabled' : ''} level-cell">
            <div class="level-display-container">
                <input type="number" class="level-input" 
                       data-card-id="${cardId}" 
                       value="${displayLevel}" 
                       min="1" 
                       max="${maxLevelForInput}" 
                       ${shouldDisableLevel ? 'disabled' : ''}>
                ${showMaxPotentialLevels && isOwned ? 
                    `<div class="level-display-overlay">${levelDisplayContent}</div>` : 
                    ''}
            </div>
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
    const typedLevel = parseInt(input.value);
    const card = cardData.find(c => c.support_id === cardId);
    
    if (!card) return;
    
    const row = input.closest('tr');
    const isOwned = isCardOwned(cardId);
    
    // Calculate effective level for effects
    let effectiveLevelForEffects;
    if (globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned)) {
        effectiveLevelForEffects = limitBreaks[card.rarity][globalLimitBreakLevel];
    } else if (isOwned) {
        effectiveLevelForEffects = typedLevel;
    } else {
        effectiveLevelForEffects = typedLevel;
    }
    
    // Update level display overlay for max potential mode
    if (showMaxPotentialLevels && isOwned) {
        const levelContainer = row.querySelector('.level-display-container');
        if (levelContainer) {
            let overlay = levelContainer.querySelector('.level-display-overlay');
            if (!overlay) {
                overlay = createElement('div', { className: 'level-display-overlay' });
                levelContainer.appendChild(overlay);
            }
            
            const currentLevel = getOwnedCardLevel(cardId);
            
            // 🔧 FIX: Use effective limit break instead of owned limit break
            const effectiveLimitBreak = getEffectiveLimitBreak(cardId, isOwned);
            const maxLevel = limitBreaks[card.rarity][effectiveLimitBreak];
            
            if (currentLevel < maxLevel) {
                const levelDiff = maxLevel - currentLevel;
                overlay.innerHTML = `${maxLevel} <span class="level-diff">+${levelDiff}</span>`;
            } else {
                overlay.innerHTML = `${maxLevel} <span class="max-potential-indicator">MAX</span>`;
            }
        }
    }
    
    // Update effects display
    const effectsCell = row.querySelector('.effects-summary');
    if (effectsCell) {
        const priorityEffects = getPriorityEffects(card, 4, effectiveLevelForEffects);
        effectsCell.innerHTML = priorityEffects.join('<br>') || 'No effects';
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

// UPDATED: Add basic filter chips - individual chips for each selected value
function addBasicFilterChips(chips) {
    // UPDATED: Individual rarity chips
    const selectedRarities = getSelectedValues('rarityFilter');
    selectedRarities.forEach(rarityValue => {
        const rarityLabel = ['', 'R', 'SR', 'SSR'][rarityValue];
        chips.push({
            type: `rarity-${rarityValue}`,
            label: `Rarity: ${rarityLabel}`,
            remove: () => {
                // Remove just this rarity
                const checkbox = document.querySelector(`#rarityFilter input[value="${rarityValue}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                    updateMultiSelectText('rarityFilter', 'All Rarities');
                }
            }
        });
    });
    
    // UPDATED: Individual type chips
    const selectedTypes = getSelectedValues('typeFilter');
    selectedTypes.forEach(typeValue => {
        const typeLabel = getTypeDisplayName(typeValue);
        chips.push({
            type: `type-${typeValue}`,
            label: `Type: ${typeLabel}`,
            remove: () => {
                // Remove just this type
                const checkbox = document.querySelector(`#typeFilter input[value="${typeValue}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                    updateMultiSelectText('typeFilter', 'All Types');
                }
            }
        });
    });
    
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

// ENHANCED: Add advanced filter chips - individual chips for each selected value
function addAdvancedFilterChips(chips) {
    // Effect filters
    Object.entries(advancedFilters.effects).forEach(([effectId, filter]) => {
        const effect = effectsData[effectId];
        if (effect) {
            const symbol = effect.symbol === 'percent' ? '%' : '';
            chips.push({
                type: `effect-${effectId}`,
                label: `${effect.name_en} ≥ ${filter.min}${symbol}`,
                remove: () => {
                    delete advancedFilters.effects[effectId];
                    const input = document.querySelector(`[data-effect-id="${effectId}"]`);
                    if (input) input.value = '';
                }
            });
        }
    });
    
    // UPDATED: Individual hint skill chips
    advancedFilters.hintSkills.forEach(skillId => {
        chips.push({
            type: `hintSkill-${skillId}`,
            label: `Hint Skill: ${getSkillName(skillId)}`,
            remove: () => {
                const index = advancedFilters.hintSkills.indexOf(skillId);
                if (index !== -1) {
                    advancedFilters.hintSkills.splice(index, 1);
                    // Update checkbox
                    const checkbox = document.querySelector(`#hintSkillDropdown input[value="${skillId}"]`);
                    if (checkbox) checkbox.checked = false;
                    updateMultiSelectText('hintSkillFilter', 'Any Hint Skills');
                }
            }
        });
    });
    
    // UPDATED: Individual event skill chips
    advancedFilters.eventSkills.forEach(skillId => {
        chips.push({
            type: `eventSkill-${skillId}`,
            label: `Event Skill: ${getSkillName(skillId)}`,
            remove: () => {
                const index = advancedFilters.eventSkills.indexOf(skillId);
                if (index !== -1) {
                    advancedFilters.eventSkills.splice(index, 1);
                    // Update checkbox
                    const checkbox = document.querySelector(`#eventSkillDropdown input[value="${skillId}"]`);
                    if (checkbox) checkbox.checked = false;
                    updateMultiSelectText('eventSkillFilter', 'Any Event Skills');
                }
            }
        });
    });
    
    // UPDATED: Individual include skill type chips
    advancedFilters.includeSkillTypes.forEach(typeId => {
        chips.push({
            type: `includeSkillType-${typeId}`,
            label: `Include Type: ${getSkillTypeDescription(typeId)}`,
            remove: () => {
                const index = advancedFilters.includeSkillTypes.indexOf(typeId);
                if (index !== -1) {
                    advancedFilters.includeSkillTypes.splice(index, 1);
                    // Update checkbox
                    const checkbox = document.querySelector(`#includeSkillTypeDropdown input[value="${typeId}"]`);
                    if (checkbox) checkbox.checked = false;
                    updateMultiSelectText('includeSkillTypeFilter', 'Any Skill Types');
                }
            }
        });
    });
    
    // UPDATED: Individual exclude skill type chips
    advancedFilters.excludeSkillTypes.forEach(typeId => {
        chips.push({
            type: `excludeSkillType-${typeId}`,
            label: `Exclude Type: ${getSkillTypeDescription(typeId)}`,
            remove: () => {
                const index = advancedFilters.excludeSkillTypes.indexOf(typeId);
                if (index !== -1) {
                    advancedFilters.excludeSkillTypes.splice(index, 1);
                    // Update checkbox
                    const checkbox = document.querySelector(`#excludeSkillTypeDropdown input[value="${typeId}"]`);
                    if (checkbox) checkbox.checked = false;
                    updateMultiSelectText('excludeSkillTypeFilter', 'No Exclusions');
                }
            }
        });
    });
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

// Debug Tools for UI Sync Issue
// Add these functions to help verify the fix

// 1. Verify table sync after any operation
function debugTableSync() {
    console.log('=== TABLE SYNC DEBUG ===');
    
    const rows = document.querySelectorAll('#cardTableBody tr');
    let syncIssues = 0;
    
    rows.forEach(row => {
        const cardId = parseInt(row.dataset.cardId);
        const isOwned = isCardOwned(cardId);
        
        // Get form elements
        const checkbox = row.querySelector('input[type="checkbox"]');
        const levelInput = row.querySelector('.level-input');
        const lbSelect = row.querySelector('.lb-select');
        
        // Get expected values
        const expectedChecked = isOwned;
        const expectedLevel = isOwned ? getOwnedCardLevel(cardId) : null;
        const expectedLB = isOwned ? getOwnedCardLimitBreak(cardId) : null;
        
        // Check for sync issues
        const issues = [];
        
        if (checkbox.checked !== expectedChecked) {
            issues.push(`Checkbox: got ${checkbox.checked}, expected ${expectedChecked}`);
        }
        
        if (isOwned && parseInt(levelInput.value) !== expectedLevel) {
            issues.push(`Level: got ${levelInput.value}, expected ${expectedLevel}`);
        }
        
        if (isOwned && parseInt(lbSelect.value) !== expectedLB) {
            issues.push(`LB: got ${lbSelect.value}, expected ${expectedLB}`);
        }
        
        if (issues.length > 0) {
            console.log(`Card ${cardId} SYNC ISSUES:`, issues);
            console.log('  Data:', { isOwned, expectedLevel, expectedLB });
            console.log('  Form:', { 
                checked: checkbox.checked, 
                level: levelInput.value, 
                lb: lbSelect.value 
            });
            syncIssues++;
        }
    });
    
    console.log(`Found ${syncIssues} sync issues out of ${rows.length} rows`);
    return syncIssues === 0;
}

// 2. Verify specific card sync
function debugCardSync(cardId) {
    console.log(`=== CARD ${cardId} SYNC DEBUG ===`);
    
    const row = document.querySelector(`tr[data-card-id="${cardId}"]`);
    if (!row) {
        console.log('Row not found');
        return false;
    }
    
    const isOwned = isCardOwned(cardId);
    const ownedLevel = getOwnedCardLevel(cardId);
    const ownedLB = getOwnedCardLimitBreak(cardId);
    
    const checkbox = row.querySelector('input[type="checkbox"]');
    const levelInput = row.querySelector('.level-input');
    const lbSelect = row.querySelector('.lb-select');
    
    console.log('Data state:', {
        isOwned,
        ownedLevel,
        ownedLB,
        ownedCardsData: ownedCards[cardId]
    });
    
    console.log('Form state:', {
        checkboxChecked: checkbox.checked,
        levelValue: parseInt(levelInput.value),
        lbValue: parseInt(lbSelect.value),
        levelDisabled: levelInput.disabled,
        lbDisabled: lbSelect.disabled
    });
    
    console.log('Global settings:', {
        globalLimitBreakLevel,
        globalLimitBreakOverrideOwned,
        showMaxPotentialLevels
    });
    
    const syncOK = checkbox.checked === isOwned &&
                   (!isOwned || parseInt(levelInput.value) === ownedLevel) &&
                   (!isOwned || parseInt(lbSelect.value) === ownedLB);
    
    console.log('Sync status:', syncOK ? '✅ OK' : '❌ BROKEN');
    return syncOK;
}

// 3. Test all critical scenarios
function testTableSyncScenarios() {
    console.log('=== TESTING ALL SYNC SCENARIOS ===');
    
    const scenarios = [
        {
            name: 'Fresh page load',
            action: () => window.location.reload()
        },
        {
            name: 'Apply filter',
            action: () => {
                document.getElementById('ownedFilter').value = 'owned';
                debouncedFilterAndSort();
            }
        },
        {
            name: 'Clear filter', 
            action: () => {
                document.getElementById('ownedFilter').value = '';
                debouncedFilterAndSort();
            }
        },
        {
            name: 'Change sort',
            action: () => handleSort('rarity')
        },
        {
            name: 'Toggle global LB',
            action: () => {
                const select = document.getElementById('globalLimitBreak');
                select.value = select.value === '4' ? '' : '4';
                setGlobalLimitBreak(select.value);
            }
        },
        {
            name: 'Toggle apply to owned',
            action: () => {
                const checkbox = document.getElementById('globalOverrideOwned');
                checkbox.checked = !checkbox.checked;
                setGlobalLimitBreakOverride(checkbox.checked);
            }
        }
    ];
    
    scenarios.forEach(scenario => {
        console.log(`\n--- Testing: ${scenario.name} ---`);
        scenario.action();
        setTimeout(() => {
            const syncOK = debugTableSync();
            console.log(`${scenario.name}: ${syncOK ? '✅ PASS' : '❌ FAIL'}`);
        }, 500);
    });
}

// 4. Monitor sync in real-time
function startSyncMonitoring() {
    console.log('Starting sync monitoring...');
    
    // Monitor table updates
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.target.id === 'cardTableBody') {
                console.log('Table updated, checking sync...');
                setTimeout(() => debugTableSync(), 100);
            }
        });
    });
    
    const tableBody = document.getElementById('cardTableBody');
    if (tableBody) {
        observer.observe(tableBody, { childList: true, subtree: true });
        console.log('✅ Sync monitoring active');
        return observer;
    }
}

// Add these to window for console access
window.debugTableSync = debugTableSync;
window.debugCardSync = debugCardSync;
window.testTableSyncScenarios = testTableSyncScenarios;
window.startSyncMonitoring = startSyncMonitoring;