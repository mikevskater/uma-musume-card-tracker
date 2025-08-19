// Modal Manager Module
// Handles card detail modal functionality and help system

// ===== MODAL STATE =====

// Global modal navigation state
let currentModalCardIndex = -1;
let currentHelpSection = 'welcome';

// ===== MODAL LIFECYCLE =====

// Open card details modal
function openCardDetails(cardId) {
    const card = cardData.find(c => c.support_id === cardId);
    if (!card) return;
    
    // Validate filtered cards
    if (!currentFilteredCards || currentFilteredCards.length === 0) {
        console.warn('No filtered cards available, using fallback');
        currentFilteredCards = cardData;
    }
    
    // Find card's index in current filtered results
    currentModalCardIndex = currentFilteredCards.findIndex(c => c.support_id === cardId);
    
    if (currentModalCardIndex === -1) {
        console.warn(`Card ${cardId} not found in current filter`);
        currentFilteredCards = [card];
        currentModalCardIndex = 0;
    }
    
    currentModalCard = card;
    
    // Get current effective level
    const currentLevel = getEffectiveLevel(card);
    
    renderCardDetails(card, currentLevel);
    showModal();
}

// Close card details modal
function closeCardDetails() {
    hideModal();
    currentModalCard = null;
    currentModalCardIndex = -1;
}

// Show modal
function showModal() {
    const modal = document.getElementById('cardModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Hide modal
function hideModal() {
    const modal = document.getElementById('cardModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// ===== HELP MODAL SYSTEM =====

// Open help modal
async function openHelpModal() {
    const modal = document.getElementById('helpModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Render initial help content (now async)
    await renderHelpContent(currentHelpSection);
    
    console.log('📖 Help modal opened');
}

// Close help modal
function closeHelpModal() {
    const modal = document.getElementById('helpModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    
    console.log('📖 Help modal closed');
}

// Navigate to help section
async function navigateToHelpSection(sectionId) {
    currentHelpSection = sectionId;
    
    // Update active navigation item
    document.querySelectorAll('.help-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
    
    // Render new content (now async)
    await renderHelpContent(sectionId);
}

// Render help content based on section
async function renderHelpContent(sectionId) {
    const contentContainer = document.getElementById('helpContent');
    
    // Hide all sections
    contentContainer.querySelectorAll('.help-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Get or create section element
    let sectionElement = contentContainer.querySelector(`[data-section="${sectionId}"]`);
    if (!sectionElement) {
        sectionElement = createElement('div', {
            className: 'help-section',
            'data-section': sectionId
        });
        
        // Show loading state
        sectionElement.innerHTML = '<p>Loading help content...</p>';
        contentContainer.appendChild(sectionElement);
        
        // Load content from HTML file
        try {
            const content = await loadHelpSectionContent(sectionId);
            sectionElement.innerHTML = content;
        } catch (error) {
            console.error(`Failed to render help section ${sectionId}:`, error);
            sectionElement.innerHTML = generateFallbackContent(sectionId);
        }
    }
    
    // Show the selected section
    sectionElement.classList.add('active');
}

// ===== HELP CONTENT LOADING =====

// Cache for loaded help content
const helpContentCache = new Map();

// Load help section content from HTML file
async function loadHelpSectionContent(sectionId) {
    // Check cache first
    if (helpContentCache.has(sectionId)) {
        return helpContentCache.get(sectionId);
    }
    
    try {
        const response = await fetch(`help/${sectionId}.html`);
        
        if (!response.ok) {
            throw new Error(`Failed to load help section: ${response.status} ${response.statusText}`);
        }
        
        const content = await response.text();
        
        // Cache the content
        helpContentCache.set(sectionId, content);
        
        console.log(`📖 Loaded help section: ${sectionId}`);
        return content;
        
    } catch (error) {
        console.error(`Failed to load help section ${sectionId}:`, error);
        return generateFallbackContent(sectionId);
    }
}

// Generate fallback content if file loading fails
function generateFallbackContent(sectionId) {
    const fallbackContent = {
        welcome: `
            <h3>Welcome</h3>
            <p>Welcome to the Uma Musume Support Card Tracker! This help content could not be loaded from the server.</p>
            <div class="help-warning">
                <strong>⚠️ Help Content Unavailable:</strong> The help files could not be loaded. Please check that the help/ folder exists and contains the necessary HTML files.
            </div>
        `,
        filtering: `<h3>Filtering</h3><p>Help content for filtering could not be loaded.</p>`,
        sorting: `<h3>Sorting</h3><p>Help content for sorting could not be loaded.</p>`,
        comparison: `<h3>Comparison</h3><p>Help content for comparison could not be loaded.</p>`,
        collection: `<h3>Collection</h3><p>Help content for collection could not be loaded.</p>`,
        tips: `<h3>Tips & Tricks</h3><p>Help content for tips could not be loaded.</p>`
    };
    
    return fallbackContent[sectionId] || `<h3>Section Not Found</h3><p>Content for section "${sectionId}" could not be loaded.</p>`;
}

// ===== MODAL NAVIGATION =====

// Navigate modal (direction: -1 for previous, 1 for next)
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

// ===== MODAL RENDERING =====

// Render card details in modal
function renderCardDetails(card, level) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    // Update modal title with navigation
    const totalCards = currentFilteredCards.length;
    const cardPosition = currentModalCardIndex + 1;
    
    modalTitle.innerHTML = '';
    modalTitle.appendChild(createModalHeader(
        card.char_name || 'Unknown Card',
        cardPosition,
        totalCards
    ));
    
    // Render modal body
    modalBody.innerHTML = '';
    modalBody.appendChild(createModalBody(card, level));
    
    // Setup form event listeners
    setupModalFormEvents(card, card.support_id);
    
    // Setup navigation event listeners
    setupModalNavigationEvents();
}

// Create modal body content
function createModalBody(card, level) {
    const cardId = card.support_id;
    const isOwned = isCardOwned(cardId);
    
    const body = createElement('div');
    
    // Header section
    body.appendChild(createModalDetailHeader(card, level, isOwned));
    
    // Effects section
    body.appendChild(createModalSection('Effects', createEffectsGrid(card, level)));
    
    // Hint skills section
    body.appendChild(createModalSection('Hint Skills', createHintSkillsGrid(card)));
    
    // Event skills section (if present)
    if (card.event_skills && card.event_skills.length > 0) {
        body.appendChild(createModalSection('Event Skills', createEventSkillsGrid(card)));
    }
    
    // Character events section
    body.appendChild(createModalSection('Character Events', createCharacterEventsGrid(card)));
    
    return body;
}

// Create modal detail header
function createModalDetailHeader(card, level, isOwned) {
    const cardId = card.support_id;
    const limitBreakLevel = getLimitBreakLevel(level, card.rarity);
    
    const header = createElement('div', {
        className: 'card-detail-header'
    });
    
    // Card image
    header.appendChild(createCardImage(cardId, card.char_name, card.rarity));
    
    // Basic info
    const basicInfo = createElement('div', {
        className: 'card-basic-info',
        innerHTML: `
            <h3>${card.char_name || 'Unknown Card'}</h3>
            <div class="character-name">Card Name: ${card.name_en || 'Not Available'}</div>
            <div class="card-badges">
                ${createRarityBadge(card.rarity).outerHTML}
                ${createTypeBadge(card.type).outerHTML}
            </div>
            <div class="release-info">
                Global Release: ${card.release_en || 'Not Released'}<br>
                ${card.release ? `Original Release: ${card.release}<br>` : ''}
                Obtained: ${card.obtained || 'Unknown'}
            </div>
        `
    });
    header.appendChild(basicInfo);
    
    // Level control panel
    header.appendChild(createLevelControlPanel(card, level, isOwned, limitBreakLevel));
    
    return header;
}

// Create level control panel
function createLevelControlPanel(card, level, isOwned, limitBreakLevel) {
    const cardId = card.support_id;
    
    const panel = createElement('div', {
        className: 'level-control-panel'
    });
    
    // Ownership controls
    const ownershipControls = createElement('div', {
        className: 'ownership-controls',
        innerHTML: `
            <label>
                <input type="checkbox" id="modalOwnershipToggle" ${isOwned ? 'checked' : ''}> 
                Owned
            </label>
            <span class="ownership-status ${isOwned ? 'owned' : 'unowned'}">
                ${isOwned ? '✓ Owned' : '✗ Not Owned'}
            </span>
        `
    });
    panel.appendChild(ownershipControls);
    
    // Level controls
    const levelControls = createElement('div', {
        className: 'level-controls'
    });
    
    // Level input row
    const shouldDisableLevel = !isOwned && globalLimitBreakLevel === null ||
                              globalLimitBreakLevel !== null && 
                              (globalLimitBreakOverrideOwned || !isOwned);
    
    const levelRow = createElement('div', {
        className: 'level-control-row',
        innerHTML: `
            <label for="modalLevelInput">Current Level:</label>
            <input type="number" id="modalLevelInput" class="modal-level-input" 
                   value="${level}" min="1" max="${limitBreaks[card.rarity][getOwnedCardLimitBreak(cardId) || 2]}" 
                   ${shouldDisableLevel ? 'disabled' : ''}>
        `
    });
    levelControls.appendChild(levelRow);
    
    // Limit break row
    const shouldDisableLB = !isOwned && globalLimitBreakLevel === null ||
                           globalLimitBreakLevel !== null && 
                           (globalLimitBreakOverrideOwned || !isOwned);
    
    const lbOptions = Array.from({length: 5}, (_, i) => `
        <option value="${i}" ${(getOwnedCardLimitBreak(cardId) || 2) === i ? 'selected' : ''}>
            LB ${i} (Max: ${limitBreaks[card.rarity][i]})
        </option>
    `).join('');
    
    const lbRow = createElement('div', {
        className: 'level-control-row',
        innerHTML: `
            <label for="modalLimitBreakSelect">Limit Break:</label>
            <select id="modalLimitBreakSelect" class="modal-lb-select" ${shouldDisableLB ? 'disabled' : ''}>
                ${lbOptions}
            </select>
        `
    });
    levelControls.appendChild(lbRow);
    
    // Status display
    const statusRow = createElement('div', {
        className: 'level-status',
        innerHTML: `
            <span class="lb-indicator">Current: LB ${limitBreakLevel} Level ${level}</span>
            ${showMaxPotentialLevels ? '<span class="potential-indicator">Showing Max Potential</span>' : ''}
        `
    });
    levelControls.appendChild(statusRow);
    
    panel.appendChild(levelControls);
    
    return panel;
}

// Create modal section
function createModalSection(title, content) {
    const section = createElement('div', {
        className: 'detail-section'
    });
    
    const header = createElement('h4', {
        textContent: title
    });
    section.appendChild(header);
    
    section.appendChild(content);
    
    return section;
}

// ===== MODAL CONTENT GRIDS =====

// Create effects grid
function createEffectsGrid(card, level) {
    const grid = createElement('div', {
        className: 'effects-grid',
        id: 'effectsGrid'
    });
    
    if (!card.effects || card.effects.length === 0) {
        grid.appendChild(createElement('div', {
            className: 'no-data',
            textContent: 'No effects data available'
        }));
        return grid;
    }
    
    card.effects.forEach(effect => {
        if (!effect[0] || !effectsData[effect[0]]) return;
        
        const effectInfo = effectsData[effect[0]];
        const effectItem = createEffectItem(effect, level, effectInfo);
        grid.appendChild(effectItem);
    });
    
    return grid;
}

// Create hint skills grid
function createHintSkillsGrid(card) {
    const grid = createElement('div', {
        className: 'skills-grid',
        id: 'hintSkillsGrid'
    });
    
    if (!card.hints?.hint_skills || card.hints.hint_skills.length === 0) {
        grid.appendChild(createElement('div', {
            className: 'no-data',
            textContent: 'No hint skills available'
        }));
        return grid;
    }
    
    card.hints.hint_skills.forEach(skill => {
        const skillItem = createSkillItem(skill, true);
        grid.appendChild(skillItem);
    });
    
    return grid;
}

// Create event skills grid
function createEventSkillsGrid(card) {
    const grid = createElement('div', {
        className: 'skills-grid'
    });
    
    if (!card.event_skills || card.event_skills.length === 0) {
        grid.appendChild(createElement('div', {
            className: 'no-data',
            textContent: 'No event skills available'
        }));
        return grid;
    }
    
    card.event_skills.forEach(skill => {
        const skillItem = createSkillItem(skill, false);
        grid.appendChild(skillItem);
    });
    
    return grid;
}

// Create character events grid
function createCharacterEventsGrid(card) {
    const grid = createElement('div', {
        className: 'events-list'
    });
    
    // Look for events by character ID
    let characterEvents = [];
    
    // Check regular events
    if (eventsData.regular) {
        const charEvents = eventsData.regular.find(eventGroup => eventGroup[0] === card.char_id);
        if (charEvents && charEvents[1]) {
            characterEvents = characterEvents.concat(charEvents[1]);
        }
    }
    
    // Check special events
    if (eventsData.special) {
        const specialEvents = eventsData.special.find(eventGroup => eventGroup[0] === card.char_id);
        if (specialEvents && specialEvents[1]) {
            characterEvents = characterEvents.concat(specialEvents[1]);
        }
    }
    
    if (characterEvents.length === 0) {
        grid.appendChild(createElement('div', {
            className: 'no-data',
            textContent: 'No character events found'
        }));
        return grid;
    }
    
    // Limit to first 5 events
    characterEvents.slice(0, 5).forEach(event => {
        const eventItem = createEventItem(event);
        grid.appendChild(eventItem);
    });
    
    return grid;
}

// Create event item
function createEventItem(event) {
    // Extract English title from localization arrays
    let eventTitle = 'Unknown Event';
    
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
    
    const item = createElement('div', {
        className: 'event-item'
    });
    
    const title = createElement('div', {
        className: 'event-title',
        textContent: eventTitle
    });
    item.appendChild(title);
    
    const choicesDiv = createElement('div', {
        className: 'event-choices'
    });
    
    choices.forEach((choice, index) => {
        const optionLabel = getEventOptionLabel(index, choices.length);
        
        const choiceDiv = createElement('div', {
            className: 'event-choice',
            innerHTML: `
                ${optionLabel ? `<strong>${optionLabel}:</strong> ` : ''}
                <div class="choice-effects">
                    ${formatEventEffects(choice[1] || [])}
                </div>
            `
        });
        
        choicesDiv.appendChild(choiceDiv);
    });
    
    item.appendChild(choicesDiv);
    
    return item;
}

// Get event option label based on choice count
function getEventOptionLabel(index, totalChoices) {
    if (totalChoices === 1) {
        return ''; // No label for single option
    } else if (totalChoices === 2) {
        return index === 0 ? 'Top Option' : 'Bottom Option';
    } else if (totalChoices === 3) {
        return index === 0 ? 'Top Option' : (index === 1 ? 'Middle Option' : 'Bottom Option');
    } else {
        return `Option ${index + 1}`;
    }
}

// ===== MODAL UPDATES =====

// Update modal display when level changes
function updateModalDisplay(level) {
    if (!currentModalCard) return;
    
    const cardId = currentModalCard.support_id;
    const currentLimitBreak = getOwnedCardLimitBreak(cardId) || 2;
    
    // Update level indicator
    const lbIndicator = document.querySelector('.lb-indicator');
    if (lbIndicator) {
        lbIndicator.textContent = `Current: LB ${currentLimitBreak} Level ${level}`;
    }
    
    // Update effects grid
    const effectsGrid = document.getElementById('effectsGrid');
    if (effectsGrid) {
        const newGrid = createEffectsGrid(currentModalCard, level);
        effectsGrid.innerHTML = newGrid.innerHTML;
    }
}

// ===== MODAL EVENT SETUP =====

// Setup modal navigation event listeners
function setupModalNavigationEvents() {
    const prevBtn = document.getElementById('modalPrevBtn');
    const nextBtn = document.getElementById('modalNextBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateModal(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateModal(1));
    }
}

// ===== CONFIRMATION MODAL =====

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

// ===== EXPORTS =====

window.ModalManager = {
    openCardDetails,
    closeCardDetails,
    navigateModal,
    renderCardDetails,
    updateModalDisplay,
    showConfirmDialog,
    setupModalNavigationEvents,
    // Help system functions
    openHelpModal,
    closeHelpModal,
    navigateToHelpSection,
    renderHelpContent
};

// Export individual functions to global scope for backward compatibility
Object.assign(window, window.ModalManager);