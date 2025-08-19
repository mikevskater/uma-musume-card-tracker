// UI Components and Builders (ENHANCED WITH DARK MODE & HELP SYSTEM)
// Reusable functions for creating consistent UI elements with dark mode support

// ===== THEME MANAGEMENT =====

// Theme management constants
const THEME_STORAGE_KEY = 'uma_theme_preference';
const THEMES = {
    LIGHT: 'light',
    DARK: 'dark'
};

// Initialize theme system
function initializeThemeSystem() {
    // Get saved theme preference or detect system preference
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    let initialTheme;
    
    if (savedTheme && Object.values(THEMES).includes(savedTheme)) {
        initialTheme = savedTheme;
    } else {
        // Detect system preference
        initialTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 
                      THEMES.DARK : THEMES.LIGHT;
    }
    
    // Apply initial theme
    setTheme(initialTheme);
    
    // Setup theme toggle event listener
    setupThemeToggle();
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't set a preference
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
            setTheme(e.matches ? THEMES.DARK : THEMES.LIGHT);
        }
    });
    
    console.log(`🌙 Theme system initialized with ${initialTheme} mode`);
}

// Set theme
function setTheme(theme) {
    if (!Object.values(THEMES).includes(theme)) {
        console.warn(`Invalid theme: ${theme}`);
        return;
    }
    
    const html = document.documentElement;
    
    if (theme === THEMES.DARK) {
        html.setAttribute('data-theme', 'dark');
    } else {
        html.removeAttribute('data-theme');
    }
    
    // Save preference
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    
    // Update toggle button state
    updateThemeToggleState(theme);
}

// Get current theme
function getCurrentTheme() {
    return document.documentElement.hasAttribute('data-theme') ? THEMES.DARK : THEMES.LIGHT;
}

// Toggle theme
function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;
    setTheme(newTheme);
    
    // Show toast notification
    showToast(`Switched to ${newTheme} mode`, 'success');
}

// Setup theme toggle event listener
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
        
        // Add keyboard support
        themeToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleTheme();
            }
        });
        
        // Update initial state
        updateThemeToggleState(getCurrentTheme());
    }
}

// Update theme toggle button state
function updateThemeToggleState(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const isDark = theme === THEMES.DARK;
        themeToggle.setAttribute('aria-label', 
            isDark ? 'Switch to light mode' : 'Switch to dark mode'
        );
        themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }
}

// ===== HELP SYSTEM MANAGEMENT =====

// Initialize help system
function initializeHelpSystem() {
    const helpToggle = document.getElementById('helpToggle');
    if (helpToggle) {
        helpToggle.addEventListener('click', openHelpModal);
        
        // Add keyboard support
        helpToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openHelpModal();
            }
        });
        
        // Set accessibility attributes
        helpToggle.setAttribute('aria-label', 'Open help and tutorial');
        helpToggle.title = 'Open help and tutorial';
    }
    
    // Setup help modal event listeners
    setupHelpModalEvents();
    
    console.log('📖 Help system initialized');
}

// Setup help modal event listeners
function setupHelpModalEvents() {
    // Close button
    const helpClose = document.getElementById('helpClose');
    if (helpClose) {
        helpClose.addEventListener('click', closeHelpModal);
    }
    
    // Overlay click to close
    const helpOverlay = document.getElementById('helpOverlay');
    if (helpOverlay) {
        helpOverlay.addEventListener('click', closeHelpModal);
    }
    
    // Navigation items
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('help-nav-item')) {
            const sectionId = e.target.getAttribute('data-section');
            if (sectionId) {
                navigateToHelpSection(sectionId);
            }
        }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        const helpModal = document.getElementById('helpModal');
        if (helpModal && helpModal.style.display === 'block') {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeHelpModal();
            }
        }
    });
}

// ===== DOM UTILITIES =====

// Create element with attributes and content
function createElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'innerHTML') {
            element.innerHTML = value;
        } else if (key === 'textContent') {
            element.textContent = value;
        } else if (key.startsWith('data-')) {
            element.setAttribute(key, value);
        } else {
            element[key] = value;
        }
    });
    
    if (content && typeof content === 'string') {
        element.innerHTML = content;
    }
    
    return element;
}

// ===== FALLBACK ELEMENTS =====

// Create fallback icon element
function createCardIconFallback() {
    return createElement('div', {
        className: 'card-icon-fallback',
        textContent: '🖼'
    });
}

// Create fallback card image element
function createCardImageFallback() {
    return createElement('div', {
        className: 'card-image-fallback',
        textContent: 'Card Image'
    });
}

// Handle card icon load error
function handleCardIconError(img) {
    const fallback = createCardIconFallback();
    img.parentNode.replaceChild(fallback, img);
}

// Handle card image load error
function handleCardImageError(img) {
    const fallback = createCardImageFallback();
    img.parentNode.replaceChild(fallback, img);
}

// ===== MULTI-SELECT COMPONENTS =====

// Create multi-select dropdown structure
function createMultiSelectDropdown(id, defaultText, options) {
    const dropdown = createElement('div', {
        className: 'multi-select',
        id: id
    });
    
    const trigger = createElement('div', {
        className: 'multi-select-trigger',
        innerHTML: `
            <span class="multi-select-text">${defaultText}</span>
            <span class="multi-select-arrow">▼</span>
        `
    });
    
    const dropdownContent = createElement('div', {
        className: 'multi-select-dropdown'
    });
    
    options.forEach(option => {
        const label = createElement('label', {
            innerHTML: `<input type="checkbox" value="${option.value}"> ${option.label}`
        });
        dropdownContent.appendChild(label);
    });
    
    dropdown.appendChild(trigger);
    dropdown.appendChild(dropdownContent);
    
    return dropdown;
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

// ===== FILTER CHIPS =====

// Create filter chip element
function createFilterChip(type, label, removeCallback) {
    const chip = createElement('div', {
        className: 'filter-chip',
        'data-filter-type': type,
        innerHTML: `
            ${label}
            <button class="remove-chip" onclick="removeFilterChip('${type}')">&times;</button>
        `
    });
    
    return chip;
}

// ===== CARD DISPLAY COMPONENTS =====

// Create card icon img element
function createCardIcon(cardId, charName, className = 'card-icon') {
    return createElement('img', {
        src: `support_card_images/${cardId}_i.png`,
        className: className,
        alt: charName || 'Unknown Card',
        onerror: 'handleCardIconError(this)',
        loading: 'lazy'
    });
}

// Create card image element
function createCardImage(cardId, charName, rarity) {
    return createElement('img', {
        src: `support_card_images/${cardId}.png`,
        className: `card-image rarity-${rarity}`,
        alt: charName || 'Unknown Card',
        onerror: 'handleCardImageError(this)',
        loading: 'lazy'
    });
}

// Create rarity badge
function createRarityBadge(rarity) {
    const rarityMap = ['', 'R', 'SR', 'SSR'];
    return createElement('span', {
        className: `rarity rarity-${rarity}`,
        textContent: rarityMap[rarity]
    });
}

// Create type badge
function createTypeBadge(type) {
    return createElement('span', {
        className: `type type-${type}`,
        textContent: getTypeDisplayName(type)
    });
}

// ===== FORM CONTROLS =====

// Create level input
function createLevelInput(cardId, currentLevel, maxLevel, disabled = false) {
    return createElement('input', {
        type: 'number',
        className: 'level-input',
        value: currentLevel,
        min: '1',
        max: maxLevel,
        'data-card-id': cardId,
        onclick: 'event.stopPropagation()',
        disabled: disabled
    });
}

// Create limit break select
function createLimitBreakSelect(cardId, currentLB, rarity, disabled = false) {
    const options = Array.from({length: 5}, (_, i) => 
        `<option value="${i}" ${currentLB === i ? 'selected' : ''}>LB ${i}</option>`
    ).join('');
    
    return createElement('select', {
        className: 'lb-select',
        'data-card-id': cardId,
        onclick: 'event.stopPropagation()',
        disabled: disabled,
        innerHTML: options
    });
}

// ENHANCED: Create ownership checkbox with comparison mode support
function createOwnershipCheckbox(cardId, isOwned, disabled = false) {
    const checkbox = createElement('input', {
        type: 'checkbox',
        checked: isOwned,
        'data-card-id': cardId,
        onclick: 'event.stopPropagation()',
        disabled: disabled
    });
    
    // Add comparison mode styling if disabled due to comparison mode
    if (disabled && comparisonMode) {
        checkbox.style.cursor = 'not-allowed';
        checkbox.title = 'Disabled in comparison mode';
    }
    
    return checkbox;
}

// ===== MODAL COMPONENTS =====

// Create modal navigation button
function createModalNavButton(direction, disabled = false) {
    const arrows = { prev: '‹', next: '›' };
    return createElement('button', {
        className: 'modal-nav-btn',
        id: `modal${direction.charAt(0).toUpperCase() + direction.slice(1)}Btn`,
        disabled: disabled,
        textContent: arrows[direction]
    });
}

// Create modal header with navigation
function createModalHeader(cardName, cardPosition, totalCards) {
    const wrapper = createElement('div', {
        className: 'modal-header-wrapper'
    });
    
    const leftNav = createElement('div', {
        className: 'modal-nav-section modal-nav-left'
    });
    leftNav.appendChild(createModalNavButton('prev', totalCards <= 1));
    
    const titleSection = createElement('div', {
        className: 'modal-title-section',
        innerHTML: `
            <div class="modal-card-name">${cardName}</div>
            <div class="modal-card-counter">${cardPosition} of ${totalCards}</div>
        `
    });
    
    const rightNav = createElement('div', {
        className: 'modal-nav-section modal-nav-right'
    });
    rightNav.appendChild(createModalNavButton('next', totalCards <= 1));
    
    wrapper.appendChild(leftNav);
    wrapper.appendChild(titleSection);
    wrapper.appendChild(rightNav);
    
    return wrapper;
}

// ===== HELP MODAL COMPONENTS =====

// Create help navigation item
function createHelpNavItem(sectionId, label, isActive = false) {
    return createElement('button', {
        className: `help-nav-item ${isActive ? 'active' : ''}`,
        'data-section': sectionId,
        textContent: label
    });
}

// Create help section container
function createHelpSection(sectionId, content, isActive = false) {
    return createElement('div', {
        className: `help-section ${isActive ? 'active' : ''}`,
        'data-section': sectionId,
        innerHTML: content
    });
}

// Create help step element
function createHelpStep(content) {
    return createElement('div', {
        className: 'help-step',
        innerHTML: content
    });
}

// Create help grid container
function createHelpGrid(items) {
    const grid = createElement('div', {
        className: 'help-grid'
    });
    
    items.forEach(item => {
        const gridItem = createElement('div', {
            className: 'help-grid-item',
            innerHTML: `<h5>${item.title}</h5><p>${item.content}</p>`
        });
        grid.appendChild(gridItem);
    });
    
    return grid;
}

// Create help tip/highlight/warning box
function createHelpBox(type, content) {
    const validTypes = ['tip', 'highlight', 'warning'];
    const boxType = validTypes.includes(type) ? type : 'tip';
    
    return createElement('div', {
        className: `help-${boxType}`,
        innerHTML: content
    });
}

// Create help image placeholder
function createHelpImagePlaceholder(description) {
    return createElement('div', {
        className: 'help-image-placeholder',
        innerHTML: `📷 ${description}<br><small>Screenshot placeholder</small>`
    });
}

// Create keyboard shortcut display
function createKeyboardShortcut(keys) {
    const shortcuts = Array.isArray(keys) ? keys : [keys];
    return createElement('span', {
        className: 'help-shortcut',
        innerHTML: shortcuts.map(key => `<kbd>${key}</kbd>`).join(' + ')
    });
}

// ===== SORT COMPONENTS =====

// Create sort layer element
function createSortLayer(sort, index, totalSorts) {
    const category = sortCategories[sort.category];
    const categoryName = category ? category.name : 'Unknown';
    
    const layer = createElement('div', {
        className: 'sort-layer',
        'data-index': index
    });
    
    // Header
    const header = createElement('div', {
        className: 'sort-layer-header',
        innerHTML: `
            <div class="sort-layer-title">
                <span class="sort-priority-badge">${index + 1}</span>
                ${categoryName}${sort.option ? `: ${getSortOptionLabel(sort.category, sort.option)}` : ''}
            </div>
            <div class="sort-controls">
                <button class="sort-btn" data-action="move-up" data-index="${index}" 
                        ${index === 0 ? 'disabled' : ''} title="Move Up">↑</button>
                <button class="sort-btn" data-action="move-down" data-index="${index}" 
                        ${index === totalSorts - 1 ? 'disabled' : ''} title="Move Down">↓</button>
                <button class="sort-btn danger" data-action="remove" data-index="${index}" title="Remove">✕</button>
            </div>
        `
    });
    
    // Dropdowns
    const dropdowns = createElement('div', {
        className: `sort-dropdowns ${category?.hasOptions ? 'has-options' : 'single-dropdown'}`
    });
    
    // Category select
    const categorySelect = createElement('select', {
        className: 'sort-category-select',
        'data-index': index
    });
    
    Object.entries(sortCategories).forEach(([key, cat]) => {
        const option = createElement('option', {
            value: key,
            selected: key === sort.category,
            textContent: cat.name
        });
        categorySelect.appendChild(option);
    });
    
    dropdowns.appendChild(categorySelect);
    
    // Option select (if needed)
    if (category?.hasOptions) {
        const optionSelect = createElement('select', {
            className: 'sort-option-select',
            'data-index': index
        });
        
        optionSelect.appendChild(createElement('option', {
            value: '',
            textContent: `Select ${categoryName}`
        }));
        
        const options = category.getOptions();
        options.forEach(opt => {
            optionSelect.appendChild(createElement('option', {
                value: opt.value,
                selected: opt.value == sort.option,
                textContent: opt.label
            }));
        });
        
        dropdowns.appendChild(optionSelect);
    }
    
    // Direction button
    const directionBtn = createElement('button', {
        className: `sort-direction-toggle ${sort.direction}`,
        'data-index': index,
        textContent: sort.direction === 'asc' ? '↑' : '↓'
    });
    
    dropdowns.appendChild(directionBtn);
    
    layer.appendChild(header);
    layer.appendChild(dropdowns);
    
    return layer;
}

// ===== COMPARISON COMPONENTS =====

// Create comparison card header
function createComparisonCardHeader(card) {
    const header = createElement('th', {
        className: 'comparison-card-header-cell'
    });
    
    header.appendChild(createCardIcon(card.support_id, card.char_name, 'comparison-card-icon'));
    
    const nameDiv = createElement('div', {
        className: 'comparison-card-name',
        textContent: card.char_name || 'Unknown Card'
    });
    
    const detailsDiv = createElement('div', {
        className: 'comparison-card-details'
    });
    detailsDiv.appendChild(createRarityBadge(card.rarity));
    detailsDiv.appendChild(createTypeBadge(card.type));
    
    header.appendChild(nameDiv);
    header.appendChild(detailsDiv);
    
    return header;
}

// Create selected card item for comparison sidebar
function createSelectedCardItem(card) {
    const item = createElement('div', {
        className: 'selected-card-item'
    });
    
    item.appendChild(createCardIcon(card.support_id, card.char_name, 'selected-card-icon-small'));
    
    const info = createElement('div', {
        className: 'selected-card-info',
        innerHTML: `
            <div class="selected-card-name">${card.char_name || 'Unknown Card'}</div>
            <div class="selected-card-details">
                <span class="rarity rarity-${card.rarity}">${['', 'R', 'SR', 'SSR'][card.rarity]}</span>
                <span class="type type-${card.type}">${getTypeDisplayName(card.type)}</span>
                Level ${getEffectiveLevel(card)}
            </div>
        `
    });
    
    const removeBtn = createElement('button', {
        className: 'remove-selected-btn',
        'data-card-id': card.support_id,
        title: 'Remove from comparison',
        textContent: '×'
    });
    
    item.appendChild(info);
    item.appendChild(removeBtn);
    
    return item;
}

// ===== NOTIFICATION COMPONENTS =====

// Create and show toast notification (ENHANCED with theme support)
function showToast(message, type = 'success') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = createElement('div', {
        className: `toast ${type}`,
        textContent: message
    });
    
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== EFFECT DISPLAY COMPONENTS =====

// Create effect item for modal display
function createEffectItem(effectArray, level, effectInfo) {
    const isLocked = isEffectLocked(effectArray, level);
    const value = isLocked ? 0 : calculateEffectValue(effectArray, level);
    const symbol = effectInfo.symbol === 'percent' ? '%' : '';
    
    return createElement('div', {
        className: `effect-item ${isLocked ? 'effect-locked' : ''}`,
        innerHTML: `
            <div class="effect-name">${effectInfo.name_en}</div>
            <div class="effect-value">${isLocked ? 'Locked' : `${value}${symbol}`}</div>
            <div class="effect-description">${effectInfo.desc_en || ''}</div>
        `
    });
}

// ===== SKILL DISPLAY COMPONENTS =====

// Helper function to check if skill types match current filters
function checkSkillTypeFilters(skillTypes) {
    if (!skillTypes || skillTypes.length === 0) {
        return { hasIncludeMatch: false, hasExcludeMatch: false, matchingTypes: [] };
    }
    
    const includeFilters = advancedFilters.includeSkillTypes || [];
    const excludeFilters = advancedFilters.excludeSkillTypes || [];
    
    const hasIncludeMatch = includeFilters.length === 0 || 
                           skillTypes.some(type => includeFilters.includes(type));
    const hasExcludeMatch = excludeFilters.length > 0 && 
                           skillTypes.some(type => excludeFilters.includes(type));
    
    const matchingIncludeTypes = skillTypes.filter(type => includeFilters.includes(type));
    const matchingExcludeTypes = skillTypes.filter(type => excludeFilters.includes(type));
    
    return {
        hasIncludeMatch,
        hasExcludeMatch,
        matchingTypes: [...matchingIncludeTypes, ...matchingExcludeTypes],
        matchingIncludeTypes,
        matchingExcludeTypes
    };
}

// Create skill item for modal display with filter highlighting (ENHANCED with individual skill highlighting)
function createSkillItem(skill, isHintSkill = true) {
    const skillInfo = skillsData[skill.id];
    const skillName = skillInfo?.name_en || skillInfo?.enname || skill.name_en || `Skill ${skill.id}`;
    
    // Check filter matches for skill types
    const filterCheck = checkSkillTypeFilters(skill.type || []);
    const skillTypeHighlight = (advancedFilters.includeSkillTypes?.length > 0 || 
                               advancedFilters.excludeSkillTypes?.length > 0) &&
                              filterCheck.hasIncludeMatch && !filterCheck.hasExcludeMatch;
    
    // ENHANCED: Check individual skill highlighting
    const individualSkillHighlight = isHintSkill ? 
        advancedFilters.hintSkills?.includes(skill.id) :
        advancedFilters.eventSkills?.includes(skill.id);
    
    // Highlight if either skill types match OR individual skill is selected
    const shouldHighlight = skillTypeHighlight || individualSkillHighlight;
    
    // Create type spans with highlighting for matching types
    let typeSpans = (skill.type || []).map(type => {
        const isMatchingInclude = filterCheck.matchingIncludeTypes.includes(type);
        const isMatchingExclude = filterCheck.matchingExcludeTypes.includes(type);
        let className = 'skill-type';
        
        if (isMatchingInclude) {
            className += ' skill-type-highlighted-include';
        }
        if (isMatchingExclude) {
            className += ' skill-type-highlighted-exclude';
        }
        
        return `<span class="${className}">${getSkillTypeDescription(type)}</span>`;
    }).join('');
    
    if (!isHintSkill && skill.rarity) {
        typeSpans += `<span class="skill-type">Rarity ${skill.rarity}</span>`;
    }
    
    // ENHANCED: Add individual skill highlighting badge if selected
    if (individualSkillHighlight) {
        typeSpans += `<span class="skill-type skill-type-highlighted-include">Selected</span>`;
    }
    
    const itemClassName = `skill-item ${shouldHighlight ? 'skill-item-highlighted' : ''}`;
    
    return createElement('div', {
        className: itemClassName,
        innerHTML: `
            <div class="skill-header">
                <div class="skill-name">${skillName}</div>
                <div class="skill-types">${typeSpans}</div>
            </div>
            <div class="skill-description">${getSkillDescription(skill.id)}</div>
        `
    });
}

// ===== UTILITY FUNCTIONS =====

// Get selected values from multi-select dropdown
function getSelectedValues(multiSelectId) {
    const checkboxes = document.querySelectorAll(`#${multiSelectId} input[type="checkbox"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
}

// Get sort option label
function getSortOptionLabel(category, option) {
    if (!option) return '';
    
    switch (category) {
        case 'effect':
            return effectsData[option]?.name_en || `Effect ${option}`;
        case 'skillTypeCount':
            return getSkillTypeDescription(option);
        default:
            return option;
    }
}

// ===== INITIALIZATION FUNCTIONS =====

// Initialize all UI systems
function initializeUIComponents() {
    // Initialize theme system first
    initializeThemeSystem();
    
    // Initialize help system
    initializeHelpSystem();
    
    console.log('🎨 UI Components initialized');
}

// ===== EXPORTS =====

// Export all components to global scope
window.UIComponents = {
    // Theme management
    initializeThemeSystem,
    setTheme,
    getCurrentTheme,
    toggleTheme,
    setupThemeToggle,
    updateThemeToggleState,
    THEMES,
    
    // Help system
    initializeHelpSystem,
    setupHelpModalEvents,
    createHelpNavItem,
    createHelpSection,
    createHelpStep,
    createHelpGrid,
    createHelpBox,
    createHelpImagePlaceholder,
    createKeyboardShortcut,
    
    // Core utilities
    createElement,
    createCardIconFallback,
    createCardImageFallback,
    handleCardIconError,
    handleCardImageError,
    createMultiSelectDropdown,
    updateMultiSelectText,
    createFilterChip,
    createCardIcon,
    createCardImage,
    createRarityBadge,
    createTypeBadge,
    createLevelInput,
    createLimitBreakSelect,
    createOwnershipCheckbox,
    createModalNavButton,
    createModalHeader,
    createSortLayer,
    createComparisonCardHeader,
    createSelectedCardItem,
    showToast,
    createEffectItem,
    createSkillItem,
    checkSkillTypeFilters,
    getSelectedValues,
    getSortOptionLabel,
    
    // Initialization
    initializeUIComponents
};

// Also export individual functions to global scope for backward compatibility
Object.assign(window, window.UIComponents);