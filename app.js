// Main Application Controller with Debug Integration
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
let globalLimitBreakOverrideOwned = true; // New: toggle for applying global LB to owned cards
let showMaxPotentialLevels = false; // New: toggle for showing max potential vs current levels

// Multi-layer sorting state
let multiSort = []; // Array of { category, option, direction } objects

// Advanced filtering state
let advancedFilters = {
    effects: {}, // effectId: { min: value, max: value }
    hintSkills: [], // array of skill IDs
    eventSkills: [] // array of skill IDs
};

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

// Initialize multi-select dropdown functionality
function initializeMultiSelects() {
    const multiSelects = ['rarityFilter', 'typeFilter', 'hintSkillFilter', 'eventSkillFilter'];
    
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
                }
                updateMultiSelectText(id, defaultText);
                
                if (id === 'rarityFilter' || id === 'typeFilter') {
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

// Initialize recognition interface with debug integration
function initializeRecognitionInterface() {
    const scanBtn = document.getElementById('scanScreenshotBtn');
    const fileInput = document.getElementById('screenshotFile');
    const recognitionModal = document.getElementById('recognitionModal');
    
    // Scan screenshot button
    scanBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Log file info for debugging
                console.log('📷 Processing screenshot:', {
                    name: file.name,
                    size: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
                    type: file.type,
                    lastModified: new Date(file.lastModified).toISOString()
                });
                
                const results = await processScreenshot(file);
                if (results && results.length > 0) {
                    showRecognitionResults(results);
                } else {
                    showToast('No cards detected in screenshot', 'warning');
                }
            } catch (error) {
                console.error('Screenshot processing failed:', error);
                showToast('Failed to process screenshot', 'error');
                
                // Show debug info in console
                console.error('Debug info for failed processing:', {
                    file: file.name,
                    error: error.message,
                    stack: error.stack,
                    recognitionState: {
                        cvReady: recognitionState?.cvReady,
                        tesseractReady: recognitionState?.tesseractReady,
                        isProcessing: recognitionState?.isProcessing,
                        templatesReady: recognitionState?.cardTemplates?.size || 0
                    }
                });
            }
        }
        e.target.value = ''; // Reset file input
    });
    
    // Recognition modal event listeners
    document.getElementById('recognitionClose').addEventListener('click', () => {
        recognitionModal.style.display = 'none';
    });
    
    document.getElementById('recognitionOverlay').addEventListener('click', () => {
        recognitionModal.style.display = 'none';
    });
    
    document.getElementById('recognitionCancel').addEventListener('click', () => {
        recognitionModal.style.display = 'none';
    });
    
    document.getElementById('recognitionImport').addEventListener('click', () => {
        importRecognitionResults();
    });
}

// Initialize debug interface
function initializeDebugInterface() {
    console.log('🔧 Initializing debug interface...');
    
    // Debug modal event listeners
    const calibrationDebugModal = document.getElementById('calibrationDebugModal');
    const debugParametersModal = document.getElementById('debugParametersModal');
    
    if (calibrationDebugModal) {
        // Calibration debug modal close handlers
        document.getElementById('calibrationDebugClose').addEventListener('click', () => {
            calibrationDebugModal.style.display = 'none';
        });
        
        document.getElementById('calibrationDebugOverlay').addEventListener('click', () => {
            calibrationDebugModal.style.display = 'none';
        });
        
        // Debug action button handlers
        const debugParametersBtn = document.getElementById('debugParametersBtn');
        const debugRerunBtn = document.getElementById('debugRerunBtn');
        const debugSaveBtn = document.getElementById('debugSaveBtn');
        
        if (debugParametersBtn) {
            debugParametersBtn.addEventListener('click', () => {
                showDebugParametersModal();
            });
        }
        
        if (debugRerunBtn) {
            debugRerunBtn.addEventListener('click', async () => {
                await rerunCalibrationWithCurrentParameters();
            });
        }
        
        if (debugSaveBtn) {
            debugSaveBtn.addEventListener('click', () => {
                saveDebugImages();
            });
        }
    }
    
    // Initialize debug parameters modal if it exists
    if (debugParametersModal) {
        initializeDebugParametersModal();
    }
    
    // Add debug console commands
    if (typeof window !== 'undefined') {
        window.debugRecognition = {
            showLastCalibration: () => {
                if (recognitionState?.debugData?.lastScreenshot) {
                    showCalibrationDebugModal('Debug: Showing last calibration');
                } else {
                    console.log('No calibration data available. Run a screenshot recognition first.');
                }
            },
            
            adjustParameter: (param, value) => {
                if (DEBUG_CONFIG.calibration.hasOwnProperty(param)) {
                    const oldValue = DEBUG_CONFIG.calibration[param];
                    DEBUG_CONFIG.calibration[param] = value;
                    console.log(`🔧 Parameter ${param}: ${oldValue} → ${value}`);
                } else {
                    console.log('Available parameters:', Object.keys(DEBUG_CONFIG.calibration));
                }
            },
            
            getCurrentParams: () => {
                console.log('Current debug parameters:', DEBUG_CONFIG.calibration);
                return DEBUG_CONFIG.calibration;
            },
            
            resetParams: () => {
                // Reset to defaults
                Object.assign(DEBUG_CONFIG.calibration, {
                    cannyLow: 50,
                    cannyHigh: 150,
                    gaussianBlur: 5,
                    minArea: 5000,
                    maxArea: 100000,
                    minAspectRatio: 0.6,
                    maxAspectRatio: 0.9,
                    maxVarianceThreshold: 1000,
                    minCardsForCalibration: 3
                });
                console.log('🔄 Parameters reset to defaults');
            },
            
            toggleDebug: () => {
                DEBUG_CONFIG.enabled = !DEBUG_CONFIG.enabled;
                console.log(`🐛 Debug mode: ${DEBUG_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
            }
        };
        
        console.log('🎮 Debug console commands available:');
        console.log('   window.debugRecognition.showLastCalibration() - Show last calibration debug');
        console.log('   window.debugRecognition.adjustParameter(param, value) - Adjust calibration parameters');
        console.log('   window.debugRecognition.getCurrentParams() - Show current parameters');
        console.log('   window.debugRecognition.resetParams() - Reset to defaults');
        console.log('   window.debugRecognition.toggleDebug() - Toggle debug mode');
    }
    
    console.log('✅ Debug interface initialized');
}

// Show debug parameters modal
function showDebugParametersModal() {
    const modal = document.getElementById('debugParametersModal');
    if (!modal) {
        console.warn('Debug parameters modal not found');
        return;
    }
    
    // Update slider values
    const params = DEBUG_CONFIG.calibration;
    
    // Set slider values and update displays
    Object.entries(params).forEach(([key, value]) => {
        const slider = document.getElementById(`debug${key.charAt(0).toUpperCase() + key.slice(1)}`);
        const display = document.getElementById(`debug${key.charAt(0).toUpperCase() + key.slice(1)}Value`);
        
        if (slider && display) {
            slider.value = value;
            display.textContent = value;
        }
    });
    
    modal.style.display = 'block';
}

// Initialize debug parameters modal
function initializeDebugParametersModal() {
    const modal = document.getElementById('debugParametersModal');
    
    // Close handlers
    document.getElementById('debugParametersClose').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    document.getElementById('debugParametersOverlay').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Parameter slider handlers
    const parameterInputs = [
        'debugCannyLow', 'debugCannyHigh', 'debugGaussianBlur',
        'debugMinArea', 'debugMaxArea', 'debugMinAspectRatio', 'debugMaxAspectRatio'
    ];
    
    parameterInputs.forEach(inputId => {
        const slider = document.getElementById(inputId);
        const display = document.getElementById(inputId + 'Value');
        
        if (slider && display) {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                display.textContent = value;
                
                // Update DEBUG_CONFIG
                const paramName = inputId.replace('debug', '').charAt(0).toLowerCase() + inputId.replace('debug', '').slice(1);
                DEBUG_CONFIG.calibration[paramName] = value;
                
                console.log(`🔧 Parameter ${paramName} updated to: ${value}`);
            });
        }
    });
    
    // Reset button
    document.getElementById('debugParametersReset').addEventListener('click', () => {
        // Reset to defaults and update UI
        window.debugRecognition.resetParams();
        showDebugParametersModal(); // Refresh the modal with default values
    });
    
    // Apply button
    document.getElementById('debugParametersApply').addEventListener('click', async () => {
        modal.style.display = 'none';
        showToast('Parameters updated! Try scanning a screenshot to see the changes.', 'success');
    });
}

// Rerun calibration with current parameters
async function rerunCalibrationWithCurrentParameters() {
    if (!recognitionState?.debugData?.lastScreenshot) {
        showToast('No screenshot data available to rerun calibration', 'warning');
        return;
    }
    
    try {
        showToast('Rerunning calibration with current parameters...', 'info');
        
        // Clone the last screenshot
        const screenshot = recognitionState.debugData.lastScreenshot.clone();
        
        // Run calibration again
        const success = await calibrateCardDimensions(screenshot);
        
        showToast(`Calibration ${success ? 'completed' : 'failed'} with updated parameters`, 
                  success ? 'success' : 'error');
        
        // Clean up
        screenshot.delete();
        
    } catch (error) {
        console.error('Failed to rerun calibration:', error);
        showToast(`Failed to rerun calibration: ${error.message}`, 'error');
    }
}

// Save debug images
function saveDebugImages() {
    if (!recognitionState?.debugData?.calibrationSteps) {
        showToast('No debug images available to save', 'warning');
        return;
    }
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let savedCount = 0;
        
        // Save each debug step
        Object.entries(recognitionState.debugData.calibrationSteps).forEach(([stepName, mat]) => {
            if (mat && typeof mat.delete === 'function') {
                const canvas = document.createElement('canvas');
                canvas.width = mat.cols;
                canvas.height = mat.rows;
                
                try {
                    cv.imshow(canvas, mat);
                    
                    // Convert to blob and download
                    canvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `debug_${stepName}_${timestamp}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    });
                    
                    savedCount++;
                } catch (error) {
                    console.warn(`Failed to save debug image for ${stepName}:`, error);
                }
            }
        });
        
        showToast(`Saved ${savedCount} debug images`, 'success');
        
    } catch (error) {
        console.error('Failed to save debug images:', error);
        showToast(`Failed to save debug images: ${error.message}`, 'error');
    }
}

// Initialize interface
async function initializeInterface() {
    try {
        document.getElementById('loading').style.display = 'none';
        document.querySelector('.main-layout').style.display = 'flex';

        // Initialize multi-select dropdowns
        initializeMultiSelects();
        
        // Initialize advanced filters
        initializeAdvancedFilters();
        
        // Initialize multi-sort interface
        initializeMultiSort();
        
        // Initialize recognition interface
        initializeRecognitionInterface();
        
        // Initialize debug interface
        initializeDebugInterface();

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
                document.getElementById('recognitionModal').style.display = 'none';
                
                // Close debug modals
                const calibrationDebugModal = document.getElementById('calibrationDebugModal');
                const debugParametersModal = document.getElementById('debugParametersModal');
                if (calibrationDebugModal) calibrationDebugModal.style.display = 'none';
                if (debugParametersModal) debugParametersModal.style.display = 'none';
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
        console.log('   ✅ Screenshot recognition with auto-calibration');
        console.log('   🐛 Debug mode enabled - check console commands');
        
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
        
        // Check for OpenCV availability and warn if not ready
        if (typeof cv === 'undefined') {
            console.warn('⚠️ OpenCV.js is still loading. Screenshot recognition will be available once loaded.');
        }
        
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
    
    // Check if it's an OpenCV related error
    if (event.error?.message?.includes('cv') || event.filename?.includes('opencv')) {
        console.warn('🔍 This appears to be an OpenCV-related error. Make sure OpenCV.js is properly loaded.');
    }
});

// Enhanced unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Unhandled promise rejection:', {
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString()
    });
    
    // Check if it's a recognition-related error
    if (event.reason?.message?.includes('recognition') || 
        event.reason?.message?.includes('calibration') ||
        event.reason?.message?.includes('template')) {
        console.warn('🔍 This appears to be recognition-related. Check if OpenCV.js and Tesseract.js are loaded.');
    }
});

// Load application when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application...');
    initializeApplication();
});