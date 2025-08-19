// Main Application Controller (Refactored)
// Simplified initialization and coordination

// ===== GLOBAL STATE =====

// Core data storage
let cardData = [];
let effectsData = {};
let skillsData = {};
let skillTypesData = {};
let eventsData = {};
let ownedCards = {};

// Modal state
let currentModalCard = null;
let currentFilteredCards = [];

// Sorting state
let currentSort = { column: '', direction: '' };
let multiSort = [];

// Global level settings
let globalLimitBreakLevel = null;
let globalLimitBreakOverrideOwned = false;
let showMaxPotentialLevels = false;

// Advanced filtering state
let advancedFilters = {
    effects: {},
    hintSkills: [],
    eventSkills: [],
    includeSkillTypes: [],
    excludeSkillTypes: []
};

// Card comparison state
let comparisonMode = false;
let selectedCards = [];
let showComparison = false;

// ===== APPLICATION INITIALIZATION =====

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
        logApplicationReady();
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        showApplicationError(error);
    }
}

// Initialize interface components
async function initializeInterface() {
    try {
        // Hide loading, show main layout
        document.getElementById('loading').style.display = 'none';
        document.querySelector('.main-layout').style.display = 'flex';
        document.getElementById('selectionModeSection').style.display = 'block';

        // Initialize all components
        initializeMultiSelectEvents(getMultiSelectIds());
        initializeAdvancedFilters();
        renderMultiSort();
        initializeAllEvents();
        
        // Setup column sorting
        setupColumnSorting();
        
        // Initial render
        filterAndSortCards();
        
        console.log('Interface initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize interface:', error);
        showToast('Failed to initialize application interface', 'error');
    }
}

// ===== COMPONENT INITIALIZATION =====

// Get multi-select IDs for initialization
function getMultiSelectIds() {
    return [
        'rarityFilter', 
        'typeFilter', 
        'hintSkillFilter', 
        'eventSkillFilter', 
        'includeSkillTypeFilter', 
        'excludeSkillTypeFilter'
    ];
}

// Setup column sorting event listeners
function setupColumnSorting() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            handleSort(column);
        });
    });
}

// ===== ADVANCED FILTER INITIALIZATION =====

// Initialize advanced filters section
function initializeAdvancedFilters() {
    // Build filters with proper event listeners
    FilterSort.buildEffectFilters();
    FilterSort.buildSkillFilters();
    
    // Note: Advanced section toggle is handled in eventManager.js
    // to avoid duplicate event listeners
}

// ===== MULTI-SORT INITIALIZATION =====

// Initialize multi-sort interface
function initializeMultiSort() {
    renderMultiSort();
    
    const addSortBtn = document.getElementById('addSortBtn');
    if (addSortBtn) {
        addSortBtn.addEventListener('click', addSortLayer);
    }
}

// ===== APPLICATION STATE MANAGEMENT =====

// Log application ready status
function logApplicationReady() {
    console.log('🎯 Uma Musume Support Card Tracker Ready!');
    console.log('📊 Features loaded:');
    console.log('   ✅ Card collection tracking');
    console.log('   ✅ Multi-layer sorting & filtering');
    console.log('   ✅ Skill type filtering');
    console.log('   ✅ Card comparison system');
    console.log('   ✅ Modal navigation');
    console.log('   ✅ Real-time level updates');
}

// Show application error
function showApplicationError(error) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Failed to initialize application: ${error.message}`;
}

// ===== ERROR HANDLING =====

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

// ===== STARTUP =====

// Load application when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application...');
    initializeApplication();
});

// ===== EXPORTS =====

// Export main functions for external access
window.App = {
    initializeApplication,
    initializeInterface,
    initializeAdvancedFilters,
    initializeMultiSort
};

// Export state variables for backward compatibility
window.cardData = cardData;
window.effectsData = effectsData;
window.skillsData = skillsData;
window.skillTypesData = skillTypesData;
window.eventsData = eventsData;
window.ownedCards = ownedCards;
window.currentModalCard = currentModalCard;
window.currentFilteredCards = currentFilteredCards;
window.currentSort = currentSort;
window.multiSort = multiSort;
window.globalLimitBreakLevel = globalLimitBreakLevel;
window.globalLimitBreakOverrideOwned = globalLimitBreakOverrideOwned;
window.showMaxPotentialLevels = showMaxPotentialLevels;
window.advancedFilters = advancedFilters;
window.comparisonMode = comparisonMode;
window.selectedCards = selectedCards;
window.showComparison = showComparison;