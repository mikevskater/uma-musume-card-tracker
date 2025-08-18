// Main Application Controller
// Coordinates all modules and handles initialization

// Global data storage
let cardData = [];
let effectsData = {};
let skillsData = {};
let skillTypesData = {};
let eventsData = {};
let ownedCards = {}; // Owned card tracking
let currentModalCard = null;
let currentSort = { column: '', direction: '' };
let globalLimitBreakLevel = null;
let globalLimitBreakOverrideOwned = false; // New: toggle for applying global LB to owned cards
let showMaxPotentialLevels = false; // New: toggle for showing max potential vs current levels

// Multi-layer sorting state
let multiSort = []; // Array of { category, option, direction } objects

// Advanced filtering state
let advancedFilters = {
    effects: {}, // effectId: { min: value, max: value }
    hintSkills: [], // array of skill IDs
    eventSkills: [], // array of skill IDs
    includeSkillTypes: [], // array of skill type IDs to include
    excludeSkillTypes: [] // array of skill type IDs to exclude
};

// Card comparison state
let comparisonMode = false; // Whether selection mode is enabled
let selectedCards = []; // Array of selected card IDs
let showComparison = false; // Whether comparison table is visible

// Initialize advanced filters UI
function initializeAdvancedFilters() {
    // Build effect filters (will be updated dynamically)
    buildEffectFilters();
    
    // Build skill filters
    buildSkillFilters();
    
    // Initialize advanced section toggle
    const advancedToggle = document.getElementById('advancedToggle');
    const advancedContent = document.getElementById('advancedContent');
    
    advancedToggle.addEventListener('click', () => {
        const isExpanded = advancedContent.style.display !== 'none';
        
        if (isExpanded) {
            advancedContent.style.display = 'none';
            advancedToggle.classList.remove('expanded');
        } else {
            advancedContent.style.display = 'block';
            advancedToggle.classList.add('expanded');
        }
    });
}

// Set global limit break level for all cards
function setGlobalLimitBreak(lbLevel) {
    globalLimitBreakLevel = lbLevel === '' ? null : parseInt(lbLevel);
    
    // Update all level inputs
    document.querySelectorAll('.level-input').forEach(input => {
        const cardId = parseInt(input.dataset.cardId);
        const card = cardData.find(c => c.support_id === cardId);
        
        if (card) {
            const effectiveLevel = getEffectiveLevel(card);
            input.value = effectiveLevel;
            
            // Determine if input should be disabled
            const shouldDisable = globalLimitBreakLevel !== null && 
                                 (globalLimitBreakOverrideOwned || !isCardOwned(cardId));
            input.disabled = shouldDisable;
            
            updateCardDisplay(input);
        }
    });
    
    // Update modal if open
    if (currentModalCard) {
        const modalLevelInput = document.getElementById('modalLevelInput');
        if (modalLevelInput) {
            const effectiveLevel = getEffectiveLevel(currentModalCard);
            modalLevelInput.value = effectiveLevel;
            
            const shouldDisable = globalLimitBreakLevel !== null && 
                                 (globalLimitBreakOverrideOwned || !isCardOwned(currentModalCard.support_id));
            modalLevelInput.disabled = shouldDisable;
            
            updateModalDisplay(effectiveLevel);
        }
    }
    
    // Trigger filter refresh to update effect ranges with new levels
    debouncedFilterAndSort();
}

// Set global limit break override setting
function setGlobalLimitBreakOverride(override) {
    globalLimitBreakOverrideOwned = override;
    
    // Refresh level inputs if global LB is set
    if (globalLimitBreakLevel !== null) {
        setGlobalLimitBreak(globalLimitBreakLevel);
    } else {
        // Even if no global LB, still refresh to update effect ranges
        debouncedFilterAndSort();
    }
}

// Set show max potential levels setting
function setShowMaxPotentialLevels(showMax) {
    showMaxPotentialLevels = showMax;
    
    // Update all level inputs and displays
    document.querySelectorAll('.level-input').forEach(input => {
        const cardId = parseInt(input.dataset.cardId);
        const card = cardData.find(c => c.support_id === cardId);
        
        if (card) {
            const effectiveLevel = getEffectiveLevel(card);
            input.value = effectiveLevel;
            updateCardDisplay(input);
        }
    });
    
    // Update modal if open
    if (currentModalCard) {
        const modalLevelInput = document.getElementById('modalLevelInput');
        if (modalLevelInput) {
            const effectiveLevel = getEffectiveLevel(currentModalCard);
            modalLevelInput.value = effectiveLevel;
            updateModalDisplay(effectiveLevel);
        }
    }
    
    // Trigger filter refresh to update effect ranges with new levels
    debouncedFilterAndSort();
}

// Card comparison management functions
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
    } else {
        mainContent.classList.remove('has-selection');
        selectionContainer.style.display = 'none';
        
        // Remove visual indicators from table rows
        document.querySelectorAll('#cardTableBody tr').forEach(row => {
            row.classList.remove('comparison-mode');
        });
    }
    
    // Re-render table to update click handlers
    renderCards(currentFilteredCards);
    renderSelectionContainer();
}

function toggleCardSelection(cardId) {
    const index = selectedCards.indexOf(cardId);
    
    if (index === -1) {
        // Add card to selection
        selectedCards.push(cardId);
    } else {
        // Remove card from selection
        selectedCards.splice(index, 1);
    }
    
    // Update UI
    updateCardSelectionStates();
    renderSelectionContainer();
    
    // Hide comparison if no cards selected
    if (selectedCards.length === 0 && showComparison) {
        hideComparison();
    }
}

function removeCardFromSelection(cardId) {
    const index = selectedCards.indexOf(cardId);
    if (index !== -1) {
        selectedCards.splice(index, 1);
        updateCardSelectionStates();
        renderSelectionContainer();
        
        // Hide comparison if no cards selected
        if (selectedCards.length === 0 && showComparison) {
            hideComparison();
        }
    }
}

function clearAllSelectedCards() {
    selectedCards = [];
    updateCardSelectionStates();
    renderSelectionContainer();
    
    if (showComparison) {
        hideComparison();
    }
}

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

function hideComparison() {
    showComparison = false;
    document.getElementById('comparisonSection').style.display = 'none';
}

function clearComparison() {
    clearAllSelectedCards();
    hideComparison();
}

// FIXED: Initialize multi-select dropdowns with proper skill filter handling
function initializeMultiSelects() {
    const multiSelects = ['rarityFilter', 'typeFilter', 'hintSkillFilter', 'eventSkillFilter', 'includeSkillTypeFilter', 'excludeSkillTypeFilter'];
    
    multiSelects.forEach(id => {
        const multiSelect = document.getElementById(id);
        const trigger = multiSelect.querySelector('.multi-select-trigger');
        const dropdown = multiSelect.querySelector('.multi-select-dropdown');
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        
        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Close other dropdowns
            multiSelects.forEach(otherId => {
                if (otherId !== id) {
                    document.getElementById(otherId).classList.remove('open');
                }
            });
            
            multiSelect.classList.toggle('open');
        });
        
        // Handle checkbox changes
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                let defaultText;
                switch(id) {
                    case 'rarityFilter': defaultText = 'All Rarities'; break;
                    case 'typeFilter': defaultText = 'All Types'; break;
                    case 'hintSkillFilter': defaultText = 'Any Hint Skills'; break;
                    case 'eventSkillFilter': defaultText = 'Any Event Skills'; break;
                    case 'includeSkillTypeFilter': defaultText = 'Any Skill Types'; break;
                    case 'excludeSkillTypeFilter': defaultText = 'No Exclusions'; break;
                }
                updateMultiSelectText(id, defaultText);
                
                // FIXED: Handle different filter types properly
                if (id === 'rarityFilter' || id === 'typeFilter') {
                    debouncedFilterAndSort();
                } else if (id === 'hintSkillFilter') {
                    // Update hint skills filter
                    advancedFilters.hintSkills = Array.from(dropdown.querySelectorAll('input:checked'))
                        .map(input => parseInt(input.value));
                    debouncedFilterAndSort();
                } else if (id === 'eventSkillFilter') {
                    // Update event skills filter
                    advancedFilters.eventSkills = Array.from(dropdown.querySelectorAll('input:checked'))
                        .map(input => parseInt(input.value));
                    debouncedFilterAndSort();
                } else if (id === 'includeSkillTypeFilter') {
                    // Update include skill types filter
                    advancedFilters.includeSkillTypes = Array.from(dropdown.querySelectorAll('input:checked'))
                        .map(input => input.value);
                    debouncedFilterAndSort();
                } else if (id === 'excludeSkillTypeFilter') {
                    // Update exclude skill types filter
                    advancedFilters.excludeSkillTypes = Array.from(dropdown.querySelectorAll('input:checked'))
                        .map(input => input.value);
                    debouncedFilterAndSort();
                }
            });
        });
        
        // Prevent dropdown from closing when clicking inside
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        multiSelects.forEach(id => {
            document.getElementById(id).classList.remove('open');
        });
    });
}

// Initialize interface
async function initializeInterface() {
    try {
        document.getElementById('loading').style.display = 'none';
        document.querySelector('.main-layout').style.display = 'flex';
        document.getElementById('selectionModeSection').style.display = 'block'; // Show selection toggle

        // Initialize multi-select dropdowns
        initializeMultiSelects();
        
        // Initialize advanced filters
        initializeAdvancedFilters();
        
        // Initialize multi-sort interface
        initializeMultiSort();
        
        // Add event listeners for filters
        document.getElementById('nameFilter').addEventListener('input', debouncedFilterAndSort);
        document.getElementById('releasedFilter').addEventListener('change', debouncedFilterAndSort);
        document.getElementById('ownedFilter').addEventListener('change', debouncedFilterAndSort);
        document.getElementById('globalLimitBreak').addEventListener('change', (e) => {
            setGlobalLimitBreak(e.target.value);
        });
        document.getElementById('globalOverrideOwned').addEventListener('change', (e) => {
            setGlobalLimitBreakOverride(e.target.checked);
        });
        document.getElementById('showMaxPotential').addEventListener('change', (e) => {
            setShowMaxPotentialLevels(e.target.checked);
        });

        // Add event listeners for data management buttons
        document.getElementById('exportBtn').addEventListener('click', exportOwnedCards);
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });
        document.getElementById('importFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importOwnedCards(file);
            }
            e.target.value = ''; // Reset file input
        });
        document.getElementById('clearBtn').addEventListener('click', clearOwnedCards);

        // Add event listeners for advanced filters
        document.getElementById('clearAdvancedBtn').addEventListener('click', clearAdvancedFilters);
        document.getElementById('clearAllFilters').addEventListener('click', () => {
            clearAllFilters();
            debouncedFilterAndSort();
        });

        // Add event listeners for comparison feature
        document.getElementById('comparisonModeToggle').addEventListener('change', (e) => {
            toggleComparisonMode(e.target.checked);
        });
        
        document.getElementById('compareSelectedBtn').addEventListener('click', showComparisonTable);
        document.getElementById('clearSelectedBtn').addEventListener('click', clearAllSelectedCards);
        document.getElementById('clearComparisonBtn').addEventListener('click', clearComparison);
        document.getElementById('closeComparisonBtn').addEventListener('click', hideComparison);

        // Add sorting event listeners
        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                handleSort(column);
            });
        });

        // Add modal event listeners
        document.getElementById('modalClose').addEventListener('click', closeCardDetails);
        document.getElementById('modalOverlay').addEventListener('click', closeCardDetails);
        document.getElementById('confirmClose').addEventListener('click', () => {
            document.getElementById('confirmModal').style.display = 'none';
        });
        document.getElementById('confirmOverlay').addEventListener('click', () => {
            document.getElementById('confirmModal').style.display = 'none';
        });
        
        // Add keyboard event listeners
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeCardDetails();
                document.getElementById('confirmModal').style.display = 'none';
            }
        });

        // Initial render
        filterAndSortCards();
        
        console.log('Interface initialized successfully');
        
        // Show debug info in console
        console.log('🎯 Uma Musume Support Card Tracker Ready!');
        console.log('📊 Features loaded:');
        console.log('   ✅ Card collection tracking');
        console.log('   ✅ Multi-layer sorting & filtering');
        console.log('   ✅ Skill type filtering');
        
    } catch (error) {
        console.error('Failed to initialize interface:', error);
        showToast('Failed to initialize application interface', 'error');
    }
}

// Main application initialization
async function initializeApplication() {
    try {
        console.log('Starting Uma Musume Support Card Tracker...');
        
        // Load card data first
        const dataLoaded = await loadData();
        if (!dataLoaded) {
            throw new Error('Failed to load card data');
        }
        
        // Initialize the user interface
        await initializeInterface();
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        
        // Show error state
        document.getElementById('loading').style.display = 'none';
        const errorDiv = document.getElementById('error');
        errorDiv.style.display = 'block';
        errorDiv.textContent = `Failed to initialize application: ${error.message}`;
    }
}

// Enhanced error handler for debugging
window.addEventListener('error', (event) => {
    console.error('🚨 Global error caught:', {
        message: event.error?.message || event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        timestamp: new Date().toISOString()
    });
});

// Enhanced unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Unhandled promise rejection:', {
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString()
    });
});

// Load application when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application...');
    initializeApplication();
});