// Deck Builder Renderer
// Handles all DOM rendering for the Deck Builder tab

const _logDeckBuilderUI = _debug.create('DeckBuilderUI');

// Stat tooltip descriptions (shared between deck summary and training breakdown tables)
const STAT_TOOLTIPS = [
    'Speed — affects position-taking and final stretch acceleration',
    'Stamina — determines how far a character can run at full effort',
    'Power — affects acceleration and ability to push through packs',
    'Guts — affects stamina conservation and late-race willpower',
    'Wisdom — affects race strategy and skill activation rate',
    'Skill Points — currency used to learn skills during training'
];

// ===== SHELL RENDERING =====

function renderDeckBuilderShell() {
    _logDeckBuilderUI.info('renderDeckBuilderShell');
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
                <button class="btn btn-primary" id="deckFindBestBtn">Find Best Deck</button>
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
        <div class="deck-summary deck-section collapsible" id="deckSummary">
            <div class="deck-section-header" data-section="deckSummary">
                <span class="deck-section-title">Deck Effects Summary</span>
                <span class="deck-section-toggle"></span>
            </div>
            <div class="deck-section-body">
                <div id="deckSummaryContent">Add cards to see aggregated effects.</div>
            </div>
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
                <span class="training-control-label">Character:</span>
                <button class="trainee-pick-btn" id="characterPickBtn">
                    <span id="characterPickLabel">None</span>
                </button>
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
                <div class="mood-btn-row" id="moodBtnRow">
                    <button class="mood-btn active" data-mood="very_good" title="+20% mood bonus"><img src="images/ui/mood_very_good.png" alt="Very Good" onerror="this.replaceWith(document.createTextNode('\u{1f601}'))"><span class="mood-label">Very Good</span></button>
                    <button class="mood-btn" data-mood="good" title="+10% mood bonus"><img src="images/ui/mood_good.png" alt="Good" onerror="this.replaceWith(document.createTextNode('\u{1f642}'))"><span class="mood-label">Good</span></button>
                    <button class="mood-btn" data-mood="normal" title="0% mood bonus"><img src="images/ui/mood_normal.png" alt="Normal" onerror="this.replaceWith(document.createTextNode('\u{1f610}'))"><span class="mood-label">Normal</span></button>
                    <button class="mood-btn" data-mood="bad" title="-10% mood bonus"><img src="images/ui/mood_bad.png" alt="Bad" onerror="this.replaceWith(document.createTextNode('\u{1f61e}'))"><span class="mood-label">Bad</span></button>
                    <button class="mood-btn" data-mood="very_bad" title="-20% mood bonus"><img src="images/ui/mood_very_bad.png" alt="Very Bad" onerror="this.replaceWith(document.createTextNode('\u{1f621}'))"><span class="mood-label">Very Bad</span></button>
                </div>
            </div>
            <label class="friendship-checkbox">
                <input type="checkbox" id="friendshipToggle" checked>
                Friendship Training active
            </label>
        </div>

        <!-- Training Breakdown -->
        <div class="training-breakdown deck-section collapsible" id="trainingBreakdown">
            <div class="deck-section-header" data-section="trainingBreakdown">
                <span class="deck-section-title">Training Breakdown</span>
                <span class="deck-section-toggle"></span>
            </div>
            <div class="deck-section-body">
                <div id="trainingBreakdownContent">Add cards to see training calculations.</div>
            </div>
        </div>

        <!-- Character Info -->
        <div class="deck-section collapsible" id="characterInfoSection" style="display:none">
            <div class="deck-section-header" data-section="characterInfoSection">
                <span class="deck-section-title">Character Info</span>
                <span class="deck-section-toggle"></span>
            </div>
            <div class="deck-section-body" id="characterInfoContent"></div>
        </div>

        <!-- Scenario Info -->
        <div class="deck-section collapsible" id="scenarioInfo">
            <div class="deck-section-header" data-section="scenarioInfo">
                <span class="deck-section-title" id="scenarioInfoTitle">Scenario Info</span>
                <span class="deck-section-toggle"></span>
            </div>
            <div class="deck-section-body" id="scenarioInfoContent"></div>
        </div>

        <!-- Unique Effects -->
        <div class="deck-section collapsible" id="uniqueEffectsSection" style="display:none">
            <div class="deck-section-header" data-section="uniqueEffectsSection">
                <span class="deck-section-title">Unique Effects</span>
                <span class="deck-section-toggle"></span>
            </div>
            <div class="deck-section-body" id="uniqueEffectsContent"></div>
        </div>

        <!-- Deck Skills -->
        <div class="deck-section collapsible" id="deckSkillsSection" style="display:none">
            <div class="deck-section-header" data-section="deckSkillsSection">
                <span class="deck-section-title">Deck Skills</span>
                <span class="deck-section-toggle"></span>
            </div>
            <div class="deck-section-body" id="deckSkillsContent"></div>
        </div>
    `;

    // Populate character selector
    populateCharacterSelect();

    // Initialize collapsible sections
    initCollapsibleSections();

    // Initial renders
    renderDeckSlots();
    renderScenarioInfo({});
}

// ===== DECK SLOTS =====

function renderDeckSlots() {
    _logDeckBuilderUI.debug('renderDeckSlots');
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
    img.src = `images/supports/${card.support_id}.png`;
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
            _logDeckBuilderUI.info('LB changed', { slotIndex, newLB });
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
            _logDeckBuilderUI.info('Level changed', { slotIndex, newLevel });
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
    _logDeckBuilderUI.info('renderCardPicker', { slot: deckBuilderState.activeSlot });
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
        _logDeckBuilderUI.debug('Picker SSR toggle', { ssrOnly: e.target.checked });
        filter.ssrOnly = e.target.checked;
        renderPickerCards();
    });

    document.getElementById('pickerSortBy').addEventListener('change', (e) => {
        _logDeckBuilderUI.debug('Picker sort changed', { sortBy: e.target.value });
        filter.sortBy = e.target.value;
        renderPickerCards();
    });

    document.getElementById('pickerSortDir').addEventListener('click', () => {
        filter.sortDirection = filter.sortDirection === 'desc' ? 'asc' : 'desc';
        _logDeckBuilderUI.debug('Picker sort direction', { direction: filter.sortDirection });
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
        icon.src = `images/supports/${card.support_id}_i.png`;
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
    _logDeckBuilderUI.debug('renderDeckSummary');
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
                        <th>Train Eff <span class="tooltip-small" data-tooltip="Training Effectiveness — bonus % applied to base stat gains" tabindex="0">?</span></th>
                        <th>Mood Eff <span class="tooltip-small" data-tooltip="Mood Effect — additional % bonus from character mood" tabindex="0">?</span></th>
                        ${statBonusLabels.map((label, i) => `<th>${label} <span class="tooltip-small" data-tooltip="${STAT_TOOLTIPS[i]}" tabindex="0">?</span></th>`).join('\n                        ')}
                        <th>Friend <span class="tooltip-small" data-tooltip="Friendship bonus multiplier — 1.00× = no bonus, higher = more stat gains when training with bonded cards" tabindex="0">?</span></th>
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

    const scenarioId = deckBuilderState.scenario || '1';
    const table = getRaceBonusTable(scenarioId);

    let rows = '';
    table.forEach(race => {
        const statGain = calculateRaceBonusGain(race.baseStats, raceBonusPct);
        const skillGain = calculateRaceBonusGain(race.baseSkillPt, raceBonusPct);
        const statLabel = race.allStats ? `+${statGain} \u00d75` : `+${statGain}`;
        const noteStr = race.note ? ` <span class="race-bonus-note-inline">${race.note}</span>` : '';
        rows += `
            <div class="race-bonus-row">
                <span class="race-bonus-grade">${race.label}</span>
                <span class="race-bonus-gain">${statLabel}</span>
                <span class="race-bonus-total">${skillGain} SP${noteStr}</span>
            </div>
        `;
    });

    return `
        <div class="deck-summary-section-label">Race Stat Gains (${raceBonusPct}% Race Bonus)</div>
        <div class="race-bonus-gains">
            ${rows}
            <div class="race-bonus-note">Formula: floor(base \u00d7 (1 + raceBonus / 100)). "All stats" races apply to all 5 stats; optional races boost 1 random stat.</div>
        </div>
    `;
}

// ===== TRAINING BREAKDOWN TABLE =====

function renderTrainingBreakdown(trainingResults, aggregated, failureRates) {
    _logDeckBuilderUI.debug('renderTrainingBreakdown');
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

    const hasEnergyReduction = aggregated && (aggregated[28] || 0) > 0;
    const hasFailureRates = failureRates && Object.keys(failureRates).length > 0;

    let html = `
        <div class="training-table-wrapper">
            <table class="training-table">
                <thead>
                    <tr>
                        <th>Training</th>
                        <th>Cards</th>
                        <th>Speed <span class="tooltip-small" data-tooltip="${STAT_TOOLTIPS[0]}" tabindex="0">?</span></th>
                        <th>Stamina <span class="tooltip-small" data-tooltip="${STAT_TOOLTIPS[1]}" tabindex="0">?</span></th>
                        <th>Power <span class="tooltip-small" data-tooltip="${STAT_TOOLTIPS[2]}" tabindex="0">?</span></th>
                        <th>Guts <span class="tooltip-small" data-tooltip="${STAT_TOOLTIPS[3]}" tabindex="0">?</span></th>
                        <th>Wit <span class="tooltip-small" data-tooltip="${STAT_TOOLTIPS[4]}" tabindex="0">?</span></th>
                        <th>Skill Pts <span class="tooltip-small" data-tooltip="${STAT_TOOLTIPS[5]}" tabindex="0">?</span></th>
                        <th>Energy <span class="tooltip-small" data-tooltip="Stamina cost — negative = energy drain per training session" tabindex="0">?</span></th>
                        ${hasFailureRates ? '<th>Fail % <span class="tooltip-small" data-tooltip="Training failure probability at current facility level" tabindex="0">?</span></th>' : ''}
                    </tr>
                </thead>
                <tbody>
    `;

    trainingTypes.forEach(type => {
        const result = trainingResults[type];
        if (!result) return;

        const typeCell = `<td>
            <div class="training-type-cell training-type-clickable" data-training="${type}" title="Click to assign cards">
                <span class="training-type-dot ${type}"></span>
                ${typeLabels[type]}
            </div>
        </td>`;

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
            const reduced = result.energyReduced;
            if (reduced !== undefined && reduced !== result.energy) {
                energyCell = `<td class="training-value-energy">${result.energy} <span class="energy-reduced">\u2192 ${reduced}</span></td>`;
            } else {
                energyCell = `<td class="training-value-energy">${result.energy}</td>`;
            }
        } else {
            energyCell = `<td class="training-value-zero">0</td>`;
        }

        let failCell = '';
        if (hasFailureRates) {
            const fr = failureRates[type];
            if (fr) {
                const baseStr = fr.baseRate.toFixed(1);
                const effStr = fr.effectiveRate.toFixed(1);
                if (fr.effectiveRate < fr.baseRate) {
                    failCell = `<td class="training-value-energy">${baseStr}% <span class="energy-reduced">\u2192 ${effStr}%</span></td>`;
                } else {
                    failCell = `<td class="training-value-energy">${baseStr}%</td>`;
                }
            } else {
                failCell = `<td class="training-value-zero">--</td>`;
            }
        }

        html += `<tr>${typeCell}${cardsCell}${statCells}${energyCell}${failCell}</tr>`;
    });

    html += '</tbody></table></div>';
    html += '<div class="training-breakdown-note">Click a training name to assign which cards are present. Failure rates shown at current facility level with base energy \u2265 50.</div>';
    content.innerHTML = html;

    content.querySelectorAll('.training-type-clickable').forEach(cell => {
        cell.addEventListener('click', () => {
            openTrainingAssignmentModal(cell.dataset.training);
        });
    });
}

// ===== TRAINING ASSIGNMENT MODAL =====

function renderTrainingAssignmentModal(trainingType) {
    _logDeckBuilderUI.info('renderTrainingAssignmentModal', { trainingType });
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
                     src="images/supports/${card.support_id}.png"
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

// ===== COLLAPSIBLE SECTIONS =====

const COLLAPSED_STORAGE_KEY = 'uma_deck_collapsed';

function initCollapsibleSections() {
    const container = document.getElementById('deckBuilderContainer');
    if (!container) return;

    const collapsed = getCollapsedState();

    container.addEventListener('click', (e) => {
        const header = e.target.closest('.deck-section-header');
        if (!header) return;
        const sectionId = header.dataset.section;
        const section = document.getElementById(sectionId);
        if (!section) return;

        section.classList.toggle('collapsed');
        const state = getCollapsedState();
        if (section.classList.contains('collapsed')) {
            state[sectionId] = true;
        } else {
            delete state[sectionId];
        }
        saveCollapsedState(state);
    });

    // Apply persisted collapsed state
    document.querySelectorAll('.deck-section.collapsible').forEach(section => {
        if (collapsed[section.id]) {
            section.classList.add('collapsed');
        }
    });
}

function getCollapsedState() {
    try {
        return JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '{}');
    } catch { return {}; }
}

function saveCollapsedState(state) {
    try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(state));
    } catch {}
}

// ===== CHARACTER SELECT =====

function populateCharacterSelect() {
    updateCharacterPickLabel();
}

function updateCharacterPickLabel() {
    const label = document.getElementById('characterPickLabel');
    if (!label) return;
    const charId = deckBuilderState.selectedCharacter;
    if (charId && typeof charactersData !== 'undefined' && charactersData[charId]) {
        label.textContent = charactersData[charId].name;
        label.closest('.trainee-pick-btn')?.classList.add('has-selection');
    } else {
        label.textContent = 'None';
        label.closest('.trainee-pick-btn')?.classList.remove('has-selection');
    }
}

// ===== TRAINEE PICKER MODAL =====

/**
 * Opens a modal to pick a trainee character with filters for aptitude, growth rates, and search.
 * @param {string|null} currentId - Currently selected character ID (for highlight)
 * @param {function} onSelect - Callback(characterId|null) when a trainee is selected
 */
function openTraineePicker(currentId, onSelect) {
    if (typeof charactersData === 'undefined' || !charactersData) return;

    const APTITUDE_GRADES = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const GROWTH_KEYS = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
    const GROWTH_LABELS = { speed: 'Spd', stamina: 'Sta', power: 'Pow', guts: 'Gut', wisdom: 'Wis' };
    const DIST_KEYS = ['short', 'mile', 'medium', 'long'];
    const STYLE_KEYS = ['front_runner', 'stalker', 'betweener', 'stretch'];
    const STYLE_LABELS = { front_runner: 'Front', stalker: 'Stalker', betweener: 'Between', stretch: 'Stretch' };
    const GROUND_KEYS = ['turf', 'dirt'];

    let filters = { search: '', distanceMin: {}, styleMin: {}, groundMin: {}, sort: 'name' };

    const overlay = document.createElement('div');
    overlay.className = 'picker-modal-overlay trainee-picker-overlay';
    overlay.innerHTML = `
        <div class="picker-modal trainee-picker-modal">
            <div class="picker-header">
                <h3>Select Trainee Character</h3>
                <button class="picker-close" id="traineePickerClose">&times;</button>
            </div>
            <div class="picker-filters trainee-picker-filters">
                <input class="picker-search" id="traineePickerSearch" placeholder="Search by character name...">
                <div class="trainee-filter-row">
                    <span class="trainee-filter-label">Distance:</span>
                    <div class="trainee-apt-btns" id="traineeDistBtns">
                        ${DIST_KEYS.map(k => `<button class="trainee-apt-btn" data-cat="distance" data-key="${k}" title="${k}">${k.charAt(0).toUpperCase() + k.slice(1)}</button>`).join('')}
                    </div>
                </div>
                <div class="trainee-filter-row">
                    <span class="trainee-filter-label">Style:</span>
                    <div class="trainee-apt-btns" id="traineeStyleBtns">
                        ${STYLE_KEYS.map(k => `<button class="trainee-apt-btn" data-cat="style" data-key="${k}" title="${k}">${STYLE_LABELS[k]}</button>`).join('')}
                    </div>
                </div>
                <div class="trainee-filter-row">
                    <span class="trainee-filter-label">Ground:</span>
                    <div class="trainee-apt-btns" id="traineeGroundBtns">
                        ${GROUND_KEYS.map(k => `<button class="trainee-apt-btn" data-cat="ground" data-key="${k}" title="${k}">${k.charAt(0).toUpperCase() + k.slice(1)}</button>`).join('')}
                    </div>
                </div>
                <div class="trainee-filter-row">
                    <span class="trainee-filter-label">Sort:</span>
                    <select class="picker-sort-select" id="traineePickerSort">
                        <option value="name">Name</option>
                        ${GROWTH_KEYS.map(k => `<option value="growth_${k}">${GROWTH_LABELS[k]} Growth</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="trainee-picker-grid" id="traineePickerGrid"></div>
            <div class="trainee-picker-footer">
                <button class="btn btn-secondary btn-sm" id="traineePickerClearBtn">Clear Selection</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    function getFilteredCharacters() {
        let entries = Object.entries(charactersData);

        // Search filter
        const q = filters.search.toLowerCase().trim();
        if (q) {
            entries = entries.filter(([, c]) => c.name.toLowerCase().includes(q));
        }

        // Aptitude filters (only show characters with grade A or better for selected aptitudes)
        for (const [cat, key] of Object.entries(filters.distanceMin)) {
            if (!key) continue;
            entries = entries.filter(([, c]) => {
                const grade = c.aptitudes?.distance?.[key];
                return grade && APTITUDE_GRADES.indexOf(grade) <= APTITUDE_GRADES.indexOf('A');
            });
        }
        for (const [cat, key] of Object.entries(filters.styleMin)) {
            if (!key) continue;
            entries = entries.filter(([, c]) => {
                const grade = c.aptitudes?.running_style?.[key];
                return grade && APTITUDE_GRADES.indexOf(grade) <= APTITUDE_GRADES.indexOf('A');
            });
        }
        for (const [cat, key] of Object.entries(filters.groundMin)) {
            if (!key) continue;
            entries = entries.filter(([, c]) => {
                const grade = c.aptitudes?.ground?.[key];
                return grade && APTITUDE_GRADES.indexOf(grade) <= APTITUDE_GRADES.indexOf('A');
            });
        }

        // Sort
        if (filters.sort === 'name') {
            entries.sort((a, b) => a[1].name.localeCompare(b[1].name));
        } else if (filters.sort.startsWith('growth_')) {
            const gk = filters.sort.replace('growth_', '');
            entries.sort((a, b) => (b[1].growth_rates?.[gk] || 0) - (a[1].growth_rates?.[gk] || 0));
        }

        return entries;
    }

    function gradeClass(grade) {
        if (grade === 'S' || grade === 'A') return 'apt-good';
        if (grade === 'B' || grade === 'C') return 'apt-ok';
        return 'apt-low';
    }

    function renderGrid() {
        const grid = overlay.querySelector('#traineePickerGrid');
        const entries = getFilteredCharacters();

        if (entries.length === 0) {
            grid.innerHTML = '<div class="picker-no-results">No characters match the current filters.</div>';
            return;
        }

        grid.innerHTML = entries.map(([id, char]) => {
            const gr = char.growth_rates || {};
            const apt = char.aptitudes || {};
            const isSelected = id === currentId;

            // Growth rate bars
            const growthHtml = GROWTH_KEYS.map(k => {
                const val = gr[k] || 0;
                return `<span class="trainee-growth-stat${val > 0 ? ' has-growth' : ''}">
                    <span class="trainee-growth-label">${GROWTH_LABELS[k]}</span>
                    <span class="trainee-growth-val">${val}%</span>
                </span>`;
            }).join('');

            // Aptitude summary — distance, style, ground
            const distHtml = DIST_KEYS.map(k => {
                const g = apt.distance?.[k] || '-';
                return `<span class="trainee-apt ${gradeClass(g)}">${k.charAt(0).toUpperCase()}:${g}</span>`;
            }).join(' ');
            const styleHtml = STYLE_KEYS.map(k => {
                const g = apt.running_style?.[k] || '-';
                return `<span class="trainee-apt ${gradeClass(g)}">${STYLE_LABELS[k].charAt(0)}:${g}</span>`;
            }).join(' ');
            const groundHtml = GROUND_KEYS.map(k => {
                const g = apt.ground?.[k] || '-';
                return `<span class="trainee-apt ${gradeClass(g)}">${k.charAt(0).toUpperCase()}:${g}</span>`;
            }).join(' ');

            return `<div class="trainee-tile${isSelected ? ' selected' : ''}" data-id="${id}">
                <img class="trainee-tile-icon" src="images/characters/${id}_icon.png"
                     onerror="this.style.display='none'" alt="${char.name}">
                <div class="trainee-tile-info">
                    <div class="trainee-tile-name">${char.name}</div>
                    <div class="trainee-tile-growth">${growthHtml}</div>
                    <div class="trainee-tile-apts">${distHtml} ${groundHtml} ${styleHtml}</div>
                </div>
            </div>`;
        }).join('');

        // Click handler on tiles
        grid.querySelectorAll('.trainee-tile').forEach(tile => {
            tile.onclick = () => {
                const selectedId = tile.dataset.id;
                currentId = selectedId;
                closeAndReturn(selectedId);
            };
        });
    }

    function closeAndReturn(selectedId) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
        if (onSelect) onSelect(selectedId || null);
    }

    // Wire events
    overlay.querySelector('#traineePickerClose').onclick = () => closeAndReturn(currentId);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAndReturn(currentId);
    });

    overlay.querySelector('#traineePickerClearBtn').onclick = () => closeAndReturn(null);

    // Search
    const searchInput = overlay.querySelector('#traineePickerSearch');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filters.search = searchInput.value;
            renderGrid();
        }, 200);
    });

    // Sort
    overlay.querySelector('#traineePickerSort').addEventListener('change', (e) => {
        filters.sort = e.target.value;
        renderGrid();
    });

    // Aptitude filter buttons (toggle)
    overlay.querySelectorAll('.trainee-apt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            const key = btn.dataset.key;
            const isActive = btn.classList.contains('active');

            // Deactivate all in same category
            btn.closest('.trainee-apt-btns').querySelectorAll('.trainee-apt-btn').forEach(b => b.classList.remove('active'));

            if (isActive) {
                // Toggle off
                if (cat === 'distance') delete filters.distanceMin[cat];
                else if (cat === 'style') delete filters.styleMin[cat];
                else if (cat === 'ground') delete filters.groundMin[cat];
            } else {
                btn.classList.add('active');
                if (cat === 'distance') filters.distanceMin[cat] = key;
                else if (cat === 'style') filters.styleMin[cat] = key;
                else if (cat === 'ground') filters.groundMin[cat] = key;
            }
            renderGrid();
        });
    });

    renderGrid();
    searchInput.focus();
}

// ===== CHARACTER INFO =====

function renderCharacterInfoSection() {
    const section = document.getElementById('characterInfoSection');
    const content = document.getElementById('characterInfoContent');
    if (!section || !content) return;

    const charData = getSelectedCharacterData();
    if (!charData) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    const stats5 = charData.base_stats?.['5'];
    const gr = charData.growth_rates;
    const apt = charData.aptitudes;

    let statsHtml = '';
    if (stats5) {
        const statKeys = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
        const statLabels = ['Speed', 'Stamina', 'Power', 'Guts', 'Wisdom'];
        statsHtml = `
            <div class="deck-summary-section-label">Base Stats (5\u2605)</div>
            <div class="deck-summary-grid">
                ${statKeys.map((k, i) => `
                    <div class="deck-summary-item">
                        <span class="deck-summary-item-label">${statLabels[i]}</span>
                        <span class="deck-summary-item-value">${stats5[k]}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    let growthHtml = '';
    if (gr) {
        const growthKeys = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
        const growthLabels = ['Speed', 'Stamina', 'Power', 'Guts', 'Wisdom'];
        const maxGrowth = Math.max(...growthKeys.map(k => gr[k] || 0), 1);
        growthHtml = `
            <div class="deck-summary-section-label">Growth Rates</div>
            <div class="char-growth-bars">
                ${growthKeys.map((k, i) => {
                    const val = gr[k] || 0;
                    const pct = Math.round(val / maxGrowth * 100);
                    return `
                        <div class="char-growth-row">
                            <span class="char-growth-label">${growthLabels[i]}</span>
                            <div class="char-growth-bar-track">
                                <div class="char-growth-bar-fill ${k}" style="width:${pct}%"></div>
                            </div>
                            <span class="char-growth-value">${val}%</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    let aptHtml = '';
    if (apt) {
        const distKeys = ['short', 'mile', 'medium', 'long'];
        const styleKeys = ['front_runner', 'stalker', 'betweener', 'stretch'];
        const styleLabels = { front_runner: 'Front', stalker: 'Stalker', betweener: 'Between', stretch: 'Stretch' };
        const groundKeys = ['turf', 'dirt'];

        aptHtml = `
            <div class="deck-summary-section-label">Aptitudes</div>
            <div class="char-aptitude-grid">
                <div class="char-aptitude-group">
                    <div class="char-aptitude-group-label">Distance</div>
                    ${distKeys.map(k => `
                        <span class="char-aptitude-cell">
                            <span class="char-aptitude-name">${k.charAt(0).toUpperCase() + k.slice(1)}</span>
                            <span class="char-aptitude-grade grade-${(apt.distance?.[k] || 'G').toLowerCase()}">${apt.distance?.[k] || 'G'}</span>
                        </span>
                    `).join('')}
                </div>
                <div class="char-aptitude-group">
                    <div class="char-aptitude-group-label">Style</div>
                    ${styleKeys.map(k => `
                        <span class="char-aptitude-cell">
                            <span class="char-aptitude-name">${styleLabels[k]}</span>
                            <span class="char-aptitude-grade grade-${(apt.running_style?.[k] || 'G').toLowerCase()}">${apt.running_style?.[k] || 'G'}</span>
                        </span>
                    `).join('')}
                </div>
                <div class="char-aptitude-group">
                    <div class="char-aptitude-group-label">Ground</div>
                    ${groundKeys.map(k => `
                        <span class="char-aptitude-cell">
                            <span class="char-aptitude-name">${k.charAt(0).toUpperCase() + k.slice(1)}</span>
                            <span class="char-aptitude-grade grade-${(apt.ground?.[k] || 'G').toLowerCase()}">${apt.ground?.[k] || 'G'}</span>
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    content.innerHTML = statsHtml + growthHtml + aptHtml;
}

// ===== UNIQUE EFFECTS SECTION =====

function renderUniqueEffectsSection(uniqueEffects) {
    const section = document.getElementById('uniqueEffectsSection');
    const content = document.getElementById('uniqueEffectsContent');
    if (!section || !content) return;

    if (!uniqueEffects || uniqueEffects.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    const rows = uniqueEffects.map(ue => {
        const badge = ue.active
            ? '<span class="ue-badge active">Active</span>'
            : `<span class="ue-badge locked">Locked (Lv.${ue.unlockLevel})</span>`;

        const effectDetails = ue.effects.map(e => {
            const name = getEffectName(e.type);
            return `<span class="ue-effect-detail">${name} +${e.value}</span>`;
        }).join('');

        return `
            <div class="ue-row ${ue.active ? '' : 'ue-locked'}">
                <div class="ue-row-header">
                    <span class="ue-card-name">${ue.cardName}</span>
                    ${badge}
                </div>
                <div class="ue-name">${ue.name}</div>
                <div class="ue-desc">${ue.description}</div>
                <div class="ue-effects">${effectDetails}</div>
            </div>
        `;
    }).join('');

    content.innerHTML = rows;
}

// ===== DECK SKILLS SECTION =====

function renderDeckSkillsSection(deckSkills) {
    const section = document.getElementById('deckSkillsSection');
    const content = document.getElementById('deckSkillsContent');
    if (!section || !content) return;

    if (!deckSkills || deckSkills.totalUnique === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    // Update title with count
    const titleEl = section.querySelector('.deck-section-title');
    if (titleEl) titleEl.textContent = `Deck Skills (${deckSkills.totalUnique} unique)`;

    function renderSkillList(skills, label) {
        if (skills.length === 0) return '';

        // Group by first type tag
        const grouped = {};
        skills.forEach(skill => {
            const typeTag = (skill.type && skill.type.length > 0) ? skill.type[0] : 'general';
            if (!grouped[typeTag]) grouped[typeTag] = [];
            grouped[typeTag].push(skill);
        });

        let html = `<div class="deck-summary-section-label">${label} (${skills.length})</div>`;
        html += '<div class="ds-skill-groups">';

        for (const [typeTag, group] of Object.entries(grouped).sort()) {
            const typeLabel = getSkillTypeDescription(typeTag) || typeTag;
            html += `<div class="ds-skill-group">`;
            html += `<div class="ds-skill-group-label">${typeLabel}</div>`;
            group.forEach(skill => {
                const costStr = skill.cost != null ? `<span class="ds-skill-cost">${skill.cost} SP</span>` : '';
                const sourceStr = skill.sources.length > 1
                    ? `<span class="ds-skill-source">(${skill.sources.length} cards)</span>`
                    : `<span class="ds-skill-source">${skill.sources[0]}</span>`;
                html += `
                    <div class="ds-skill-row" title="${skill.description}">
                        <span class="ds-skill-name">${skill.name}</span>
                        ${costStr}
                        ${sourceStr}
                    </div>
                `;
            });
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    content.innerHTML =
        renderSkillList(deckSkills.hintSkills, 'Hint Skills') +
        renderSkillList(deckSkills.eventSkills, 'Event Skills');
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

    // Build base training values display from loaded data at current facility level
    const trainingTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    const typeLabels = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wisdom' };
    const facilityLevel = deckBuilderState.trainingLevel || 1;

    let baseValuesHtml = '';
    trainingTypes.forEach(type => {
        const base = getBaseTrainingValues(type, scenarioId, facilityLevel);
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

    // Enhanced training for Trackblazer
    let enhancedHtml = '';
    if (scenario?.enhanced_training) {
        enhancedHtml = '<div class="deck-summary-section-label">Enhanced Training (Trackblazer)</div>';
        for (const [cmdId, baseType] of Object.entries(scenario.enhanced_training)) {
            const base = getBaseTrainingValues(`${baseType}_enhanced`, scenarioId, facilityLevel);
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

        <div class="deck-summary-section-label">Base Training Values (Facility Lv.${facilityLevel})</div>
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
                '<strong>Enhanced Training</strong> -- Trackblazer unlocks boosted training commands (higher stats but more energy cost).',
                '<strong>Race Bonus is king</strong> -- races are the primary progression source, making Race Bonus the most impactful effect.',
                '<strong>Shop Items</strong> -- Megaphones (+20-60% training for 2-4 turns) and Ankle Weights (+50% single stat) amplify your deck\'s effects.',
                '<strong>Energy management</strong> -- enhanced training costs more energy; Energy Cost Reduction and Event Recovery are critical.',
                '<strong>Custom goal routes</strong> -- Trackblazer supports character-specific race routes for optimized progression.'
            ];
        default:
            return ['Select a scenario to see strategy tips.'];
    }
}

// ===== DECK SELECT RENDERING =====

function renderDeckSelect() {
    _logDeckBuilderUI.debug('renderDeckSelect', { deckCount: deckBuilderState.savedDecks.length });
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
    renderDeckSelect,
    renderUniqueEffectsSection,
    renderDeckSkillsSection,
    renderCharacterInfoSection,
    populateCharacterSelect,
    initCollapsibleSections
};

Object.assign(window, window.DeckBuilderRenderer);
