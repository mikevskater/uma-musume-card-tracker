// Event Manager
// Centralized event handling and delegation

// ===== EVENT DELEGATION PATTERNS =====

// Global event handlers registry
const eventHandlers = new Map();

// Add delegated event listener
function addDelegatedListener(selector, event, handler, container = document) {
    const key = `${selector}-${event}`;
    
    if (eventHandlers.has(key)) {
        container.removeEventListener(event, eventHandlers.get(key));
    }
    
    const delegatedHandler = (e) => {
        const target = e.target.closest(selector);
        if (target) {
            handler.call(target, e);
        }
    };
    
    container.addEventListener(event, delegatedHandler);
    eventHandlers.set(key, delegatedHandler);
}

// Remove delegated event listener
function removeDelegatedListener(selector, event, container = document) {
    const key = `${selector}-${event}`;
    const handler = eventHandlers.get(key);
    
    if (handler) {
        container.removeEventListener(event, handler);
        eventHandlers.delete(key);
    }
}

// ===== MULTI-SELECT EVENT HANDLERS =====

// Initialize multi-select dropdown events
function initializeMultiSelectEvents(multiSelectIds) {
    multiSelectIds.forEach(id => {
        const multiSelect = document.getElementById(id);
        if (!multiSelect) return;
        
        const trigger = multiSelect.querySelector('.multi-select-trigger');
        const dropdown = multiSelect.querySelector('.multi-select-dropdown');
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        
        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Close other dropdowns
            multiSelectIds.forEach(otherId => {
                if (otherId !== id) {
                    document.getElementById(otherId).classList.remove('open');
                }
            });
            
            multiSelect.classList.toggle('open');
        });
        
        // Handle checkbox changes
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                handleMultiSelectChange(id);
            });
        });
        
        // Prevent dropdown from closing when clicking inside
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        multiSelectIds.forEach(id => {
            document.getElementById(id).classList.remove('open');
        });
    });
}

// Handle multi-select change events
function handleMultiSelectChange(id) {
    const defaultTexts = {
        'rarityFilter': 'All Rarities',
        'typeFilter': 'All Types',
        'hintSkillFilter': 'Any Hint Skills',
        'eventSkillFilter': 'Any Event Skills',
        'includeSkillTypeFilter': 'Any Skill Types',
        'excludeSkillTypeFilter': 'No Exclusions'
    };
    
    updateMultiSelectText(id, defaultTexts[id]);
    
    // Handle different filter types
    if (id === 'rarityFilter' || id === 'typeFilter') {
        debouncedFilterAndSort();
    } else if (id === 'hintSkillFilter') {
        const dropdown = document.getElementById('hintSkillDropdown');
        advancedFilters.hintSkills = Array.from(dropdown.querySelectorAll('input:checked'))
            .map(input => parseInt(input.value));
        debouncedFilterAndSort();
    } else if (id === 'eventSkillFilter') {
        const dropdown = document.getElementById('eventSkillDropdown');
        advancedFilters.eventSkills = Array.from(dropdown.querySelectorAll('input:checked'))
            .map(input => parseInt(input.value));
        debouncedFilterAndSort();
    } else if (id === 'includeSkillTypeFilter') {
        const dropdown = document.getElementById('includeSkillTypeDropdown');
        advancedFilters.includeSkillTypes = Array.from(dropdown.querySelectorAll('input:checked'))
            .map(input => input.value);
        debouncedFilterAndSort();
    } else if (id === 'excludeSkillTypeFilter') {
        const dropdown = document.getElementById('excludeSkillTypeDropdown');
        advancedFilters.excludeSkillTypes = Array.from(dropdown.querySelectorAll('input:checked'))
            .map(input => input.value);
        debouncedFilterAndSort();
    }
}

// ===== TABLE EVENT HANDLERS =====

// Initialize table event handlers
function initializeTableEvents() {
    // Ownership checkbox changes
    addDelegatedListener('.ownership-checkbox input[type="checkbox"]', 'change', function(e) {
        const cardId = parseInt(this.dataset.cardId);
        const owned = this.checked;
        setCardOwnership(cardId, owned);
        
        // Update row state
        const row = this.closest('tr');
        updateRowState(row, cardId, owned);
    });
    
    // Level input changes
    addDelegatedListener('.level-input', 'input', function(e) {
        updateCardDisplay(this);
    });
    
    addDelegatedListener('.level-input', 'change', function(e) {
        const cardId = parseInt(this.dataset.cardId);
        updateCardDisplay(this);
        
        // Update owned card level if conditions are met
        if (isCardOwned(cardId) && 
            (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
            setOwnedCardLevel(cardId, parseInt(this.value));
        }
    });
    
    // Limit break select changes
    addDelegatedListener('.lb-select', 'change', function(e) {
        const cardId = parseInt(this.dataset.cardId);
        const newLimitBreak = parseInt(this.value);
        const tableRow = this.closest('tr');
        
        // ENHANCED: Use the new handler with level clamping
        handleTableLimitBreakChange(cardId, newLimitBreak, tableRow);
    });
    
    // Row click handlers (for modal or selection)
    addDelegatedListener('#cardTableBody tr', 'click', function(e) {
        // Don't trigger if clicking on interactive elements
        if (e.target.matches('input, select, button') || e.target.closest('input, select, button')) {
            return;
        }
        
        const cardId = parseInt(this.dataset.cardId);
        
        if (comparisonMode) {
            toggleCardSelection(cardId);
        } else {
            openCardDetails(cardId);
        }
    });
}

// Update row state after ownership change
function updateRowState(row, cardId, owned) {
    console.log(`🔄 Updating row state for card ${cardId}, owned: ${owned}`);
    
    // Update row classes
    row.className = owned ? 'owned' : 'unowned';
    if (selectedCards.includes(cardId)) {
        row.classList.add('selected');
    }
    
    const levelInput = row.querySelector('.level-input');
    const lbSelect = row.querySelector('.lb-select');
    const ownershipCheckbox = row.querySelector('input[type="checkbox"]');
    
    // Update ownership checkbox
    if (ownershipCheckbox) {
        ownershipCheckbox.checked = owned;
    }
    
    // Calculate disabled states for table elements
    const shouldDisableLevel = !owned && globalLimitBreakLevel === null ||
                              globalLimitBreakLevel !== null && 
                              (globalLimitBreakOverrideOwned || !owned);
    
    const shouldDisableLB = !owned && globalLimitBreakLevel === null ||
                           globalLimitBreakLevel !== null && 
                           (globalLimitBreakOverrideOwned || !owned);
    
    // Update level input
    if (levelInput) {
        levelInput.disabled = shouldDisableLevel;
        
        if (owned) {
            levelInput.value = getOwnedCardLevel(cardId);
        } else {
            const card = cardData.find(c => c.support_id === cardId);
            levelInput.value = getEffectiveLevel(card);
        }
        
        updateCardDisplay(levelInput);
    }
    
    // Update LB select
    if (lbSelect) {
        lbSelect.disabled = shouldDisableLB;
        
        if (owned) {
            lbSelect.value = getOwnedCardLimitBreak(cardId);
        } else {
            lbSelect.value = 4; // Default LB
        }
    }
    
    console.log(`   Row state updated:`, {
        owned,
        levelDisabled: shouldDisableLevel,
        lbDisabled: shouldDisableLB
    });
}

// ===== SORT LAYER EVENT HANDLERS =====

// Initialize sort layer events
function initializeSortEvents() {
    const container = document.getElementById('multiSortContainer');
    
    // Sort control buttons
    addDelegatedListener('.sort-btn', 'click', function(e) {
        const action = this.dataset.action;
        const index = parseInt(this.dataset.index);
        
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
    }, container);
    
    // Category select changes
    addDelegatedListener('.sort-category-select', 'change', function(e) {
        const index = parseInt(this.dataset.index);
        const category = this.value;
        updateSortLayer(index, { category, option: null });
    }, container);
    
    // Option select changes
    addDelegatedListener('.sort-option-select', 'change', function(e) {
        const index = parseInt(this.dataset.index);
        const option = this.value;
        updateSortLayer(index, { option: option || null });
    }, container);
    
    // Direction toggle
    addDelegatedListener('.sort-direction-toggle', 'click', function(e) {
        const index = parseInt(this.dataset.index);
        const currentDirection = multiSort[index].direction;
        const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
        updateSortLayer(index, { direction: newDirection });
    }, container);
}

// ===== MODAL EVENT HANDLERS =====

// Initialize modal events
function initializeModalEvents() {
    // Modal navigation
    addDelegatedListener('#modalPrevBtn', 'click', function(e) {
        navigateModal(-1);
    });
    
    addDelegatedListener('#modalNextBtn', 'click', function(e) {
        navigateModal(1);
    });
    
    // Modal close
    const modalCloseElements = ['#modalClose', '#modalOverlay'];
    modalCloseElements.forEach(selector => {
        addDelegatedListener(selector, 'click', closeCardDetails);
    });
    
    // Confirmation modal close
    const confirmCloseElements = ['#confirmClose', '#confirmOverlay'];
    confirmCloseElements.forEach(selector => {
        addDelegatedListener(selector, 'click', function() {
            document.getElementById('confirmModal').style.display = 'none';
        });
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', handleModalKeyNavigation);
}

// Handle modal keyboard navigation
function handleModalKeyNavigation(e) {
    if (!currentModalCard) return;
    
    const modal = document.getElementById('cardModal');
    if (modal.style.display !== 'block') return;
    
    const activeElement = document.activeElement;
    if (activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeElement.tagName)) {
        return;
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
            document.getElementById('confirmModal').style.display = 'none';
            break;
    }
}

// ===== MODAL FORM EVENT HANDLERS =====

// Setup modal form event listeners (called when modal is opened)
function setupModalFormEvents(card, cardId) {
    console.log(`🔧 Setting up modal form events for card ${cardId}`);
    
    // Ownership toggle
    const ownershipToggle = document.getElementById('modalOwnershipToggle');
    if (ownershipToggle) {
        // Remove existing event listeners by cloning
        const newOwnershipToggle = ownershipToggle.cloneNode(true);
        ownershipToggle.parentNode.replaceChild(newOwnershipToggle, ownershipToggle);
        
        newOwnershipToggle.addEventListener('change', (e) => {
            console.log(`🔧 Modal ownership change: Card ${cardId}, owned ${e.target.checked}`);
            handleModalOwnershipChange(e, cardId, card);
        });
        
        console.log('   ✅ Ownership toggle event bound');
    }
    
    // Level input
    const levelInput = document.getElementById('modalLevelInput');
    if (levelInput) {
        // Remove existing event listeners by cloning
        const newLevelInput = levelInput.cloneNode(true);
        levelInput.parentNode.replaceChild(newLevelInput, levelInput);
        
        newLevelInput.addEventListener('change', (e) => {
            console.log(`🔧 Modal level change triggered: Card ${cardId}, value ${e.target.value}`);
            handleModalLevelChange(e, cardId);
        });
        
        // Also bind to 'input' event for real-time updates
        newLevelInput.addEventListener('input', (e) => {
            // Only update display, don't save until 'change'
            const level = parseInt(e.target.value);
            if (!isNaN(level)) {
                updateModalDisplay(level);
            }
        });
        
        console.log('   ✅ Level input events bound');
    } else {
        console.warn('   ❌ Modal level input not found');
    }
    
    // Limit break select
    const lbSelect = document.getElementById('modalLimitBreakSelect');
    if (lbSelect) {
        // Remove existing event listeners by cloning
        const newLBSelect = lbSelect.cloneNode(true);
        lbSelect.parentNode.replaceChild(newLBSelect, lbSelect);
        
        newLBSelect.addEventListener('change', (e) => {
            console.log(`🔧 Modal LB change triggered: Card ${cardId}, value ${e.target.value}`);
            handleModalLimitBreakChange(e, cardId);
        });
        
        console.log('   ✅ LB select event bound');
    } else {
        console.warn('   ❌ Modal LB select not found');
    }

    const modalMaxPotentialToggle = document.getElementById('modalMaxPotentialToggle');
    if (modalMaxPotentialToggle) {
        modalMaxPotentialToggle.addEventListener('change', (e) => {
            const newValue = e.target.checked;
            
            // Update global setting (sync with main toggle)
            setShowMaxPotentialLevels(newValue);
            
            // Update modal display immediately
            updatePotentialIndicatorDisplay();
            
            // Refresh effects grid with new calculation
            const effectsGrid = document.getElementById('effectsGrid');
            if (effectsGrid) {
                const newGrid = createEffectsGrid(currentModalCard, getOwnedCardLevel(cardId));
                effectsGrid.innerHTML = newGrid.innerHTML;
            }
            
            // Sync main toggle if it exists
            const mainToggle = document.getElementById('showMaxPotential');
            if (mainToggle) {
                mainToggle.checked = newValue;
            }
        });
    }
    
    const modalLevelInput = document.getElementById('modalLevelInput');
    if (modalLevelInput) {
        modalLevelInput.addEventListener('input', (e) => {
            const newLevel = parseInt(e.target.value);
            
            // Update owned card level
            if (isCardOwned(cardId)) {
                setOwnedCardLevel(cardId, newLevel);
            }
            
            // Update modal display with new effective level
            updateModalDisplay(newLevel);
            updatePotentialIndicatorDisplay();
            
            // Update table row if visible
            updateTableRowFromModal(cardId, newLevel);
        });
    }
}

// Handle modal ownership change
function handleModalOwnershipChange(e, cardId, card) {
    const owned = e.target.checked;
    
    console.log(`🎯 Modal ownership change: Card ${cardId}, owned ${owned}`);
    
    // Update ownership status
    setCardOwnership(cardId, owned);
    
    // Update ownership status display
    const statusElement = document.querySelector('.ownership-status');
    if (statusElement) {
        statusElement.className = `ownership-status ${owned ? 'owned' : 'unowned'}`;
        statusElement.textContent = owned ? '✓ Owned' : '✗ Not Owned';
    }
    
    // FIXED: Get modal form elements
    const modalLevelInput = document.getElementById('modalLevelInput');
    const modalLBSelect = document.getElementById('modalLimitBreakSelect');
    
    console.log(`   Modal elements found:`, {
        levelInput: !!modalLevelInput,
        lbSelect: !!modalLBSelect
    });
    
    // ENHANCED: Recalculate disabled states based on new ownership
    const shouldDisable = !owned && globalLimitBreakLevel === null ||
                              globalLimitBreakLevel !== null && 
                              (globalLimitBreakOverrideOwned || !owned);
    
    console.log(`   Calculated disabled states:`, {
        shouldDisable,
        globalLimitBreakLevel,
        globalLimitBreakOverrideOwned
    });
    
    // FIXED: Update level input state and value
    if (modalLevelInput) {
        const oldDisabled = modalLevelInput.disabled;
        modalLevelInput.disabled = shouldDisable;
        
        console.log(`   Level input disabled: ${oldDisabled} → ${shouldDisable}`);
        
        if (owned) {
            // Set to owned card level or default
            const ownedLevel = getOwnedCardLevel(cardId);
            modalLevelInput.value = ownedLevel;
            console.log(`   Set level input to owned level: ${ownedLevel}`);
        } else {
            // Set to effective level for unowned card
            const effectiveLevel = getEffectiveLevel(card);
            modalLevelInput.value = effectiveLevel;
            console.log(`   Set level input to effective level: ${effectiveLevel}`);
        }
        
        updateModalDisplay(parseInt(modalLevelInput.value));
    }
    
    // FIXED: Update limit break select state and value
    if (modalLBSelect) {
        const oldDisabled = modalLBSelect.disabled;
        modalLBSelect.disabled = shouldDisable;
        
        console.log(`   LB select disabled: ${oldDisabled} → ${shouldDisable} ⭐`);
        
        if (owned) {
            // Set to owned card LB or default
            const ownedLB = getOwnedCardLimitBreak(cardId);
            modalLBSelect.value = ownedLB;
            console.log(`   Set LB select to owned LB: ${ownedLB}`);
            
            // Update level input max constraint
            if (modalLevelInput) {
                const maxLevel = limitBreaks[card.rarity][ownedLB];
                modalLevelInput.max = maxLevel;
                console.log(`   Updated level input max to: ${maxLevel}`);
            }
        } else {
            // Set to default LB for unowned card
            modalLBSelect.value = 4;
            console.log(`   Set LB select to default: 4`);
            
            // Update level input max constraint
            if (modalLevelInput) {
                const maxLevel = limitBreaks[card.rarity][4];
                modalLevelInput.max = maxLevel;
                console.log(`   Updated level input max to: ${maxLevel}`);
            }
        }
    }
    
    // ENHANCED: Update table display to match
    const tableRow = document.querySelector(`tr[data-card-id="${cardId}"]`);
    if (tableRow) {
        updateRowState(tableRow, cardId, owned);
        console.log(`   ✅ Updated table row state`);
    }
    
    // ENHANCED: Trigger filter refresh to update display
    debouncedFilterAndSort();
    
    console.log(`   🎉 Ownership change complete`);
}

// Level validation and clamping function
function validateAndClampLevel(cardId, proposedLevel, currentLimitBreak) {
    const card = cardData.find(c => c.support_id === cardId);
    if (!card) return proposedLevel;
    
    const maxLevel = limitBreaks[card.rarity][currentLimitBreak];
    const clampedLevel = Math.min(Math.max(1, proposedLevel), maxLevel);
    
    if (clampedLevel !== proposedLevel) {
        console.log(`🔧 Level validation: Card ${cardId}, ${proposedLevel} → ${clampedLevel} (max for LB ${currentLimitBreak})`);
    }
    
    return clampedLevel;
}

// Get maximum level for a card at specific limit break
function getMaxLevelForLimitBreak(cardId, limitBreakLevel) {
    const card = cardData.find(c => c.support_id === cardId);
    if (!card) return 1;
    
    return limitBreaks[card.rarity][limitBreakLevel];
}

// Check if a level is valid for a card's limit break
function isLevelValidForLimitBreak(cardId, level, limitBreakLevel) {
    const maxLevel = getMaxLevelForLimitBreak(cardId, limitBreakLevel);
    return level >= 1 && level <= maxLevel;
}

// Get safe level when changing limit break (clamps if necessary)
function getSafeLevelForNewLimitBreak(cardId, currentLevel, newLimitBreak) {
    const maxLevel = getMaxLevelForLimitBreak(cardId, newLimitBreak);
    return Math.min(currentLevel, maxLevel);
}

function updateTableRowFromModal(cardId, newLevel, newLimitBreak = null) {
    // Use more specific selector for level input
    const tableRow = document.querySelector(`tr[data-card-id="${cardId}"]`);
    if (!tableRow) {
        console.warn(`Table row not found for card ${cardId}`);
        return false;
    }
    
    // More specific selectors within the row
    const tableLevelInput = tableRow.querySelector('.level-input');
    const tableLBSelect = tableRow.querySelector('.lb-select');
    
    console.log(`🔄 Updating table row for card ${cardId}:`, {
        newLevel,
        newLimitBreak,
        foundLevelInput: !!tableLevelInput,
        foundLBSelect: !!tableLBSelect
    });
    
    // Update level input
    if (tableLevelInput && newLevel !== null && newLevel !== undefined) {
        const oldValue = tableLevelInput.value;
        tableLevelInput.value = newLevel;
        
        console.log(`   Level input: ${oldValue} → ${newLevel}`);
        
        // Trigger the update display function
        updateCardDisplay(tableLevelInput);
    }
    
    // Update limit break select if provided
    if (tableLBSelect && newLimitBreak !== null && newLimitBreak !== undefined) {
        const oldValue = tableLBSelect.value;
        tableLBSelect.value = newLimitBreak;
        
        console.log(`   LB select: ${oldValue} → ${newLimitBreak}`);
    }
    
    return true;
}

// Enhanced modal level change handler with better sync
function handleModalLevelChange(e, cardId) {
    const proposedLevel = parseInt(e.target.value);
    
    console.log(`🎯 Modal level change: Card ${cardId}, proposed level ${proposedLevel}`);
    
    // Validate and clamp level
    const currentLB = getOwnedCardLimitBreak(cardId) || 2;
    const validLevel = validateAndClampLevel(cardId, proposedLevel, currentLB);
    
    // Update modal input value if it was clamped
    if (validLevel !== proposedLevel) {
        e.target.value = validLevel;
        showToast(`Level clamped to ${validLevel} (max for LB ${currentLB})`, 'warning');
        console.log(`   Level clamped: ${proposedLevel} → ${validLevel}`);
    }
    
    // Update modal display
    updateModalDisplay(validLevel);
    
    // Update owned card level and sync table
    if (isCardOwned(cardId) && 
        (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
        
        // Save the new level
        setOwnedCardLevel(cardId, validLevel);
        console.log(`   Saved level ${validLevel} for card ${cardId}`);
        
        // Use enhanced table update function
        const syncSuccess = updateTableRowFromModal(cardId, validLevel);
        console.log(`   Table sync: ${syncSuccess ? '✅ Success' : '❌ Failed'}`);
    }
}

// Enhanced modal limit break change handler with better sync
function handleModalLimitBreakChange(e, cardId) {
    const newLimitBreak = parseInt(e.target.value);
    
    console.log(`🎯 Modal LB change: Card ${cardId}, new LB ${newLimitBreak}`);
    
    if (isCardOwned(cardId) && 
        (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
        
        // Use enhanced setOwnedCardLimitBreak with clamping
        const clampResult = setOwnedCardLimitBreak(cardId, newLimitBreak);
        
        if (clampResult) {
            const { newLevel, levelChanged, newMaxLevel } = clampResult;
            
            console.log(`   LB change result:`, clampResult);
            
            // Update modal level input constraints and value
            const modalLevelInput = document.getElementById('modalLevelInput');
            if (modalLevelInput) {
                modalLevelInput.max = newMaxLevel;
                
                // Update level if it was clamped
                if (levelChanged) {
                    modalLevelInput.value = newLevel;
                    updateModalDisplay(newLevel);
                    
                    // Show user feedback about level clamping
                    showToast(`Level reduced to ${newLevel} (max for LB ${newLimitBreak})`, 'warning');
                }
            }
            
            // Use enhanced table update function
            const syncSuccess = updateTableRowFromModal(cardId, newLevel, newLimitBreak);
            console.log(`   Table sync: ${syncSuccess ? '✅ Success' : '❌ Failed'}`);
        }
    }
}

function handleTableLimitBreakChange(cardId, newLimitBreak, tableRow) {
    if (isCardOwned(cardId) && 
        (globalLimitBreakLevel === null || !globalLimitBreakOverrideOwned)) {
        
        // Use the setOwnedCardLimitBreak function
        const clampResult = setOwnedCardLimitBreak(cardId, newLimitBreak);
        
        if (clampResult) {
            const { newLevel, levelChanged, newMaxLevel } = clampResult;
            
            // Update table level input constraints and value
            const levelInput = tableRow.querySelector('.level-input');
            if (levelInput) {
                levelInput.max = newMaxLevel;
                
                // Update level if it was clamped
                if (levelChanged) {
                    levelInput.value = newLevel;
                    updateCardDisplay(levelInput);
                    
                    // Show user feedback about level clamping
                    showToast(`Level reduced to ${newLevel} (max for LB ${newLimitBreak})`, 'warning');
                }
            }
            
            // Update modal if open for this card
            if (currentModalCard && currentModalCard.support_id === cardId) {
                updateModalAfterTableLimitBreakChange(cardId, newLimitBreak, newLevel, newMaxLevel);
            }
            
            console.log(`🔄 Table LB change: Card ${cardId} → LB ${newLimitBreak}, Level ${newLevel}`);
        }
    }
}

function updateTableRowAfterLimitBreakChange(cardId, newLimitBreak, newLevel, newMaxLevel) {
    const tableRow = document.querySelector(`tr[data-card-id="${cardId}"]`);
    if (tableRow) {
        const levelInput = tableRow.querySelector('.level-input');
        const lbSelect = tableRow.querySelector('.lb-select');
        
        if (levelInput) {
            levelInput.max = newMaxLevel;
            levelInput.value = newLevel;
            updateCardDisplay(levelInput);
        }
        
        if (lbSelect && lbSelect.value != newLimitBreak) {
            lbSelect.value = newLimitBreak;
        }
    }
}

function updateModalAfterTableLimitBreakChange(cardId, newLimitBreak, newLevel, newMaxLevel) {
    const modalLevelInput = document.getElementById('modalLevelInput');
    const modalLBSelect = document.getElementById('modalLimitBreakSelect');
    
    if (modalLevelInput) {
        modalLevelInput.max = newMaxLevel;
        modalLevelInput.value = newLevel;
        updateModalDisplay(newLevel);
    }
    
    if (modalLBSelect && modalLBSelect.value != newLimitBreak) {
        modalLBSelect.value = newLimitBreak;
    }
}

// ===== COMPARISON EVENT HANDLERS =====

// Initialize comparison events
function initializeComparisonEvents() {
    // Comparison mode toggle
    const modeToggle = document.getElementById('comparisonModeToggle');
    if (modeToggle) {
        modeToggle.addEventListener('change', (e) => {
            toggleComparisonMode(e.target.checked);
        });
    }
    
    // Comparison action buttons
    const compareBtn = document.getElementById('compareSelectedBtn');
    if (compareBtn) {
        compareBtn.addEventListener('click', showComparisonTable);
    }
    
    const clearSelectedBtn = document.getElementById('clearSelectedBtn');
    if (clearSelectedBtn) {
        clearSelectedBtn.addEventListener('click', clearAllSelectedCards);
    }
    
    const clearComparisonBtn = document.getElementById('clearComparisonBtn');
    if (clearComparisonBtn) {
        clearComparisonBtn.addEventListener('click', clearComparison);
    }
    
    const closeComparisonBtn = document.getElementById('closeComparisonBtn');
    if (closeComparisonBtn) {
        closeComparisonBtn.addEventListener('click', hideComparison);
    }
    
    // Remove selected card buttons (delegated)
    addDelegatedListener('.remove-selected-btn', 'click', function(e) {
        const cardId = parseInt(this.dataset.cardId);
        removeCardFromSelection(cardId);
    });
}

// ===== FILTER EVENT HANDLERS =====

// Initialize filter events
function initializeFilterEvents() {
    // Basic filters
    const nameFilter = document.getElementById('nameFilter');
    if (nameFilter) {
        nameFilter.addEventListener('input', debouncedFilterAndSort);
    }
    
    const releasedFilter = document.getElementById('releasedFilter');
    if (releasedFilter) {
        releasedFilter.addEventListener('change', debouncedFilterAndSort);
    }
    
    const ownedFilter = document.getElementById('ownedFilter');
    if (ownedFilter) {
        ownedFilter.addEventListener('change', debouncedFilterAndSort);
    }
    
    // Global controls
    const globalLBSelect = document.getElementById('globalLimitBreak');
    if (globalLBSelect) {
        globalLBSelect.addEventListener('change', (e) => {
            setGlobalLimitBreak(e.target.value);
        });
    }
    
    const globalOverrideCheckbox = document.getElementById('globalOverrideOwned');
    if (globalOverrideCheckbox) {
        globalOverrideCheckbox.addEventListener('change', (e) => {
            setGlobalLimitBreakOverride(e.target.checked);
        });
    }
    
    const showMaxPotentialCheckbox = document.getElementById('showMaxPotential');
    if (showMaxPotentialCheckbox) {
        showMaxPotentialCheckbox.addEventListener('change', (e) => {
            setShowMaxPotentialLevels(e.target.checked);
        });
    }
    
    // Advanced filter toggle
    const advancedToggle = document.getElementById('advancedToggle');
    if (advancedToggle) {
        advancedToggle.addEventListener('click', toggleAdvancedFilters);
    }
    
    // Filter action buttons
    const clearAdvancedBtn = document.getElementById('clearAdvancedBtn');
    if (clearAdvancedBtn) {
        clearAdvancedBtn.addEventListener('click', clearAdvancedFilters);
    }
    
    const clearAllFiltersBtn = document.getElementById('clearAllFilters');
    if (clearAllFiltersBtn) {
        clearAllFiltersBtn.addEventListener('click', () => {
            clearAllFilters();
            debouncedFilterAndSort();
        });
    }
}

// Toggle advanced filters section
function toggleAdvancedFilters() {
    const advancedContent = document.getElementById('advancedContent');
    const advancedToggle = document.getElementById('advancedToggle');
    
    const isExpanded = advancedContent.style.display !== 'none';
    
    if (isExpanded) {
        advancedContent.style.display = 'none';
        advancedToggle.classList.remove('expanded');
    } else {
        advancedContent.style.display = 'block';
        advancedToggle.classList.add('expanded');
    }
}

// ===== DATA MANAGEMENT EVENT HANDLERS =====

// Initialize data management events
function initializeDataManagementEvents() {
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportOwnedCards);
    }
    
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });
        
        importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importOwnedCards(file);
            }
            e.target.value = ''; // Reset file input
        });
    }
    
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearOwnedCards);
    }
}

// ===== SORTING EVENT HANDLERS =====

// Initialize column sorting events
function initializeSortingEvents() {
    addDelegatedListener('th.sortable', 'click', function() {
        const column = this.dataset.sort;
        handleSort(column);
    });
    
    const addSortBtn = document.getElementById('addSortBtn');
    if (addSortBtn) {
        addSortBtn.addEventListener('click', addSortLayer);
    }
}

// ===== INITIALIZATION =====

// Initialize all event handlers
function initializeAllEvents() {
    initializeModalEvents();
    initializeTableEvents();
    initializeSortEvents();
    initializeComparisonEvents();
    initializeFilterEvents();
    initializeDataManagementEvents();
    initializeSortingEvents();
}

// ===== EXPORTS =====

window.EventManager = {
    addDelegatedListener,
    removeDelegatedListener,
    initializeMultiSelectEvents,
    initializeAllEvents,
    setupModalFormEvents,
    handleMultiSelectChange
};

// Export individual functions to global scope
Object.assign(window, {
    initializeMultiSelectEvents: EventManager.initializeMultiSelectEvents,
    initializeAllEvents: EventManager.initializeAllEvents,
    setupModalFormEvents: EventManager.setupModalFormEvents,
    handleMultiSelectChange: EventManager.handleMultiSelectChange
});