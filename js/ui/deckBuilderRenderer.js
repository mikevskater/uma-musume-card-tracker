// Deck Builder Renderer
// Handles all DOM rendering for the Deck Builder tab

// ===== SHELL RENDERING =====

function renderDeckBuilderShell() {
    const container = document.getElementById('deckBuilderContainer');
    if (!container) return;

    // Build scenario options from loaded data
    const scenarios = getAvailableScenarios();
    const scenarioOptions = scenarios.map(s =>
        `<option value="${s.id}"${s.id === deckBuilderState.scenario ? ' selected' : ''}>${s.name}</option>`
    ).join('');

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
                <span class="training-control-label">Scenario:</span>
                <select class="scenario-select" id="scenarioSelect">
                    ${scenarioOptions}
                </select>
            </div>
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

        <!-- Scenario Info -->
        <div class="scenario-info" id="scenarioInfo">
            <div class="scenario-info-title" id="scenarioInfoTitle">Scenario Info</div>
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
        empty.style.paddingTop = '24px';
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

    // Image with rarity border
    const img = document.createElement('img');
    img.className = `deck-slot-image card-image rarity-${card.rarity}`;
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

const PICKER_SORT_OPTIONS = [
    { value: 'effect_15', label: 'Race Bonus' },
    { value: 'effect_8',  label: 'Training Effectiveness' },
    { value: 'effect_1',  label: 'Friendship Bonus' },
    { value: 'effect_2',  label: 'Mood Effect' },
    { value: 'effect_3',  label: 'Speed Bonus' },
    { value: 'effect_4',  label: 'Stamina Bonus' },
    { value: 'effect_5',  label: 'Power Bonus' },
    { value: 'effect_6',  label: 'Guts Bonus' },
    { value: 'effect_7',  label: 'Wit Bonus' },
    { value: 'effect_30', label: 'Skill Point Bonus' },
    { value: 'effect_19', label: 'Specialty Priority' },
    { value: 'name',      label: 'Name' },
    { value: 'rarity',    label: 'Rarity' }
];

const PICKER_DISPLAY_EFFECT_IDS = [15, 8, 1, 2, 3, 4, 5, 6, 7, 30, 19];

function renderCardPicker() {
    const existingOverlay = document.getElementById('deckPickerOverlay');
    if (existingOverlay) existingOverlay.remove();

    const filter = deckBuilderState.pickerFilter;
    const isFriend = deckBuilderState.activeSlot === 5;
    const slotLabel = isFriend ? 'Friend Slot' : `Slot ${deckBuilderState.activeSlot + 1}`;
    const allTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'];
    const isAllTypes = filter.types.length === 6;

    const overlay = document.createElement('div');
    overlay.className = 'picker-modal-overlay';
    overlay.id = 'deckPickerOverlay';

    const typeButtonsHtml = `
        <button class="picker-type-btn${isAllTypes ? ' active' : ''}" data-type="all">All</button>
        <button class="picker-type-btn${!isAllTypes && filter.types.includes('speed') ? ' active' : ''}" data-type="speed">Speed</button>
        <button class="picker-type-btn${!isAllTypes && filter.types.includes('stamina') ? ' active' : ''}" data-type="stamina">Stamina</button>
        <button class="picker-type-btn${!isAllTypes && filter.types.includes('power') ? ' active' : ''}" data-type="power">Power</button>
        <button class="picker-type-btn${!isAllTypes && filter.types.includes('guts') ? ' active' : ''}" data-type="guts">Guts</button>
        <button class="picker-type-btn${!isAllTypes && filter.types.includes('intelligence') ? ' active' : ''}" data-type="intelligence">Wit</button>
        <button class="picker-type-btn${!isAllTypes && filter.types.includes('friend') ? ' active' : ''}" data-type="friend">Friend</button>
    `;

    const sortOptionsHtml = PICKER_SORT_OPTIONS.map(opt =>
        `<option value="${opt.value}"${filter.sortBy === opt.value ? ' selected' : ''}>${opt.label}</option>`
    ).join('');

    const dirArrow = filter.sortDirection === 'desc' ? '\u2193' : '\u2191';
    const dirLabel = filter.sortDirection === 'desc' ? 'Desc' : 'Asc';

    overlay.innerHTML = `
        <div class="picker-modal" id="pickerModal">
            <div class="picker-header">
                <h3>Select Card \u2014 ${slotLabel}</h3>
                <button class="picker-close" id="pickerCloseBtn">&times;</button>
            </div>
            <div class="picker-filters">
                <div class="picker-type-filters" id="pickerTypeFilters">
                    ${typeButtonsHtml}
                </div>
                <input class="picker-search" id="pickerSearch" type="text" placeholder="Search by card name...">
                <div class="picker-filter-row">
                    <label class="picker-ssr-toggle">
                        <input type="checkbox" id="pickerSsrOnly"${filter.ssrOnly ? ' checked' : ''}>
                        SSR Only
                    </label>
                    <div class="picker-sort-controls">
                        <label class="picker-sort-label">Sort:</label>
                        <select class="picker-sort-select" id="pickerSortBy">
                            ${sortOptionsHtml}
                        </select>
                        <button class="picker-sort-dir-btn" id="pickerSortDir" title="Toggle sort direction">
                            ${dirArrow} ${dirLabel}
                        </button>
                    </div>
                </div>
            </div>
            <div class="picker-card-grid" id="pickerCardGrid">
                <!-- Cards rendered here -->
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('pickerCloseBtn').addEventListener('click', closeCardPicker);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCardPicker();
    });

    document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const allBtn = document.querySelector('#pickerTypeFilters .picker-type-btn[data-type="all"]');

            if (type === 'all') {
                filter.types = [...allTypes];
                document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.type === 'all');
                });
            } else if (allBtn.classList.contains('active')) {
                filter.types = [type];
                allBtn.classList.remove('active');
                document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(b => {
                    if (b.dataset.type !== 'all') {
                        b.classList.toggle('active', b.dataset.type === type);
                    }
                });
            } else {
                const idx = filter.types.indexOf(type);
                if (idx >= 0) {
                    filter.types.splice(idx, 1);
                } else {
                    filter.types.push(type);
                }
                btn.classList.toggle('active');

                if (filter.types.length === 0 || filter.types.length === 6) {
                    filter.types = [...allTypes];
                    allBtn.classList.add('active');
                    document.querySelectorAll('#pickerTypeFilters .picker-type-btn').forEach(b => {
                        if (b.dataset.type !== 'all') b.classList.remove('active');
                    });
                }
            }
            renderPickerCards();
        });
    });

    let searchTimeout;
    document.getElementById('pickerSearch').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filter.search = e.target.value.trim().toLowerCase();
            renderPickerCards();
        }, 300);
    });

    document.getElementById('pickerSsrOnly').addEventListener('change', (e) => {
        filter.ssrOnly = e.target.checked;
        renderPickerCards();
    });

    document.getElementById('pickerSortBy').addEventListener('change', (e) => {
        filter.sortBy = e.target.value;
        renderPickerCards();
    });

    document.getElementById('pickerSortDir').addEventListener('click', () => {
        filter.sortDirection = filter.sortDirection === 'desc' ? 'asc' : 'desc';
        const btn = document.getElementById('pickerSortDir');
        const arrow = filter.sortDirection === 'desc' ? '\u2193' : '\u2191';
        const label = filter.sortDirection === 'desc' ? 'Desc' : 'Asc';
        btn.textContent = `${arrow} ${label}`;
        renderPickerCards();
    });

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeCardPicker();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    renderPickerCards();

    requestAnimationFrame(() => {
        overlay.classList.add('open');
    });
}

function getCardPickerEffects(card, level) {
    if (!card.effects) return [];

    const results = [];
    const usedIds = new Set();

    for (const effectId of PICKER_DISPLAY_EFFECT_IDS) {
        if (results.length >= 4) break;
        const effectArray = card.effects.find(e => e[0] === effectId);
        if (effectArray && !isEffectLocked(effectArray, level)) {
            const value = calculateEffectValue(effectArray, level);
            if (value > 0) {
                const info = effectsData[effectId];
                results.push({
                    name: info?.name || `Effect ${effectId}`,
                    value: value,
                    symbol: info?.symbol === 'percent' ? '%' : ''
                });
                usedIds.add(effectId);
            }
        }
    }

    if (results.length < 4) {
        const remaining = card.effects
            .filter(e => e[0] && effectsData[e[0]] && !usedIds.has(e[0]) && !isEffectLocked(e, level))
            .map(e => {
                const val = calculateEffectValue(e, level);
                const info = effectsData[e[0]];
                return { name: info.name, value: val, symbol: info.symbol === 'percent' ? '%' : '', effectId: e[0] };
            })
            .filter(e => e.value > 0)
            .sort((a, b) => b.value - a.value);

        for (const eff of remaining) {
            if (results.length >= 4) break;
            results.push(eff);
        }
    }

    return results;
}

function renderPickerCards() {
    const grid = document.getElementById('pickerCardGrid');
    if (!grid) return;

    const cards = getPickerCards();

    if (cards.length === 0) {
        grid.innerHTML = '<div class="picker-no-results">No cards match your filters.</div>';
        return;
    }

    const deckCardIds = new Set();
    deckBuilderState.slots.forEach((slot, idx) => {
        if (slot && idx !== deckBuilderState.activeSlot) {
            deckCardIds.add(slot.cardId);
        }
    });

    grid.innerHTML = '';
    cards.forEach(card => {
        const inDeck = deckCardIds.has(card.support_id);
        const owned = isCardOwned(card.support_id);
        const isFriendSlot = deckBuilderState.activeSlot === 5;

        let level, lb;
        if (isFriendSlot) {
            lb = 4;
            level = limitBreaks[card.rarity][lb];
        } else if (owned) {
            level = getOwnedCardLevel(card.support_id);
            lb = getOwnedCardLimitBreak(card.support_id);
        } else {
            lb = 4;
            level = limitBreaks[card.rarity][lb];
        }

        const tile = document.createElement('div');
        tile.className = `picker-card-tile${inDeck ? ' in-deck' : ''}`;
        tile.setAttribute('tabindex', inDeck ? '-1' : '0');

        const topRow = document.createElement('div');
        topRow.className = 'picker-tile-top';

        const icon = document.createElement('img');
        icon.className = 'picker-tile-icon';
        icon.src = `support_card_images/${card.support_id}_i.png`;
        icon.alt = card.char_name || '';
        icon.loading = 'lazy';
        icon.onerror = function() { this.style.display = 'none'; };
        topRow.appendChild(icon);

        const info = document.createElement('div');
        info.className = 'picker-tile-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'picker-tile-name';
        nameDiv.textContent = card.char_name || 'Unknown';
        nameDiv.title = card.char_name || '';
        info.appendChild(nameDiv);

        const badges = document.createElement('div');
        badges.className = 'picker-tile-badges';
        badges.appendChild(createRarityBadge(card.rarity));
        badges.appendChild(createTypeBadge(card.type));
        info.appendChild(badges);

        const levelDiv = document.createElement('div');
        levelDiv.className = 'picker-tile-level';
        if (owned) {
            levelDiv.textContent = `Lv.${level} LB${lb}`;
        } else if (isFriendSlot) {
            levelDiv.textContent = `Lv.${level} LB${lb}`;
        } else {
            levelDiv.textContent = 'Not owned';
        }
        info.appendChild(levelDiv);

        if (inDeck) {
            const badge = document.createElement('span');
            badge.className = 'picker-in-deck-badge';
            badge.textContent = 'In Deck';
            info.appendChild(badge);
        }

        topRow.appendChild(info);
        tile.appendChild(topRow);

        const effects = getCardPickerEffects(card, level);
        if (effects.length > 0) {
            const effectsDiv = document.createElement('div');
            effectsDiv.className = 'picker-tile-effects';
            effects.forEach(eff => {
                const row = document.createElement('div');
                row.className = 'picker-tile-effect-row';
                row.innerHTML = `<span class="picker-tile-effect-name">${eff.name}</span><span class="picker-tile-effect-value">${eff.value}${eff.symbol}</span>`;
                effectsDiv.appendChild(row);
            });
            tile.appendChild(effectsDiv);
        }

        if (!inDeck) {
            tile.addEventListener('click', () => {
                selectCardForSlot(deckBuilderState.activeSlot, card.support_id);
            });
            tile.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectCardForSlot(deckBuilderState.activeSlot, card.support_id);
                }
            });
        }

        grid.appendChild(tile);
    });
}

function getPickerCards() {
    const isFriend = deckBuilderState.activeSlot === 5;
    const filter = deckBuilderState.pickerFilter;

    let cards = cardData.filter(card => {
        // For non-friend slots, show only owned cards
        if (!isFriend && !isCardOwned(card.support_id)) return false;

        // Exclude R for deck building
        if (card.rarity < 2) return false;

        // SSR Only filter
        if (filter.ssrOnly && card.rarity !== 3) return false;

        // Type filter
        if (filter.types.length > 0 && !filter.types.includes(card.type)) return false;

        // Search filter
        if (filter.search) {
            const search = filter.search;
            const nameMatch = (card.char_name || '').toLowerCase().includes(search) ||
                              (card.card_name || '').toLowerCase().includes(search);
            if (!nameMatch) return false;
        }

        // Only released cards (EN)
        if (!card.start_date) return false;

        return true;
    });

    // Sort
    const { sortBy, sortDirection } = filter;
    const dirMult = sortDirection === 'desc' ? -1 : 1;

    cards.sort((a, b) => {
        let cmp = 0;

        if (sortBy === 'name') {
            cmp = (a.char_name || '').localeCompare(b.char_name || '');
        } else if (sortBy === 'rarity') {
            cmp = a.rarity - b.rarity;
        } else if (sortBy.startsWith('effect_')) {
            const effectId = parseInt(sortBy.split('_')[1]);
            const aLevel = getPickerCardLevel(a, isFriend);
            const bLevel = getPickerCardLevel(b, isFriend);
            const aVal = getCardEffectValue(a, effectId, aLevel);
            const bVal = getCardEffectValue(b, effectId, bLevel);
            cmp = aVal - bVal;
        }

        if (cmp !== 0) return cmp * dirMult;

        const aOwned = isCardOwned(a.support_id) ? 1 : 0;
        const bOwned = isCardOwned(b.support_id) ? 1 : 0;
        if (aOwned !== bOwned) return bOwned - aOwned;
        if (a.rarity !== b.rarity) return b.rarity - a.rarity;
        return (a.char_name || '').localeCompare(b.char_name || '');
    });

    return cards;
}

function getPickerCardLevel(card, isFriend) {
    if (isFriend) {
        return limitBreaks[card.rarity][4];
    }
    if (isCardOwned(card.support_id)) {
        return getOwnedCardLevel(card.support_id);
    }
    return limitBreaks[card.rarity][4];
}

function getCardEffectValue(card, effectId, level) {
    if (!card.effects) return 0;
    const effectArray = card.effects.find(e => e[0] === effectId);
    if (!effectArray || isEffectLocked(effectArray, level)) return 0;
    return calculateEffectValue(effectArray, level);
}

// ===== DECK SUMMARY =====

function renderDeckSummary(aggregated, perTraining) {
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

    // Deck-wide effects
    const raceBonusVal = aggregated[15] || 0;
    const specPriority = aggregated[19] || 0;
    const failProt = aggregated[27] || 0;
    const energyReduce = aggregated[28] || 0;
    const eventRecovery = aggregated[25] || 0;
    const hintLevel = aggregated[17] || 0;
    const hintFreq = aggregated[18] || 0;

    // Initial stats
    const initSpd = aggregated[9] || 0;
    const initSta = aggregated[10] || 0;
    const initPow = aggregated[11] || 0;
    const initGut = aggregated[12] || 0;
    const initWit = aggregated[13] || 0;
    const initBond = aggregated[14] || 0;

    const raceBonusClass = raceBonusVal >= 30 ? 'race-bonus-high' : 'race-bonus-low';

    // Per-training table
    const trainingTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    const typeLabels = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wisdom' };
    const statBonusColumns = [3, 4, 5, 6, 7, 30];
    const statBonusLabels = ['Spd', 'Sta', 'Pow', 'Gut', 'Wit', 'SkPt'];

    let perTrainingRows = '';
    trainingTypes.forEach(type => {
        const data = perTraining[type];
        if (!data) return;

        const typeCell = `<td>
            <div class="training-type-cell">
                <span class="training-type-dot ${type}"></span>
                ${typeLabels[type]}
            </div>
        </td>`;

        const cardDots = data.presentCardTypes.map(ct =>
            `<span class="training-card-dot ${ct}"></span>`
        ).join('');
        const cardsCell = `<td><div class="training-cards-cell">${cardDots || '--'}</div></td>`;

        const trainEffCell = data.trainingEff > 0
            ? `<td class="training-value-positive">${data.trainingEff}%</td>`
            : `<td class="training-value-zero">0%</td>`;

        const moodEffCell = data.moodEffect > 0
            ? `<td class="training-value-positive">${data.moodEffect}%</td>`
            : `<td class="training-value-zero">0%</td>`;

        const statCells = statBonusColumns.map((effectId, colIdx) => {
            const isApplicable = data.applicableBonusIds.includes(effectId);
            if (!isApplicable) {
                return `<td class="training-value-zero">--</td>`;
            }
            const idx = STAT_BONUS_INDEX_MAP[effectId];
            const val = idx !== undefined ? data.statBonuses[idx] : 0;
            if (val > 0) {
                return `<td class="training-value-positive">+${val}</td>`;
            }
            return `<td class="training-value-zero">0</td>`;
        }).join('');

        const friendVal = data.friendshipMultiplier;
        const friendCell = friendVal > 1
            ? `<td class="training-value-positive deck-summary-friendship">\u00d7${friendVal.toFixed(2)}</td>`
            : `<td class="training-value-zero deck-summary-friendship">\u00d71.00</td>`;

        perTrainingRows += `<tr>${typeCell}${cardsCell}${trainEffCell}${moodEffCell}${statCells}${friendCell}</tr>`;
    });

    content.innerHTML = `
        <div class="deck-summary-section-label">Deck-Wide Effects (always active)</div>
        <div class="deck-summary-grid">
            <div class="deck-summary-item highlight ${raceBonusClass}">
                <span class="deck-summary-item-label">Race Bonus</span>
                <span class="deck-summary-item-value">${raceBonusVal}%</span>
            </div>
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
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Hint Level</span>
                <span class="deck-summary-item-value">${hintLevel}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Hint Freq.</span>
                <span class="deck-summary-item-value">${hintFreq}%</span>
            </div>
        </div>

        <div class="deck-summary-section-label">Per-Training Effects (from present cards only)</div>
        <div class="deck-summary-training-wrapper">
            <table class="deck-summary-training-table">
                <thead>
                    <tr>
                        <th>Training</th>
                        <th>Cards</th>
                        <th>Train Eff</th>
                        <th>Mood Eff</th>
                        <th>${statBonusLabels[0]}</th>
                        <th>${statBonusLabels[1]}</th>
                        <th>${statBonusLabels[2]}</th>
                        <th>${statBonusLabels[3]}</th>
                        <th>${statBonusLabels[4]}</th>
                        <th>${statBonusLabels[5]}</th>
                        <th>Friend</th>
                    </tr>
                </thead>
                <tbody>
                    ${perTrainingRows}
                </tbody>
            </table>
        </div>
        <div class="deck-summary-training-note">Stat columns show bonuses added to base training. "--" = not applicable at that training. Friendship is combined multiplier.</div>

        <div class="deck-summary-section-label">Initial Stats (one-time at scenario start)</div>
        <div class="deck-summary-grid">
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Speed</span>
                <span class="deck-summary-item-value">+${initSpd}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Stamina</span>
                <span class="deck-summary-item-value">+${initSta}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Power</span>
                <span class="deck-summary-item-value">+${initPow}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Guts</span>
                <span class="deck-summary-item-value">+${initGut}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Wit</span>
                <span class="deck-summary-item-value">+${initWit}</span>
            </div>
            <div class="deck-summary-item">
                <span class="deck-summary-item-label">Bond</span>
                <span class="deck-summary-item-value">+${initBond}</span>
            </div>
        </div>

        ${renderRaceBonusSection(raceBonusVal)}
    `;
}

function renderRaceBonusSection(raceBonusPct) {
    if (raceBonusPct <= 0) return '';

    // Race bonus tiers: G1/G2/G3 races give bonus tiers 1-5 for different reward items
    // The primary stat reward uses tier 5 for 1st place
    const tiers = [
        { label: 'G1 / G2 / G3 (1st)', bonus: 5 },
        { label: 'G1 / G2 / G3 (2nd-3rd)', bonus: 4 },
        { label: 'G1 / G2 / G3 (4th-5th)', bonus: 3 },
    ];

    let rows = '';
    tiers.forEach(tier => {
        const perStat = calculateRaceBonusGain(tier.bonus, raceBonusPct);
        const total = perStat * 5; // 5 stats
        if (perStat > 0) {
            rows += `
                <div class="race-bonus-row">
                    <span class="race-bonus-grade">${tier.label}</span>
                    <span class="race-bonus-gain">+${perStat}/stat</span>
                    <span class="race-bonus-total">(+${total} total)</span>
                </div>
            `;
        }
    });

    if (!rows) {
        rows = '<div class="race-bonus-row"><span class="race-bonus-grade">Race Bonus too low for stat gains at current level.</span></div>';
    }

    return `
        <div class="deck-summary-section-label">Race Stat Gains (from ${raceBonusPct}% Race Bonus)</div>
        <div class="race-bonus-gains">
            ${rows}
            <div class="race-bonus-note">Formula: floor(tier x Race Bonus% / 100) per stat. Pre-OP and below: no bonus.</div>
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

        // Clickable training name to open assignment modal
        const typeCell = `<td>
            <div class="training-type-cell training-type-clickable" data-training="${type}" title="Click to assign cards">
                <span class="training-type-dot ${type}"></span>
                ${typeLabels[type]}
            </div>
        </td>`;

        // Show card icons based on assignments (not just dots)
        const assignments = deckBuilderState.trainingAssignments[type];
        let cardIconsHtml = '';
        deckBuilderState.slots.forEach((slot, idx) => {
            if (!slot) return;
            const card = cardData.find(c => c.support_id === slot.cardId);
            if (!card) return;
            const isPresent = assignments[idx];
            cardIconsHtml += `<span class="training-card-dot ${card.type}${isPresent ? '' : ' excluded'}" title="${card.char_name}${isPresent ? '' : ' (excluded)'}"></span>`;
        });
        const cardsCell = `<td><div class="training-cards-cell">${cardIconsHtml || '--'}</div></td>`;

        const stats = ['speed', 'stamina', 'power', 'guts', 'wit', 'skillPts'];
        const statCells = stats.map(stat => {
            const val = result[stat];
            if (val > 0) {
                return `<td class="training-value-positive">+${val}</td>`;
            }
            return `<td class="training-value-zero">--</td>`;
        }).join('');

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
    html += '<div class="training-breakdown-note">Click a training name to assign which cards are present.</div>';
    content.innerHTML = html;

    // Wire click handlers for training type cells
    content.querySelectorAll('.training-type-clickable').forEach(cell => {
        cell.addEventListener('click', () => {
            openTrainingAssignmentModal(cell.dataset.training);
        });
    });
}

// ===== TRAINING ASSIGNMENT MODAL =====

function renderTrainingAssignmentModal(trainingType) {
    const existingOverlay = document.getElementById('trainingAssignOverlay');
    if (existingOverlay) existingOverlay.remove();

    const typeLabels = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wisdom' };
    const label = typeLabels[trainingType] || trainingType;

    // Copy current assignments for editing
    const tempAssignments = [...deckBuilderState.trainingAssignments[trainingType]];

    const overlay = document.createElement('div');
    overlay.className = 'picker-modal-overlay';
    overlay.id = 'trainingAssignOverlay';

    const modal = document.createElement('div');
    modal.className = 'training-assign-modal';

    // Header
    modal.innerHTML = `
        <div class="training-assign-header">
            <h3>
                <span class="training-type-dot ${trainingType}"></span>
                ${label} Training -- Card Assignment
            </h3>
            <div class="training-assign-hint">Click cards to toggle their presence at this training.</div>
        </div>
        <div class="training-assign-cards" id="trainingAssignCards"></div>
        <div class="training-assign-actions">
            <button class="btn btn-secondary" id="trainingAssignCancel">Cancel</button>
            <button class="btn btn-secondary" id="trainingAssignReset">Reset All</button>
            <button class="btn btn-primary" id="trainingAssignSave">Save</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const cardsContainer = document.getElementById('trainingAssignCards');

    function renderCards() {
        cardsContainer.innerHTML = '';
        deckBuilderState.slots.forEach((slot, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'training-assign-card';

            if (!slot) {
                cardEl.classList.add('empty');
                cardEl.innerHTML = `<div class="training-assign-card-empty">Empty Slot ${idx < 5 ? idx + 1 : 'F'}</div>`;
                cardsContainer.appendChild(cardEl);
                return;
            }

            const card = cardData.find(c => c.support_id === slot.cardId);
            if (!card) return;

            const isPresent = tempAssignments[idx];
            if (!isPresent) cardEl.classList.add('excluded');

            cardEl.innerHTML = `
                <img class="training-assign-card-img card-image rarity-${card.rarity}"
                     src="support_card_images/${card.support_id}.png"
                     alt="${card.char_name}" loading="lazy"
                     onerror="this.style.display='none'">
                <div class="training-assign-card-info">
                    <div class="training-assign-card-name">${card.char_name}</div>
                    <div class="training-assign-card-meta">
                        <span class="training-card-dot ${card.type}"></span>
                        Lv.${slot.level}
                    </div>
                </div>
                <div class="training-assign-status">${isPresent ? 'Present' : 'Excluded'}</div>
            `;

            cardEl.addEventListener('click', () => {
                tempAssignments[idx] = !tempAssignments[idx];
                renderCards();
            });

            cardsContainer.appendChild(cardEl);
        });
    }

    renderCards();

    // Cancel
    document.getElementById('trainingAssignCancel').addEventListener('click', () => {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    });

    // Reset
    document.getElementById('trainingAssignReset').addEventListener('click', () => {
        for (let i = 0; i < 6; i++) tempAssignments[i] = true;
        renderCards();
    });

    // Save
    document.getElementById('trainingAssignSave').addEventListener('click', () => {
        saveTrainingAssignment(trainingType, tempAssignments);
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    });

    // ESC to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 200);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Backdrop click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 200);
        }
    });

    requestAnimationFrame(() => overlay.classList.add('open'));
}

// ===== SCENARIO INFO =====

function renderScenarioInfo(aggregated) {
    const content = document.getElementById('scenarioInfoContent');
    if (!content) return;

    const scenarioId = deckBuilderState.scenario || '1';
    const scenario = scenarioData?.scenarios?.[scenarioId];
    const scenarioName = scenario?.name || 'Unknown';
    const turnCount = scenario?.turn_count || '?';

    // Update title
    const title = document.getElementById('scenarioInfoTitle');
    if (title) title.textContent = `${scenarioName} Scenario Info`;

    const raceBonusVal = aggregated[15] || 0;
    const raceBonusClass = raceBonusVal >= 30 ? 'high' : (raceBonusVal > 0 ? 'low' : '');

    // Build base training values display from loaded data
    const trainingTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    const typeLabels = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wisdom' };

    let baseValuesHtml = '';
    trainingTypes.forEach(type => {
        const base = getBaseTrainingValues(type, scenarioId);
        if (!base) return;
        const stats = [];
        if (base.speed) stats.push(`Spd +${base.speed}`);
        if (base.stamina) stats.push(`Sta +${base.stamina}`);
        if (base.power) stats.push(`Pow +${base.power}`);
        if (base.guts) stats.push(`Gut +${base.guts}`);
        if (base.wisdom) stats.push(`Wit +${base.wisdom}`);
        if (base.skill_pt) stats.push(`SkPt +${base.skill_pt}`);
        const energyStr = base.energy >= 0 ? `+${base.energy}` : `${base.energy}`;
        stats.push(`Energy ${energyStr}`);

        baseValuesHtml += `
            <div class="scenario-base-row">
                <span class="training-type-dot ${type}"></span>
                <span class="scenario-base-label">${typeLabels[type]}:</span>
                <span class="scenario-base-values">${stats.join(', ')}</span>
            </div>
        `;
    });

    // Enhanced training for Trailblazer
    let enhancedHtml = '';
    if (scenario?.enhanced_training) {
        enhancedHtml = '<div class="deck-summary-section-label">Enhanced Training (Trailblazer)</div>';
        for (const [cmdId, baseType] of Object.entries(scenario.enhanced_training)) {
            const base = getBaseTrainingValues(`${baseType}_enhanced`, scenarioId);
            if (!base) continue;
            const stats = [];
            if (base.speed) stats.push(`Spd +${base.speed}`);
            if (base.stamina) stats.push(`Sta +${base.stamina}`);
            if (base.power) stats.push(`Pow +${base.power}`);
            if (base.guts) stats.push(`Gut +${base.guts}`);
            if (base.wisdom) stats.push(`Wit +${base.wisdom}`);
            if (base.skill_pt) stats.push(`SkPt +${base.skill_pt}`);
            const energyStr = base.energy >= 0 ? `+${base.energy}` : `${base.energy}`;
            stats.push(`Energy ${energyStr}`);
            const label = typeLabels[baseType] || baseType;

            enhancedHtml += `
                <div class="scenario-base-row enhanced">
                    <span class="training-type-dot ${baseType}"></span>
                    <span class="scenario-base-label">${label}+:</span>
                    <span class="scenario-base-values">${stats.join(', ')}</span>
                </div>
            `;
        }
    }

    // Strategy tips based on scenario
    const tips = getScenarioTips(scenarioId);

    content.innerHTML = `
        <div class="scenario-race-bonus ${raceBonusClass}">
            Your Race Bonus: ${raceBonusVal}%
        </div>

        <div class="scenario-meta">
            <span class="scenario-meta-item">Turns: ${turnCount}</span>
        </div>

        <div class="deck-summary-section-label">Base Training Values (Facility Lv.1)</div>
        <div class="scenario-base-values-grid">
            ${baseValuesHtml}
        </div>
        ${enhancedHtml}

        <div class="deck-summary-section-label">Strategy Tips</div>
        <div class="scenario-tips">
            <ul>
                ${tips.map(tip => `<li>${tip}</li>`).join('')}
            </ul>
        </div>
    `;
}

function getScenarioTips(scenarioId) {
    switch (scenarioId) {
        case '1':
            return [
                '<strong>Race Bonus is king</strong> -- races are the primary progression source, making Race Bonus the most impactful effect.',
                '<strong>Training Effectiveness</strong> stacks multiplicatively with other bonuses.',
                '<strong>Friendship Training</strong> -- fill your friendship gauge early and keep support cards at their preferred training.',
                '<strong>Energy management</strong> -- Energy Cost Reduction and Event Recovery help sustain more training turns.'
            ];
        case '2':
            return [
                '<strong>Lower base training values</strong> -- Aoharu has weaker base stats than URA, making support card bonuses even more important.',
                '<strong>Team Race focus</strong> -- team races at specific turns give bonus stats; build your team members\' stats alongside yours.',
                '<strong>Training Effectiveness matters more</strong> -- with lower bases, multiplicative bonuses have outsized impact.',
                '<strong>Friendship Training</strong> -- fill your friendship gauge early for maximum stat gains.'
            ];
        case '4':
            return [
                '<strong>Enhanced Training</strong> -- Trailblazer unlocks boosted training commands (higher stats but more energy cost).',
                '<strong>Race Bonus is king</strong> -- races are the primary progression source, making Race Bonus the most impactful effect.',
                '<strong>Shop Items</strong> -- Megaphones (+20-60% training for 2-4 turns) and Ankle Weights (+50% single stat) amplify your deck\'s effects.',
                '<strong>Energy management</strong> -- enhanced training costs more energy; Energy Cost Reduction and Event Recovery are critical.',
                '<strong>Custom goal routes</strong> -- Trailblazer supports character-specific race routes for optimized progression.'
            ];
        default:
            return ['Select a scenario to see strategy tips.'];
    }
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
    renderTrainingAssignmentModal,
    renderScenarioInfo,
    renderDeckSelect
};

Object.assign(window, window.DeckBuilderRenderer);
