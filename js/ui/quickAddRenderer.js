// Quick Add Renderer
// DOM creation for setup screen & card-by-card view, display updates

// ===== SETUP SCREEN =====

function renderQuickAddSetup() {
    const overlay = document.getElementById('quickAddOverlay');
    if (!overlay) return;

    const typeIconFiles = {
        speed: 'support_card_images/utx_ico_obtain_00.png',
        stamina: 'support_card_images/utx_ico_obtain_01.png',
        power: 'support_card_images/utx_ico_obtain_02.png',
        guts: 'support_card_images/utx_ico_obtain_03.png',
        intelligence: 'support_card_images/utx_ico_obtain_04.png',
        friend: 'support_card_images/utx_ico_obtain_05.png'
    };

    const typeLabels = {
        speed: 'Speed',
        stamina: 'Stamina',
        power: 'Power',
        guts: 'Guts',
        intelligence: 'Wit',
        friend: 'Friend'
    };

    const rarityLabels = { 1: 'R', 2: 'SR', 3: 'SSR' };

    overlay.innerHTML = `
        <div class="quick-add-header">
            <button class="quick-add-cancel-btn" id="qaCancelBtn" aria-label="Cancel and revert all changes">&times;</button>
            <span class="quick-add-header-title">Quick Add Cards</span>
            <button class="quick-add-confirm-btn" id="qaConfirmBtn" aria-label="Save and close">&#10003;</button>
        </div>
        <div class="quick-add-setup" id="qaSetupScreen">
            <div class="quick-add-setup-panel">
                <div class="quick-add-setup-section">
                    <label>Region</label>
                    <div class="quick-add-icon-grid" id="qaRegionGrid">
                        <button class="quick-add-icon-btn selected" data-region="global" aria-label="Global" aria-pressed="true">
                            Global
                        </button>
                        <button class="quick-add-icon-btn" data-region="jp" aria-label="JP" aria-pressed="false">
                            JP
                        </button>
                    </div>
                </div>

                <div class="quick-add-setup-section">
                    <label>Card Types</label>
                    <div class="quick-add-icon-grid" id="qaTypeGrid">
                        ${['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'].map(type =>
                            `<button class="quick-add-icon-btn selected" data-type="${type}" aria-label="${typeLabels[type]}" aria-pressed="true">
                                <img class="quick-add-type-icon" src="${typeIconFiles[type]}" alt="${typeLabels[type]}"> ${typeLabels[type]}
                            </button>`
                        ).join('')}
                    </div>
                    <div class="quick-add-bulk-btns">
                        <button class="quick-add-bulk-btn" id="qaTypeSelectAll">Select All</button>
                        <button class="quick-add-bulk-btn" id="qaTypeDeselectAll">Deselect All</button>
                    </div>
                </div>

                <div class="quick-add-setup-section">
                    <label>Rarity</label>
                    <div class="quick-add-icon-grid" id="qaRarityGrid">
                        ${[1, 2, 3].map(r =>
                            `<button class="quick-add-icon-btn selected${r === 3 ? ' rainbow-border' : ''}" data-rarity="${r}" aria-label="${rarityLabels[r]}" aria-pressed="true">
                                <img class="quick-add-rarity-icon" src="support_card_images/utx_txt_rarity_0${r}.png" alt="${rarityLabels[r]}"> ${rarityLabels[r]}
                            </button>`
                        ).join('')}
                    </div>
                    <div class="quick-add-bulk-btns">
                        <button class="quick-add-bulk-btn" id="qaRaritySelectAll">Select All</button>
                        <button class="quick-add-bulk-btn" id="qaRarityDeselectAll">Deselect All</button>
                    </div>
                </div>

                <div class="quick-add-setup-section">
                    <label for="qaOwnershipFilter">Show</label>
                    <select id="qaOwnershipFilter">
                        <option value="all">All Cards</option>
                        <option value="owned">Owned Only</option>
                        <option value="unowned">Unowned Only</option>
                    </select>
                </div>

                <div class="quick-add-setup-section">
                    <label for="qaSortOrder">Sort</label>
                    <select id="qaSortOrder">
                        <option value="alpha">Alphabetical</option>
                        <option value="type">By Type</option>
                        <option value="rarity">By Rarity</option>
                        <option value="release">By Release Date</option>
                    </select>
                </div>

                <div class="quick-add-card-count" id="qaCardCount">
                    <strong>${getQuickAddCardCount()}</strong> cards match
                </div>

                <button class="quick-add-start-btn" id="qaStartBtn" ${getQuickAddCardCount() === 0 ? 'disabled' : ''}>
                    START
                </button>
            </div>
        </div>
        <div class="quick-add-card-view" id="qaCardView"></div>
    `;

    // Wire setup events
    wireQuickAddSetupEvents();
}

function wireQuickAddSetupEvents() {
    // Cancel / Confirm buttons
    document.getElementById('qaCancelBtn')?.addEventListener('click', cancelQuickAdd);
    document.getElementById('qaConfirmBtn')?.addEventListener('click', closeQuickAdd);

    // Region toggles
    document.querySelectorAll('#qaRegionGrid .quick-add-icon-btn').forEach(btn => {
        btn.addEventListener('click', () => setQuickAddRegion(btn.dataset.region));
    });

    // Type toggles
    document.querySelectorAll('#qaTypeGrid .quick-add-icon-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleQuickAddType(btn.dataset.type));
    });

    // Rarity toggles
    document.querySelectorAll('#qaRarityGrid .quick-add-icon-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleQuickAddRarity(parseInt(btn.dataset.rarity)));
    });

    // Bulk buttons
    document.getElementById('qaTypeSelectAll')?.addEventListener('click', selectAllQuickAddTypes);
    document.getElementById('qaTypeDeselectAll')?.addEventListener('click', deselectAllQuickAddTypes);
    document.getElementById('qaRaritySelectAll')?.addEventListener('click', selectAllQuickAddRarities);
    document.getElementById('qaRarityDeselectAll')?.addEventListener('click', deselectAllQuickAddRarities);

    // Dropdowns
    document.getElementById('qaOwnershipFilter')?.addEventListener('change', e => setQuickAddOwnershipFilter(e.target.value));
    document.getElementById('qaSortOrder')?.addEventListener('change', e => setQuickAddSortOrder(e.target.value));

    // Start button
    document.getElementById('qaStartBtn')?.addEventListener('click', startQuickAddCards);
}

// ===== SETUP UI UPDATE =====

function updateQuickAddSetupUI() {
    // Update region buttons
    document.querySelectorAll('#qaRegionGrid .quick-add-icon-btn').forEach(btn => {
        const selected = btn.dataset.region === quickAddState.region;
        btn.classList.toggle('selected', selected);
        btn.setAttribute('aria-pressed', selected);
    });

    // Update type buttons
    document.querySelectorAll('#qaTypeGrid .quick-add-icon-btn').forEach(btn => {
        const selected = quickAddState.selectedTypes.includes(btn.dataset.type);
        btn.classList.toggle('selected', selected);
        btn.setAttribute('aria-pressed', selected);
    });

    // Update rarity buttons
    document.querySelectorAll('#qaRarityGrid .quick-add-icon-btn').forEach(btn => {
        const selected = quickAddState.selectedRarities.includes(parseInt(btn.dataset.rarity));
        btn.classList.toggle('selected', selected);
        btn.setAttribute('aria-pressed', selected);
    });

    // Update card count
    const count = getQuickAddCardCount();
    const countEl = document.getElementById('qaCardCount');
    if (countEl) {
        countEl.innerHTML = `<strong>${count}</strong> cards match`;
    }

    // Update start button
    const startBtn = document.getElementById('qaStartBtn');
    if (startBtn) {
        startBtn.disabled = count === 0;
    }
}

// ===== CARD VIEW =====

function renderQuickAddCardView() {
    const setupScreen = document.getElementById('qaSetupScreen');
    const cardView = document.getElementById('qaCardView');
    if (!setupScreen || !cardView) return;

    setupScreen.style.display = 'none';
    cardView.classList.add('active');

    cardView.innerHTML = `
        <div class="quick-add-card-content">
            <div class="quick-add-image-panel">
                <button class="quick-add-nav-btn quick-add-nav-prev" id="qaNavPrev" aria-label="Previous card">&#8249;</button>
                <img class="quick-add-card-image" id="qaCardImage" src="" alt="Card image">
                <div class="quick-add-card-image-fallback" id="qaCardImageFallback" style="display:none;">No Image</div>
                <button class="quick-add-nav-btn quick-add-nav-next" id="qaNavNext" aria-label="Next card">&#8250;</button>
            </div>
            <div class="quick-add-control-panel">
                <div class="quick-add-card-info">
                    <div class="quick-add-card-name" id="qaCardName"></div>
                    <div class="quick-add-card-badges" id="qaCardBadges"></div>
                </div>

                <div class="quick-add-control-group">
                    <span class="quick-add-control-label">Owned</span>
                    <div class="quick-add-ownership-btns">
                        <button class="quick-add-own-btn" id="qaOwnYes">OWNED</button>
                        <button class="quick-add-own-btn" id="qaOwnNo">NOT OWNED</button>
                    </div>
                </div>

                <div class="quick-add-control-group">
                    <span class="quick-add-control-label">Limit Break</span>
                    <div class="quick-add-lb-btns" id="qaLBBtns">
                        ${[0,1,2,3,4].map(lb =>
                            `<button class="quick-add-lb-btn" data-lb="${lb}">
                                <span>${lb}</span>
                                <span class="lb-max-label" id="qaLBMax${lb}"></span>
                            </button>`
                        ).join('')}
                    </div>
                </div>

                <div class="quick-add-control-group">
                    <span class="quick-add-control-label">Level</span>
                    <div class="quick-add-level-row">
                        <button class="quick-add-level-step-btn" data-step="-5">-5</button>
                        <button class="quick-add-level-step-btn" data-step="-1">-1</button>
                        <input type="range" class="quick-add-level-slider" id="qaLevelSlider" min="1" max="50" value="30">
                        <button class="quick-add-level-step-btn" data-step="1">+1</button>
                        <button class="quick-add-level-step-btn" data-step="5">+5</button>
                        <input type="number" class="quick-add-level-input" id="qaLevelInput" min="1" max="50" value="30">
                    </div>
                    <div class="quick-add-level-range-info">
                        <span>Min: <span id="qaLevelMin">1</span></span>
                        <span>Max: <span id="qaLevelMax">50</span></span>
                    </div>
                </div>
            </div>
        </div>
        <div class="quick-add-footer">
            <div class="quick-add-progress-bar-container">
                <div class="quick-add-progress-bar">
                    <div class="quick-add-progress-fill" id="qaProgressFill"></div>
                </div>
                <span class="quick-add-progress-text" id="qaProgressText"></span>
            </div>
            <button class="quick-add-undo-btn" id="qaUndoBtn" disabled>Undo</button>
            <label class="quick-add-skip-toggle">
                <input type="checkbox" id="qaSkipOwned"> Skip Owned
            </label>
        </div>
    `;

    // Update header to show progress
    const headerTitle = document.querySelector('.quick-add-header-title');
    if (headerTitle) headerTitle.textContent = 'Quick Add Cards';

    wireQuickAddCardViewEvents();
}

function wireQuickAddCardViewEvents() {
    // Navigation
    document.getElementById('qaNavPrev')?.addEventListener('click', () => navigateQuickAdd(-1));
    document.getElementById('qaNavNext')?.addEventListener('click', () => navigateQuickAdd(1));

    // Ownership
    document.getElementById('qaOwnYes')?.addEventListener('click', () => quickAddSetOwnership(true));
    document.getElementById('qaOwnNo')?.addEventListener('click', () => quickAddSetOwnership(false));

    // Limit Break
    document.querySelectorAll('.quick-add-lb-btn').forEach(btn => {
        btn.addEventListener('click', () => quickAddSetLimitBreak(parseInt(btn.dataset.lb)));
    });

    // Level slider + input sync
    const slider = document.getElementById('qaLevelSlider');
    const input = document.getElementById('qaLevelInput');

    if (slider) {
        slider.addEventListener('input', () => {
            const val = parseInt(slider.value);
            if (input) input.value = val;
            quickAddSetLevel(val);
        });
    }

    if (input) {
        input.addEventListener('change', () => {
            let val = parseInt(input.value);
            const card = quickAddState.cards[quickAddState.currentIndex];
            if (card) {
                const currentLB = getOwnedCardLimitBreak(card.support_id) || 0;
                const maxLevel = limitBreaks[card.rarity][currentLB];
                val = Math.max(1, Math.min(val, maxLevel));
                input.value = val;
            }
            if (slider) slider.value = val;
            quickAddSetLevel(val);
        });
    }

    // Level step buttons (-5, -1, +1, +5)
    document.querySelectorAll('.quick-add-level-step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = quickAddState.cards[quickAddState.currentIndex];
            if (!card || !isCardOwned(card.support_id)) return;
            const currentLevel = getOwnedCardLevel(card.support_id) || 1;
            const step = parseInt(btn.dataset.step);
            const currentLB = getOwnedCardLimitBreak(card.support_id) || 0;
            const maxLevel = limitBreaks[card.rarity][currentLB];
            const newLevel = Math.max(1, Math.min(currentLevel + step, maxLevel));
            if (newLevel !== currentLevel) {
                quickAddSetLevel(newLevel);
            }
        });
    });

    // Undo
    document.getElementById('qaUndoBtn')?.addEventListener('click', quickAddUndo);

    // Skip owned
    document.getElementById('qaSkipOwned')?.addEventListener('change', e => setQuickAddSkipOwned(e.target.checked));

    // Cancel / Confirm buttons (re-wire since header persists)
    document.getElementById('qaCancelBtn')?.addEventListener('click', cancelQuickAdd);
    document.getElementById('qaConfirmBtn')?.addEventListener('click', closeQuickAdd);
}

// ===== RENDER CARD =====

function renderQuickAddCard(index) {
    const card = quickAddState.cards[index];
    if (!card) return;

    const cardId = card.support_id;

    // Card name — use region-appropriate name
    const nameEl = document.getElementById('qaCardName');
    if (nameEl) {
        nameEl.textContent = getQuickAddCardName(card) || 'Unknown';
    }

    // Card image — apply rarity border class
    const img = document.getElementById('qaCardImage');
    const fallback = document.getElementById('qaCardImageFallback');
    if (img) {
        img.className = `quick-add-card-image card-image rarity-${card.rarity}`;
        img.src = `support_card_images/${cardId}.png`;
        img.alt = getQuickAddCardName(card) || 'Card';
        img.style.display = '';
        img.onerror = () => {
            img.style.display = 'none';
            if (fallback) fallback.style.display = 'flex';
        };
        if (fallback) fallback.style.display = 'none';
    }

    // Badges
    const badgesEl = document.getElementById('qaCardBadges');
    if (badgesEl) {
        badgesEl.innerHTML = '';
        const rarityBadge = createRarityBadge(card.rarity);
        const typeBadge = createTypeBadge(card.type);
        badgesEl.appendChild(rarityBadge);
        badgesEl.appendChild(typeBadge);
    }

    // Update LB max labels
    for (let lb = 0; lb <= 4; lb++) {
        const maxLabel = document.getElementById(`qaLBMax${lb}`);
        if (maxLabel) {
            maxLabel.textContent = `Max ${limitBreaks[card.rarity][lb]}`;
        }
    }

    updateQuickAddCardControls();
    updateQuickAddProgress();
}

// ===== UPDATE CONTROLS FOR CURRENT CARD =====

function updateQuickAddCardControls() {
    const card = quickAddState.cards[quickAddState.currentIndex];
    if (!card) return;

    const cardId = card.support_id;
    const owned = isCardOwned(cardId);

    // Ownership buttons — explicitly coerce to boolean
    const isOwned = !!owned;
    const ownYes = document.getElementById('qaOwnYes');
    const ownNo = document.getElementById('qaOwnNo');
    if (ownYes) {
        ownYes.className = 'quick-add-own-btn' + (isOwned ? ' active-owned' : ' inactive');
    }
    if (ownNo) {
        ownNo.className = 'quick-add-own-btn' + (!isOwned ? ' active-unowned' : ' inactive');
    }

    // LB buttons
    const currentLB = owned ? (getOwnedCardLimitBreak(cardId) ?? 4) : 4;
    document.querySelectorAll('.quick-add-lb-btn').forEach(btn => {
        const lb = parseInt(btn.dataset.lb);
        btn.classList.toggle('active', lb === currentLB);
        btn.disabled = !owned;
    });

    // Level controls
    const currentLevel = owned ? (getOwnedCardLevel(cardId) ?? limitBreaks[card.rarity][currentLB]) : limitBreaks[card.rarity][currentLB];
    const maxLevel = limitBreaks[card.rarity][currentLB];
    const slider = document.getElementById('qaLevelSlider');
    const input = document.getElementById('qaLevelInput');
    const minSpan = document.getElementById('qaLevelMin');
    const maxSpan = document.getElementById('qaLevelMax');

    if (slider) {
        slider.min = 1;
        slider.max = maxLevel;
        slider.value = currentLevel;
        slider.disabled = !owned;
    }
    if (input) {
        input.min = 1;
        input.max = maxLevel;
        input.value = currentLevel;
        input.disabled = !owned;
    }
    if (minSpan) minSpan.textContent = '1';
    if (maxSpan) maxSpan.textContent = maxLevel;

    // Level step buttons
    document.querySelectorAll('.quick-add-level-step-btn').forEach(btn => {
        btn.disabled = !owned;
    });

    updateQuickAddUndoBtn();
}

// ===== SYNC LEVEL CONTROLS (without full refresh) =====

function syncQuickAddLevelControls(level) {
    const slider = document.getElementById('qaLevelSlider');
    const input = document.getElementById('qaLevelInput');
    if (slider) slider.value = level;
    if (input) input.value = level;
}

// ===== PROGRESS =====

function updateQuickAddProgress() {
    const total = quickAddState.cards.length;
    const current = quickAddState.currentIndex + 1;
    const pct = total > 0 ? (current / total) * 100 : 0;

    const fill = document.getElementById('qaProgressFill');
    const text = document.getElementById('qaProgressText');
    const headerProgress = document.querySelector('.quick-add-header-progress');

    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${current} / ${total}`;

    // Update header progress if it exists
    if (headerProgress) {
        headerProgress.textContent = `Card ${current} of ${total}`;
    }

    // Add progress to header if not present
    const header = document.querySelector('.quick-add-header');
    if (header && !headerProgress) {
        const span = document.createElement('span');
        span.className = 'quick-add-header-progress';
        span.textContent = `Card ${current} of ${total}`;
        // Insert before close button
        const closeBtn = document.getElementById('qaCloseBtn');
        if (closeBtn) {
            header.insertBefore(span, closeBtn);
        }
    }
}

// ===== UNDO BUTTON STATE =====

function updateQuickAddUndoBtn() {
    const btn = document.getElementById('qaUndoBtn');
    if (btn) {
        btn.disabled = quickAddState.changeHistory.length === 0;
    }
}

// ===== EXPORTS =====

window.QuickAddRenderer = {
    renderQuickAddSetup,
    renderQuickAddCardView,
    renderQuickAddCard,
    updateQuickAddSetupUI,
    updateQuickAddCardControls,
    syncQuickAddLevelControls,
    updateQuickAddProgress,
    updateQuickAddUndoBtn
};

Object.assign(window, window.QuickAddRenderer);
