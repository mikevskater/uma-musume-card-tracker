// UI Renderer Module
// Handles all UI rendering, modal management, and display updates

// Multi-Sort Functions
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

// Get priority effects for display based on sort configuration - FIXED: Now filters out locked effects
function getPriorityEffects(card, targetCount = 4) {
    const cardLevel = getEffectiveLevel(card);
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
            .filter(effect => !isEffectLocked(effect, cardLevel)) // FIXED: Filter out locked effects
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
            // Don't open modal if clicking on checkbox, input, or select
            if (e.target.type !== 'checkbox' && e.target.type !== 'number' && e.target.tagName !== 'SELECT') {
                openCardDetails(cardId);
            }
        });
        
        // Get effective level for display
        const effectiveLevel = getEffectiveLevel(card);
        const currentLimitBreak = isOwned ? getOwnedCardLimitBreak(cardId) : 2;
        
        // Create level display with potential indicator
        const levelDisplay = showMaxPotentialLevels && isOwned ? 
            `${effectiveLevel} <span class="max-potential-indicator">MAX</span>` : 
            effectiveLevel;
        
        // Get priority effects based on sort configuration (now filtered for unlocked only)
        const priorityEffects = getPriorityEffects(card, 4);
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

        // FIXED: Create LB dropdown instead of plain text
        const lbDropdownOptions = Array.from({length: 5}, (_, i) => 
            `<option value="${i}" ${currentLimitBreak === i ? 'selected' : ''}>LB ${i}</option>`
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
            <td><input type="number" class="level-input" value="${effectiveLevel}" min="1" max="${limitBreaks[card.rarity][currentLimitBreak]}" data-card-id="${cardId}" onclick="event.stopPropagation()" ${shouldDisableLevel ? 'disabled' : ''}></td>
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

    // FIXED: Add event listeners for LB dropdown changes
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

// Update card display when level changes
function updateCardDisplay(input) {
    const cardId = parseInt(input.dataset.cardId);
    const level = parseInt(input.value);
    const card = cardData.find(c => c.support_id === cardId);
    
    if (!card) return;
    
    const row = input.closest('tr');
    const isOwned = isCardOwned(cardId);
    const currentLimitBreak = isOwned ? getOwnedCardLimitBreak(cardId) : 2;
    
    // Update limit break display (the dropdown should already show current LB)
    const lbSelect = row.querySelector('.lb-select');
    if (lbSelect && lbSelect.value != currentLimitBreak) {
        lbSelect.value = currentLimitBreak;
    }
    
    // Recalculate and update priority effects (now filtered for unlocked only)
    const priorityEffects = getPriorityEffects(card, 4);
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
    
    // FIXED: Modal limit break select - now also updates table LB dropdown max value
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
            
            // FIXED: Update table display - both level input max and LB dropdown value
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