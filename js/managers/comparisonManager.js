// Comparison Manager Module (ENHANCED)
// Handles card selection and comparison functionality with form control management

// ===== COMPARISON STATE =====

// Card comparison state (declared in app.js but managed here)
// comparisonMode, selectedCards, showComparison

// ===== COMPARISON MODE MANAGEMENT =====

// Toggle comparison mode (ENHANCED with form control management and smart container visibility)
function toggleComparisonMode(enabled) {
    comparisonMode = enabled;
    
    // Update UI classes
    const mainContent = document.querySelector('.main-content');
    const selectionContainer = document.getElementById('selectionContainer');
    
    if (comparisonMode) {
        mainContent.classList.add('has-selection');
        selectionContainer.style.display = 'block';
        
        // Add visual indicators to table rows
        document.querySelectorAll('#cardTableBody tr').forEach(row => {
            row.classList.add('comparison-mode');
        });
        
        // ENHANCED: Disable form controls to prevent accidental changes
        disableFormControlsForComparison(true);
        
    } else {
        mainContent.classList.remove('has-selection');
        
        // FIXED: Keep selection container visible if cards are selected
        if (selectedCards.length === 0) {
            selectionContainer.style.display = 'none';
        } else {
            selectionContainer.style.display = 'block';
        }
        
        // Remove visual indicators from table rows
        document.querySelectorAll('#cardTableBody tr').forEach(row => {
            row.classList.remove('comparison-mode');
        });
        
        // ENHANCED: Re-enable form controls
        disableFormControlsForComparison(false);
    }
    
    // Re-render table to update click handlers and control states
    renderCards(currentFilteredCards);
    renderSelectionContainer();
}

// ENHANCED: Helper function to disable/enable form controls in comparison mode
function disableFormControlsForComparison(disable) {
    const formControls = document.querySelectorAll(
        '.ownership-checkbox input[type="checkbox"], .level-input, .lb-select'
    );
    
    formControls.forEach(control => {
        // Set disabled state
        control.disabled = disable;
        
        // Add visual feedback to parent cells
        const parentCell = control.closest('td');
        if (parentCell) {
            if (disable) {
                parentCell.classList.add('comparison-mode-disabled');
            } else {
                parentCell.classList.remove('comparison-mode-disabled');
            }
        }
        
        // Update cursor style
        if (disable) {
            control.style.cursor = 'not-allowed';
        } else {
            control.style.cursor = control.type === 'checkbox' ? 'pointer' : 'default';
        }
    });
    
    // Update click handling for disabled controls
    if (disable) {
        // Add event listeners to prevent clicks on disabled controls
        formControls.forEach(control => {
            control.addEventListener('click', preventDisabledControlClick, { capture: true });
        });
    } else {
        // Remove the event listeners
        formControls.forEach(control => {
            control.removeEventListener('click', preventDisabledControlClick, { capture: true });
        });
    }
}

// ENHANCED: Prevent clicks on disabled controls and show feedback
function preventDisabledControlClick(event) {
    if (event.target.disabled && comparisonMode) {
        event.preventDefault();
        event.stopPropagation();
        
        // Show temporary feedback
        showToast('Controls are disabled in comparison mode. Toggle off comparison mode to make changes.', 'warning');
    }
}

// ===== CARD SELECTION MANAGEMENT =====

// Toggle card selection (ENHANCED with smart container visibility)
function toggleCardSelection(cardId) {
    const index = selectedCards.indexOf(cardId);
    
    if (index === -1) {
        selectedCards.push(cardId);
        // Show selection container when first card is added
        if (selectedCards.length === 1) {
            document.getElementById('selectionContainer').style.display = 'block';
        }
    } else {
        selectedCards.splice(index, 1);
        // Hide container if no cards and comparison mode is off
        if (selectedCards.length === 0 && !comparisonMode) {
            document.getElementById('selectionContainer').style.display = 'none';
        }
    }
    
    updateCardSelectionStates();
    renderSelectionContainer();
    
    // Hide comparison if no cards selected
    if (selectedCards.length === 0 && showComparison) {
        hideComparison();
    }
}

// Remove card from selection (ENHANCED with smart container visibility)
function removeCardFromSelection(cardId) {
    const index = selectedCards.indexOf(cardId);
    if (index !== -1) {
        selectedCards.splice(index, 1);
        updateCardSelectionStates();
        renderSelectionContainer();
        
        // ENHANCED: Hide selection container if no cards and comparison mode is off
        if (selectedCards.length === 0) {
            if (showComparison) {
                hideComparison();
            }
            if (!comparisonMode) {
                document.getElementById('selectionContainer').style.display = 'none';
            }
        }
    }
}

// Clear all selected cards (ENHANCED with smart container visibility)
function clearAllSelectedCards() {
    selectedCards = [];
    updateCardSelectionStates();
    renderSelectionContainer();
    
    if (showComparison) {
        hideComparison();
    }
    
    // ENHANCED: Hide selection container if comparison mode is off
    if (!comparisonMode) {
        document.getElementById('selectionContainer').style.display = 'none';
    }
}

// ===== COMPARISON TABLE MANAGEMENT =====

// Show comparison table
function showComparisonTable() {
    if (selectedCards.length === 0) {
        showToast('Please select at least one card to compare', 'warning');
        return;
    }
    
    showComparison = true;
    const comparisonSection = document.getElementById('comparisonSection');
    comparisonSection.style.display = 'block';
    renderComparisonTable();
    
    // Smooth scroll to comparison section
    comparisonSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Hide comparison table
function hideComparison() {
    showComparison = false;
    document.getElementById('comparisonSection').style.display = 'none';
}

// Clear comparison (hide and clear selection)
function clearComparison() {
    clearAllSelectedCards();
    hideComparison();
}

// ===== COMPARISON TABLE RENDERING =====

// Render comparison table with proper HTML structure
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
    
    // Build comparison data structure
    const comparisonData = buildComparisonData(cardsToCompare);
    
    // Render HTML table
    const table = createElement('table', {
        className: 'comparison-data-table'
    });
    
    // Create header
    table.appendChild(createComparisonTableHeader(cardsToCompare));
    
    // Create body
    table.appendChild(createComparisonTableBody(comparisonData));
    
    comparisonTable.innerHTML = '';
    comparisonTable.appendChild(table);
    
    // Store comparison data for toggle function
    window.currentComparisonData = comparisonData;
}

// Create comparison table header
function createComparisonTableHeader(cards) {
    const thead = createElement('thead');
    const headerRow = createElement('tr');
    
    // First column header
    headerRow.appendChild(createElement('th', {
        textContent: 'Effect/Skill'
    }));
    
    // Card headers
    cards.forEach(card => {
        headerRow.appendChild(createComparisonCardHeader(card));
    });
    
    thead.appendChild(headerRow);
    return thead;
}

// Create comparison table body
function createComparisonTableBody(data) {
    const tbody = createElement('tbody');
    
    data.sections.forEach((section, sectionIndex) => {
        // Add section header if collapsible
        if (section.collapsible) {
            const headerRow = createComparisonSectionHeader(section, sectionIndex, data.cards.length);
            tbody.appendChild(headerRow);
        }
        
        // Add section rows
        section.rows.forEach(row => {
            const dataRow = createComparisonDataRow(row, section, sectionIndex);
            tbody.appendChild(dataRow);
        });
    });
    
    return tbody;
}

// Create comparison section header row
function createComparisonSectionHeader(section, sectionIndex, cardCount) {
    const row = createElement('tr', {
        className: `comparison-section-header ${section.collapsed ? 'collapsed' : ''}`,
        'data-section': sectionIndex
    });
    
    // FIXED: Add click event listener instead of inline onclick
    row.addEventListener('click', () => toggleComparisonSection(sectionIndex));
    
    const cell = createElement('td', {
        colSpan: cardCount + 1,  // FIXED: Capital S for colSpan
        textContent: `${section.name} (${section.rows.length} items)`
    });
    
    row.appendChild(cell);
    return row;
}

// Create comparison data row
function createComparisonDataRow(row, section, sectionIndex) {
    const isHidden = section.collapsible && section.collapsed;
    
    // Check if this is a skill row and if it matches current filters
    const isSkillFilterHighlighted = row.type === 'skill' && row.skillTypeFilterMatch;
    
    const tr = createElement('tr', {
        className: `comparison-section-row ${isHidden ? 'hidden' : ''} ${isSkillFilterHighlighted ? 'skill-filter-highlighted' : ''}`,
        'data-section': sectionIndex
    });
    
    // Label cell
    const labelCell = createElement('td', {
        textContent: row.label
    });
    
    // Add filter indicator to skill labels if they match filters
    if (isSkillFilterHighlighted) {
        labelCell.classList.add('skill-label-highlighted');
    }
    
    tr.appendChild(labelCell);
    
    // Value cells
    row.values.forEach(cellData => {
        const cell = createComparisonValueCell(cellData, row, isSkillFilterHighlighted);
        tr.appendChild(cell);
    });
    
    return tr;
}

// Create comparison value cell (ENHANCED with proper skill-only highlighting)
function createComparisonValueCell(cellData, row, isSkillFilterHighlighted = false) {
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
            if (cellData.value) {
                cellClass = 'has-skill';
                cellContent = '✓';
                // FIXED: Only add filter highlighting to cells with skills
                if (isSkillFilterHighlighted) {
                    cellClass += ' skill-cell-highlighted';
                }
            } else {
                cellClass = 'no-skill';
                cellContent = '✗';
                // FIXED: Don't highlight empty skill cells - they get standard styling
            }
            break;
        default:
            cellContent = cellData.value;
    }
    
    return createElement('td', {
        className: cellClass,
        innerHTML: cellContent
    });
}

// ===== COMPARISON DATA BUILDING =====

// Build comparison data structure
function buildComparisonData(cards) {
    const data = {
        cards: cards,
        sections: []
    };
    
    // Basic information section
    data.sections.push(buildBasicInfoSection(cards));
    
    // Effects section - NOW COLLAPSIBLE
    data.sections.push(buildEffectsSection(cards));
    
    // Hint skills section (if any cards have hint skills)
    const hintSkillsSection = buildHintSkillsSection(cards);
    if (hintSkillsSection.rows.length > 0) {
        data.sections.push(hintSkillsSection);
    }
    
    // Event skills section (if any cards have event skills)
    const eventSkillsSection = buildEventSkillsSection(cards);
    if (eventSkillsSection.rows.length > 0) {
        data.sections.push(eventSkillsSection);
    }
    
    return data;
}

// Build basic info section
function buildBasicInfoSection(cards) {
    const section = {
        name: 'Basic Information',
        collapsible: false,
        rows: []
    };
    
    section.rows.push({
        label: 'Level',
        type: 'level',
        values: cards.map(card => ({ value: getEffectiveLevel(card), type: 'level' }))
    });
    
    section.rows.push({
        label: 'Owned',
        type: 'owned',
        values: cards.map(card => ({ value: isCardOwned(card.support_id), type: 'owned' }))
    });
    
    return section;
}

// Build effects section - UPDATED: Now collapsible but expanded by default
function buildEffectsSection(cards) {
    const section = {
        name: 'Effects',
        collapsible: true,    // CHANGED: Now collapsible
        collapsed: false,     // NEW: Expanded by default
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
    
    // Build effects rows with highlighting
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
            
            // Find highest value for highlighting
            const validValues = values.filter(v => v.hasEffect && !v.locked).map(v => v.value);
            const highestValue = validValues.length > 0 ? Math.max(...validValues) : 0;
            
            section.rows.push({
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
    
    return section;
}

// Build hint skills section with filter highlighting (ENHANCED with individual skill highlighting)
function buildHintSkillsSection(cards) {
    const section = {
        name: 'Hint Skills',
        collapsible: true,
        collapsed: true,
        rows: []
    };
    
    const allHintSkills = new Set();
    const skillTypeMap = new Map(); // Map skill ID to skill types
    
    cards.forEach(card => {
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                allHintSkills.add(skill.id);
                skillTypeMap.set(skill.id, skill.type || []);
            });
        }
    });
    
    Array.from(allHintSkills).forEach(skillId => {
        const values = cards.map(card => {
            const hasSkill = card.hints?.hint_skills?.some(skill => skill.id === skillId);
            return { value: hasSkill, type: 'skill' };
        });
        
        // Check if this skill matches current filters
        const skillTypes = skillTypeMap.get(skillId) || [];
        const filterCheck = checkSkillTypeFilters(skillTypes);
        
        // ENHANCED: Check both skill type filters AND individual skill filters
        const skillTypeFilterMatch = (advancedFilters.includeSkillTypes?.length > 0 || 
                                     advancedFilters.excludeSkillTypes?.length > 0) &&
                                    filterCheck.hasIncludeMatch && !filterCheck.hasExcludeMatch;
        
        const individualSkillMatch = advancedFilters.hintSkills?.includes(skillId);
        
        // Highlight if either skill types match OR individual skill is selected
        const shouldHighlight = skillTypeFilterMatch || individualSkillMatch;
        
        section.rows.push({
            label: getSkillName(skillId),
            type: 'skill',
            values: values,
            skillTypeFilterMatch: shouldHighlight
        });
    });
    
    return section;
}

// Build event skills section with filter highlighting (ENHANCED with individual skill highlighting)
function buildEventSkillsSection(cards) {
    const section = {
        name: 'Event Skills',
        collapsible: true,
        collapsed: true,
        rows: []
    };
    
    const allEventSkills = new Set();
    const skillTypeMap = new Map(); // Map skill ID to skill types
    
    cards.forEach(card => {
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                allEventSkills.add(skill.id);
                skillTypeMap.set(skill.id, skill.type || []);
            });
        }
    });
    
    Array.from(allEventSkills).forEach(skillId => {
        const values = cards.map(card => {
            const hasSkill = card.event_skills?.some(skill => skill.id === skillId);
            return { value: hasSkill, type: 'skill' };
        });
        
        // Check if this skill matches current filters
        const skillTypes = skillTypeMap.get(skillId) || [];
        const filterCheck = checkSkillTypeFilters(skillTypes);
        
        // ENHANCED: Check both skill type filters AND individual skill filters
        const skillTypeFilterMatch = (advancedFilters.includeSkillTypes?.length > 0 || 
                                     advancedFilters.excludeSkillTypes?.length > 0) &&
                                    filterCheck.hasIncludeMatch && !filterCheck.hasExcludeMatch;
        
        const individualSkillMatch = advancedFilters.eventSkills?.includes(skillId);
        
        // Highlight if either skill types match OR individual skill is selected
        const shouldHighlight = skillTypeFilterMatch || individualSkillMatch;
        
        section.rows.push({
            label: getSkillName(skillId),
            type: 'skill',
            values: values,
            skillTypeFilterMatch: shouldHighlight
        });
    });
    
    return section;
}

// ===== COMPARISON SECTION TOGGLE =====

// Global function for toggling comparison sections - FIXED to work properly
function toggleComparisonSection(sectionIndex) {
    if (!window.currentComparisonData) {
        console.warn('No comparison data available');
        return;
    }
    
    const section = window.currentComparisonData.sections[sectionIndex];
    if (!section || !section.collapsible) {
        console.warn('Section not found or not collapsible:', sectionIndex);
        return;
    }
    
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
    } else {
        console.warn('Header row or section rows not found for section:', sectionIndex);
    }
}

// Ensure global access
window.toggleComparisonSection = toggleComparisonSection;

// ===== EXPORTS =====

window.ComparisonManager = {
    toggleComparisonMode,
    toggleCardSelection,
    removeCardFromSelection,
    clearAllSelectedCards,
    showComparisonTable,
    hideComparison,
    clearComparison,
    renderComparisonTable,
    buildComparisonData,
    disableFormControlsForComparison,
    preventDisabledControlClick
};

// Export individual functions to global scope for backward compatibility
Object.assign(window, window.ComparisonManager);