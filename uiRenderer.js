// UI Renderer Module
// Handles all UI rendering, modal management, and display updates

// Global data storage for modal navigation
let currentModalCardIndex = -1;
let currentFilteredCards = [];

// Card comparison management functions
function toggleComparisonMode(enabled) {
    comparisonMode = enabled;
    
    // Update UI classes
    const mainContent = document.querySelector('.main-content');
    const selectionContainer = document.getElementById('selectionContainer');
    
    if (comparisonMode) {
        mainContent.classList.add('has-selection');
        selectionContainer.style.display = 'block';
    } else {
        mainContent.classList.remove('has-selection');
        selectionContainer.style.display = 'none';
    }
    
    // Re-render table to update click handlers and selection states
    renderCards(currentFilteredCards);
    renderSelectionContainer();
}
function initializeMultiSort() {
    renderMultiSort();
    
    // Add event listener for add sort button
    const addSortBtn = document.getElementById('addSortBtn');
    addSortBtn.addEventListener('click', addSortLayer);
}

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
    
    container.innerHTML = multiSort.map((sort, index) => {
        const category = sortCategories[sort.category];
        const categoryName = category ? category.name : 'Unknown';
        const hasOptions = category && category.hasOptions;
        
        let optionSelect = '';
        if (hasOptions) {
            const options = category.getOptions();
            optionSelect = `
                <select class="sort-option-select" data-index="${index}">
                    <option value="">Select ${categoryName}</option>
                    ${options.map(opt => `
                        <option value="${opt.value}" ${opt.value == sort.option ? 'selected' : ''}>
                            ${opt.label}
                        </option>
                    `).join('')}
                </select>
            `;
        }
        
        return `
            <div class="sort-layer" data-index="${index}">
                <div class="sort-layer-header">
                    <div class="sort-layer-title">
                        <span class="sort-priority-badge">${index + 1}</span>
                        ${categoryName}${sort.option ? `: ${getSortOptionLabel(sort.category, sort.option)}` : ''}
                    </div>
                    <div class="sort-controls">
                        <button class="sort-btn" data-action="move-up" data-index="${index}" 
                                ${index === 0 ? 'disabled' : ''} title="Move Up">↑</button>
                        <button class="sort-btn" data-action="move-down" data-index="${index}" 
                                ${index === multiSort.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
                        <button class="sort-btn danger" data-action="remove" data-index="${index}" title="Remove">✕</button>
                    </div>
                </div>
                <div class="sort-dropdowns ${hasOptions ? 'has-options' : 'single-dropdown'}">
                    <select class="sort-category-select" data-index="${index}">
                        ${Object.entries(sortCategories).map(([key, cat]) => `
                            <option value="${key}" ${key === sort.category ? 'selected' : ''}>${cat.name}</option>
                        `).join('')}
                    </select>
                    ${optionSelect}
                    <button class="sort-direction-toggle ${sort.direction}" data-index="${index}">
                        ${sort.direction === 'asc' ? '↑' : '↓'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Add event listeners
    container.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const index = parseInt(e.target.dataset.index);
            
            switch (action) {
                case 'move-up':
                    moveSortLayer(index, index - 1);
                    break;
                case 'move-down':
                    moveSortLayer(index, index + 1);
                    break;
                case 'remove':
                    removeSortLayer(index);
                    break;
            }
        });
    });
    
    container.querySelectorAll('.sort-category-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            const category = e.target.value;
            updateSortLayer(index, { category, option: null });
        });
    });
    
    container.querySelectorAll('.sort-option-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            const option = e.target.value;
            updateSortLayer(index, { option: option || null });
        });
    });
    
    container.querySelectorAll('.sort-direction-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const currentDirection = multiSort[index].direction;
            const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
            updateSortLayer(index, { direction: newDirection });
        });
    });
}

function addSortLayer() {
    multiSort.push({
        category: 'effect',
        option: null,
        direction: 'desc'
    });
    renderMultiSort();
    debouncedFilterAndSort();
}

function removeSortLayer(index) {
    multiSort.splice(index, 1);
    renderMultiSort();
    debouncedFilterAndSort();
}

function moveSortLayer(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= multiSort.length) return;
    
    const item = multiSort.splice(fromIndex, 1)[0];
    multiSort.splice(toIndex, 0, item);
    renderMultiSort();
    debouncedFilterAndSort();
}

function updateSortLayer(index, updates) {
    if (index < 0 || index >= multiSort.length) return;
    
    multiSort[index] = { ...multiSort[index], ...updates };
    renderMultiSort();
    debouncedFilterAndSort();
}

function getSortOptionLabel(category, option) {
    if (!option) return '';
    
    switch (category) {
        case 'effect':
            return effectsData[option]?.name_en || `Effect ${option}`;
        default:
            return option;
    }
}

function clearAllSorts() {
    multiSort = [];
    renderMultiSort();
    debouncedFilterAndSort();
}

// FIXED: Get priority effects for display based on sort configuration - Now accepts optional level override
function getPriorityEffects(card, targetCount = 4, overrideLevel = null) {
    // Use override level if provided, otherwise get the effective level from card data
    const cardLevel = overrideLevel !== null ? overrideLevel : getEffectiveLevel(card);
    const priorityEffects = [];
    const usedEffectIds = new Set();
    
    // Add effects from sort configuration first (only if unlocked)
    multiSort.forEach(sort => {
        if (sort.category === 'effect' && sort.option && !usedEffectIds.has(parseInt(sort.option))) {
            const effectArray = card.effects?.find(effect => effect[0] == sort.option);
            if (effectArray && !isEffectLocked(effectArray, cardLevel)) {
                const value = calculateEffectValue(effectArray, cardLevel);
                const effectName = getEffectName(sort.option);
                const symbol = effectsData[sort.option]?.symbol === 'percent' ? '%' : '';
                priorityEffects.push(`${effectName}: ${value}${symbol}`);
                usedEffectIds.add(parseInt(sort.option));
            }
        }
    });
    
    // Fill remaining slots with highest value effects not already included (only unlocked)
    if (priorityEffects.length < targetCount && card.effects) {
        const remainingEffects = card.effects
            .filter(effect => effect[0] && effectsData[effect[0]] && !usedEffectIds.has(effect[0]))
            .filter(effect => !isEffectLocked(effect, cardLevel)) // Filter out locked effects
            .map(effect => {
                const value = calculateEffectValue(effect, cardLevel);
                const effectName = getEffectName(effect[0]);
                const symbol = effectsData[effect[0]].symbol === 'percent' ? '%' : '';
                return {
                    display: `${effectName}: ${value}${symbol}`,
                    value: value,
                    effectId: effect[0]
                };
            })
            .sort((a, b) => b.value - a.value) // Sort by value descending
            .slice(0, targetCount - priorityEffects.length);
        
        remainingEffects.forEach(effect => {
            priorityEffects.push(effect.display);
            usedEffectIds.add(effect.effectId); // Track this too for consistency
        });
    }
    
    return priorityEffects;
}

// Create fallback icon element
function createCardIconFallback() {
    const fallback = document.createElement('div');
    fallback.className = 'card-icon-fallback';
    fallback.textContent = '🖼';
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
    // Store the filtered cards for modal navigation
    currentFilteredCards = cards;
    
    const tbody = document.getElementById('cardTableBody');
    tbody.innerHTML = '';

    cards.forEach(card => {
        const row = document.createElement('tr');
        const cardId = card.support_id;
        const isOwned = isCardOwned(cardId);
        const isSelected = selectedCards.includes(cardId);
        
        // Add ownership and selection classes
        row.className = isOwned ? 'owned' : 'unowned';
        if (isSelected) row.classList.add('selected');
        
        row.style.cursor = 'pointer';
        row.dataset.cardId = cardId;
        
        // Add click handler based on mode
        row.addEventListener('click', (e) => {
            // Don't open modal or select if clicking on checkbox, input, or select
            if (e.target.type !== 'checkbox' && e.target.type !== 'number' && e.target.tagName !== 'SELECT') {
                if (comparisonMode) {
                    toggleCardSelection(cardId);
                } else {
                    openCardDetails(cardId);
                }
            }
        });
        
        // Get effective level for display
        const effectiveLevel = getEffectiveLevel(card);
        
        // Determine which LB to display - respect global override settings
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
        
        // FIXED: Get priority effects based on sort configuration using current effective level
        const priorityEffects = getPriorityEffects(card, 4, effectiveLevel);
        const mainEffectsDisplay = priorityEffects.join('<br>') || 'No effects';

        // Get hint skills
        const hintSkills = card.hints?.hint_skills?.slice(0, 3).map(skill => 
            getSkillName(skill.id)
        ).join('<br>') || 'None';

        // Determine if level input should be disabled
        const shouldDisableLevel = !isOwned && globalLimitBreakLevel === null ||
                                  globalLimitBreakLevel !== null && 
                                  (globalLimitBreakOverrideOwned || !isOwned);

        // Determine if LB select should be disabled
        const shouldDisableLB = !isOwned && globalLimitBreakLevel === null ||
                               globalLimitBreakLevel !== null && 
                               (globalLimitBreakOverrideOwned || !isOwned);

        // Create LB dropdown instead of plain text
        const lbDropdownOptions = Array.from({length: 5}, (_, i) => 
            `<option value="${i}" ${displayLimitBreak === i ? 'selected' : ''}>LB ${i}</option>`
        ).join('');

        const lbDropdown = `<select class="lb-select" data-card-id="${cardId}" onclick="event.stopPropagation()" ${shouldDisableLB ? 'disabled' : ''}>${lbDropdownOptions}</select>`;

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
            <td><span class="type type-${card.type}">${getTypeDisplayName(card.type)}</span></td>
            <td><input type="number" class="level-input" value="${effectiveLevel}" min="1" max="${limitBreaks[card.rarity][displayLimitBreak]}" data-card-id="${cardId}" onclick="event.stopPropagation()" ${shouldDisableLevel ? 'disabled' : ''}></td>
            <td>${lbDropdown}</td>
            <td class="effects-summary">${mainEffectsDisplay}</td>
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
            if (selectedCards.includes(cardId)) row.classList.add('selected');
            
            const levelInput = row.querySelector('.level-input');
            const lbSelect = row.querySelector('.lb-select');
            const shouldDisableLevel = !owned && globalLimitBreakLevel === null ||
                                      globalLimitBreakLevel !== null && 
                                      (globalLimitBreakOverrideOwned || !owned);
            const shouldDisableLB = !owned && globalLimitBreakLevel === null ||
                                   globalLimitBreakLevel !== null && 
                                   (globalLimitBreakOverrideOwned || !owned);
            
            levelInput.disabled = shouldDisableLevel;
            lbSelect.disabled = shouldDisableLB;
            
            if (owned) {
                levelInput.value = getOwnedCardLevel(cardId);
                lbSelect.value = getOwnedCardLimitBreak(cardId);
            } else {
                const card = cardData.find(c => c.support_id === cardId);
                levelInput.value = getEffectiveLevel(card);
                lbSelect.value = 2; // Default LB
            }
            updateCardDisplay(levelInput);
        });
    });

    // FIXED: Add both 'input' and 'change' event listeners for level inputs for real-time updates
    document.querySelectorAll('.level-input').forEach(input => {
        // Real-time updates while typing
        input.addEventListener('input', (e) => {
            updateCardDisplay(e.target);
        });
        
        // Final update when done editing
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

    // Add event listeners for LB dropdown changes
    document.querySelectorAll('.lb-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const cardId = parseInt(e.target.dataset.cardId);
            const newLimitBreak = parseInt(e.target.value);
            
            if (isCardOwned(cardId) && 
                (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
                setOwnedCardLimitBreak(cardId, newLimitBreak);
                
                // Update level input max value
                const card = cardData.find(c => c.support_id === cardId);
                const maxLevel = limitBreaks[card.rarity][newLimitBreak];
                const levelInput = e.target.closest('tr').querySelector('.level-input');
                levelInput.max = maxLevel;
                
                // Update current level if it exceeds new max
                if (parseInt(levelInput.value) > maxLevel) {
                    levelInput.value = maxLevel;
                    setOwnedCardLevel(cardId, maxLevel);
                }
                
                updateCardDisplay(levelInput);
            }
        });
    });
}

// FIXED: Update card display when level changes - Now passes typed level to getPriorityEffects
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
    
    // Update limit break display (the dropdown should show the correct LB)
    const lbSelect = row.querySelector('.lb-select');
    if (lbSelect && lbSelect.value != displayLimitBreak) {
        lbSelect.value = displayLimitBreak;
    }
    
    // FIXED: Recalculate and update priority effects using the typed level
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

// Render active filters display
function renderActiveFilters(filteredCount, totalCount) {
    const activeFiltersDiv = document.getElementById('activeFilters');
    const resultsCount = document.getElementById('resultsCount');
    const filterChips = document.getElementById('filterChips');
    
    // Update results count
    resultsCount.textContent = `Showing ${filteredCount} of ${totalCount} cards`;
    
    // Build filter chips
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

// Update multi-select display text
function updateMultiSelectText(multiSelectId, defaultText) {
    const multiSelect = document.getElementById(multiSelectId);
    const selectedValues = getSelectedValues(multiSelectId);
    const textElement = multiSelect.querySelector('.multi-select-text');
    
    if (selectedValues.length === 0) {
        textElement.textContent = defaultText;
    } else if (selectedValues.length === 1) {
        if (multiSelectId === 'typeFilter') {
            textElement.textContent = getTypeDisplayName(selectedValues[0]);
        } else {
            textElement.textContent = selectedValues[0].toUpperCase();
        }
    } else {
        textElement.textContent = `${selectedValues.length} selected`;
    }
}

// Open card details modal
function openCardDetails(cardId) {
    const card = cardData.find(c => c.support_id === cardId);
    if (!card) return;
    
    // Validate that we have the filtered cards
    if (!currentFilteredCards || currentFilteredCards.length === 0) {
        console.warn('No filtered cards available, this should not happen');
        currentFilteredCards = cardData; // Fallback to prevent errors
    }
    
    // Find the card's index in the current filtered results
    currentModalCardIndex = currentFilteredCards.findIndex(c => c.support_id === cardId);
    
    if (currentModalCardIndex === -1) {
        console.warn(`Card ${cardId} not found in current filter. This should not happen if opened from table.`);
        // If for some reason the card isn't in filtered results, add it as single item
        currentFilteredCards = [card];
        currentModalCardIndex = 0;
    }
    
    currentModalCard = card;
    
    // Get current effective level
    const currentLevel = getEffectiveLevel(card);
    
    renderCardDetails(card, currentLevel);
    
    const modal = document.getElementById('cardModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Add keyboard event listener for modal navigation
    document.addEventListener('keydown', handleModalKeyNavigation);
}

// Close card details modal
function closeCardDetails() {
    const modal = document.getElementById('cardModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentModalCard = null;
    currentModalCardIndex = -1;
    
    // Remove keyboard event listener
    document.removeEventListener('keydown', handleModalKeyNavigation);
}

// Render card details in modal
function renderCardDetails(card, level) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    // Update modal title with navigation arrows
    const totalCards = currentFilteredCards.length;
    const cardPosition = currentModalCardIndex + 1;
    
    // Better modal header layout with more structured divs
    modalTitle.innerHTML = `
        <div class="modal-header-wrapper">
            <div class="modal-nav-section modal-nav-left">
                <button class="modal-nav-btn" id="modalPrevBtn" ${totalCards <= 1 ? 'disabled' : ''}>
                    &#8249;
                </button>
            </div>
            <div class="modal-title-section">
                <div class="modal-card-name">
                    ${card.char_name || 'Unknown Card'}
                </div>
                <div class="modal-card-counter">
                    ${cardPosition} of ${totalCards}
                </div>
            </div>
            <div class="modal-nav-section modal-nav-right">
                <button class="modal-nav-btn" id="modalNextBtn" ${totalCards <= 1 ? 'disabled' : ''}>
                    &#8250;
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners for navigation buttons
    const prevBtn = document.getElementById('modalPrevBtn');
    const nextBtn = document.getElementById('modalNextBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateModal(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateModal(1));
    }
    
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
                    <span class="type type-${card.type}">${getTypeDisplayName(card.type)}</span>
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
                    <div class="level-control-row">
                        <label for="modalLevelInput">Current Level:</label>
                        <input type="number" id="modalLevelInput" class="modal-level-input" 
                               value="${level}" min="1" max="${limitBreaks[card.rarity][getOwnedCardLimitBreak(cardId) || 2]}" 
                               ${!isOwned && globalLimitBreakLevel === null ? 'disabled' : ''} 
                               ${globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned) ? 'disabled' : ''}>
                    </div>
                    <div class="level-control-row">
                        <label for="modalLimitBreakSelect">Limit Break:</label>
                        <select id="modalLimitBreakSelect" class="modal-lb-select"
                                ${!isOwned && globalLimitBreakLevel === null ? 'disabled' : ''} 
                                ${globalLimitBreakLevel !== null && (globalLimitBreakOverrideOwned || !isOwned) ? 'disabled' : ''}>
                            ${Array.from({length: 5}, (_, i) => `
                                <option value="${i}" ${(getOwnedCardLimitBreak(cardId) || 2) === i ? 'selected' : ''}>
                                    LB ${i} (Max: ${limitBreaks[card.rarity][i]})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="level-status">
                        <span class="lb-indicator">Current: LB ${limitBreakLevel} Level ${level}</span>
                        ${showMaxPotentialLevels ? `<span class="potential-indicator">Showing Max Potential</span>` : ''}
                    </div>
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
    
    // Add modal event listeners
    setupModalEventListeners(card, cardId, isOwned);
}

// Setup modal event listeners
function setupModalEventListeners(card, cardId, isOwned) {
    // Modal ownership toggle
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
    
    // Modal level input
    const modalLevelInput = document.getElementById('modalLevelInput');
    modalLevelInput.addEventListener('change', (e) => {
        const newLevel = parseInt(e.target.value);
        updateModalDisplay(newLevel);
        
        // Update owned card level and table input
        if (isCardOwned(cardId) && 
            (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
            setOwnedCardLevel(cardId, newLevel);
            
            const tableInput = document.querySelector(`input[data-card-id="${cardId}"]`);
            if (tableInput) {
                tableInput.value = newLevel;
                updateCardDisplay(tableInput);
            }
        }
    });
    
    // Modal limit break select - now also updates table LB dropdown max value
    const modalLimitBreakSelect = document.getElementById('modalLimitBreakSelect');
    modalLimitBreakSelect.addEventListener('change', (e) => {
        const newLimitBreak = parseInt(e.target.value);
        
        if (isCardOwned(cardId) && 
            (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
            setOwnedCardLimitBreak(cardId, newLimitBreak);
            
            // Update level input max value
            const card = cardData.find(c => c.support_id === cardId);
            const maxLevel = limitBreaks[card.rarity][newLimitBreak];
            modalLevelInput.max = maxLevel;
            
            // Update current level if it exceeds new max
            if (parseInt(modalLevelInput.value) > maxLevel) {
                modalLevelInput.value = maxLevel;
                setOwnedCardLevel(cardId, maxLevel);
            }
            
            updateModalDisplay(parseInt(modalLevelInput.value));
            
            // Update table display - both level input max and LB dropdown value
            const tableInput = document.querySelector(`input[data-card-id="${cardId}"]`);
            const tableLBSelect = document.querySelector(`select[data-card-id="${cardId}"]`);
            if (tableInput) {
                tableInput.max = maxLevel; // Update max attribute
                tableInput.value = parseInt(modalLevelInput.value);
                updateCardDisplay(tableInput);
            }
            if (tableLBSelect) {
                tableLBSelect.value = newLimitBreak; // Update LB dropdown
            }
        }
    });
}

// Update modal display when level changes
function updateModalDisplay(level) {
    if (!currentModalCard) return;
    
    const cardId = currentModalCard.support_id;
    const currentLimitBreak = getOwnedCardLimitBreak(cardId) || 2;
    
    const lbIndicator = document.querySelector('.lb-indicator');
    if (lbIndicator) {
        lbIndicator.textContent = `Current: LB ${currentLimitBreak} Level ${level}`;
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
                        ${(skill.type || []).map(type => `<span class="skill-type">${getSkillTypeDescription(type)}</span>`).join('')}
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
                        ${(skill.type || []).map(type => `<span class="skill-type">${getSkillTypeDescription(type)}</span>`).join('')}
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
        // Extract English title from localization arrays
        let eventTitle = 'Unknown Event';
        
        // Look through the localization arrays for English (103)
        if (Array.isArray(event) && event.length > 2) {
            for (let i = 2; i < event.length; i++) {
                if (Array.isArray(event[i]) && event[i].length >= 2 && event[i][0] === 103) {
                    eventTitle = event[i][1];
                    break;
                }
            }
        }
        
        // Fallback to Japanese title if no English title found
        if (eventTitle === 'Unknown Event' && event[0]) {
            eventTitle = event[0];
        }
        
        const choices = event[1] || [];
        
        // Generate option labels based on number of choices
        const getOptionLabel = (index, totalChoices) => {
            if (totalChoices === 1) {
                return ''; // No label for single option
            } else if (totalChoices === 2) {
                return index === 0 ? 'Top Option' : 'Bottom Option';
            } else if (totalChoices === 3) {
                return index === 0 ? 'Top Option' : (index === 1 ? 'Middle Option' : 'Bottom Option');
            } else {
                return `Option ${index + 1}`;
            }
        };
        
        return `
            <div class="event-item">
                <div class="event-title">${eventTitle}</div>
                <div class="event-choices">
                    ${choices.map((choice, index) => {
                        const optionLabel = getOptionLabel(index, choices.length);
                        return `
                            <div class="event-choice">
                                ${optionLabel ? `<strong>${optionLabel}:</strong> ` : ''}${choice[0] || 'No description'}
                                <div class="choice-effects">
                                    ${formatEventEffects(choice[1] || [])}
                                </div>
                            </div>
                        `;
                    }).join('')}
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
            case 'po': return `Power ${value}`;
            case 'pt': return `Skill Points ${value}`;
            case 'gu': return `Guts ${value}`;
            case 'in': return `Wit ${value}`;
            case 'en': return `Energy ${value}`;
            case 'mo': return `Mood ${value}`;
            case 'bo': return `Bond ${value}`;
            case 'me': return `Maximum Energy ${value}`;            
            case 'sk': return `Skill: ${getSkillName(skillId)}`;
            case '5s': return `All Stats ${value}`;
            case 'rs': return `Random Stats (${value})`;
            case 'sg': return `Obtain Skill: ${getSkillName(skillId)}`;
            case 'sre': return `Lose Skill: ${getSkillName(skillId)}`;
            case 'srh': return `Strategy Related Hint (${value || 1})`;
            case 'sr': return `Skill Hint: ${getSkillName(skillId)} hint ${value}`;
            case 'bo_l': return `Bond Low ${value}`;
            case 'fa': return `Fans ${value}`;
            case 'ct': return `${value}`; // ct is a passthrough
            case 'ha': return 'Heal All Statuses';
            case 'hp': return `Heal Status: ${getSkillName(skillId)}`;
            case 'nsl': return 'Not Scenario Linked';            
            case 'ps_h': return `Condition Healed: ${getSkillName(skillId)}`;
            case 'ps_nh': return `Condition Not Healed: ${getSkillName(skillId)}`;
            case 'pa': return `Passion ${value}`;
            case 'mn': return `Mental ${value}`;
            case 'rf': return 'Red Fragment';
            case 'bf': return 'Blue Fragment';
            case 'yf': return 'Yellow Fragment';
            case 'wl_e': return `Win Level Exact: ${value}`;
            case 'wl_l': return `Win Level Less: ${value}`;
            case 'wl_c': return `Win Level Combined: ${value}`;
            case 'app': return `Aptitude Points ${value}`;
            case 'ntsr': return `NTSR ${value}`;
            case 'ls': return `Last Trained Stat: ${value}`;
            case 'mt': return `Minimum Token: ${value}`;
            case 'ee': return 'Event Chain Ended';
            case 'ds': return 'Can Start Dating';
            case 'rr': return 'Normal Race Rewards';
            case 'fe': return 'Full Energy';
            case 'no': return 'Nothing Happens';
            default: return `${type}: ${value}`;
        }
    }).join(', ');
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

// Modal Navigation Functions
function navigateModal(direction) {
    if (!currentModalCard || currentFilteredCards.length <= 1) return;
    
    // Calculate new index with wraparound
    let newIndex = currentModalCardIndex + direction;
    if (newIndex >= currentFilteredCards.length) {
        newIndex = 0; // Wrap to beginning
    } else if (newIndex < 0) {
        newIndex = currentFilteredCards.length - 1; // Wrap to end
    }
    
    // Update current card and index
    currentModalCardIndex = newIndex;
    currentModalCard = currentFilteredCards[newIndex];
    
    // Get current effective level for new card
    const currentLevel = getEffectiveLevel(currentModalCard);
    
    // Re-render modal with new card
    renderCardDetails(currentModalCard, currentLevel);
}

// Handle keyboard navigation in modal
function handleModalKeyNavigation(e) {
    if (!currentModalCard) return;
    
    // Only handle if modal is open and no input is focused
    const modal = document.getElementById('cardModal');
    if (modal.style.display !== 'block') return;
    
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA')) {
        return; // Don't interfere with input focus
    }
    
    switch(e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            navigateModal(-1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            navigateModal(1);
            break;
        case 'Escape':
            e.preventDefault();
            closeCardDetails();
            break;
    }
}

// Render selection container
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
        
        return `
            <div class="selected-card-item">
                <img src="support_card_images/${cardId}_i.png" 
                     class="selected-card-icon-small" 
                     alt="${card.char_name || 'Unknown Card'}"
                     onerror="this.style.display='none'"
                     loading="lazy">
                <div class="selected-card-info">
                    <div class="selected-card-name">${card.char_name || 'Unknown Card'}</div>
                    <div class="selected-card-details">
                        <span class="rarity rarity-${card.rarity}">${['', 'R', 'SR', 'SSR'][card.rarity]}</span>
                        <span class="type type-${card.type}">${getTypeDisplayName(card.type)}</span>
                        Level ${getEffectiveLevel(card)}
                    </div>
                </div>
                <button class="remove-selected-btn" data-card-id="${cardId}" title="Remove from comparison">×</button>
            </div>
        `;
    }).join('');
    
    // Add event listeners for remove buttons
    selectedCardsList.querySelectorAll('.remove-selected-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const cardId = parseInt(e.target.dataset.cardId);
            removeCardFromSelection(cardId);
        });
    });
}

// Render comparison table with proper HTML table structure and sections
function renderComparisonTable() {
    const comparisonTable = document.getElementById('comparisonTable');
    
    if (selectedCards.length === 0) {
        comparisonTable.innerHTML = '<div class="no-comparison-data">No cards selected for comparison</div>';
        return;
    }
    
    // Get selected card data
    const cardsToCompare = selectedCards.map(cardId => 
        cardData.find(c => c.support_id === cardId)
    ).filter(card => card);
    
    if (cardsToCompare.length === 0) {
        comparisonTable.innerHTML = '<div class="no-comparison-data">Selected cards not found</div>';
        return;
    }
    
    // Build comparison data structure with sections
    const comparisonData = buildComparisonData(cardsToCompare);
    
    // Render proper HTML table instead of CSS Grid with sections
    comparisonTable.innerHTML = `
        <table class="comparison-data-table">
            <thead>
                <tr>
                    <th>Effect/Skill</th>
                    ${cardsToCompare.map(card => `
                        <th class="comparison-card-header-cell">
                            <img src="support_card_images/${card.support_id}_i.png" 
                                 class="comparison-card-icon" 
                                 alt="${card.char_name || 'Unknown Card'}"
                                 onerror="this.style.display='none'"
                                 loading="lazy">
                            <div class="comparison-card-name">${card.char_name || 'Unknown Card'}</div>
                            <div class="comparison-card-details">
                                <span class="rarity rarity-${card.rarity}">${['', 'R', 'SR', 'SSR'][card.rarity]}</span>
                                <span class="type type-${card.type}">${getTypeDisplayName(card.type)}</span>
                            </div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
                ${renderComparisonTableRows(comparisonData)}
            </tbody>
        </table>
    `;
    
    // Store the comparison data for the toggle function
    window.currentComparisonData = comparisonData;
}

// Global function for toggling comparison sections (needed for onclick handlers)
window.toggleComparisonSection = function(sectionIndex) {
    if (!window.currentComparisonData) return;
    
    const section = window.currentComparisonData.sections[sectionIndex];
    if (!section || !section.collapsible) return;
    
    const headerRow = document.querySelector(`tr.comparison-section-header[data-section="${sectionIndex}"]`);
    const sectionRows = document.querySelectorAll(`tr.comparison-section-row[data-section="${sectionIndex}"]`);
    
    if (headerRow && sectionRows.length > 0) {
        const isCollapsed = headerRow.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Expand section
            headerRow.classList.remove('collapsed');
            sectionRows.forEach(row => row.classList.remove('hidden'));
            section.collapsed = false;
        } else {
            // Collapse section
            headerRow.classList.add('collapsed');
            sectionRows.forEach(row => row.classList.add('hidden'));
            section.collapsed = true;
        }
    }
};

// Build comparison data structure optimized for table rendering with sections
function buildComparisonData(cards) {
    const data = {
        cards: cards,
        sections: []
    };
    
    // Basic info section
    const basicSection = {
        name: 'Basic Information',
        collapsible: false,
        rows: []
    };
    
    basicSection.rows.push({
        label: 'Level',
        type: 'level',
        values: cards.map(card => ({ value: getEffectiveLevel(card), type: 'level' }))
    });
    
    basicSection.rows.push({
        label: 'Owned',
        type: 'owned',
        values: cards.map(card => ({ value: isCardOwned(card.support_id), type: 'owned' }))
    });
    
    data.sections.push(basicSection);
    
    // Effects section
    const effectsSection = {
        name: 'Effects',
        collapsible: false,
        rows: []
    };
    
    // Collect all effects from selected cards
    const allEffectIds = new Set();
    cards.forEach(card => {
        if (card.effects) {
            card.effects.forEach(effect => {
                if (effect[0] && effectsData[effect[0]]) {
                    allEffectIds.add(effect[0]);
                }
            });
        }
    });
    
    // Build effects rows with highlighting logic
    Array.from(allEffectIds).forEach(effectId => {
        const effectInfo = effectsData[effectId];
        if (effectInfo && effectInfo.name_en) {
            const values = cards.map(card => {
                const effectArray = card.effects?.find(effect => effect[0] == effectId);
                const level = getEffectiveLevel(card);
                if (effectArray) {
                    const isLocked = isEffectLocked(effectArray, level);
                    return {
                        value: isLocked ? 0 : calculateEffectValue(effectArray, level),
                        locked: isLocked,
                        hasEffect: true
                    };
                }
                return { value: 0, locked: false, hasEffect: false };
            });
            
            // Find highest value for highlighting (excluding locked/missing effects)
            const validValues = values.filter(v => v.hasEffect && !v.locked).map(v => v.value);
            const highestValue = validValues.length > 0 ? Math.max(...validValues) : 0;
            
            effectsSection.rows.push({
                label: effectInfo.name_en,
                type: 'effect',
                symbol: effectInfo.symbol === 'percent' ? '%' : '',
                values: values.map(v => ({
                    ...v,
                    isHighest: v.hasEffect && !v.locked && v.value === highestValue && v.value > 0
                }))
            });
        }
    });
    
    data.sections.push(effectsSection);
    
    // Hint skills section (collapsible)
    const allHintSkills = new Set();
    cards.forEach(card => {
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                allHintSkills.add(skill.id);
            });
        }
    });
    
    if (allHintSkills.size > 0) {
        const hintSkillsSection = {
            name: 'Hint Skills',
            collapsible: true,
            collapsed: true, // Start collapsed
            rows: []
        };
        
        Array.from(allHintSkills).forEach(skillId => {
            const values = cards.map(card => {
                const hasSkill = card.hints?.hint_skills?.some(skill => skill.id === skillId);
                return { value: hasSkill, type: 'skill' };
            });
            
            hintSkillsSection.rows.push({
                label: `${getSkillName(skillId)}`,
                type: 'skill',
                values: values
            });
        });
        
        data.sections.push(hintSkillsSection);
    }
    
    // Event skills section (collapsible)
    const allEventSkills = new Set();
    cards.forEach(card => {
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                allEventSkills.add(skill.id);
            });
        }
    });
    
    if (allEventSkills.size > 0) {
        const eventSkillsSection = {
            name: 'Event Skills',
            collapsible: true,
            collapsed: true, // Start collapsed
            rows: []
        };
        
        Array.from(allEventSkills).forEach(skillId => {
            const values = cards.map(card => {
                const hasSkill = card.event_skills?.some(skill => skill.id === skillId);
                return { value: hasSkill, type: 'skill' };
            });
            
            eventSkillsSection.rows.push({
                label: `${getSkillName(skillId)}`,
                type: 'skill',
                values: values
            });
        });
        
        data.sections.push(eventSkillsSection);
    }
    
    return data;
}

// Render comparison table rows with sections and improved highlighting
function renderComparisonTableRows(data) {
    let html = '';
    let rowIndex = 0;
    
    data.sections.forEach((section, sectionIndex) => {
        // Add section header if collapsible
        if (section.collapsible) {
            html += `
                <tr class="comparison-section-header ${section.collapsed ? 'collapsed' : ''}" 
                    data-section="${sectionIndex}" 
                    onclick="toggleComparisonSection(${sectionIndex})">
                    <td colspan="${data.cards.length + 1}">${section.name} (${section.rows.length} items)</td>
                </tr>
            `;
        }
        
        // Add section rows
        section.rows.forEach(row => {
            const isHidden = section.collapsible && section.collapsed;
            html += `
                <tr class="comparison-section-row ${isHidden ? 'hidden' : ''}" data-section="${sectionIndex}">
                    <td>${row.label}</td>
                    ${row.values.map(cellData => {
                        let cellClass = 'has-value';
                        let cellContent = '';
                        
                        switch(row.type) {
                            case 'level':
                                cellContent = cellData.value;
                                break;
                            case 'owned':
                                cellContent = cellData.value ? '✓ Owned' : '✗ Not Owned';
                                break;
                            case 'effect':
                                if (!cellData.hasEffect) {
                                    cellClass = 'no-value';
                                    cellContent = 'X';
                                } else if (cellData.locked) {
                                    cellClass = 'locked-value';
                                    cellContent = 'Locked';
                                } else if (cellData.isHighest) {
                                    cellClass = 'highest-value';
                                    cellContent = `${cellData.value}${row.symbol || ''}`;
                                } else {
                                    cellClass = 'has-value';
                                    cellContent = `${cellData.value}${row.symbol || ''}`;
                                }
                                break;
                            case 'skill':
                                // Green highlighting for skills that are present
                                if (cellData.value) {
                                    cellClass = 'has-skill';
                                    cellContent = '✓';
                                } else {
                                    cellClass = 'no-skill';
                                    cellContent = '✗';
                                }
                                break;
                            default:
                                cellContent = cellData.value;
                        }
                        
                        return `<td class="${cellClass}">${cellContent}</td>`;
                    }).join('')}
                </tr>
            `;
            rowIndex++;
        });
    });
    
    return html;
}