// Card Recognition Module
// Computer Vision and OCR for automatic card detection from screenshots

// Recognition state
let recognitionState = {
    isProcessing: false,
    cvReady: false,
    tesseractReady: false,
    cardTemplates: new Map(),
    lastResults: []
};

// Initialize computer vision libraries
async function initializeRecognition() {
    try {
        // Wait for OpenCV.js to load
        await waitForOpenCV();
        recognitionState.cvReady = true;
        console.log('OpenCV.js initialized successfully');
        
        // Initialize Tesseract
        await initializeTesseract();
        recognitionState.tesseractReady = true;
        console.log('Tesseract.js initialized successfully');
        
        // Prepare card templates for matching
        await prepareCardTemplates();
        console.log('Card templates prepared successfully');
        
        return true;
    } catch (error) {
        console.error('Failed to initialize recognition libraries:', error);
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
        console.error('Failed to initialize Tesseract:', error);
        throw error;
    }
}

// Prepare card templates for template matching
async function prepareCardTemplates() {
    if (!cardData || cardData.length === 0) {
        console.warn('Card data not loaded yet, templates will be prepared later');
        return;
    }
    
    recognitionState.cardTemplates.clear();
    
    // Process a subset of cards for template matching (avoid memory issues)
    const templatesPerRarity = { 1: 10, 2: 15, 3: 25 }; // R, SR, SSR
    const cardsByRarity = { 1: [], 2: [], 3: [] };
    
    // Group cards by rarity
    cardData.forEach(card => {
        if (card.release_en && cardsByRarity[card.rarity]) {
            cardsByRarity[card.rarity].push(card);
        }
    });
    
    // Select representative cards from each rarity
    for (const [rarity, cards] of Object.entries(cardsByRarity)) {
        const maxTemplates = templatesPerRarity[rarity] || 10;
        const step = Math.max(1, Math.floor(cards.length / maxTemplates));
        
        for (let i = 0; i < cards.length && recognitionState.cardTemplates.size < 100; i += step) {
            const card = cards[i];
            try {
                const template = await createCardTemplate(card.support_id);
                if (template) {
                    recognitionState.cardTemplates.set(card.support_id, {
                        template: template,
                        card: card,
                        rarity: card.rarity
                    });
                }
            } catch (error) {
                console.warn(`Failed to create template for card ${card.support_id}:`, error);
            }
        }
    }
    
    console.log(`Prepared ${recognitionState.cardTemplates.size} card templates`);
}

// Create template from card icon image
async function createCardTemplate(cardId) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Standard template size for consistency
                const templateSize = 64;
                canvas.width = templateSize;
                canvas.height = templateSize;
                
                // Draw resized image
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
                console.error(`Error creating template for card ${cardId}:`, error);
                resolve(null);
            }
        };
        
        img.onerror = () => {
            console.warn(`Image not found for card ${cardId}`);
            resolve(null);
        };
        
        img.src = `support_card_images/${cardId}_i.png`;
    });
}

// Process uploaded screenshot
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
        
        // Load and preprocess image
        const image = await loadImageFromFile(file);
        updateRecognitionProgress(10, 'Preprocessing image...');
        
        const preprocessedImage = preprocessScreenshot(image);
        updateRecognitionProgress(20, 'Detecting cards...');
        
        // Detect cards using template matching
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
        return validResults;
        
    } catch (error) {
        console.error('Screenshot processing failed:', error);
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

// Detect cards in screenshot using template matching
async function detectCardsInImage(screenshot) {
    const detectedCards = [];
    const grayScreenshot = new cv.Mat();
    cv.cvtColor(screenshot, grayScreenshot, cv.COLOR_RGBA2GRAY);
    
    // Multi-scale template matching
    const scales = [0.5, 0.75, 1.0, 1.25, 1.5];
    const matchThreshold = 0.65;
    
    for (const [cardId, templateData] of recognitionState.cardTemplates) {
        let bestMatch = null;
        
        for (const scale of scales) {
            try {
                const scaledTemplate = new cv.Mat();
                const templateSize = new cv.Size(
                    Math.round(templateData.template.cols * scale),
                    Math.round(templateData.template.rows * scale)
                );
                
                cv.resize(templateData.template, scaledTemplate, templateSize);
                
                // Template matching
                const result = new cv.Mat();
                cv.matchTemplate(grayScreenshot, scaledTemplate, result, cv.TM_CCOEFF_NORMED);
                
                // Find best match
                const minMaxLoc = cv.minMaxLoc(result);
                const confidence = minMaxLoc.maxVal;
                
                if (confidence > matchThreshold && (!bestMatch || confidence > bestMatch.confidence)) {
                    bestMatch = {
                        cardId: cardId,
                        card: templateData.card,
                        confidence: confidence,
                        x: minMaxLoc.maxLoc.x,
                        y: minMaxLoc.maxLoc.y,
                        width: scaledTemplate.cols,
                        height: scaledTemplate.rows,
                        scale: scale
                    };
                }
                
                scaledTemplate.delete();
                result.delete();
                
            } catch (error) {
                console.warn(`Template matching failed for card ${cardId} at scale ${scale}:`, error);
            }
        }
        
        if (bestMatch) {
            detectedCards.push(bestMatch);
        }
    }
    
    grayScreenshot.delete();
    
    // Remove overlapping detections (non-maximum suppression)
    const filteredCards = nonMaximumSuppression(detectedCards, 0.3);
    
    console.log(`Detected ${filteredCards.length} cards in screenshot`);
    return filteredCards;
}

// Non-maximum suppression to remove overlapping detections
function nonMaximumSuppression(detections, overlapThreshold) {
    if (detections.length === 0) return [];
    
    // Sort by confidence (highest first)
    detections.sort((a, b) => b.confidence - a.confidence);
    
    const kept = [];
    const suppressed = new Set();
    
    for (let i = 0; i < detections.length; i++) {
        if (suppressed.has(i)) continue;
        
        const current = detections[i];
        kept.push(current);
        
        // Suppress overlapping detections
        for (let j = i + 1; j < detections.length; j++) {
            if (suppressed.has(j)) continue;
            
            const other = detections[j];
            const overlap = calculateOverlap(current, other);
            
            if (overlap > overlapThreshold) {
                suppressed.add(j);
            }
        }
    }
    
    return kept;
}

// Calculate overlap between two bounding boxes
function calculateOverlap(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    if (x2 <= x1 || y2 <= y1) return 0;
    
    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;
    
    return intersection / union;
}

// Recognize card details (level, limit break) from detected cards
async function recognizeCardDetails(screenshot, detectedCards) {
    const results = [];
    
    for (let i = 0; i < detectedCards.length; i++) {
        const detection = detectedCards[i];
        updateRecognitionProgress(50 + (i / detectedCards.length) * 30, 
                                 `Processing card ${i + 1}/${detectedCards.length}...`);
        
        try {
            // Extract card region with padding for level text
            const cardRegion = extractCardRegion(screenshot, detection);
            
            // Recognize level text
            const level = await recognizeCardLevel(cardRegion);
            
            // Detect limit break level
            const limitBreak = detectLimitBreakLevel(cardRegion);
            
            results.push({
                cardId: detection.cardId,
                card: detection.card,
                confidence: detection.confidence,
                level: level || 1,
                limitBreak: limitBreak || 0,
                boundingBox: {
                    x: detection.x,
                    y: detection.y,
                    width: detection.width,
                    height: detection.height
                }
            });
            
            cardRegion.delete();
            
        } catch (error) {
            console.warn(`Failed to process card ${detection.cardId}:`, error);
        }
    }
    
    return results;
}

// Extract card region from screenshot
function extractCardRegion(screenshot, detection) {
    // Add padding around detected card for level text
    const padding = 20;
    const x = Math.max(0, detection.x - padding);
    const y = Math.max(0, detection.y - padding);
    const width = Math.min(screenshot.cols - x, detection.width + padding * 2);
    const height = Math.min(screenshot.rows - y, detection.height + padding * 2);
    
    const rect = new cv.Rect(x, y, width, height);
    const cardRegion = screenshot.roi(rect);
    
    return cardRegion;
}

// Recognize level text using OCR
async function recognizeCardLevel(cardRegion) {
    try {
        // Convert to canvas for Tesseract
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = cardRegion.cols;
        canvas.height = cardRegion.rows;
        
        // Convert OpenCV Mat to ImageData
        const imageData = new ImageData(
            new Uint8ClampedArray(cardRegion.data),
            cardRegion.cols,
            cardRegion.rows
        );
        
        ctx.putImageData(imageData, 0, 0);
        
        // Extract likely level text region (top-right area)
        const levelCanvas = document.createElement('canvas');
        const levelCtx = levelCanvas.getContext('2d');
        
        const regionWidth = Math.min(100, canvas.width * 0.4);
        const regionHeight = Math.min(30, canvas.height * 0.2);
        const regionX = canvas.width - regionWidth;
        const regionY = 0;
        
        levelCanvas.width = regionWidth;
        levelCanvas.height = regionHeight;
        
        levelCtx.drawImage(canvas, regionX, regionY, regionWidth, regionHeight, 0, 0, regionWidth, regionHeight);
        
        // Enhance for OCR
        const enhancedImageData = levelCtx.getImageData(0, 0, regionWidth, regionHeight);
        enhanceForOCR(enhancedImageData);
        levelCtx.putImageData(enhancedImageData, 0, 0);
        
        // Run OCR
        const { data: { text } } = await tesseractWorker.recognize(levelCanvas);
        
        // Parse level from text
        const level = parseLevelFromText(text);
        return level;
        
    } catch (error) {
        console.warn('OCR failed for level recognition:', error);
        return null;
    }
}

// Enhance image for better OCR accuracy
function enhanceForOCR(imageData) {
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        
        // Increase contrast
        const enhanced = gray > 128 ? 255 : 0;
        
        data[i] = enhanced;     // R
        data[i + 1] = enhanced; // G
        data[i + 2] = enhanced; // B
        // Alpha stays the same
    }
}

// Parse level number from OCR text
function parseLevelFromText(text) {
    // Clean up text
    const cleaned = text.replace(/[^0-9LvlLV\s]/g, '').trim();
    
    // Look for patterns like "Lvl 30", "LV 45", or just "30"
    const patterns = [
        /Lvl\s*(\d+)/i,
        /LV\s*(\d+)/i,
        /(\d+)/
    ];
    
    for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
            const level = parseInt(match[1]);
            if (level >= 1 && level <= 50) {
                return level;
            }
        }
    }
    
    return null;
}

// Detect limit break level by counting crystals
function detectLimitBreakLevel(cardRegion) {
    try {
        // Extract bottom region where crystals appear
        const bottomHeight = Math.min(20, Math.floor(cardRegion.rows * 0.2));
        const bottomY = cardRegion.rows - bottomHeight;
        
        const rect = new cv.Rect(0, bottomY, cardRegion.cols, bottomHeight);
        const bottomRegion = cardRegion.roi(rect);
        
        // Convert to HSV for blue color detection
        const hsv = new cv.Mat();
        cv.cvtColor(bottomRegion, hsv, cv.COLOR_RGB2HSV);
        
        // Define blue range for crystals
        const lowerBlue = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [100, 50, 50, 0]);
        const upperBlue = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [130, 255, 255, 255]);
        
        // Create mask for blue regions
        const mask = new cv.Mat();
        cv.inRange(hsv, lowerBlue, upperBlue, mask);
        
        // Find contours (connected components)
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        // Count significant contours (potential crystals)
        let crystalCount = 0;
        const minArea = 10; // Minimum area for a crystal
        
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            if (area > minArea) {
                crystalCount++;
            }
        }
        
        // Clean up
        bottomRegion.delete();
        hsv.delete();
        lowerBlue.delete();
        upperBlue.delete();
        mask.delete();
        contours.delete();
        hierarchy.delete();
        
        // Limit to valid range (0-4)
        return Math.min(4, Math.max(0, crystalCount));
        
    } catch (error) {
        console.warn('Limit break detection failed:', error);
        return 0;
    }
}

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
            console.log('Card recognition system ready');
        }
    }, 2000);
});