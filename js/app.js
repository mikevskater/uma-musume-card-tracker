// Main Application Controller (Refactored with Dark Mode Support & Help System)
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
        console.log('🎯 Starting Uma Musume Support Card Tracker...');
        
        // ENHANCED: Initialize UI systems first (includes theme and help)
        initializeUIComponents();
        
        // Load card data
        const dataLoaded = await loadData();
        if (!dataLoaded) {
            throw new Error('Failed to load card data');
        }
        
        // Initialize the user interface
        await initializeInterface();
        
        console.log('✅ Application initialized successfully');
        logApplicationReady();
        
    } catch (error) {
        console.error('❌ Application initialization failed:', error);
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
        
        console.log('🔧 Interface initialized successfully');
        
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
    const currentTheme = getCurrentTheme();
    console.log('🎯 Uma Musume Support Card Tracker Ready!');
    console.log('📊 Features loaded:');
    console.log('   ✅ Card collection tracking');
    console.log('   ✅ Multi-layer sorting & filtering');
    console.log('   ✅ Skill type filtering');
    console.log('   ✅ Card comparison system');
    console.log('   ✅ Modal navigation');
    console.log('   ✅ Real-time level updates');
    console.log(`   🌙 Dark mode system (${currentTheme} mode active)`);
    console.log('   📖 Help & tutorial system');
}

// Show application error
function showApplicationError(error) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Failed to initialize application: ${error.message}`;
}

// ===== HELP SYSTEM INTEGRATION =====

// Initialize help system event listeners
function initializeHelpEventListeners() {
    // Help toggle button
    const helpToggle = document.getElementById('helpToggle');
    if (helpToggle) {
        helpToggle.addEventListener('click', openHelpModal);
        
        // Keyboard support
        helpToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openHelpModal();
            }
        });
    }
    
    // Help modal close events
    const helpClose = document.getElementById('helpClose');
    const helpOverlay = document.getElementById('helpOverlay');
    
    if (helpClose) {
        helpClose.addEventListener('click', closeHelpModal);
    }
    
    if (helpOverlay) {
        helpOverlay.addEventListener('click', closeHelpModal);
    }
    
    // Help navigation
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('help-nav-item')) {
            const sectionId = e.target.getAttribute('data-section');
            if (sectionId) {
                navigateToHelpSection(sectionId);
            }
        }
    });
    
    // Global keyboard shortcuts for help
    document.addEventListener('keydown', (e) => {
        // F1 key to open help
        if (e.key === 'F1') {
            e.preventDefault();
            openHelpModal();
        }
        
        // ESC to close help modal
        const helpModal = document.getElementById('helpModal');
        if (helpModal && helpModal.style.display === 'block' && e.key === 'Escape') {
            e.preventDefault();
            closeHelpModal();
        }
    });
    
    console.log('📖 Help system event listeners initialized');
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
        timestamp: new Date().toISOString(),
        theme: getCurrentTheme(), // Include theme info for debugging
        helpSystemActive: document.getElementById('helpModal')?.style.display === 'block'
    });
});

// Enhanced unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Unhandled promise rejection:', {
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString(),
        theme: getCurrentTheme(), // Include theme info for debugging
        helpSystemActive: document.getElementById('helpModal')?.style.display === 'block'
    });
});

// ===== ACCESSIBILITY ENHANCEMENTS =====

// Initialize accessibility features
function initializeAccessibilityFeatures() {
    // Skip to main content link (for screen readers)
    const skipLink = document.createElement('a');
    skipLink.href = '#cardTable';
    skipLink.textContent = 'Skip to main content';
    skipLink.className = 'sr-only';
    skipLink.style.position = 'absolute';
    skipLink.style.top = '-40px';
    skipLink.style.left = '6px';
    skipLink.style.zIndex = '1000';
    skipLink.style.padding = '8px';
    skipLink.style.backgroundColor = 'var(--color-primary)';
    skipLink.style.color = 'white';
    skipLink.style.textDecoration = 'none';
    
    skipLink.addEventListener('focus', () => {
        skipLink.style.top = '6px';
    });
    
    skipLink.addEventListener('blur', () => {
        skipLink.style.top = '-40px';
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    // Announce page loads to screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.id = 'aria-announcements';
    document.body.appendChild(announcement);
    
    // Focus management for modals
    let lastFocusedElement = null;
    
    // Store focus when modal opens
    const originalOpenCardDetails = window.openCardDetails;
    window.openCardDetails = function(cardId) {
        lastFocusedElement = document.activeElement;
        originalOpenCardDetails(cardId);
        // Focus the modal close button for keyboard users
        setTimeout(() => {
            const closeBtn = document.getElementById('modalClose');
            if (closeBtn) closeBtn.focus();
        }, 100);
    };
    
    // Store focus when help modal opens
    const originalOpenHelpModal = window.openHelpModal;
    window.openHelpModal = function() {
        lastFocusedElement = document.activeElement;
        originalOpenHelpModal();
        // Focus the first navigation item
        setTimeout(() => {
            const firstNavItem = document.querySelector('.help-nav-item');
            if (firstNavItem) firstNavItem.focus();
        }, 100);
    };
    
    // Restore focus when modals close
    const originalCloseCardDetails = window.closeCardDetails;
    window.closeCardDetails = function() {
        originalCloseCardDetails();
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    };
    
    const originalCloseHelpModal = window.closeHelpModal;
    window.closeHelpModal = function() {
        originalCloseHelpModal();
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    };
    
    console.log('♿ Accessibility features initialized');
}

// Announce to screen readers
function announceToScreenReader(message) {
    const announcement = document.getElementById('aria-announcements');
    if (announcement) {
        announcement.textContent = message;
    }
}

// ===== STARTUP =====

// Load application when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded, initializing application...');
    
    // Initialize application with all systems
    Promise.resolve(initializeApplication()).then(() => {
        // Initialize help system after main app
        initializeHelpEventListeners();
        
        // Initialize accessibility features
        initializeAccessibilityFeatures();
        
        // Announce app ready to screen readers
        setTimeout(() => {
            announceToScreenReader('Uma Musume Support Card Tracker loaded and ready');
        }, 1000);
    });
});

// ===== PERFORMANCE MONITORING =====

// Monitor performance for large datasets
function monitorPerformance() {
    if (window.performance && window.performance.mark) {
        // Mark key performance points
        window.performance.mark('app-init-start');
        
        // Monitor filter performance
        const originalFilterAndSort = window.filterAndSortCards;
        window.filterAndSortCards = function() {
            window.performance.mark('filter-start');
            const result = originalFilterAndSort();
            window.performance.mark('filter-end');
            window.performance.measure('filter-duration', 'filter-start', 'filter-end');
            return result;
        };
        
        // Log performance metrics periodically
        setInterval(() => {
            const measures = window.performance.getEntriesByType('measure');
            const filterMeasures = measures.filter(m => m.name === 'filter-duration');
            if (filterMeasures.length > 0) {
                const avgFilterTime = filterMeasures.reduce((sum, m) => sum + m.duration, 0) / filterMeasures.length;
                if (avgFilterTime > 100) { // Log if filtering takes > 100ms
                    console.warn(`⚠️ Filter performance: ${avgFilterTime.toFixed(2)}ms average`);
                }
            }
        }, 30000); // Check every 30 seconds
    }
}

// Initialize performance monitoring
monitorPerformance();

// ===== EXPORTS =====

// Export main functions for external access
window.App = {
    initializeApplication,
    initializeInterface,
    initializeAdvancedFilters,
    initializeMultiSort,
    initializeHelpEventListeners,
    initializeAccessibilityFeatures,
    announceToScreenReader
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