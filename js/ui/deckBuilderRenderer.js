// Deck Builder Renderer
// Handles all DOM rendering for the MaNT Deck Builder tab

// ===== SHELL RENDERING =====

function renderDeckBuilderShell() {
    const container = document.getElementById('deckBuilderContainer');
    if (!container) return;

    container.innerHTML = `
        <!-- Deck Header -->
        <div class="deck-header" id="deckHeader">
            <span class="deck-header-label">Deck:</span>
            <select class="deck-select" id="deckSelect">
                <option value="default">New Deck</option>
            </select>
            <div class="deck-header-actions">
                <button class="btn btn-secondary" id="deckNewBtn">New</button>
                <button class="btn btn-secondary" id="deckRenameBtn">Rename</button>
                <button class="btn btn-danger" id="deckDeleteBtn">Delete</button>
            </div>
        </div>

        <!-- Card Slots -->
        <div class="deck-slots-container">
            <div class="deck-slots-label">Support Cards (5 + 1 Friend)</div>
            <div class="deck-slots" id="deckSlots">
                <!-- Rendered by renderDeckSlots() -->
            </div>
        </div>

        <!-- Deck Effects Summary -->
        <div class="deck-summary" id="deckSummary">
            <div class="deck-summary-title">Deck Effects Summary</div>
            <div class="deck-summary-empty" id="deckSummaryContent">Add cards to see aggregated effects.</div>
        </div>

        <!-- Training Sim Controls -->
        <div class="training-controls" id="trainingControls">
            <div class="training-control-group">
                <span class="training-control-label">Facility Level:</span>
                <div class="facility-level-btns" id="facilityLevelBtns">
                    <button class="facility-level-btn active" data-level="1">1</button>
                    <button class="facility-level-btn" data-level="2">2</button>
                    <button class="facility-level-btn" data-level="3">3</button>
                    <button class="facility-level-btn" data-level="4">4</button>
                    <button class="facility-level-btn" data-level="5">5</button>
                </div>
            </div>
            <div class="training-control-group">
                <span class="training-control-label">Mood:</span>
                <select class="mood-select" id="moodSelect">
                    <option value="very_good">Very Good (+20%)</option>
                    <option value="good">Good (+10%)</option>
                    <option value="normal">Normal (0%)</option>
                    <option value="bad">Bad (-10%)</option>
                    <option value="very_bad">Very Bad (-20%)</option>
                </select>
            </div>
            <label class="friendship-checkbox">
                <input type="checkbox" id="friendshipToggle" checked>
                Friendship Training active
            </label>
        </div>

        <!-- Training Breakdown -->
        <div class="training-breakdown" id="trainingBreakdown">
            <div class="training-breakdown-title">Training Breakdown</div>
            <div class="training-breakdown-empty" id="trainingBreakdownContent">Add cards to see training calculations.</div>
        </div>

        <!-- MaNT Scenario Tips -->
        <div class="scenario-info" id="scenarioInfo">
            <div class="scenario-info-title">MaNT (Make a New Track) Scenario Info</div>
            <div id="scenarioInfoContent">
                <!-- Rendered by renderScenarioInfo() -->
            </div>
        </div>
    `;

    // Initial renders
    renderDeckSlots();
    renderScenarioInfo({});
}

// ===== DECK SLOTS =====

function renderDeckSlots() {
    const slotsContainer = document.getElementById('deckSlots');
    if (!slotsContainer) return;

    slotsContainer.innerHTML = '';

    for (let i = 0; i < 6; i++) {
        const slotData = deckBuilderState.slots[i];
        const isFriend = i === 5;
        const slotEl = document.createElement('div');
        slotEl.className = `deck-slot${isFriend ? ' friend-slot' : ''}`;
        slotEl.dataset.slotIndex = i;
        slotEl.setAttribute('tabindex', '0');
        slotEl.setAttribute('role', 'button');
        slotEl.setAttribute('aria-label', slotData ? `Slot ${i + 1}: ${getSlotCardName(slotData)}` : `Add card to slot ${i + 1}`);

        if (isFriend) {
            const friendLabel = document.createElement('div');
            friendLabel.className = 'deck-slot-friend-label';
            friendLabel.textContent = 'Friend';
            slotEl.appendChild(friendLabel);
        }

        if (slotData) {
            slotEl.appendChild(renderFilledSlot(slotData, i, isFriend));
        } else {
            slotEl.appendChild(renderEmptySlot(isFriend));
        }

        // Click to open picker (on empty part or entire slot)
        slotEl.addEventListener('click', (e) => {
            if (e.target.closest('.deck-slot-remove') || e.target.closest('.deck-slot-friend-controls')) return;
            openCardPicker(i);
        });

        slotEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!e.target.closest('.deck-slot-remove') && !e.target.closest('.deck-slot-friend-controls')) {
                    openCardPicker(i);
                }
            }
        });

        slotsContainer.appendChild(slotEl);
    }
}

function getSlotCardName(slotData) {
    if (!slotData) return '';
    const card = cardData.find(c => c.support_id === slotData.cardId);
    return card ? (card.char_name || 'Unknown') : 'Unknown';
}

function renderEmptySlot(isFriend) {
    const empty = document.createElement('div');
    empty.className = 'deck-slot-empty';
    if (isFriend) {
        empty.style.paddingTop = '24px'; // Account for friend label
    }
    empty.innerHTML = `
        <div class="deck-slot-empty-icon">+</div>
        <div class="deck-slot-empty-text">${isFriend ? 'Add Friend Card' : 'Add Card'}</div>
    `;
    return empty;
}

function renderFilledSlot(slotData, slotIndex, isFriend) {
    const card = cardData.find(c => c.support_id === slotData.cardId);
    if (!card) return renderEmptySlot(isFriend);

    const wrapper = document.createElement('div');
    wrapper.className = 'deck-slot-filled';

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'deck-slot-remove';
    removeBtn.textContent = '\u2715';
    removeBtn.title = 'Remove card';
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeDeckSlot(slotIndex);
    });
    wrapper.appendChild(removeBtn);

    // Image
    const img = document.createElement('img');
    img.className = 'deck-slot-image';
    img.src = `support_card_images/${card.support_id}.png`;
    img.alt = card.char_name || 'Card';
    img.loading = 'lazy';
    img.onerror = function() { this.style.display = 'none'; };
    wrapper.appendChild(img);

    // Info section
    const info = document.createElement('div');
    info.className = 'deck-slot-info';

    const name = document.createElement('div');
    name.className = 'deck-slot-name';
    name.textContent = card.char_name || 'Unknown';
    name.title = card.char_name || '';
    info.appendChild(name);

    const badges = document.createElement('div');
    badges.className = 'deck-slot-badges';
    badges.appendChild(createRarityBadge(card.rarity));
    badges.appendChild(createTypeBadge(card.type));
    info.appendChild(badges);

    const level = document.createElement('div');
    level.className = 'deck-slot-level';
    level.textContent = `Lv.${slotData.level} / LB${slotData.limitBreak}`;
    info.appendChild(level);

    wrapper.appendChild(info);

    // Friend slot extra controls
    if (isFriend) {
        const controls = document.createElement('div');
        controls.className = 'deck-slot-friend-controls';

        // LB select
        const lbLabel = document.createElement('label');
        lbLabel.textContent = 'Limit Break:';
        controls.appendChild(lbLabel);

        const lbSelect = document.createElement('select');
        for (let lb = 0; lb <= 4; lb++) {
            const opt = document.createElement('option');
            opt.value = lb;
            opt.textContent = `LB ${lb}`;
            if (lb === slotData.limitBreak) opt.selected = true;
            lbSelect.appendChild(opt);
        }
        lbSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            const newLB = parseInt(e.target.value);
            const maxLevel = limitBreaks[card.rarity][newLB];
            const clampedLevel = Math.min(slotData.level, maxLevel);
            setDeckSlot(slotIndex, slotData.cardId, clampedLevel, newLB);
        });
        controls.appendChild(lbSelect);

        // Level input
        const lvLabel = document.createElement('label');
        lvLabel.textContent = 'Level:';
        controls.appendChild(lvLabel);

        const lvInput = document.createElement('input');
        lvInput.type = 'number';
        lvInput.min = 1;
        lvInput.max = limitBreaks[card.rarity][slotData.limitBreak];
        lvInput.value = slotData.level;
        lvInput.addEventListener('change', (e) => {
            e.stopPropagation();
            let newLevel = parseInt(e.target.value);
            const max = limitBreaks[card.rarity][slotData.limitBreak];
            newLevel = Math.max(1, Math.min(newLevel, max));
            e.target.value = newLevel;
            setDeckSlot(slotIndex, slotData.cardId, newLevel, slotData.limitBreak);
        });
        lvInput.addEventListener('click', (e) => e.stopPropagation());
        controls.appendChild(lvInput);

        wrapper.appendChild(controls);
    }

    return wrapper;
}

// ===== CARD PICKER =====

function renderCardPicker() {
    // Remove existing picker
    const existingPicker = document.getElementById('deckCardPicker');
    const existingOverlay = document.getElementById('deckPickerOverlay');
    if (existingPicker) existingPicker.remove();
    if (existingOverlay) existingOverlay.remove();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'deck-card-picker-overlay';
    overlay.id = 'deckPickerOverlay';
    overlay.addEventListener('click', closeCardPicker);

    // Create picker panel
    const picker = document.createElement('div');
    picker.className = 'deck-card-picker';
    picker.id = 'deckCardPicker';

    const isFriend = deckBuilderState.activeSlot === 5;
    const slotLabel = isFriend ? 'Friend Slot' : `Slot ${deckBuilderState.activeSlot + 1}`;

    picker.innerHTML = `
        <div class="picker-header">
            <h3>Select Card — ${slotLabel}</h3>
            <button class="picker-close" id="pickerCloseBtn">&times;</button>
        </div>
        <div class="picker-filters">
            <div class="picker-type-filters" id="pickerTypeFilters">
                <button class="picker-type-btn active" data-type="all">All</button>
                <button class="picker-type-btn" data-type="speed">Speed</button>
                <button class="picker-type-btn" data-type="stamina">Stamina</button>
                <button class="picker-type-btn" data-type="power">Power</button>
                <button class="picker-type-btn" data-type="guts">Guts</button>
                <button class="picker-type-btn" data-type="intelligence">Wit</button>
                <button class="picker-type-btn" data-type="friend">Friend</button>
            </div>
            <input class="picker-search" id="pickerSearch" type="text" placeholder="Search by card name...">
        </div>
        <div class="picker-card-list" id="pickerCardList">
            <!-- Cards rendered here -->
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(picker);

    // Wire events
    document.getElementById('pickerCloseBtn').addEventListener('click', closeCardPicker);

    // Type filter buttons
    document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const allBtn = document.querySelector('#pickerTypeFilters .picker-type-btn[data-type="all"]');
            const allTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'];

            if (type === 'all') {
                // "All" resets to showing everything
                deckBuilderState.pickerFilter.types = [...allTypes];
                document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.type === 'all');
                });
            } else if (allBtn.classList.contains('active')) {
                // Clicking a type while "All" is active: switch to only that type
                deckBuilderState.pickerFilter.types = [type];
                allBtn.classList.remove('active');
                document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(b => {
                    if (b.dataset.type !== 'all') {
                        b.classList.toggle('active', b.dataset.type === type);
                    }
                });
            } else {
                // Toggle individual type on/off
                const idx = deckBuilderState.pickerFilter.types.indexOf(type);
                if (idx >= 0) {
                    deckBuilderState.pickerFilter.types.splice(idx, 1);
                } else {
                    deckBuilderState.pickerFilter.types.push(type);
                }
                btn.classList.toggle('active');

                // If none selected or all selected, reset to "All"
                if (deckBuilderState.pickerFilter.types.length === 0 || deckBuilderState.pickerFilter.types.length === 6) {
                    deckBuilderState.pickerFilter.types = [...allTypes];
                    allBtn.classList.add('active');
                    document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(b => {
                        if (b.dataset.type !== 'all') b.classList.remove('active');
                    });
                }
            }
            renderPickerCards();
        });
    });

    // Search with debounce
    let searchTimeout;
    document.getElementById('pickerSearch').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            deckBuilderState.pickerFilter.search = e.target.value.trim().toLowerCase();
            renderPickerCards();
        }, 300);
    });

    // ESC to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeCardPicker();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Render initial card list
    renderPickerCards();

    // Animate open
    requestAnimationFrame(() => {
        overlay.classList.add('open');
        picker.classList.add('open');
    });
}

function renderPickerCards() {
    const list = document.getElementById('pickerCardList');
    if (!list) return;

    const cards = getPickerCards();

    if (cards.length === 0) {
        list.innerHTML = '<div class="picker-no-results">No cards match your filters.</div>';
        return;
    }

    // Get card IDs already in deck (for greying out)
    const deckCardIds = new Set();
    deckBuilderState.slots.forEach((slot, idx) => {
        if (slot && idx !== deckBuilderState.activeSlot) {
            deckCardIds.add(slot.cardId);
        }
    });

    list.innerHTML = '';
    cards.forEach(card => {
        const inDeck = deckCardIds.has(card.support_id);
        const item = document.createElement('div');
        item.className = `picker-card-item${inDeck ? ' in-deck' : ''}`;
        item.setAttribute('tabindex', inDeck ? '-1' : '0');

        const icon = document.createElement('img');
        icon.className = 'picker-card-item-icon';
        icon.src = `support_card_images/${card.support_id}_i.png`;
        icon.alt = card.char_name || '';
        icon.loading = 'lazy';
        icon.onerror = function() { this.style.display = 'none'; };
        item.appendChild(icon);

        const info = document.createElement('div');
        info.className = 'picker-card-item-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'picker-card-item-name';
        nameDiv.textContent = card.char_name || 'Unknown';
        info.appendChild(nameDiv);

        const details = document.createElement('div');
        details.className = 'picker-card-item-details';
        details.appendChild(createRarityBadge(card.rarity));
        details.appendChild(createTypeBadge(card.type));

        // Show level info
        const levelSpan = document.createElement('span');
        levelSpan.className = 'picker-card-item-level';
        if (isCardOwned(card.support_id)) {
            levelSpan.textContent = `Lv.${getOwnedCardLevel(card.support_id)} LB${getOwnedCardLimitBreak(card.support_id)}`;
        } else {
            levelSpan.textContent = 'Not owned';
        }
        details.appendChild(levelSpan);

        if (inDeck) {
            const badge = document.createElement('span');
            badge.className = 'picker-in-deck-badge';
            badge.textContent = 'In Deck';
            details.appendChild(badge);
        }

        info.appendChild(details);
        item.appendChild(info);

        if (!inDeck) {
            item.addEventListener('click', () => {
                selectCardForSlot(deckBuilderState.activeSlot, card.support_id);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectCardForSlot(deckBuilderState.activeSlot, card.support_id);
                }
            });
        }

        list.appendChild(item);
    });
}

function getPickerCards() {
    const isFriend = deckBuilderState.activeSlot === 5;
    const filter = deckBuilderState.pickerFilter;

    let cards = cardData.filter(card => {
        // For non-friend slots, show only owned cards
        if (!isFriend && !isCardOwned(card.support_id)) return false;

        // SSR/SR only (exclude R for deck building)
        if (card.rarity < 2) return false;

        // Type filter
        if (filter.types.length > 0 && !filter.types.includes(card.type)) return false;

        // Search filter
        if (filter.search) {
            const search = filter.search;
            const nameMatch = (card.char_name || '').toLowerCase().includes(search) ||
                              (card.name_en || '').toLowerCase().includes(search) ||
                              (card.name_jp || '').toLowerCase().includes(search) ||
                              (card.name_kr || '').toLowerCase().includes(search) ||
                              (card.name_tw || '').toLowerCase().includes(search);
            if (!nameMatch) return false;
        }

        // Only released cards
        if (!card.release_en) return false;

        return true;
    });

    // Sort: owned first, then by rarity desc, then name
    cards.sort((a, b) => {
        const aOwned = isCardOwned(a.support_id) ? 1 : 0;
        const bOwned = isCardOwned(b.support_id) ? 1 : 0;
        if (aOwned !== bOwned) return bOwned - aOwned;
        if (a.rarity !== b.rarity) return b.rarity - a.rarity;
        return (a.char_name || '').localeCompare(b.char_name || '');
    });

    return cards;
}

// ===== DECK SUMMARY =====

function renderDeckSummary(aggregated) {
    const content = document.getElementById('deckSummaryContent');
    if (!content) return;

    const filledSlots = deckBuilderState.slots.filter(s => s !== null).length;
    if (filledSlots === 0) {
        content.innerHTML = '';
        content.className = 'deck-summary-empty';
        content.textContent = 'Add cards to see aggregated effects.';
        return;
    }

    content.className = '';

    // Effect ID mappings
    const raceBonusVal = aggregated[15] || 0;
    const trainingEffVal = aggregated[8] || 0;
    const friendshipVal = aggregated[1] || 0;
    const moodEffVal = aggregated[2] || 0;

    const spdBonus = aggregated[3] || 0;
    const staBonus = aggregated[4] || 0;
    const powBonus = aggregated[5] || 0;
    const gutBonus = aggregated[6] || 0;
    const witBonus = aggregated[7] || 0;
    const skillPtBonus = aggregated[30] || 0;

    const specPriority = aggregated[19] || 0;
    const failProt = aggregated[27] || 0;
    const energyReduce = aggregated[28] || 0;
    const eventRecovery = aggregated[25] || 0;

    const initSpd = aggregated[9] || 0;
    const initSta = aggregated[10] || 0;
    const initPow = aggregated[11] || 0;
    const initGut = aggregated[12] || 0;
    const initWit = aggregated[13] || 0;
    const initBond = aggregated[14] || 0;

    const raceBonusClass = raceBonusVal >= 30 ? 'race-bonus-high' : 'race-bonus-low';

    content.innerHTML = `
        <div class="deck-summary-section-label">Key Training Effects</div>
        <div class="deck-summary-grid">
            <div class="deck-summary-item highlight ${raceBonusClass}">
                <span class="deck-summary-item-label">Race Bonus</span>
                <span class="deck-summary-item-value">${raceBonusVal}%</span>
            </div>
            <div class="deck-summary-item highlight">
                <span class="deck-summary-item-label">Training Eff.</span>
                <span class="deck-summary-item-value">${trainingEffVal}%</span>
            </div>
            <div class="deck-summary-item highlight">
                <span class="deck-summary-item-label">Friendship Bonus</span>
                <span class="deck-summary-item-value">${friendshipVal}%</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Mood Effect</span>
                <span class="deck-summary-item-value">${moodEffVal}%</span>
            </div>
        </div>

        <div class="deck-summary-section-label">Stat Bonuses</div>
        <div class="deck-summary-grid">
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Speed</span>
                <span class="deck-summary-item-value">+${spdBonus}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Stamina</span>
                <span class="deck-summary-item-value">+${staBonus}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Power</span>
                <span class="deck-summary-item-value">+${powBonus}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Guts</span>
                <span class="deck-summary-item-value">+${gutBonus}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Wit</span>
                <span class="deck-summary-item-value">+${witBonus}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Skill Pts</span>
                <span class="deck-summary-item-value">+${skillPtBonus}</span>
            </div>
        </div>

        <div class="deck-summary-section-label">Support Effects</div>
        <div class="deck-summary-grid">
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Spec. Priority</span>
                <span class="deck-summary-item-value">${specPriority}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Fail Protection</span>
                <span class="deck-summary-item-value">${failProt}%</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Energy Reduce</span>
                <span class="deck-summary-item-value">${energyReduce}%</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Event Recovery</span>
                <span class="deck-summary-item-value">${eventRecovery}%</span>
            </div>
        </div>

        <div class="deck-summary-section-label">Initial Stats</div>
        <div class="deck-summary-grid">
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Init. Speed</span>
                <span class="deck-summary-item-value">+${initSpd}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Init. Stamina</span>
                <span class="deck-summary-item-value">+${initSta}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Init. Power</span>
                <span class="deck-summary-item-value">+${initPow}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Init. Guts</span>
                <span class="deck-summary-item-value">+${initGut}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Init. Wit</span>
                <span class="deck-summary-item-value">+${initWit}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Init. Bond</span>
                <span class="deck-summary-item-value">+${initBond}</span>
            </div>
        </div>
    `;
}

// ===== TRAINING BREAKDOWN TABLE =====

function renderTrainingBreakdown(trainingResults) {
    const content = document.getElementById('trainingBreakdownContent');
    if (!content) return;

    const filledSlots = deckBuilderState.slots.filter(s => s !== null).length;
    if (filledSlots === 0) {
        content.className = 'training-breakdown-empty';
        content.textContent = 'Add cards to see training calculations.';
        return;
    }

    content.className = '';

    const trainingTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    const typeLabels = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wisdom' };

    let html = `
        <div class="training-table-wrapper">
            <table class="training-table">
                <thead>
                    <tr>
                        <th>Training</th>
                        <th>Cards</th>
                        <th>Speed</th>
                        <th>Stamina</th>
                        <th>Power</th>
                        <th>Guts</th>
                        <th>Wit</th>
                        <th>Skill Pts</th>
                        <th>Energy</th>
                    </tr>
                </thead>
                <tbody>
    `;

    trainingTypes.forEach(type => {
        const result = trainingResults[type];
        if (!result) return;

        // Training type cell with color dot
        const typeCell = `<td>
            <div class="training-type-cell">
                <span class="training-type-dot ${type}"></span>
                ${typeLabels[type]}
            </div>
        </td>`;

        // Cards present dots
        const cardDots = result.presentCards.map(ct =>
            `<span class="training-card-dot ${ct}"></span>`
        ).join('');
        const cardsCell = `<td><div class="training-cards-cell">${cardDots || '--'}</div></td>`;

        // Stat cells
        const stats = ['speed', 'stamina', 'power', 'guts', 'wit', 'skillPts'];
        const statCells = stats.map(stat => {
            const val = result[stat];
            if (val > 0) {
                return `<td class="training-value-positive">+${val}</td>`;
            }
            return `<td class="training-value-zero">--</td>`;
        }).join('');

        // Energy cell
        let energyCell;
        if (result.energy > 0) {
            energyCell = `<td class="training-value-energy-positive">+${result.energy}</td>`;
        } else if (result.energy < 0) {
            energyCell = `<td class="training-value-energy">${result.energy}</td>`;
        } else {
            energyCell = `<td class="training-value-zero">0</td>`;
        }

        html += `<tr>${typeCell}${cardsCell}${statCells}${energyCell}</tr>`;
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

// ===== SCENARIO INFO =====

function renderScenarioInfo(aggregated) {
    const content = document.getElementById('scenarioInfoContent');
    if (!content) return;

    const raceBonusVal = aggregated[15] || 0;
    const raceBonusClass = raceBonusVal >= 30 ? 'high' : (raceBonusVal > 0 ? 'low' : '');

    content.innerHTML = `
        <div class="scenario-race-bonus ${raceBonusClass}">
            Your Race Bonus: ${raceBonusVal}%
        </div>

        <div class="deck-summary-section-label">Stat Caps</div>
        <div class="scenario-stat-caps">
            <div class="scenario-stat-cap">
                <span class="scenario-stat-cap-label">Speed</span>
                <span class="scenario-stat-cap-value">1200</span>
            </div>
            <div class="scenario-stat-cap">
                <span class="scenario-stat-cap-label">Stamina</span>
                <span class="scenario-stat-cap-value">1900</span>
            </div>
            <div class="scenario-stat-cap">
                <span class="scenario-stat-cap-label">Power</span>
                <span class="scenario-stat-cap-value">1200</span>
            </div>
            <div class="scenario-stat-cap">
                <span class="scenario-stat-cap-label">Guts</span>
                <span class="scenario-stat-cap-value">1200</span>
            </div>
            <div class="scenario-stat-cap">
                <span class="scenario-stat-cap-label">Wisdom</span>
                <span class="scenario-stat-cap-value">1500</span>
            </div>
        </div>

        <div class="deck-summary-section-label">Strategy Tips</div>
        <div class="scenario-tips">
            <ul>
                <li><strong>Race Bonus is king</strong> — races are the primary progression source in MaNT, making Race Bonus the most impactful effect.</li>
                <li><strong>Training Effectiveness</strong> stacks multiplicatively with other bonuses, providing the biggest overall training gains.</li>
                <li><strong>Prioritize Stamina</strong> — the highest stat cap (1900) means you need efficient Stamina training.</li>
                <li><strong>Shop Items</strong> — Megaphones (+20-60% training for 2-4 turns) and Ankle Weights (+50% single stat) amplify your deck's effects further.</li>
                <li><strong>Friendship Training</strong> — try to fill your friendship gauge early and keep support cards at their preferred training for maximum gains.</li>
                <li><strong>Energy management</strong> — Energy Cost Reduction and Event Recovery help sustain more training turns throughout the scenario.</li>
            </ul>
        </div>
    `;
}

// ===== DECK SELECT RENDERING =====

function renderDeckSelect() {
    const select = document.getElementById('deckSelect');
    if (!select) return;

    select.innerHTML = '';
    const decks = deckBuilderState.savedDecks;

    if (decks.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'default';
        opt.textContent = 'New Deck';
        select.appendChild(opt);
        return;
    }

    decks.forEach(deck => {
        const opt = document.createElement('option');
        opt.value = deck.id;
        opt.textContent = deck.name;
        if (deck.id === deckBuilderState.activeDeckId) opt.selected = true;
        select.appendChild(opt);
    });
}

// ===== EXPORTS =====

window.DeckBuilderRenderer = {
    renderDeckBuilderShell,
    renderDeckSlots,
    renderCardPicker,
    renderPickerCards,
    renderDeckSummary,
    renderTrainingBreakdown,
    renderScenarioInfo,
    renderDeckSelect
};

Object.assign(window, window.DeckBuilderRenderer);
