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
function openHelpModal() {
    const modal = document.getElementById('helpModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Render initial help content
    renderHelpContent(currentHelpSection);
    
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
function navigateToHelpSection(sectionId) {
    currentHelpSection = sectionId;
    
    // Update active navigation item
    document.querySelectorAll('.help-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
    
    // Render new content
    renderHelpContent(sectionId);
}

// Render help content based on section
function renderHelpContent(sectionId) {
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
        
        // Generate content based on section
        sectionElement.innerHTML = generateHelpSectionContent(sectionId);
        contentContainer.appendChild(sectionElement);
    }
    
    // Show the selected section
    sectionElement.classList.add('active');
}

// Generate help section content
function generateHelpSectionContent(sectionId) {
    switch (sectionId) {
        case 'welcome':
            return generateWelcomeContent();
        case 'filtering':
            return generateFilteringContent();
        case 'sorting':
            return generateSortingContent();
        case 'comparison':
            return generateComparisonContent();
        case 'collection':
            return generateCollectionContent();
        case 'tips':
            return generateTipsContent();
        default:
            return '<p>Content not found for this section.</p>';
    }
}

// Generate welcome content
function generateWelcomeContent() {
    return `
        <h3>Welcome to the Uma Musume Support Card Tracker</h3>
        
        <p>This powerful tool helps you manage and analyze your support card collection with advanced filtering, sorting, and comparison features.</p>
        
        <div class="help-image-placeholder">
            📷 App Overview Screenshot
            <br><small>Main interface showing card table and controls</small>
        </div>
        
        <h4>Key Features</h4>
        <ul>
            <li><strong>Card Collection Management:</strong> Track owned cards with levels and limit breaks</li>
            <li><strong>Advanced Filtering:</strong> Filter by rarity, type, effects, skills, and more</li>
            <li><strong>Multi-Layer Sorting:</strong> Sort by multiple criteria with customizable priority</li>
            <li><strong>Card Comparison:</strong> Side-by-side comparison of multiple cards</li>
            <li><strong>Data Import/Export:</strong> Backup and share your collection data</li>
            <li><strong>Dark Mode:</strong> Comfortable viewing in any lighting condition</li>
        </ul>
        
        <div class="help-tip">
            <strong>💡 Getting Started:</strong> Click on any card row to view detailed information, or use the comparison mode to select multiple cards for analysis.
        </div>
        
        <h4>Navigation Guide</h4>
        <div class="help-grid">
            <div class="help-grid-item">
                <h5>📋 Filtering</h5>
                <p>Learn how to filter cards by various criteria</p>
            </div>
            <div class="help-grid-item">
                <h5>🔀 Sorting</h5>
                <p>Master the multi-layer sorting system</p>
            </div>
            <div class="help-grid-item">
                <h5>⚖️ Comparison</h5>
                <p>Compare multiple cards side-by-side</p>
            </div>
            <div class="help-grid-item">
                <h5>💾 Collection</h5>
                <p>Manage your card ownership and levels</p>
            </div>
            <div class="help-grid-item">
                <h5>🎯 Tips & Tricks</h5>
                <p>Discover advanced workflows and shortcuts</p>
            </div>
        </div>
        
        <div class="help-highlight">
            <strong>🌙 Dark Mode Available:</strong> Toggle between light and dark themes using the button in the top-right corner for comfortable viewing.
        </div>
    `;
}

// Generate filtering content
function generateFilteringContent() {
    return `
        <h3>Filtering System</h3>
        
        <p>The filtering system allows you to narrow down the card list using various criteria. Filters are located in the left sidebar and update results in real-time.</p>
        
        <h4>Basic Filters</h4>
        
        <div class="help-steps">
            <div class="help-step">
                <strong>Rarity Filter:</strong> Select one or more rarities (R, SR, SSR) to show only cards of those rarities.
                <div class="help-image-placeholder">
                    📷 Rarity filter dropdown screenshot
                </div>
            </div>
            
            <div class="help-step">
                <strong>Type Filter:</strong> Filter by card types (Speed, Stamina, Power, Guts, Wit, Friend).
                <div class="help-image-placeholder">
                    📷 Type filter dropdown screenshot
                </div>
            </div>
            
            <div class="help-step">
                <strong>Ownership Filter:</strong> Show all cards, owned only, or unowned only.
            </div>
            
            <div class="help-step">
                <strong>Name Search:</strong> Type character names to search for specific cards.
            </div>
            
            <div class="help-step">
                <strong>Release Filter:</strong> Toggle to include cards not yet released in English.
            </div>
        </div>
        
        <h4>Level Display Options</h4>
        <p>Control how card levels are displayed and calculated:</p>
        
        <ul>
            <li><strong>Set All LB:</strong> Override all cards to use the same limit break level for comparison</li>
            <li><strong>Apply to Owned:</strong> Whether the global LB setting affects your owned cards</li>
            <li><strong>Show Max Potential:</strong> Display effect values at maximum level instead of current level</li>
        </ul>
        
        <div class="help-image-placeholder">
            📷 Level display options screenshot
        </div>
        
        <h4>Advanced Filters</h4>
        <p>Click "Advanced Filters" to access more sophisticated filtering options:</p>
        
        <ul>
            <li><strong>Effect Filters:</strong> Set minimum values for specific card effects</li>
            <li><strong>Skill Filters:</strong> Filter by specific hint skills or event skills</li>
            <li><strong>Skill Type Filters:</strong> Include or exclude cards with certain skill types (pacer, debuff, etc.)</li>
        </ul>
        
        <div class="help-tip">
            <strong>💡 Pro Tip:</strong> Use effect filters with "Show Max Potential" enabled to find cards with the highest possible values at their maximum levels.
        </div>
        
        <h4>Active Filters Display</h4>
        <p>When filters are active, you'll see:</p>
        <ul>
            <li>A results count showing how many cards match your filters</li>
            <li>Filter chips showing which filters are active</li>
            <li>Click the "×" on any chip to remove that specific filter</li>
        </ul>
        
        <div class="help-image-placeholder">
            📷 Active filters and chips screenshot
        </div>
    `;
}

// Generate sorting content
function generateSortingContent() {
    return `
        <h3>Sorting System</h3>
        
        <p>The app features both simple column sorting and advanced multi-layer sorting for complex card analysis.</p>
        
        <h4>Column Sorting</h4>
        <p>Click on any sortable column header to sort by that criteria:</p>
        
        <div class="help-image-placeholder">
            📷 Column headers with sort arrows screenshot
        </div>
        
        <ul>
            <li>🔤 <strong>Card Name:</strong> Alphabetical by character name</li>
            <li>⭐ <strong>Rarity:</strong> R → SR → SSR</li>
            <li>🎯 <strong>Type:</strong> Alphabetical by type</li>
            <li>📅 <strong>Release Date:</strong> Chronological order</li>
        </ul>
        
        <div class="help-tip">
            <strong>💡 Quick Tip:</strong> Click the same column header again to reverse the sort direction (ascending ↔ descending).
        </div>
        
        <h4>Multi-Layer Sorting</h4>
        <p>For advanced analysis, use the multi-layer sort system in the sidebar:</p>
        
        <div class="help-steps">
            <div class="help-step">
                <strong>Add Sort Layer:</strong> Click "+ Add Sort Layer" to create a new sorting criteria.
                <div class="help-image-placeholder">
                    📷 Add sort layer button screenshot
                </div>
            </div>
            
            <div class="help-step">
                <strong>Choose Category:</strong> Select what to sort by (Effect, Level, Ownership, etc.).
            </div>
            
            <div class="help-step">
                <strong>Select Options:</strong> For effects and skill types, choose specific values to sort by.
            </div>
            
            <div class="help-step">
                <strong>Set Direction:</strong> Choose ascending (↑) or descending (↓) order.
            </div>
            
            <div class="help-step">
                <strong>Arrange Priority:</strong> Use ↑ and ↓ buttons to reorder sort layers. Top layers have highest priority.
            </div>
        </div>
        
        <h4>Sort Categories</h4>
        <div class="help-grid">
            <div class="help-grid-item">
                <h5>📊 Effect</h5>
                <p>Sort by specific effect values (Speed+, Stamina+, etc.)</p>
            </div>
            <div class="help-grid-item">
                <h5>📈 Level</h5>
                <p>Sort by current or effective card level</p>
            </div>
            <div class="help-grid-item">
                <h5>✅ Ownership</h5>
                <p>Sort by owned vs unowned status</p>
            </div>
            <div class="help-grid-item">
                <h5>🎲 Skill Count</h5>
                <p>Sort by number of hint or event skills</p>
            </div>
            <div class="help-grid-item">
                <h5>🏷️ Skill Type Count</h5>
                <p>Sort by count of specific skill types</p>
            </div>
        </div>
        
        <div class="help-highlight">
            <strong>🔄 Sort Priority:</strong> Sorts are applied in order from top to bottom. Cards equal in the first criteria are sorted by the second, and so on.
        </div>
        
        <h4>Sort Examples</h4>
        <ul>
            <li><strong>Find Best Speed Cards:</strong> Sort by Speed+ effect (descending), then by rarity (descending)</li>
            <li><strong>Prioritize Owned Cards:</strong> Sort by ownership (descending), then by level (descending)</li>
            <li><strong>Skill Analysis:</strong> Sort by hint skill count (descending), then by specific skill types</li>
        </ul>
    `;
}

// Generate comparison content
function generateComparisonContent() {
    return `
        <h3>Card Comparison System</h3>
        
        <p>Compare multiple cards side-by-side to analyze their stats, effects, and skills.</p>
        
        <h4>Enabling Comparison Mode</h4>
        
        <div class="help-steps">
            <div class="help-step">
                <strong>Toggle Comparison Mode:</strong> Check "Select cards to compare" above the card table.
                <div class="help-image-placeholder">
                    📷 Comparison mode toggle screenshot
                </div>
            </div>
            
            <div class="help-step">
                <strong>Selection Changes:</strong> The table will show visual indicators and a selection sidebar will appear.
            </div>
            
            <div class="help-step">
                <strong>Form Controls Disabled:</strong> Ownership and level controls are disabled to prevent accidental changes during comparison.
            </div>
        </div>
        
        <h4>Selecting Cards</h4>
        
        <ul>
            <li>Click on any card row to add it to your selection</li>
            <li>Selected cards will be highlighted in blue</li>
            <li>The selection sidebar shows all selected cards</li>
            <li>Click the "×" button on any selected card to remove it</li>
        </ul>
        
        <div class="help-image-placeholder">
            📷 Selected cards in comparison mode screenshot
        </div>
        
        <h4>Viewing Comparison</h4>
        
        <div class="help-steps">
            <div class="help-step">
                <strong>Start Comparison:</strong> Click "Compare Cards" button when you have cards selected.
            </div>
            
            <div class="help-step">
                <strong>Comparison Table:</strong> A detailed comparison table appears above the main table.
                <div class="help-image-placeholder">
                    📷 Comparison table screenshot
                </div>
            </div>
            
            <div class="help-step">
                <strong>Collapsible Sections:</strong> Click section headers to expand/collapse different categories.
            </div>
        </div>
        
        <h4>Comparison Sections</h4>
        
        <ul>
            <li><strong>Basic Information:</strong> Level and ownership status</li>
            <li><strong>Effects:</strong> All card effects with highest values highlighted 🏆</li>
            <li><strong>Hint Skills:</strong> All hint skills with checkmarks for presence</li>
            <li><strong>Event Skills:</strong> All event skills with checkmarks for presence</li>
        </ul>
        
        <div class="help-tip">
            <strong>💡 Filter Highlighting:</strong> Skills and skill types that match your current filters are highlighted in the comparison table.
        </div>
        
        <h4>Comparison Features</h4>
        
        <ul>
            <li><strong>Highest Value Indicators:</strong> 🏆 symbol marks the highest effect values</li>
            <li><strong>Skill Presence:</strong> ✓ for skills the card has, ✗ for skills it doesn't</li>
            <li><strong>Filter Integration:</strong> Highlighted rows show skills matching your active filters</li>
            <li><strong>Level Consideration:</strong> Effect values calculated using each card's current level</li>
        </ul>
        
        <div class="help-warning">
            <strong>⚠️ Note:</strong> While in comparison mode, you cannot modify card ownership or levels. Toggle off comparison mode to make changes.
        </div>
        
        <h4>Comparison Actions</h4>
        
        <ul>
            <li><strong>Clear All:</strong> Remove all cards from comparison</li>
            <li><strong>Close:</strong> Hide the comparison table</li>
            <li><strong>Add More Cards:</strong> Continue selecting cards while comparison is active</li>
        </ul>
    `;
}

// Generate collection content
function generateCollectionContent() {
    return `
        <h3>Collection Management</h3>
        
        <p>Track your owned cards, set their levels and limit breaks, and manage your collection data.</p>
        
        <h4>Adding Cards to Collection</h4>
        
        <div class="help-steps">
            <div class="help-step">
                <strong>Mark as Owned:</strong> Check the checkbox in the "Owned" column for any card you own.
                <div class="help-image-placeholder">
                    📷 Ownership checkbox screenshot
                </div>
            </div>
            
            <div class="help-step">
                <strong>Automatic Defaults:</strong> New owned cards default to Level 30 (LB 2).
            </div>
            
            <div class="help-step">
                <strong>Visual Changes:</strong> Owned cards get a green highlight and updated controls.
            </div>
        </div>
        
        <h4>Setting Levels and Limit Breaks</h4>
        
        <p>For each owned card, you can set:</p>
        
        <ul>
            <li><strong>Current Level:</strong> The card's current level (affects effect calculations)</li>
            <li><strong>Limit Break:</strong> Current limit break level (LB 0-4)</li>
        </ul>
        
        <div class="help-image-placeholder">
            📷 Level and LB controls screenshot
        </div>
        
        <div class="help-tip">
            <strong>💡 Level Validation:</strong> The app automatically prevents setting levels higher than the current limit break allows.
        </div>
        
        <h4>Detailed Card Management</h4>
        <p>Click any card to open the detailed view where you can:</p>
        
        <ul>
            <li>Toggle ownership status</li>
            <li>Set precise levels with validation</li>
            <li>Adjust limit break levels</li>
            <li>View calculated effect values at current level</li>
        </ul>
        
        <div class="help-image-placeholder">
            📷 Card detail modal screenshot
        </div>
        
        <h4>Global Level Controls</h4>
        <p>Use the "Level Display Options" in the sidebar for analysis:</p>
        
        <div class="help-grid">
            <div class="help-grid-item">
                <h5>🔧 Set All LB</h5>
                <p>Override all cards to use the same limit break level for comparison purposes.</p>
            </div>
            <div class="help-grid-item">
                <h5>👤 Apply to Owned</h5>
                <p>Choose whether the global LB setting affects your owned cards or uses their individual levels.</p>
            </div>
            <div class="help-grid-item">
                <h5>📈 Max Potential</h5>
                <p>Show effect values at maximum level for each card's current limit break.</p>
            </div>
        </div>
        
        <h4>Data Management</h4>
        <p>Protect and share your collection data:</p>
        
        <div class="help-steps">
            <div class="help-step">
                <strong>Export Collection:</strong> Download your owned cards data as a JSON file.
                <div class="help-image-placeholder">
                    📷 Data management buttons screenshot
                </div>
            </div>
            
            <div class="help-step">
                <strong>Import Collection:</strong> Load previously exported collection data.
            </div>
            
            <div class="help-step">
                <strong>Clear Collection:</strong> Remove all ownership data (with confirmation).
            </div>
        </div>
        
        <div class="help-highlight">
            <strong>💾 Auto-Save:</strong> All changes to your collection are automatically saved to your browser's local storage.
        </div>
        
        <h4>Collection Analysis</h4>
        <p>Use filters and sorting to analyze your collection:</p>
        
        <ul>
            <li>Filter by "Owned Only" to see just your cards</li>
            <li>Sort by level to identify cards that need upgrading</li>
            <li>Use effect filters to find your strongest cards</li>
            <li>Compare multiple owned cards to optimize team building</li>
        </ul>
        
        <div class="help-warning">
            <strong>⚠️ Browser Data:</strong> Collection data is stored in your browser. Clearing browser data or using incognito mode will not persist your collection.
        </div>
    `;
}

// Generate tips content
function generateTipsContent() {
    return `
        <h3>Tips & Tricks</h3>
        
        <p>Master the Support Card Tracker with these advanced techniques and workflow tips.</p>
        
        <h4>Keyboard Shortcuts</h4>
        <div class="help-grid">
            <div class="help-grid-item">
                <h5>Modal Navigation</h5>
                <div class="help-shortcut">←</div> <div class="help-shortcut">→</div> Navigate between cards in modal<br>
                <div class="help-shortcut">Esc</div> Close any modal
            </div>
            <div class="help-grid-item">
                <h5>Theme Toggle</h5>
                <div class="help-shortcut">Click 🌙/☀️</div> Toggle dark/light mode
            </div>
        </div>
        
        <h4>Efficient Workflows</h4>
        
        <div class="help-steps">
            <div class="help-step">
                <strong>Team Building Analysis:</strong>
                <ul>
                    <li>Filter by specific effect types you need</li>
                    <li>Sort by effect values (descending) to find the best cards</li>
                    <li>Use comparison mode to evaluate multiple candidates</li>
                    <li>Consider both owned and unowned cards for future planning</li>
                </ul>
            </div>
            
            <div class="help-step">
                <strong>Collection Progress Tracking:</strong>
                <ul>
                    <li>Filter by "Unowned Only" to see missing cards</li>
                    <li>Sort by rarity and release date to prioritize acquisitions</li>
                    <li>Use skill filters to identify key missing skills</li>
                </ul>
            </div>
            
            <div class="help-step">
                <strong>Level Planning:</strong>
                <ul>
                    <li>Enable "Show Max Potential" to see upgrade potential</li>
                    <li>Sort owned cards by level to identify upgrade priorities</li>
                    <li>Use global LB settings to plan for future limit breaks</li>
                </ul>
            </div>
        </div>
        
        <h4>Advanced Filter Combinations</h4>
        
        <ul>
            <li><strong>Speed Team Building:</strong> Type = Speed + Effect filter for Speed+ ≥ 10 + Skill type = "Front"</li>
            <li><strong>Stamina Powerhouses:</strong> Rarity = SSR + Effect filter for Stamina+ ≥ 15 + Sort by Stamina+ descending</li>
            <li><strong>Versatile Cards:</strong> Multiple sort layers: Hint skill count (desc) → Event skill count (desc) → Level (desc)</li>
            <li><strong>Missing Key Skills:</strong> Ownership = Unowned + Include skill types = "Leader" or "Debuff resist"</li>
        </ul>
        
        <h4>Data Analysis Tips</h4>
        
        <div class="help-tip">
            <strong>💡 Pro Tip:</strong> Use the comparison system with max potential enabled to see which cards have the highest growth potential when fully upgraded.
        </div>
        
        <ul>
            <li><strong>Effect Value Analysis:</strong> Compare cards at the same limit break level for fair analysis</li>
            <li><strong>Skill Coverage:</strong> Use skill type filters to identify gaps in your collection</li>
            <li><strong>Release Planning:</strong> Enable "Show Unreleased" to plan for future cards</li>
            <li><strong>Investment Priority:</strong> Sort owned cards by effect potential to prioritize upgrades</li>
        </ul>
        
        <h4>Performance Tips</h4>
        
        <ul>
            <li>Use specific filters to reduce the number of visible cards for faster browsing</li>
            <li>Clear unnecessary filters when not needed</li>
            <li>Export your collection regularly as backup</li>
            <li>Use dark mode for comfortable extended sessions</li>
        </ul>
        
        <h4>Troubleshooting</h4>
        
        <div class="help-warning">
            <strong>⚠️ Common Issues:</strong>
            <ul>
                <li><strong>Controls disabled:</strong> Check if comparison mode is active</li>
                <li><strong>Cards not updating:</strong> Verify global level settings aren't overriding individual card levels</li>
                <li><strong>Missing data:</strong> Try refreshing the page if cards don't load</li>
                <li><strong>Lost collection:</strong> Import your exported backup file</li>
            </ul>
        </div>
        
        <h4>Best Practices</h4>
        
        <ul>
            <li><strong>Regular Backups:</strong> Export your collection data monthly</li>
            <li><strong>Consistent Levels:</strong> Keep card levels updated as you upgrade them</li>
            <li><strong>Filter Management:</strong> Clear filters between different analysis sessions</li>
            <li><strong>Comparison Workflow:</strong> Use comparison mode for specific analysis, then toggle off for general browsing</li>
        </ul>
        
        <div class="help-highlight">
            <strong>🎯 Remember:</strong> The tracker is most powerful when you maintain accurate ownership and level data. Take a few minutes to update your collection after each game session!
        </div>
    `;
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
                English Release: ${card.release_en || 'Not Released'}<br>
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