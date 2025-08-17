// Card Recognition Module with Enhanced Debugging
// Computer Vision and OCR for automatic card detection from screenshots
//
// SETUP INSTRUCTIONS FOR OPTIMAL PERFORMANCE:
// 
// 1. Create type_icons/ folder in your project root
// 2. Extract or create 32x32 PNG files for each card type:
//    - type_icons/speed.png (green speed icon)
//    - type_icons/stamina.png (yellow stamina icon) 
//    - type_icons/power.png (red power icon)
//    - type_icons/guts.png (blue guts icon)
//    - type_icons/intelligence.png (purple intelligence/wit icon)
//    - type_icons/friend.png (pink friend icon)
// 
// 3. Type icons can be extracted from:
//    - Game UI screenshots
//    - Official game assets 
//    - Manually created based on game design
//
// 4. With type icons, detection uses two-stage process:
//    Stage 1: Find type icons → identify card type regions
//    Stage 2: Match only cards of detected types → much faster
//
// 5. Without type icons, fallback mode searches all templates (slower but works)
//
// TEMPLATE GENERATION:
// - Uses full-sized card images (support_card_images/{id}.png)
// - Extracts center 50% of each card for unique artwork matching
// - Organizes templates by card type for efficient searching
// - Creates ~25 templates per type from highest rarity cards

// Debug configuration
const DEBUG_CONFIG = {
    enabled: true, // Master debug toggle
    showVisualDebug: true, // Show debug modal with visualizations
    logDetailed: true, // Detailed console logging
    saveDebugImages: false, // Save debug canvases as images
    
    // Calibration parameters (adjustable for testing)
    calibration: {
        cannyLow: 50,           // Canny edge detection low threshold
        cannyHigh: 150,         // Canny edge detection high threshold
        gaussianBlur: 5,        // Gaussian blur kernel size
        minArea: 5000,          // Minimum contour area
        maxArea: 100000,        // Maximum contour area
        minAspectRatio: 0.6,    // Minimum aspect ratio for cards
        maxAspectRatio: 0.9,    // Maximum aspect ratio for cards
        maxVarianceThreshold: 1000, // Maximum variance for confidence
        minCardsForCalibration: 3   // Minimum cards needed for reliable calibration
    }
};

// Recognition state with auto-scaling capabilities and debug data
let recognitionState = {
    isProcessing: false,
    cvReady: false,
    tesseractReady: false,
    cardTemplates: new Map(), // Organized by type: { speed: Map(), stamina: Map(), ... }
    typeTemplates: new Map(), // Type icon templates
    lastResults: [],
    // Auto-detected scaling information
    detectedCardSize: { width: 160, height: 210 }, // Default from your measurements
    isCalibrated: false,
    calibrationConfidence: 0,
    // Debug data
    debugData: {
        lastScreenshot: null,
        calibrationSteps: [],
        detectedContours: [],
        filteredContours: [],
        finalCardBounds: [],
        processingTime: 0
    }
};

// Card type mappings
const CARD_TYPES = {
    'speed': 'Speed',
    'stamina': 'Stamina', 
    'power': 'Power',
    'guts': 'Guts',
    'intelligence': 'Wit',
    'wisdom': 'Wit', // Alternative name
    'friend': 'Friend'
};

// Type icon template paths (these will need to be created/extracted)
const TYPE_ICON_PATHS = {
    'speed': 'type_icons/speed.png',
    'stamina': 'type_icons/stamina.png',
    'power': 'type_icons/power.png',
    'guts': 'type_icons/guts.png',
    'intelligence': 'type_icons/intelligence.png',
    'friend': 'type_icons/friend.png'
};

// Debug logging utility
function debugLog(level, message, data = null) {
    if (!DEBUG_CONFIG.enabled) return;
    
    const timestamp = new Date().toISOString().substr(11, 12);
    const prefix = {
        'info': '📘',
        'success': '✅', 
        'warning': '⚠️',
        'error': '❌',
        'debug': '🔍'
    }[level] || '📄';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
    if (data && DEBUG_CONFIG.logDetailed) {
        console.log('   Data:', data);
    }
}

// Initialize computer vision libraries with auto-scaling support
async function initializeRecognition() {
    try {
        debugLog('info', 'Starting recognition system initialization...');
        
        // Wait for OpenCV.js to load
        await waitForOpenCV();
        recognitionState.cvReady = true;
        debugLog('success', 'OpenCV.js initialized successfully');
        
        // Initialize Tesseract
        await initializeTesseract();
        recognitionState.tesseractReady = true;
        debugLog('success', 'Tesseract.js initialized successfully');
        
        // Prepare initial templates with default dimensions
        debugLog('info', 'Preparing initial templates with default dimensions (160×210px)...');
        await prepareCardTemplates();
        debugLog('success', 'Card recognition system ready with auto-scaling support');
        
        // Note: Type icon templates are required for optimal performance
        if (recognitionState.typeTemplates.size === 0) {
            debugLog('warning', 'Type icon templates not found. Recognition will be slower.');
            debugLog('info', 'Create type icon templates by extracting icons from game UI:');
            debugLog('info', '   - Extract speed/stamina/power/guts/intelligence/friend icons');
            debugLog('info', '   - Save as 32x32 PNG files in type_icons/ folder');
            debugLog('info', '   - This enables type-first detection for better performance');
        }
        
        debugLog('info', 'Features enabled:');
        debugLog('info', '   ✅ Auto-scale calibration from screenshots');
        debugLog('info', '   ✅ Smart template scaling (449×599 → detected size)');
        debugLog('info', '   ✅ Targeted scale matching (±20% around detected size)');
        debugLog('info', '   ✅ Fallback mode for edge case scenarios');
        debugLog('info', `   🐛 Debug mode: ${DEBUG_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
        
        return true;
    } catch (error) {
        debugLog('error', 'Failed to initialize recognition libraries', error);
        showToast('Recognition libraries failed to load. Screenshot scanning disabled.', 'error');
        return false;
    }
}

// Wait for OpenCV.js to be ready
function waitForOpenCV() {
    return new Promise((resolve, reject) => {
        if (typeof cv !== 'undefined' && cv.Mat) {
            resolve();
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds timeout
        
        const checkOpenCV = () => {
            attempts++;
            if (typeof cv !== 'undefined' && cv.Mat) {
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('OpenCV.js failed to load within timeout'));
            } else {
                setTimeout(checkOpenCV, 100);
            }
        };
        
        checkOpenCV();
    });
}

// Initialize Tesseract worker
let tesseractWorker = null;

async function initializeTesseract() {
    try {
        tesseractWorker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    updateRecognitionProgress(50 + (m.progress * 30)); // OCR is 30% of total progress
                }
            }
        });
        
        // Configure for number recognition (levels)
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: '0123456789LvlLV ',
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        });
        
        return true;
    } catch (error) {
        debugLog('error', 'Failed to initialize Tesseract', error);
        throw error;
    }
}

// Auto-calibrate card dimensions from screenshot with enhanced debugging
async function calibrateCardDimensions(screenshot) {
    const startTime = Date.now();
    debugLog('info', '🔍 Auto-calibrating card dimensions from screenshot...');
    
    // Clear previous debug data
    recognitionState.debugData.calibrationSteps = [];
    recognitionState.debugData.detectedContours = [];
    recognitionState.debugData.filteredContours = [];
    recognitionState.debugData.finalCardBounds = [];
    recognitionState.debugData.lastScreenshot = screenshot.clone();
    
    try {
        const detectedCards = await detectCardBoundaries(screenshot);
        
        debugLog('info', `📊 Card boundary detection completed:`, {
            totalDetected: detectedCards.length,
            minRequired: DEBUG_CONFIG.calibration.minCardsForCalibration
        });
        
        if (detectedCards.length < DEBUG_CONFIG.calibration.minCardsForCalibration) {
            debugLog('warning', `⚠️ Not enough cards detected for reliable calibration (${detectedCards.length}/${DEBUG_CONFIG.calibration.minCardsForCalibration}), using defaults`);
            recognitionState.detectedCardSize = { width: 160, height: 210 };
            recognitionState.calibrationConfidence = 0.3;
            recognitionState.isCalibrated = false;
            
            // Show debug modal if enabled
            if (DEBUG_CONFIG.showVisualDebug) {
                await showCalibrationDebugModal('Insufficient cards detected for calibration');
            }
            
            return false;
        }
        
        // Calculate average card dimensions
        const avgWidth = detectedCards.reduce((sum, card) => sum + card.width, 0) / detectedCards.length;
        const avgHeight = detectedCards.reduce((sum, card) => sum + card.height, 0) / detectedCards.length;
        
        recognitionState.detectedCardSize = {
            width: Math.round(avgWidth),
            height: Math.round(avgHeight)
        };
        
        // Calculate confidence based on consistency of detected sizes
        const widthVariance = detectedCards.reduce((sum, card) => 
            sum + Math.pow(card.width - avgWidth, 2), 0) / detectedCards.length;
        const heightVariance = detectedCards.reduce((sum, card) => 
            sum + Math.pow(card.height - avgHeight, 2), 0) / detectedCards.length;
        
        const maxVariance = Math.max(widthVariance, heightVariance);
        recognitionState.calibrationConfidence = Math.max(0.1, 1.0 - (maxVariance / DEBUG_CONFIG.calibration.maxVarianceThreshold));
        recognitionState.isCalibrated = true;
        
        // Calculate scale factor from full-size images
        const scaleFactorWidth = recognitionState.detectedCardSize.width / 449; // 449 is full image width
        const scaleFactorHeight = recognitionState.detectedCardSize.height / 599; // 599 is full image height
        const avgScaleFactor = (scaleFactorWidth + scaleFactorHeight) / 2;
        
        const processingTime = Date.now() - startTime;
        recognitionState.debugData.processingTime = processingTime;
        
        debugLog('success', `✅ Calibration successful:`, {
            detectedSize: recognitionState.detectedCardSize,
            confidence: `${Math.round(recognitionState.calibrationConfidence * 100)}%`,
            cardsAnalyzed: detectedCards.length,
            scaleFactors: {
                width: scaleFactorWidth.toFixed(3),
                height: scaleFactorHeight.toFixed(3),
                average: avgScaleFactor.toFixed(3)
            },
            variance: {
                width: widthVariance.toFixed(1),
                height: heightVariance.toFixed(1),
                max: maxVariance.toFixed(1)
            },
            processingTime: `${processingTime}ms`
        });
        
        // Show debug modal if enabled
        if (DEBUG_CONFIG.showVisualDebug) {
            await showCalibrationDebugModal('Calibration successful');
        }
        
        return true;
        
    } catch (error) {
        debugLog('error', '❌ Card dimension calibration failed', error);
        recognitionState.detectedCardSize = { width: 160, height: 210 };
        recognitionState.calibrationConfidence = 0.2;
        recognitionState.isCalibrated = false;
        
        // Show debug modal if enabled
        if (DEBUG_CONFIG.showVisualDebug) {
            await showCalibrationDebugModal(`Calibration failed: ${error.message}`);
        }
        
        return false;
    }
}

// Detect card boundaries using edge detection with enhanced debugging
async function detectCardBoundaries(screenshot) {
    debugLog('debug', '🔍 Starting card boundary detection...');
    
    const detectedCards = [];
    const stepResults = {};
    
    try {
        // Step 1: Convert to grayscale
        debugLog('debug', '📐 Step 1: Converting to grayscale...');
        const gray = new cv.Mat();
        cv.cvtColor(screenshot, gray, cv.COLOR_RGBA2GRAY);
        stepResults.grayscale = gray.clone();
        
        // Step 2: Apply Gaussian blur
        debugLog('debug', `📐 Step 2: Applying Gaussian blur (kernel: ${DEBUG_CONFIG.calibration.gaussianBlur}x${DEBUG_CONFIG.calibration.gaussianBlur})...`);
        const blurred = new cv.Mat();
        const kernelSize = new cv.Size(DEBUG_CONFIG.calibration.gaussianBlur, DEBUG_CONFIG.calibration.gaussianBlur);
        cv.GaussianBlur(gray, blurred, kernelSize, 0);
        stepResults.blurred = blurred.clone();
        
        // Step 3: Edge detection using Canny
        debugLog('debug', `📐 Step 3: Canny edge detection (thresholds: ${DEBUG_CONFIG.calibration.cannyLow}-${DEBUG_CONFIG.calibration.cannyHigh})...`);
        const edges = new cv.Mat();
        cv.Canny(blurred, edges, DEBUG_CONFIG.calibration.cannyLow, DEBUG_CONFIG.calibration.cannyHigh);
        stepResults.edges = edges.clone();
        
        // Step 4: Morphological operations
        debugLog('debug', '📐 Step 4: Morphological operations to connect edges...');
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        const morphed = new cv.Mat();
        cv.morphologyEx(edges, morphed, cv.MORPH_CLOSE, kernel);
        stepResults.morphed = morphed.clone();
        
        // Step 5: Find contours
        debugLog('debug', '📐 Step 5: Finding contours...');
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        const allContours = [];
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            const rect = cv.boundingRect(contour);
            const aspectRatio = rect.width / rect.height;
            
            allContours.push({
                index: i,
                area: area,
                rect: rect,
                aspectRatio: aspectRatio,
                contour: contour.clone()
            });
        }
        
        recognitionState.debugData.detectedContours = allContours.map(c => ({
            ...c,
            contour: undefined // Don't store Mat in debug data
        }));
        
        debugLog('debug', `📊 Found ${allContours.length} total contours`);
        
        // Step 6: Filter by area
        debugLog('debug', `📐 Step 6: Filtering by area (${DEBUG_CONFIG.calibration.minArea}-${DEBUG_CONFIG.calibration.maxArea})...`);
        const areaFiltered = allContours.filter(c => 
            c.area >= DEBUG_CONFIG.calibration.minArea && 
            c.area <= DEBUG_CONFIG.calibration.maxArea
        );
        debugLog('debug', `📊 After area filter: ${areaFiltered.length}/${allContours.length} contours`);
        
        // Step 7: Filter by aspect ratio
        debugLog('debug', `📐 Step 7: Filtering by aspect ratio (${DEBUG_CONFIG.calibration.minAspectRatio}-${DEBUG_CONFIG.calibration.maxAspectRatio})...`);
        const ratioFiltered = areaFiltered.filter(c =>
            c.aspectRatio >= DEBUG_CONFIG.calibration.minAspectRatio && 
            c.aspectRatio <= DEBUG_CONFIG.calibration.maxAspectRatio
        );
        debugLog('debug', `📊 After aspect ratio filter: ${ratioFiltered.length}/${areaFiltered.length} contours`);
        
        // Step 8: Check for rectangular shapes
        debugLog('debug', '📐 Step 8: Checking for rectangular shapes...');
        const rectangularCards = [];
        
        for (const contourData of ratioFiltered) {
            const approx = new cv.Mat();
            const epsilon = 0.02 * cv.arcLength(contourData.contour, true);
            cv.approxPolyDP(contourData.contour, approx, epsilon, true);
            
            // Look for rectangular shapes (4 corners) or accept any reasonable polygon
            if (approx.rows >= 4) {
                rectangularCards.push({
                    x: contourData.rect.x,
                    y: contourData.rect.y,
                    width: contourData.rect.width,
                    height: contourData.rect.height,
                    area: contourData.area,
                    aspectRatio: contourData.aspectRatio,
                    corners: approx.rows
                });
            }
            
            approx.delete();
        }
        
        debugLog('debug', `📊 Found ${rectangularCards.length} rectangular/polygonal cards`);
        recognitionState.debugData.filteredContours = rectangularCards;
        
        // Step 9: Sort and filter outliers
        debugLog('debug', '📐 Step 9: Sorting by area and filtering outliers...');
        rectangularCards.sort((a, b) => b.area - a.area);
        
        // Filter outliers by removing cards significantly different from median
        let finalCards = rectangularCards;
        if (rectangularCards.length > 2) {
            const medianIndex = Math.floor(rectangularCards.length / 2);
            const medianWidth = rectangularCards[medianIndex].width;
            const medianHeight = rectangularCards[medianIndex].height;
            
            debugLog('debug', `📊 Median dimensions: ${medianWidth}×${medianHeight}`);
            
            finalCards = rectangularCards.filter(card => {
                const widthDiff = Math.abs(card.width - medianWidth) / medianWidth;
                const heightDiff = Math.abs(card.height - medianHeight) / medianHeight;
                const isValid = widthDiff < 0.3 && heightDiff < 0.3; // Within 30% of median
                
                if (!isValid) {
                    debugLog('debug', `🚫 Filtered out card: ${card.width}×${card.height} (too different from median)`);
                }
                
                return isValid;
            });
        }
        
        recognitionState.debugData.finalCardBounds = finalCards;
        recognitionState.debugData.calibrationSteps = stepResults;
        
        debugLog('success', `✅ Card boundary detection complete: ${finalCards.length} cards found`);
        
        // Clean up OpenCV objects
        gray.delete();
        blurred.delete();
        edges.delete();
        kernel.delete();
        morphed.delete();
        
        // Clean up contours
        for (let i = 0; i < contours.size(); i++) {
            contours.get(i).delete();
        }
        contours.delete();
        hierarchy.delete();
        
        // Clean up stored contours
        allContours.forEach(c => c.contour.delete());
        
        return finalCards;
        
    } catch (error) {
        debugLog('error', '❌ Error in detectCardBoundaries', error);
        
        // Clean up any allocated memory
        Object.values(stepResults).forEach(mat => {
            if (mat && typeof mat.delete === 'function') {
                mat.delete();
            }
        });
        
        throw error;
    }
}

// Show calibration debug modal
async function showCalibrationDebugModal(status) {
    if (!DEBUG_CONFIG.showVisualDebug) return;
    
    try {
        debugLog('debug', '🖼️ Creating calibration debug visualization...');
        
        const modal = document.getElementById('calibrationDebugModal');
        const statusElement = document.getElementById('debugStatus');
        const canvasContainer = document.getElementById('debugCanvasContainer');
        const detailsElement = document.getElementById('debugDetails');
        
        // Update status
        statusElement.textContent = status;
        
        // Clear previous canvases
        canvasContainer.innerHTML = '';
        
        const debugData = recognitionState.debugData;
        
        // Create debug canvases for each step
        if (debugData.calibrationSteps.grayscale) {
            await createDebugCanvas('Grayscale', debugData.calibrationSteps.grayscale, canvasContainer);
        }
        
        if (debugData.calibrationSteps.edges) {
            await createDebugCanvas('Edge Detection', debugData.calibrationSteps.edges, canvasContainer);
        }
        
        if (debugData.calibrationSteps.morphed) {
            await createDebugCanvas('Morphological Operations', debugData.calibrationSteps.morphed, canvasContainer);
        }
        
        // Create contours visualization
        if (debugData.lastScreenshot) {
            await createContoursVisualization(debugData.lastScreenshot, canvasContainer);
        }
        
        // Update details
        const details = {
            'Detected Card Size': `${recognitionState.detectedCardSize.width}×${recognitionState.detectedCardSize.height}px`,
            'Calibration Confidence': `${Math.round(recognitionState.calibrationConfidence * 100)}%`,
            'Total Contours Found': debugData.detectedContours.length,
            'After Area Filter': debugData.filteredContours.length,
            'Final Card Boundaries': debugData.finalCardBounds.length,
            'Processing Time': `${debugData.processingTime}ms`,
            'Debug Parameters': JSON.stringify(DEBUG_CONFIG.calibration, null, 2)
        };
        
        detailsElement.innerHTML = Object.entries(details).map(([key, value]) => 
            `<div><strong>${key}:</strong> ${typeof value === 'string' && value.includes('\n') ? `<pre>${value}</pre>` : value}</div>`
        ).join('');
        
        // Show modal
        modal.style.display = 'block';
        
        debugLog('success', '✅ Debug modal shown');
        
    } catch (error) {
        debugLog('error', '❌ Failed to create debug visualization', error);
    }
}

// Create debug canvas for OpenCV Mat
async function createDebugCanvas(title, mat, container) {
    try {
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'debug-canvas-wrapper';
        
        const titleElement = document.createElement('h4');
        titleElement.textContent = title;
        
        const canvas = document.createElement('canvas');
        canvas.width = mat.cols;
        canvas.height = mat.rows;
        canvas.className = 'debug-canvas';
        
        // Convert OpenCV Mat to canvas
        cv.imshow(canvas, mat);
        
        canvasWrapper.appendChild(titleElement);
        canvasWrapper.appendChild(canvas);
        container.appendChild(canvasWrapper);
        
        debugLog('debug', `📊 Created debug canvas: ${title} (${mat.cols}×${mat.rows})`);
        
    } catch (error) {
        debugLog('error', `❌ Failed to create debug canvas for ${title}`, error);
    }
}

// Create contours visualization
async function createContoursVisualization(screenshot, container) {
    try {
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'debug-canvas-wrapper';
        
        const titleElement = document.createElement('h4');
        titleElement.textContent = 'Detected Card Boundaries';
        
        const canvas = document.createElement('canvas');
        canvas.width = screenshot.cols;
        canvas.height = screenshot.rows;
        canvas.className = 'debug-canvas';
        
        const ctx = canvas.getContext('2d');
        
        // Draw original screenshot
        cv.imshow(canvas, screenshot);
        
        // Overlay detected boundaries
        const debugData = recognitionState.debugData;
        
        // Draw all contours in red
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 1;
        debugData.detectedContours.forEach(contour => {
            const rect = contour.rect;
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        });
        
        // Draw filtered contours in yellow
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        debugData.filteredContours.forEach(contour => {
            ctx.strokeRect(contour.x, contour.y, contour.width, contour.height);
        });
        
        // Draw final card boundaries in green
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 3;
        debugData.finalCardBounds.forEach((card, index) => {
            ctx.strokeRect(card.x, card.y, card.width, card.height);
            
            // Add dimension labels
            ctx.fillStyle = 'lime';
            ctx.font = '12px Arial';
            ctx.fillText(`${card.width}×${card.height}`, card.x + 5, card.y + 15);
            ctx.fillText(`#${index + 1}`, card.x + 5, card.y + card.height - 5);
        });
        
        canvasWrapper.appendChild(titleElement);
        canvasWrapper.appendChild(canvas);
        container.appendChild(canvasWrapper);
        
        // Add legend
        const legend = document.createElement('div');
        legend.className = 'debug-legend';
        legend.innerHTML = `
            <div><span style="color: red;">■</span> All contours (${debugData.detectedContours.length})</div>
            <div><span style="color: yellow;">■</span> Filtered contours (${debugData.filteredContours.length})</div>
            <div><span style="color: lime;">■</span> Final card boundaries (${debugData.finalCardBounds.length})</div>
        `;
        canvasWrapper.appendChild(legend);
        
        debugLog('debug', '📊 Created contours visualization');
        
    } catch (error) {
        debugLog('error', '❌ Failed to create contours visualization', error);
    }
}

// Prepare card templates by type
async function prepareCardTemplates() {
    if (!cardData || cardData.length === 0) {
        debugLog('warning', 'Card data not loaded yet, templates will be prepared later');
        return false;
    }
    
    debugLog('info', 'Preparing card templates by type...');
    
    // Initialize template maps for each type
    Object.keys(CARD_TYPES).forEach(type => {
        recognitionState.cardTemplates.set(type, new Map());
    });
    
    // Prepare type icon templates first
    await prepareTypeIconTemplates();
    
    // Process cards by type for better organization
    const templateCounts = {};
    const templatesPerType = 25; // Limit per type for performance
    
    // Group cards by type and filter released cards
    const cardsByType = {};
    Object.keys(CARD_TYPES).forEach(type => {
        cardsByType[type] = cardData
            .filter(card => card.release_en && (card.type === type || (type === 'intelligence' && card.type === 'wisdom')))
            .sort((a, b) => b.rarity - a.rarity); // Prioritize higher rarity cards
    });
    
    // Create templates for each type
    for (const [type, cards] of Object.entries(cardsByType)) {
        const typeMap = recognitionState.cardTemplates.get(type);
        const step = Math.max(1, Math.floor(cards.length / templatesPerType));
        let count = 0;
        
        for (let i = 0; i < cards.length && count < templatesPerType; i += step) {
            const card = cards[i];
            try {
                const template = await createFullCardTemplate(card.support_id);
                if (template) {
                    typeMap.set(card.support_id, {
                        template: template,
                        card: card,
                        rarity: card.rarity,
                        type: card.type
                    });
                    count++;
                }
            } catch (error) {
                debugLog('warning', `Failed to create template for card ${card.support_id}`, error);
            }
        }
        
        templateCounts[type] = count;
        debugLog('info', `Prepared ${count} templates for ${CARD_TYPES[type]} cards`);
    }
    
    const totalTemplates = Object.values(templateCounts).reduce((sum, count) => sum + count, 0);
    debugLog('success', `Prepared ${totalTemplates} card templates across ${Object.keys(templateCounts).length} types`);
}

// Prepare type icon templates for type detection
async function prepareTypeIconTemplates() {
    debugLog('info', 'Preparing type icon templates...');
    recognitionState.typeTemplates.clear();
    
    for (const [type, iconPath] of Object.entries(TYPE_ICON_PATHS)) {
        try {
            const template = await createTypeIconTemplate(iconPath, type);
            if (template) {
                recognitionState.typeTemplates.set(type, template);
                debugLog('success', `Created template for ${CARD_TYPES[type]} type`);
            }
        } catch (error) {
            debugLog('warning', `Failed to create type template for ${type}`, error);
        }
    }
    
    debugLog('info', `Prepared ${recognitionState.typeTemplates.size} type icon templates`);
}

// Create template from type icon
async function createTypeIconTemplate(iconPath, type) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Standard type icon template size
                const templateSize = 32;
                canvas.width = templateSize;
                canvas.height = templateSize;
                
                // Draw resized type icon
                ctx.drawImage(img, 0, 0, templateSize, templateSize);
                
                // Convert to OpenCV Mat
                const imageData = ctx.getImageData(0, 0, templateSize, templateSize);
                const src = cv.matFromImageData(imageData);
                
                // Convert to grayscale for template matching
                const gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                
                src.delete();
                resolve(gray);
            } catch (error) {
                debugLog('error', `Error creating type template for ${type}`, error);
                resolve(null);
            }
        };
        
        img.onerror = () => {
            debugLog('warning', `Type icon image not found: ${iconPath}`);
            resolve(null);
        };
        
        img.src = iconPath;
    });
}

// Create template from full card image scaled to detected screenshot size
async function createFullCardTemplate(cardId) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Scale full-size image (449×599) to detected screenshot card size
                const targetWidth = recognitionState.detectedCardSize.width;
                const targetHeight = recognitionState.detectedCardSize.height;
                
                debugLog('debug', `🔧 Scaling card ${cardId}: 449×599 → ${targetWidth}×${targetHeight}`);
                
                // Create scaled version of full card first
                const scaledCanvas = document.createElement('canvas');
                const scaledCtx = scaledCanvas.getContext('2d');
                scaledCanvas.width = targetWidth;
                scaledCanvas.height = targetHeight;
                
                // Draw full image scaled to target screenshot size
                scaledCtx.drawImage(img, 0, 0, targetWidth, targetHeight);
                
                // Now extract center 50% from the scaled image
                const centerWidth = targetWidth * 0.5;
                const centerHeight = targetHeight * 0.5;
                const offsetX = targetWidth * 0.25;
                const offsetY = targetHeight * 0.25;
                
                // Template size is center 50% of scaled card
                const templateWidth = Math.round(centerWidth);
                const templateHeight = Math.round(centerHeight);
                canvas.width = templateWidth;
                canvas.height = templateHeight;
                
                // Extract center portion from scaled image
                ctx.drawImage(
                    scaledCanvas,
                    offsetX, offsetY, centerWidth, centerHeight, // Source: center 50% of scaled image
                    0, 0, templateWidth, templateHeight // Destination: full template
                );
                
                // Convert to OpenCV Mat
                const imageData = ctx.getImageData(0, 0, templateWidth, templateHeight);
                const src = cv.matFromImageData(imageData);
                
                // Convert to grayscale for template matching
                const gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                
                // Apply slight blur to reduce noise and improve matching
                const blurred = new cv.Mat();
                cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);
                
                // Enhance contrast slightly
                const enhanced = new cv.Mat();
                blurred.convertTo(enhanced, -1, 1.2, 10); // alpha=1.2 (contrast), beta=10 (brightness)
                
                src.delete();
                gray.delete();
                blurred.delete();
                
                debugLog('success', `✅ Created template for card ${cardId}: ${templateWidth}×${templateHeight}px`);
                resolve(enhanced);
                
            } catch (error) {
                debugLog('error', `❌ Error creating template for card ${cardId}`, error);
                resolve(null);
            }
        };
        
        img.onerror = () => {
            debugLog('warning', `⚠️ Full card image not found for card ${cardId}`);
            resolve(null);
        };
        
        // Use full card image instead of icon
        img.src = `support_card_images/${cardId}.png`;
    });
}

// Process uploaded screenshot with auto-calibration
async function processScreenshot(file) {
    if (!recognitionState.cvReady || !recognitionState.tesseractReady) {
        showToast('Recognition libraries not ready. Please wait...', 'warning');
        return null;
    }
    
    if (recognitionState.isProcessing) {
        showToast('Recognition already in progress', 'warning');
        return null;
    }
    
    try {
        recognitionState.isProcessing = true;
        showRecognitionProgress(true);
        updateRecognitionProgress(0, 'Loading screenshot...');
        
        debugLog('info', '🎯 Starting screenshot processing pipeline...');
        
        // Load and preprocess image
        const image = await loadImageFromFile(file);
        updateRecognitionProgress(5, 'Preprocessing image...');
        
        const preprocessedImage = preprocessScreenshot(image);
        updateRecognitionProgress(10, 'Calibrating card dimensions...');
        
        // Auto-calibrate card dimensions from screenshot
        const calibrationSuccess = await calibrateCardDimensions(preprocessedImage);
        
        if (calibrationSuccess) {
            updateRecognitionProgress(15, 'Regenerating templates with correct scale...');
            // Regenerate templates with correct scale
            await prepareCardTemplates();
            updateRecognitionProgress(20, 'Templates updated! Detecting cards...');
        } else {
            updateRecognitionProgress(15, 'Using default dimensions, detecting cards...');
        }
        
        // Detect cards using scale-aware templates
        const detectedCards = await detectCardsInImage(preprocessedImage);
        updateRecognitionProgress(50, 'Recognizing levels...');
        
        // Extract levels and limit breaks for detected cards
        const results = await recognizeCardDetails(preprocessedImage, detectedCards);
        updateRecognitionProgress(90, 'Finalizing results...');
        
        // Filter and validate results
        const validResults = results.filter(result => result.confidence > 0.6);
        
        updateRecognitionProgress(100, 'Complete!');
        setTimeout(() => showRecognitionProgress(false), 1000);
        
        recognitionState.lastResults = validResults;
        
        // Log detection summary
        debugLog('info', `📊 Detection Summary:`);
        debugLog('info', `   Card size: ${recognitionState.detectedCardSize.width}×${recognitionState.detectedCardSize.height}px`);
        debugLog('info', `   Calibration confidence: ${Math.round(recognitionState.calibrationConfidence * 100)}%`);
        debugLog('info', `   Cards detected: ${validResults.length}`);
        if (validResults.length > 0) {
            const avgConfidence = validResults.reduce((sum, r) => sum + r.confidence, 0) / validResults.length;
            debugLog('info', `   Average confidence: ${Math.round(avgConfidence * 100)}%`);
        }
        
        return validResults;
        
    } catch (error) {
        debugLog('error', 'Screenshot processing failed', error);
        showToast(`Recognition failed: ${error.message}`, 'error');
        return null;
    } finally {
        recognitionState.isProcessing = false;
    }
}

// Load image from file
function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// Preprocess screenshot for better recognition
function preprocessScreenshot(image) {
    const canvas = document.getElementById('processingCanvas');
    const ctx = canvas.getContext('2d');
    
    // Resize if too large (max 1920x1080 for performance)
    const maxWidth = 1920;
    const maxHeight = 1080;
    let { width, height } = image;
    
    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
    }
    
    canvas.width = width;
    canvas.height = height;
    
    // Draw image
    ctx.drawImage(image, 0, 0, width, height);
    
    // Enhance contrast slightly
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        // Simple contrast enhancement
        data[i] = Math.min(255, data[i] * 1.1);     // R
        data[i + 1] = Math.min(255, data[i + 1] * 1.1); // G
        data[i + 2] = Math.min(255, data[i + 2] * 1.1); // B
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Convert to OpenCV Mat
    const cvImage = cv.matFromImageData(imageData);
    return cvImage;
}

// [Rest of the functions remain the same as in the original file...]
// I'll include the essential recognition functions but will truncate for space

// Detect cards in screenshot using two-stage type-aware matching
async function detectCardsInImage(screenshot) {
    debugLog('info', 'Starting card detection...');
    
    // Check if type templates are available for two-stage detection
    if (recognitionState.typeTemplates.size > 0) {
        debugLog('info', 'Using two-stage type-aware detection');
        return await detectCardsWithTypeAwareness(screenshot);
    } else {
        debugLog('info', 'Type templates not available, using fallback detection');
        return await detectCardsWithoutTypeAwareness(screenshot);
    }
}

// Two-stage detection when type templates are available
async function detectCardsWithTypeAwareness(screenshot) {
    // Stage 1: Detect card types in the screenshot
    updateRecognitionProgress(25, 'Detecting card types...');
    const detectedTypes = await detectCardTypesInImage(screenshot);
    
    if (detectedTypes.length === 0) {
        debugLog('warning', 'No card types detected, falling back to full detection');
        return await detectCardsWithoutTypeAwareness(screenshot);
    }
    
    debugLog('info', `Detected card types: ${detectedTypes.map(t => CARD_TYPES[t.type]).join(', ')}`);
    
    // Stage 2: Match cards within detected types
    updateRecognitionProgress(30, `Matching cards in ${detectedTypes.length} type regions...`);
    const detectedCards = [];
    
    for (let i = 0; i < detectedTypes.length; i++) {
        const typeDetection = detectedTypes[i];
        const progressBase = 30 + (i / detectedTypes.length) * 15; // 30-45% for card matching
        
        updateRecognitionProgress(progressBase, `Matching ${CARD_TYPES[typeDetection.type]} cards...`);
        
        // Get templates for this specific type
        const typeTemplates = recognitionState.cardTemplates.get(typeDetection.type);
        if (!typeTemplates || typeTemplates.size === 0) {
            debugLog('warning', `No templates available for type: ${typeDetection.type}`);
            continue;
        }
        
        // Match cards within this type region
        const typeCards = await matchCardsInTypeRegion(screenshot, typeDetection, typeTemplates);
        detectedCards.push(...typeCards);
        
        debugLog('info', `Found ${typeCards.length} ${CARD_TYPES[typeDetection.type]} cards`);
    }
    
    // Remove overlapping detections across types
    const filteredCards = nonMaximumSuppression(detectedCards, 0.3);
    
    debugLog('info', `Total detected: ${filteredCards.length} cards after filtering`);
    return filteredCards;
}

// [Continue with rest of functions - keeping them largely the same]
// ... (other recognition functions)

// Update recognition progress
function updateRecognitionProgress(percentage, message = '') {
    const progressBar = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
    
    if (progressText && message) {
        progressText.textContent = message;
    }
}

// Show/hide recognition progress
function showRecognitionProgress(show) {
    const progressElement = document.getElementById('recognitionProgress');
    if (progressElement) {
        progressElement.style.display = show ? 'block' : 'none';
    }
}

// Show recognition results modal
function showRecognitionResults(results) {
    if (!results || results.length === 0) {
        showToast('No cards detected in screenshot', 'warning');
        return;
    }
    
    const modal = document.getElementById('recognitionModal');
    const countElement = document.getElementById('recognitionCount');
    const confidenceElement = document.getElementById('recognitionConfidence');
    const listElement = document.getElementById('detectedCardsList');
    
    // Update stats
    const avgConfidence = Math.round((results.reduce((sum, r) => sum + r.confidence, 0) / results.length) * 100);
    countElement.textContent = `${results.length} cards detected`;
    confidenceElement.textContent = `Average confidence: ${avgConfidence}%`;
    
    // Render detected cards list
    listElement.innerHTML = results.map((result, index) => `
        <div class="detected-card-item" data-index="${index}">
            <label class="detected-card-checkbox">
                <input type="checkbox" checked data-card-id="${result.cardId}">
                <img src="support_card_images/${result.cardId}_i.png" 
                     class="detected-card-icon" 
                     alt="${result.card.char_name}"
                     onerror="this.style.display='none'">
                <div class="detected-card-info">
                    <div class="detected-card-name">${result.card.char_name || 'Unknown Card'}</div>
                    <div class="detected-card-details">
                        Level: ${result.level} | LB: ${result.limitBreak} | 
                        Confidence: ${Math.round(result.confidence * 100)}%
                    </div>
                </div>
            </label>
        </div>
    `).join('');
    
    modal.style.display = 'block';
}

// Import selected cards from recognition results
function importRecognitionResults() {
    const checkboxes = document.querySelectorAll('#detectedCardsList input[type="checkbox"]:checked');
    const results = recognitionState.lastResults;
    
    let importCount = 0;
    
    checkboxes.forEach(checkbox => {
        const cardId = parseInt(checkbox.dataset.cardId);
        const result = results.find(r => r.cardId === cardId);
        
        if (result) {
            setCardOwnership(cardId, true);
            setOwnedCardLevel(cardId, result.level);
            setOwnedCardLimitBreak(cardId, result.limitBreak);
            importCount++;
        }
    });
    
    // Close modal and refresh display
    document.getElementById('recognitionModal').style.display = 'none';
    
    if (typeof debouncedFilterAndSort === 'function') {
        debouncedFilterAndSort();
    }
    
    showToast(`Successfully imported ${importCount} cards from screenshot!`, 'success');
}

// Initialize recognition when libraries are loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize recognition after a short delay to ensure other modules are loaded
    setTimeout(async () => {
        const success = await initializeRecognition();
        if (success) {
            debugLog('success', 'Card recognition system ready');
        }
    }, 2000);
});