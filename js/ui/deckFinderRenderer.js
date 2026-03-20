// Deck Finder Renderer
// Modal UI, filter panel, results list, preview, and comparison for Best Deck Finder

const _logDeckFinderUI = _debug.create('DeckFinderUI');

// Track trigger element for focus return on close
let _finderTriggerEl = null;

// ===== METRIC TOOLTIPS =====
const FINDER_METRIC_TOOLTIPS = {
    'metric-race': 'Race Bonus — extra stats earned from races',
    'metric-train': 'Training Effectiveness — bonus % applied to base stat gains',
    'metric-friend': 'Friendship Bonus — stat gain multiplier when training with bonded cards',
    'metric-energy': 'Energy Cost Reduction — lowers stamina cost of training',
    'metric-event': 'Event Recovery — increases HP recovered from support card events',
    'metric-hints': 'Hint Skill Count — total hint skills available from this deck',
    'metric-aptitude': 'Skill Aptitude — how well deck skills match your trainee\'s race conditions'
};

// ===== CARD LOOKUP MAP =====
// O(1) lookup by support_id instead of O(n) cardData.find() in render loops
let _cardDataMap = null;
function getCardDataMap() {
    if (!_cardDataMap) {
        _cardDataMap = new Map(cardData.map(c => [c.support_id, c]));
    }
    return _cardDataMap;
}
function invalidateCardDataMap() { _cardDataMap = null; }

// ===== CARD PICKER STATE =====
let _finderExcludeCardIds = new Set();   // support_id strings
let _finderIncludeCardIds = new Set();   // support_id strings
let _finderIncludeFriendIds = new Set(); // support_id strings

// ===== MODAL LIFECYCLE =====

let _finderInitialized = false;

function openDeckFinder() {
    _logDeckFinderUI.info('openDeckFinder');
    const isReopen = _finderInitialized;

    if (!isReopen) {
        // First open — initialize with defaults
        deckFinderState.filters = getDefaultFinderFilters();
        deckFinderState.results = [];
        deckFinderState.selectedResultIndex = -1;
        deckFinderState.compareIndices = [];
        deckFinderState.searching = false;
        deckFinderState.progress = 0;
        deckFinderState.searchStats = null;
        deckFinderState.traineeData = null;
        if (!deckFinderState.sortLayers) deckFinderState.sortLayers = [];
        // Initialize custom weights from scenario defaults
        if (!deckFinderState.customWeights) resetWeightsToDefaults('1');
        // Initialize search settings
        if (!deckFinderState.searchSettings) {
            deckFinderState.searchSettings = { workerCount: 'auto', warmStartCount: 1500, stabilityPercent: 30, searchPoolSize: 500 };
        }
        _finderInitialized = true;
    }

    // Cancel any active search but preserve results
    if (deckFinderState.searching) cancelSearch();

    _resultsDelegateWired = false;

    const existing = document.getElementById('deckFinderOverlay');
    if (existing) existing.remove();

    _finderTriggerEl = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'deckFinderOverlay';
    overlay.className = 'picker-modal-overlay deck-finder-overlay';
    overlay.innerHTML = buildFinderModalHTML();
    document.body.appendChild(overlay);

    // Focus trap for modal accessibility
    const finderModal = overlay.querySelector('.deck-finder-modal');
    if (finderModal) trapFocus(finderModal);

    requestAnimationFrame(() => overlay.classList.add('open'));
    initFinderEvents();

    // Restore UI from persisted state on reopen
    if (isReopen) {
        restoreFinderUIFromState();
    }
}

function resetDeckFinder() {
    _logDeckFinderUI.info('resetDeckFinder — all filters cleared');
    deckFinderState.filters = getDefaultFinderFilters();
    deckFinderState.results = [];
    deckFinderState.selectedResultIndex = -1;
    deckFinderState.compareIndices = [];
    deckFinderState.searching = false;
    deckFinderState.progress = 0;
    deckFinderState.searchStats = null;
    deckFinderState.traineeData = null;
    deckFinderState.sortLayers = [];
    deckFinderState.customWeights = null;
    resetWeightsToDefaults('1');
    deckFinderState.searchSettings = { workerCount: 'auto', warmStartCount: 1500, stabilityPercent: 30, searchPoolSize: 500 };
    _finderSkillTypeLayers = [];
    _selectedRequiredSkills = [];
    _finderExcludeCardIds = new Set();
    _finderIncludeCardIds = new Set();
    _finderIncludeFriendIds = new Set();
    _finderInitialized = true;

    // Rebuild the filter panel with defaults
    const filtersEl = document.getElementById('finderFilters');
    if (filtersEl) filtersEl.innerHTML = buildFinderFiltersHTML();

    // Re-wire events on the new filter DOM
    const overlay = document.getElementById('deckFinderOverlay');
    if (overlay) {
        // Re-init all filter-related events
        reInitFilterEvents(overlay);
    }

    // Clear results
    const resultsBody = document.getElementById('finderResultsBody');
    if (resultsBody) {
        resultsBody.innerHTML = `<div class="finder-results-placeholder">
            <div class="finder-placeholder-icon">&#128269;</div>
            <div>Configure filters and click <strong>Search</strong> to find optimal decks.</div>
        </div>`;
    }

    showToast('Deck finder reset to defaults.', 'info');
}

function closeDeckFinder() {
    _logDeckFinderUI.info('closeDeckFinder');
    // Save current UI state before tearing down DOM
    const overlay = document.getElementById('deckFinderOverlay');
    if (overlay) {
        try { deckFinderState.filters = collectFiltersFromUI(); } catch (e) {}
    }
    if (deckFinderState.searching) cancelSearch();
    if (overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    }
    // Return focus to trigger element
    if (_finderTriggerEl && _finderTriggerEl.focus) {
        _finderTriggerEl.focus();
        _finderTriggerEl = null;
    }
}

// ===== MODAL HTML =====

function buildFinderModalHTML() {
    return `
        <div class="deck-finder-shield"></div>
        <div class="picker-modal deck-finder-modal" role="dialog" aria-modal="true" aria-label="Find best deck">
            <div class="picker-header">
                <h3>Find Best Deck</h3>
                <button class="picker-close" id="finderClose" aria-label="Close (Esc)">&times;</button>
            </div>
            <div class="deck-finder-body">
                <div class="deck-finder-filters" id="finderFilters">
                    ${buildFinderFiltersHTML()}
                </div>
                <div class="deck-finder-results" id="finderResults">
                    <div class="finder-search-bar" id="finderSearchBar">
                        <button class="btn btn-primary finder-search-btn" id="finderSearchBtn">Search</button>
                        <button class="btn btn-danger finder-search-btn" id="finderCancelBtn" style="display:none;">Cancel</button>
                        <div class="finder-progress" id="finderProgress" style="display:none;" aria-live="assertive" role="status">
                            <div class="finder-progress-bar">
                                <div class="finder-progress-fill" id="finderProgressFill"></div>
                            </div>
                            <span class="finder-progress-text" id="finderProgressText">0%</span>
                            <span class="finder-progress-matches" id="finderProgressMatches"></span>
                        </div>
                    </div>
                    <div class="finder-results-body" id="finderResultsBody">
                        <div class="finder-results-placeholder">
                            <div class="finder-placeholder-icon">&#128269;</div>
                            <div>Configure filters and click <strong>Search</strong> to find optimal decks.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateFinderTraineeLabel() {
    const label = document.getElementById('finderTraineePickLabel');
    if (!label) return;
    const charId = deckFinderState.filters?.selectedTrainee;
    if (charId && typeof charactersData !== 'undefined' && charactersData[charId]) {
        label.textContent = charactersData[charId].name;
        label.closest('.trainee-pick-btn')?.classList.add('has-selection');
    } else {
        label.textContent = '— No trainee selected —';
        label.closest('.trainee-pick-btn')?.classList.remove('has-selection');
    }
}

function buildFinderFiltersHTML() {
    const typeOptions = [
        { key: 'speed', label: 'Speed' },
        { key: 'stamina', label: 'Stamina' },
        { key: 'power', label: 'Power' },
        { key: 'guts', label: 'Guts' },
        { key: 'intelligence', label: 'Wit' },
        { key: 'friend', label: 'Friend' }
    ];
    const typeIconIdx = { speed: '0', stamina: '1', power: '2', guts: '3', intelligence: '4', friend: '5' };

    // Build scenario options
    const scenarios = typeof getAvailableScenarios === 'function' ? getAvailableScenarios() : [];
    const scenarioOptions = scenarios.length > 0
        ? scenarios.map(s => `<option value="${s.id}"${s.id === '1' ? ' selected' : ''}>${s.name}</option>`).join('')
        : Object.entries(SCENARIO_WEIGHTS).map(([id, data]) =>
            `<option value="${id}"${id === '1' ? ' selected' : ''}>${data.name}</option>`
        ).join('');

    return `
        <!-- ═══ CARD POOL FILTERS ═══ -->
        <div class="finder-group-header" data-tooltip="Filters narrow the card pool before searching for optimal decks" tabindex="0">Card Pool</div>

        <!-- Scenario -->
        <div class="finder-section">
            <div class="finder-label">Scoring Scenario</div>
            <select class="finder-scenario-select" id="finderScenario">
                ${scenarioOptions}
            </select>
        </div>

        <!-- Trainee -->
        <div class="finder-section">
            <div class="finder-label">Trainee Character <span class="finder-hint">(optional — weights skills by aptitude)</span></div>
            <button class="trainee-pick-btn finder-trainee-pick-btn" id="finderTraineePickBtn">
                <span id="finderTraineePickLabel">— No trainee selected —</span>
            </button>
        </div>

        <!-- Card Pool -->
        <div class="finder-section">
            <div class="finder-label">Include Cards From</div>
            <div class="finder-toggle-row">
                <button class="finder-toggle-btn active" data-pool="owned" data-tooltip="Only search cards in your collection" tabindex="0">Owned Only</button>
                <button class="finder-toggle-btn" data-pool="all" data-tooltip="Search all available cards, including ones you don't own" tabindex="0">All Cards</button>
            </div>
            <label class="finder-max-potential-label" style="margin-top:var(--space-xs);">
                <input type="checkbox" id="finderMaxPotentialToggle">
                Max Potential
                <span class="tooltip-small" data-tooltip="Use each card's maximum level for its limit break when scoring decks. Shows the best possible results assuming all cards are fully leveled." tabindex="0">?</span>
            </label>
        </div>

        <!-- Rarity -->
        <div class="finder-section">
            <div class="finder-label">Card Rarity</div>
            <div class="quick-add-icon-grid finder-icon-grid">
                <button class="quick-add-icon-btn selected rainbow-border" data-rarity="3" id="finderSSR">
                    <img class="quick-add-rarity-icon" src="images/supports/utx_txt_rarity_03.png" alt="SSR">
                </button>
                <button class="quick-add-icon-btn selected" data-rarity="2" id="finderSR">
                    <img class="quick-add-rarity-icon" src="images/supports/utx_txt_rarity_02.png" alt="SR">
                </button>
                <button class="quick-add-icon-btn" data-rarity="1" id="finderR">
                    <img class="quick-add-rarity-icon" src="images/supports/utx_txt_rarity_01.png" alt="R">
                </button>
            </div>
        </div>

        <!-- Types -->
        <div class="finder-section">
            <div class="finder-label">Card Types</div>
            <div class="quick-add-icon-grid finder-icon-grid">
                ${typeOptions.map(t => `
                    <button class="quick-add-icon-btn selected finder-type-btn" data-type="${t.key}">
                        <img class="quick-add-type-icon" src="images/supports/utx_ico_obtain_0${typeIconIdx[t.key]}.png" alt="${t.label}"> ${t.label}
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- Exclude Cards (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderExcludeBody">
                <span class="finder-collapse-icon">&#9654;</span> Exclude Cards
                <span class="finder-hint">(remove specific cards from pool)</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderExcludeBody">
                <div class="finder-label">By Character Name</div>
                <div class="multi-select" id="finderExcludeCharSelect">
                    <div class="multi-select-trigger">
                        <span class="multi-select-text">Select characters...</span>
                        <span class="multi-select-arrow">&#9660;</span>
                    </div>
                    <div class="multi-select-dropdown" id="finderExcludeCharDropdown"></div>
                </div>
                <div class="finder-exclusion-list" id="finderExcludeChars"></div>
                <div class="finder-label" style="margin-top:8px;">By Specific Card</div>
                <button class="btn btn-secondary btn-sm finder-pick-btn" id="finderExcludeCardPickBtn">
                    + Add Cards to Exclude
                </button>
                <div class="finder-thumb-grid" id="finderExcludeCardThumbs"></div>
            </div>
        </div>

        <!-- Include Cards (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderIncludeBody">
                <span class="finder-collapse-icon">&#9654;</span> Include Cards
                <span class="finder-hint">(force specific cards into deck)</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderIncludeBody">
                <!-- Player Slot Cards -->
                <div class="finder-label">Player Deck Cards</div>
                <div class="finder-include-mode">
                    <span class="finder-hint">Mode:</span>
                    <label class="finder-pill finder-pill-sm active"><input type="radio" name="finderIncludeMode" value="all" checked hidden> ALL</label>
                    <label class="finder-pill finder-pill-sm"><input type="radio" name="finderIncludeMode" value="any" hidden> ANY</label>
                </div>
                <button class="btn btn-secondary btn-sm finder-pick-btn" id="finderIncludeCardPickBtn">
                    + Add Cards to Include
                </button>
                <div class="finder-thumb-grid" id="finderIncludeCardThumbs"></div>
                <div class="finder-include-info" id="finderIncludeInfo"></div>

                <!-- Friend Slot Card -->
                <div class="finder-label" style="margin-top:8px;">Friend Cards <span class="finder-hint">(optional — decks choose from these)</span></div>
                <button class="btn btn-secondary btn-sm finder-pick-btn" id="finderIncludeFriendPickBtn">
                    + Add Friend Cards
                </button>
                <div class="finder-thumb-grid finder-thumb-grid-single" id="finderIncludeFriendThumb"></div>
                <div class="finder-include-warning" id="finderIncludeDupeWarning" style="display:none;"></div>
            </div>
        </div>

        <!-- ═══ DECK REQUIREMENTS ═══ -->
        <div class="finder-group-header">Deck Requirements</div>

        <!-- Result Count -->
        <div class="finder-section">
            <div class="finder-label">Display Count</div>
            <div class="finder-toggle-row">
                <button class="finder-toggle-btn active" data-count="10">10</button>
                <button class="finder-toggle-btn" data-count="25">25</button>
                <button class="finder-toggle-btn" data-count="50">50</button>
            </div>
        </div>

        <!-- Result Ranking (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderSortBody">
                <span class="finder-collapse-icon">&#9654;</span> Result Ranking
                <span class="finder-hint">(how decks are ordered)</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderSortBody">
                <div class="finder-sort-layers" id="finderSortLayers">
                    <div class="no-sorts-message">Default: score descending. Add layers to customize ranking.</div>
                </div>
                <button class="btn btn-secondary btn-sm finder-add-sort-btn" id="finderAddSortBtn">
                    <span class="sort-icon">+</span> Add Sort Layer
                </button>
            </div>
        </div>

        <!-- Deck Type Composition (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderRatioBody">
                <span class="finder-collapse-icon">&#9654;</span> Deck Type Composition
                <span class="finder-hint">(require N cards of each type)</span>
                <span class="tooltip-small" data-tooltip="Learn about type composition — click for full guide" tabindex="0" onclick="event.stopPropagation(); openHelpModal('deck-finder'); return false;">?</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderRatioBody">
                <div class="finder-ratio-grid">
                    ${typeOptions.map(t => `
                        <div class="finder-ratio-item" data-type="${t.key}">
                            <img class="finder-ratio-icon" src="images/supports/utx_ico_obtain_0${typeIconIdx[t.key]}.png" alt="${t.label}">
                            <input type="number" class="finder-ratio-input" data-type="${t.key}" min="0" max="6" value="0">
                        </div>
                    `).join('')}
                </div>
                <div class="finder-ratio-sum" id="finderRatioSum" data-tooltip="Total must equal 6 (the number of deck slots). Set to 0 for flexible distribution." tabindex="0">Sum: 0 / 6</div>
            </div>
        </div>

        <!-- Minimum Deck Effects (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderThresholdBody">
                <span class="finder-collapse-icon">&#9654;</span> Minimum Deck Effects
                <span class="finder-hint">(combined across all 6 cards)</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderThresholdBody">
                <div class="finder-threshold-grid">
                    <div class="finder-threshold-item" data-tooltip="Minimum combined Race Bonus across all 6 cards. Decks below this value are excluded." tabindex="0">
                        <label>Race Bonus</label>
                        <div class="finder-input-suffix"><input type="number" id="finderMinRace" min="0" value="0"><span>%</span></div>
                    </div>
                    <div class="finder-threshold-item" data-tooltip="Minimum combined Training Effectiveness across all 6 cards. Decks below this value are excluded." tabindex="0">
                        <label>Train Eff</label>
                        <div class="finder-input-suffix"><input type="number" id="finderMinTrain" min="0" value="0"><span>%</span></div>
                    </div>
                    <div class="finder-threshold-item" data-tooltip="Minimum combined Friendship bonus across all 6 cards. Decks below this value are excluded." tabindex="0">
                        <label>Friendship</label>
                        <div class="finder-input-suffix"><input type="number" id="finderMinFriend" min="0" value="0"><span>%</span></div>
                    </div>
                    <div class="finder-threshold-item" data-tooltip="Minimum combined Energy Reduction across all 6 cards. Decks below this value are excluded." tabindex="0">
                        <label>Energy Red</label>
                        <div class="finder-input-suffix"><input type="number" id="finderMinEnergy" min="0" value="0"><span>%</span></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Deck Skill Requirements (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderSkillBody">
                <span class="finder-collapse-icon">&#9654;</span> Deck Skill Requirements
                <span class="finder-hint">(skills the deck must provide)</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderSkillBody">
                <!-- Required Hint Skills -->
                <div class="finder-label">Required Hint Skills</div>
                <div class="multi-select" id="finderReqSkillSelect">
                    <div class="multi-select-trigger">
                        <span class="multi-select-text">Select hint skills...</span>
                        <span class="multi-select-arrow">&#9660;</span>
                    </div>
                    <div class="multi-select-dropdown" id="finderReqSkillDropdown"></div>
                </div>
                <div class="finder-req-skills-mode">
                    <span class="finder-hint">Mode:</span>
                    <label class="finder-pill finder-pill-sm active" data-tooltip="ALL — deck must contain every selected skill" tabindex="0"><input type="radio" name="finderReqSkillMode" value="all" checked hidden> ALL</label>
                    <label class="finder-pill finder-pill-sm" data-tooltip="ANY — deck must contain at least one of the selected skills" tabindex="0"><input type="radio" name="finderReqSkillMode" value="any" hidden> ANY</label>
                </div>
                <div class="finder-req-skills-list" id="finderReqSkillsList"></div>

                <!-- Required Skill Types — layer system -->
                <div class="finder-label" style="margin-top:var(--space-sm);">Minimum Skill Types in Deck</div>
                <div class="finder-skill-type-layers" id="finderSkillTypeLayers">
                    <div class="no-sorts-message">No skill type requirements. Add layers to require specific types.</div>
                </div>
                <button class="btn btn-secondary btn-sm finder-add-sort-btn" id="finderAddSkillTypeBtn">
                    <span class="sort-icon">+</span> Add Skill Type
                </button>
            </div>
        </div>

        <!-- ═══ ADVANCED SETTINGS ═══ -->
        <div class="finder-group-header">Advanced Settings</div>

        <!-- Scoring Weights (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderWeightsBody">
                <span class="finder-collapse-icon">&#9654;</span> Scoring Weights
                <span class="finder-hint" data-tooltip="Higher weight = metric prioritized more in deck scoring. Adjust to find decks that match your training strategy." tabindex="0">(what the search optimizes for)</span>
                <span class="tooltip-small" data-tooltip="Learn about scoring weights — click for full guide" tabindex="0" onclick="event.stopPropagation(); openHelpModal('deck-finder'); return false;">?</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderWeightsBody">
                <div class="finder-weights-list" id="finderWeightsList"></div>
                <button class="btn btn-secondary btn-sm" id="finderResetWeightsBtn" style="width:100%;margin-top:4px;">Reset to Scenario Defaults</button>
            </div>
        </div>

        <!-- Search Settings (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderSearchSettingsBody">
                <span class="finder-collapse-icon">&#9654;</span> Search Settings
                <span class="finder-hint">(performance tuning)</span>
            </button>
            <div class="finder-collapse-body collapsed" id="finderSearchSettingsBody">
                <div class="finder-threshold-grid">
                    <div class="finder-threshold-item" data-tooltip="Number of parallel web workers used during search. Auto detects your CPU core count. More threads = faster search but higher CPU usage." tabindex="0">
                        <label>Worker Threads</label>
                        <select class="finder-small-input" id="finderWorkerCount" style="width:100%;">
                            <option value="auto" selected>Auto</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="4">4</option>
                            <option value="8">8</option>
                        </select>
                    </div>
                    <div class="finder-threshold-item" data-tooltip="Number of random decks evaluated before the optimizer begins. Higher values explore more of the search space but take longer to start. Default: 1500." tabindex="0">
                        <label>Warm-start Count</label>
                        <div class="finder-input-suffix"><input type="number" id="finderWarmStartCount" min="100" max="10000" value="1500"></div>
                    </div>
                    <div class="finder-threshold-item" data-tooltip="Maximum number of top-scoring decks kept during search. Higher values find more diverse results but use more memory. Default: 500." tabindex="0">
                        <label>Search Pool Size</label>
                        <div class="finder-input-suffix"><input type="number" id="finderSearchPoolSize" min="100" max="2000" value="500"></div>
                    </div>
                    <div class="finder-threshold-item" data-tooltip="Percentage of warm-start decks that must converge before the optimizer stops early. Lower values stop sooner (faster but may miss results). Default: 30%." tabindex="0">
                        <label>Stability %</label>
                        <div class="finder-input-suffix"><input type="number" id="finderStabilityPct" min="5" max="100" value="30"><span>%</span></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Reset -->
        <div class="finder-section finder-reset-section">
            <button class="btn btn-danger btn-sm" id="finderResetBtn">Reset All Filters</button>
        </div>
    `;
}


// ===== EVENT WIRING =====

function initFinderEvents() {
    const overlay = document.getElementById('deckFinderOverlay');
    if (!overlay) return;

    // Close
    overlay.querySelector('#finderClose').addEventListener('click', closeDeckFinder);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDeckFinder();
    });

    // ESC
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeDeckFinder();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Toggle buttons (pool, count)
    overlay.querySelectorAll('.finder-toggle-row').forEach(row => {
        row.querySelectorAll('.finder-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                row.querySelectorAll('.finder-toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _logDeckFinderUI.debug('Toggle', { pool: btn.dataset.pool, count: btn.dataset.count });
            });
        });
    });

    // Rarity icon-button toggles
    overlay.querySelectorAll('.finder-icon-grid .quick-add-icon-btn[data-rarity]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
            _logDeckFinderUI.debug('Rarity toggle', { rarity: btn.dataset.rarity, selected: btn.classList.contains('selected') });
        });
    });

    // Type icon-button toggles
    overlay.querySelectorAll('.finder-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isSelected = btn.classList.toggle('selected');
            const type = btn.dataset.type;
            _logDeckFinderUI.debug('Type toggle', { type, selected: isSelected });
            // Sync ratio item disabled state
            const ratioItem = overlay.querySelector(`.finder-ratio-item[data-type="${type}"]`);
            if (ratioItem) {
                ratioItem.classList.toggle('disabled', !isSelected);
                ratioItem.querySelector('.finder-ratio-input').disabled = !isSelected;
                if (!isSelected) {
                    ratioItem.querySelector('.finder-ratio-input').value = 0;
                    updateRatioSum();
                }
            }
        });
    });

    // Multi-select dropdowns (skill types, hint skills)
    overlay.querySelectorAll('.multi-select-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const ms = trigger.closest('.multi-select');
            // Close others
            overlay.querySelectorAll('.multi-select.open').forEach(other => {
                if (other !== ms) other.classList.remove('open');
            });
            ms.classList.toggle('open');
            e.stopPropagation();
        });
    });

    // Close multi-selects on outside click
    overlay.addEventListener('click', (e) => {
        if (!e.target.closest('.multi-select')) {
            overlay.querySelectorAll('.multi-select.open').forEach(ms => ms.classList.remove('open'));
        }
    });

    // Required skills mode radio pills
    overlay.querySelectorAll('.finder-req-skills-mode .finder-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const radio = pill.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                _logDeckFinderUI.debug('Required skills mode', { mode: radio.value });
                overlay.querySelectorAll('.finder-req-skills-mode .finder-pill').forEach(p => {
                    p.classList.toggle('active', p.querySelector('input[type="radio"]')?.checked);
                });
            }
        });
    });

    // Collapsible sections
    overlay.querySelectorAll('.finder-collapse-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) {
                const icon = btn.querySelector('.finder-collapse-icon');
                const isOpen = !target.classList.contains('collapsed');
                target.classList.toggle('collapsed', isOpen);
                target.style.display = '';
                icon.classList.toggle('open', !isOpen);
                _logDeckFinderUI.debug('Collapsible', { section: btn.dataset.target, open: !isOpen });
            }
        });
    });

    // Scenario change — also reset weights to new scenario defaults
    const scenarioSel = overlay.querySelector('#finderScenario');
    if (scenarioSel) {
        scenarioSel.addEventListener('change', (e) => {
            _logDeckFinderUI.info('Scenario changed', { scenario: e.target.value });
            resetWeightsToDefaults(e.target.value);
            renderFinderWeightsList();
        });
    }

    // Trainee picker button
    const traineePickBtn = overlay.querySelector('#finderTraineePickBtn');
    if (traineePickBtn) {
        traineePickBtn.addEventListener('click', () => {
            openTraineePicker(deckFinderState.filters.selectedTrainee, (selectedId) => {
                _logDeckFinderUI.info('Trainee changed', { trainee: selectedId || null });
                deckFinderState.filters.selectedTrainee = selectedId || null;
                updateFinderTraineeLabel();
            });
        });
    }

    // Scoring weights
    renderFinderWeightsList();
    overlay.querySelector('#finderResetWeightsBtn')?.addEventListener('click', () => {
        const scenarioId = overlay.querySelector('#finderScenario')?.value || '1';
        resetWeightsToDefaults(scenarioId);
        renderFinderWeightsList();
        showToast('Weights reset to scenario defaults.', 'info');
    });

    // Search settings
    const workerCountSel = overlay.querySelector('#finderWorkerCount');
    if (workerCountSel) {
        workerCountSel.value = deckFinderState.searchSettings.workerCount;
        workerCountSel.addEventListener('change', () => {
            deckFinderState.searchSettings.workerCount = workerCountSel.value;
        });
    }
    const warmStartInput = overlay.querySelector('#finderWarmStartCount');
    if (warmStartInput) {
        warmStartInput.value = deckFinderState.searchSettings.warmStartCount;
        warmStartInput.addEventListener('change', () => {
            deckFinderState.searchSettings.warmStartCount = Math.max(100, Math.min(10000, parseInt(warmStartInput.value) || 1500));
            warmStartInput.value = deckFinderState.searchSettings.warmStartCount;
        });
    }
    const poolSizeInput = overlay.querySelector('#finderSearchPoolSize');
    if (poolSizeInput) {
        poolSizeInput.value = deckFinderState.searchSettings.searchPoolSize;
        poolSizeInput.addEventListener('change', () => {
            deckFinderState.searchSettings.searchPoolSize = Math.max(100, Math.min(2000, parseInt(poolSizeInput.value) || 500));
            poolSizeInput.value = deckFinderState.searchSettings.searchPoolSize;
        });
    }
    const stabilityInput = overlay.querySelector('#finderStabilityPct');
    if (stabilityInput) {
        stabilityInput.value = deckFinderState.searchSettings.stabilityPercent;
        stabilityInput.addEventListener('change', () => {
            deckFinderState.searchSettings.stabilityPercent = Math.max(5, Math.min(100, parseInt(stabilityInput.value) || 30));
            stabilityInput.value = deckFinderState.searchSettings.stabilityPercent;
        });
    }

    // Result count toggle — instant re-display from pool (no re-search)
    overlay.querySelectorAll('.finder-toggle-btn[data-count]').forEach(btn => {
        btn.addEventListener('click', () => {
            deckFinderState.filters.resultCount = parseInt(btn.dataset.count) || 10;
            // If we have results, re-display from pool instantly
            if (deckFinderState.results.length > 0 && !deckFinderState.searching) {
                sortFinderResults();
            }
        });
    });

    // Ratio sum update
    overlay.querySelectorAll('.finder-ratio-input').forEach(input => {
        input.addEventListener('input', updateRatioSum);
    });

    // Minimum deck effect thresholds
    ['finderMinRace', 'finderMinTrain', 'finderMinFriend', 'finderMinEnergy'].forEach(id => {
        const el = overlay.querySelector('#' + id);
        if (el) {
            el.addEventListener('change', (e) => {
                _logDeckFinderUI.debug('Threshold changed', { id, value: parseInt(e.target.value) || 0 });
            });
        }
    });

    // Required skills search
    initRequiredSkillsSearch(overlay);

    // Exclusion character dropdown
    populateExcludeCharDropdown();

    const excludeCharDropdown = overlay.querySelector('#finderExcludeCharDropdown');
    if (excludeCharDropdown) {
        excludeCharDropdown.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                renderExclusionChipsFromDropdown('finderExcludeChars', '#finderExcludeCharDropdown', '.finder-exclude-char-check');
                updateFinderMultiSelectText('finderExcludeCharSelect', 'Select characters...');
            }
        });
    }

    // Exclude card picker button
    wireFinderPickerButtons(overlay);

    // Include mode radio pills
    overlay.querySelectorAll('.finder-include-mode .finder-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const radio = pill.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                _logDeckFinderUI.debug('Include mode', { mode: radio.value });
                overlay.querySelectorAll('.finder-include-mode .finder-pill').forEach(p => {
                    p.classList.toggle('active', p.querySelector('input[type="radio"]')?.checked);
                });
                updateIncludeInfo();
            }
        });
    });

    // Sort layer management
    overlay.querySelector('#finderAddSortBtn')?.addEventListener('click', addFinderSortLayer);
    wireFinderSortEvents();

    // Skill type layer management
    overlay.querySelector('#finderAddSkillTypeBtn')?.addEventListener('click', addFinderSkillTypeLayer);
    wireFinderSkillTypeEvents();

    // Search
    overlay.querySelector('#finderSearchBtn').addEventListener('click', startFinderSearch);
    overlay.querySelector('#finderCancelBtn').addEventListener('click', () => {
        _logDeckFinderUI.info('Search cancel requested');
        cancelSearch();
    });

    // Reset button with confirmation
    overlay.querySelector('#finderResetBtn')?.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog(
            'Reset Deck Finder',
            'Reset all deck finder filters, settings, and results to defaults?',
            { confirmLabel: 'Reset', destructive: true }
        );
        if (confirmed) resetDeckFinder();
    });
}

// ===== STATE RESTORATION =====

function restoreFinderUIFromState() {
    _logDeckFinderUI.debug('restoreFinderUIFromState');
    const overlay = document.getElementById('deckFinderOverlay');
    if (!overlay) return;

    const f = deckFinderState.filters;
    if (!f) return;

    // Pool toggle
    overlay.querySelectorAll('.finder-toggle-btn[data-pool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.pool === f.cardPool);
    });

    // Max Potential
    const maxPotToggle = overlay.querySelector('#finderMaxPotentialToggle');
    if (maxPotToggle) maxPotToggle.checked = f.maxPotential || false;

    // Scenario
    const scenarioSel = overlay.querySelector('#finderScenario');
    if (scenarioSel) scenarioSel.value = f.scenario || '1';

    // Trainee
    updateFinderTraineeLabel();

    // Rarity
    const rarityMap = { finderSSR: f.rarity.ssr, finderSR: f.rarity.sr, finderR: f.rarity.r };
    for (const [id, selected] of Object.entries(rarityMap)) {
        const btn = overlay.querySelector(`#${id}`);
        if (btn) btn.classList.toggle('selected', selected);
    }

    // Types
    overlay.querySelectorAll('.finder-type-btn').forEach(btn => {
        const type = btn.dataset.type;
        btn.classList.toggle('selected', !!f.types[type]);
    });

    // Type ratio
    overlay.querySelectorAll('.finder-ratio-input').forEach(input => {
        const type = input.dataset.type;
        input.value = f.typeRatio[type] || 0;
        const ratioItem = input.closest('.finder-ratio-item');
        if (ratioItem) {
            const disabled = !f.types[type];
            ratioItem.classList.toggle('disabled', disabled);
            input.disabled = disabled;
        }
    });
    updateRatioSum();

    // Thresholds
    const threshMap = {
        finderMinRace: f.minRaceBonus,
        finderMinTrain: f.minTrainingEff,
        finderMinFriend: f.minFriendBonus,
        finderMinEnergy: f.minEnergyCost
    };
    for (const [id, val] of Object.entries(threshMap)) {
        const el = overlay.querySelector(`#${id}`);
        if (el) el.value = val || 0;
    }

    // Result count toggle
    overlay.querySelectorAll('.finder-toggle-btn[data-count]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === f.resultCount);
    });

    // Exclude characters
    (f.excludeCharacters || []).forEach(name => {
        const cb = overlay.querySelector(`.finder-exclude-char-check[value="${name}"]`);
        if (cb) cb.checked = true;
    });
    renderExclusionChipsFromDropdown('finderExcludeChars', '#finderExcludeCharDropdown', '.finder-exclude-char-check');
    updateFinderMultiSelectText('finderExcludeCharSelect', 'Select characters...');

    // Exclude cards — restore from state into Set
    _finderExcludeCardIds = new Set((f.excludeCards || []).map(String));
    renderExcludeThumbGrid();

    // Include cards — restore from state into Sets
    _finderIncludeCardIds = new Set((f.includeCards || []).map(String));
    _finderIncludeFriendIds = new Set((f.includeFriendCards || []).map(String));
    renderIncludeThumbsAndInfo();
    renderFriendThumbAndInfo();

    // Include mode
    const includeMode = f.includeCardsMode || 'all';
    const includeModeRadio = overlay.querySelector(`input[name="finderIncludeMode"][value="${includeMode}"]`);
    if (includeModeRadio) {
        includeModeRadio.checked = true;
        overlay.querySelectorAll('.finder-include-mode .finder-pill').forEach(p => {
            p.classList.toggle('active', p.querySelector('input[type="radio"]')?.checked);
        });
    }

    // Required skills mode
    const reqMode = f.requiredSkillsMode || 'all';
    const reqModeRadio = overlay.querySelector(`input[name="finderReqSkillMode"][value="${reqMode}"]`);
    if (reqModeRadio) {
        reqModeRadio.checked = true;
        overlay.querySelectorAll('.finder-req-skills-mode .finder-pill').forEach(p => {
            p.classList.toggle('active', p.querySelector('input[type="radio"]')?.checked);
        });
    }

    // Required skills — restore from _selectedRequiredSkills
    if (_selectedRequiredSkills.length > 0) {
        _selectedRequiredSkills.forEach(skill => {
            const cb = overlay.querySelector(`.finder-req-skill-check[value="${skill.id}"]`);
            if (cb) cb.checked = true;
        });
        renderRequiredSkillsList();
        updateFinderMultiSelectText('finderReqSkillSelect', 'Select hint skills...');
    }

    // Sort layers
    if (deckFinderState.sortLayers && deckFinderState.sortLayers.length > 0) {
        renderFinderSortLayers();
        wireFinderSortEvents();
    }

    // Skill type layers
    if (_finderSkillTypeLayers.length > 0) {
        renderFinderSkillTypeLayers();
        wireFinderSkillTypeEvents();
    }

    // Restore weights list
    renderFinderWeightsList();

    // Restore search settings
    const ss = deckFinderState.searchSettings || {};
    const workerSel = overlay.querySelector('#finderWorkerCount');
    if (workerSel) workerSel.value = ss.workerCount || 'auto';
    const warmInput = overlay.querySelector('#finderWarmStartCount');
    if (warmInput) warmInput.value = ss.warmStartCount || 1500;
    const poolInput = overlay.querySelector('#finderSearchPoolSize');
    if (poolInput) poolInput.value = ss.searchPoolSize || 500;
    const stabInput = overlay.querySelector('#finderStabilityPct');
    if (stabInput) stabInput.value = ss.stabilityPercent || 30;

    // Restore results if we have them
    if (deckFinderState.results && deckFinderState.results.length > 0) {
        renderFinderResults(deckFinderState.results, null, false);
    }
}

// Re-initialize filter events after reset (filter DOM was replaced)
function reInitFilterEvents(overlay) {
    // Toggle buttons
    overlay.querySelectorAll('.finder-toggle-row').forEach(row => {
        row.querySelectorAll('.finder-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                row.querySelectorAll('.finder-toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    // Rarity icons
    overlay.querySelectorAll('.finder-icon-grid .quick-add-icon-btn[data-rarity]').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('selected'));
    });

    // Type icons
    overlay.querySelectorAll('.finder-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isSelected = btn.classList.toggle('selected');
            const type = btn.dataset.type;
            const ratioItem = overlay.querySelector(`.finder-ratio-item[data-type="${type}"]`);
            if (ratioItem) {
                ratioItem.classList.toggle('disabled', !isSelected);
                ratioItem.querySelector('.finder-ratio-input').disabled = !isSelected;
                if (!isSelected) {
                    ratioItem.querySelector('.finder-ratio-input').value = 0;
                    updateRatioSum();
                }
            }
        });
    });

    // Multi-selects
    overlay.querySelectorAll('.multi-select-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const ms = trigger.closest('.multi-select');
            overlay.querySelectorAll('.multi-select.open').forEach(other => {
                if (other !== ms) other.classList.remove('open');
            });
            ms.classList.toggle('open');
            e.stopPropagation();
        });
    });

    // Radio pills (required skills mode)
    overlay.querySelectorAll('.finder-req-skills-mode .finder-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const radio = pill.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                overlay.querySelectorAll('.finder-req-skills-mode .finder-pill').forEach(p => {
                    p.classList.toggle('active', p.querySelector('input[type="radio"]')?.checked);
                });
            }
        });
    });

    // Collapsible sections
    overlay.querySelectorAll('.finder-collapse-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) {
                const icon = btn.querySelector('.finder-collapse-icon');
                const isOpen = !target.classList.contains('collapsed');
                target.classList.toggle('collapsed', isOpen);
                target.style.display = '';
                icon.classList.toggle('open', !isOpen);
                _logDeckFinderUI.debug('Collapsible', { section: btn.dataset.target, open: !isOpen });
            }
        });
    });

    // Scenario change — also reset weights to new scenario defaults
    const scenarioSel2 = overlay.querySelector('#finderScenario');
    if (scenarioSel2) {
        scenarioSel2.addEventListener('change', (e) => {
            _logDeckFinderUI.info('Scenario changed', { scenario: e.target.value });
            resetWeightsToDefaults(e.target.value);
            renderFinderWeightsList();
        });
    }

    // Trainee picker button
    const traineePickBtn2 = overlay.querySelector('#finderTraineePickBtn');
    if (traineePickBtn2) {
        traineePickBtn2.addEventListener('click', () => {
            openTraineePicker(deckFinderState.filters.selectedTrainee, (selectedId) => {
                _logDeckFinderUI.info('Trainee changed', { trainee: selectedId || null });
                deckFinderState.filters.selectedTrainee = selectedId || null;
                updateFinderTraineeLabel();
            });
        });
    }

    // Ratio sum
    overlay.querySelectorAll('.finder-ratio-input').forEach(input => {
        input.addEventListener('input', updateRatioSum);
    });

    // Minimum deck effect thresholds
    ['finderMinRace', 'finderMinTrain', 'finderMinFriend', 'finderMinEnergy'].forEach(id => {
        const el = overlay.querySelector('#' + id);
        if (el) {
            el.addEventListener('change', (e) => {
                _logDeckFinderUI.debug('Threshold changed', { id, value: parseInt(e.target.value) || 0 });
            });
        }
    });

    // Required skills
    initRequiredSkillsSearch(overlay);

    // Exclusion character dropdown
    populateExcludeCharDropdown();
    const excludeCharDropdown = overlay.querySelector('#finderExcludeCharDropdown');
    if (excludeCharDropdown) {
        excludeCharDropdown.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                renderExclusionChipsFromDropdown('finderExcludeChars', '#finderExcludeCharDropdown', '.finder-exclude-char-check');
                updateFinderMultiSelectText('finderExcludeCharSelect', 'Select characters...');
            }
        });
    }

    // Picker buttons
    wireFinderPickerButtons(overlay);

    overlay.querySelectorAll('.finder-include-mode .finder-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const radio = pill.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                overlay.querySelectorAll('.finder-include-mode .finder-pill').forEach(p => {
                    p.classList.toggle('active', p.querySelector('input[type="radio"]')?.checked);
                });
                updateIncludeInfo();
            }
        });
    });

    // Sort layers
    overlay.querySelector('#finderAddSortBtn')?.addEventListener('click', addFinderSortLayer);
    wireFinderSortEvents();

    // Skill type layers
    overlay.querySelector('#finderAddSkillTypeBtn')?.addEventListener('click', addFinderSkillTypeLayer);
    wireFinderSkillTypeEvents();

    // Scoring weights
    renderFinderWeightsList();
    overlay.querySelector('#finderResetWeightsBtn')?.addEventListener('click', () => {
        const scenarioId = overlay.querySelector('#finderScenario')?.value || '1';
        resetWeightsToDefaults(scenarioId);
        renderFinderWeightsList();
        showToast('Weights reset to scenario defaults.', 'info');
    });

    // Search settings
    const workerCountSel2 = overlay.querySelector('#finderWorkerCount');
    if (workerCountSel2) {
        workerCountSel2.value = deckFinderState.searchSettings.workerCount;
        workerCountSel2.addEventListener('change', () => { deckFinderState.searchSettings.workerCount = workerCountSel2.value; });
    }
    const warmStartInput2 = overlay.querySelector('#finderWarmStartCount');
    if (warmStartInput2) {
        warmStartInput2.value = deckFinderState.searchSettings.warmStartCount;
        warmStartInput2.addEventListener('change', () => {
            deckFinderState.searchSettings.warmStartCount = Math.max(100, Math.min(10000, parseInt(warmStartInput2.value) || 1500));
            warmStartInput2.value = deckFinderState.searchSettings.warmStartCount;
        });
    }
    const poolSizeInput2 = overlay.querySelector('#finderSearchPoolSize');
    if (poolSizeInput2) {
        poolSizeInput2.value = deckFinderState.searchSettings.searchPoolSize;
        poolSizeInput2.addEventListener('change', () => {
            deckFinderState.searchSettings.searchPoolSize = Math.max(100, Math.min(2000, parseInt(poolSizeInput2.value) || 500));
            poolSizeInput2.value = deckFinderState.searchSettings.searchPoolSize;
        });
    }
    const stabilityInput2 = overlay.querySelector('#finderStabilityPct');
    if (stabilityInput2) {
        stabilityInput2.value = deckFinderState.searchSettings.stabilityPercent;
        stabilityInput2.addEventListener('change', () => {
            deckFinderState.searchSettings.stabilityPercent = Math.max(5, Math.min(100, parseInt(stabilityInput2.value) || 30));
            stabilityInput2.value = deckFinderState.searchSettings.stabilityPercent;
        });
    }

    // Result count toggle — instant re-display from pool
    overlay.querySelectorAll('.finder-toggle-btn[data-count]').forEach(btn => {
        btn.addEventListener('click', () => {
            deckFinderState.filters.resultCount = parseInt(btn.dataset.count) || 10;
            if (deckFinderState.results.length > 0 && !deckFinderState.searching) {
                sortFinderResults();
            }
        });
    });

    // Reset button
    overlay.querySelector('#finderResetBtn')?.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog(
            'Reset Deck Finder',
            'Reset all deck finder filters, settings, and results to defaults?',
            { confirmLabel: 'Reset', destructive: true }
        );
        if (confirmed) resetDeckFinder();
    });
}

// ===== SORT LAYER UI =====

function addFinderSortLayer() {
    const layers = deckFinderState.sortLayers;
    const usedKeys = new Set(layers.map(l => l.key));
    const available = Object.keys(FINDER_SORT_CATEGORIES).find(k => !usedKeys.has(k)) || 'score';
    const cat = FINDER_SORT_CATEGORIES[available];
    layers.push({ key: available, option: null, direction: cat?.defaultDirection || 'desc' });
    _logDeckFinderUI.debug('addSortLayer', { key: available, total: layers.length });
    renderFinderSortLayers();
    wireFinderSortEvents();
    if (deckFinderState.results.length > 0) sortFinderResults();
}

function removeFinderSortLayer(index) {
    _logDeckFinderUI.debug('removeSortLayer', { index });
    deckFinderState.sortLayers.splice(index, 1);
    renderFinderSortLayers();
    wireFinderSortEvents();
    // Instant re-sort (no re-search needed)
    if (deckFinderState.results.length > 0) sortFinderResults();
}

function moveFinderSortLayer(fromIndex, toIndex) {
    const layers = deckFinderState.sortLayers;
    if (toIndex < 0 || toIndex >= layers.length) return;
    _logDeckFinderUI.debug('moveSortLayer', { from: fromIndex, to: toIndex });
    const [item] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, item);
    renderFinderSortLayers();
    wireFinderSortEvents();
    if (deckFinderState.results.length > 0) sortFinderResults();
}

function updateFinderSortLayer(index, updates) {
    const layer = deckFinderState.sortLayers[index];
    if (!layer) return;
    _logDeckFinderUI.debug('updateSortLayer', { index, updates });
    Object.assign(layer, updates);
    renderFinderSortLayers();
    wireFinderSortEvents();
    if (deckFinderState.results.length > 0) sortFinderResults();
}

function renderFinderSortLayers() {
    const container = document.getElementById('finderSortLayers');
    if (!container) return;

    const layers = deckFinderState.sortLayers;
    if (layers.length === 0) {
        container.innerHTML = '<div class="no-sorts-message">Default: score descending. Add layers to customize.</div>';
        return;
    }

    container.innerHTML = layers.map((layer, index) => {
        const cat = FINDER_SORT_CATEGORIES[layer.key];
        const titleLabel = getFinderSortLayerLabel(layer);
        const total = layers.length;

        const categoryOptions = Object.entries(FINDER_SORT_CATEGORIES).map(([key, c]) =>
            `<option value="${key}"${key === layer.key ? ' selected' : ''}>${c.label}</option>`
        ).join('');

        // Build sub-option select if category has options
        let optionSelectHTML = '';
        if (cat?.hasOptions) {
            const opts = cat.getOptions();
            const optionItems = opts.map(o =>
                `<option value="${o.value}"${o.value === layer.option ? ' selected' : ''}>${o.label}</option>`
            ).join('');
            optionSelectHTML = `<select class="sort-option-select finder-sort-opt" data-index="${index}">
                <option value="">Select ${cat.label}...</option>
                ${optionItems}
            </select>`;
        }

        const dropdownClass = cat?.hasOptions ? 'has-options' : 'single-dropdown';

        return `<div class="sort-layer" data-index="${index}">
            <div class="sort-layer-header">
                <div class="sort-layer-title">
                    <span class="sort-priority-badge">${index + 1}</span>
                    ${titleLabel}
                </div>
                <div class="sort-controls">
                    <button class="sort-btn finder-sort-btn" data-action="move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Move Up">\u2191</button>
                    <button class="sort-btn finder-sort-btn" data-action="move-down" data-index="${index}" ${index === total - 1 ? 'disabled' : ''} title="Move Down">\u2193</button>
                    <button class="sort-btn danger finder-sort-btn" data-action="remove" data-index="${index}" title="Remove">\u2715</button>
                </div>
            </div>
            <div class="sort-dropdowns ${dropdownClass}">
                <select class="sort-category-select finder-sort-cat" data-index="${index}">${categoryOptions}</select>
                ${optionSelectHTML}
                <button class="sort-direction-toggle ${layer.direction} finder-sort-dir" data-index="${index}">${layer.direction === 'asc' ? '\u2191' : '\u2193'}</button>
            </div>
        </div>`;
    }).join('');
}

function wireFinderSortEvents() {
    const container = document.getElementById('finderSortLayers');
    if (!container) return;

    container.querySelectorAll('.finder-sort-btn').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;
            const index = parseInt(btn.dataset.index);
            if (action === 'move-up') moveFinderSortLayer(index, index - 1);
            else if (action === 'move-down') moveFinderSortLayer(index, index + 1);
            else if (action === 'remove') removeFinderSortLayer(index);
        };
    });

    container.querySelectorAll('.finder-sort-cat').forEach(sel => {
        sel.onchange = () => {
            const index = parseInt(sel.dataset.index);
            const key = sel.value;
            const cat = FINDER_SORT_CATEGORIES[key];
            updateFinderSortLayer(index, { key, option: null, direction: cat?.defaultDirection || 'desc' });
        };
    });

    container.querySelectorAll('.finder-sort-opt').forEach(sel => {
        sel.onchange = () => {
            const index = parseInt(sel.dataset.index);
            updateFinderSortLayer(index, { option: sel.value || null });
        };
    });

    container.querySelectorAll('.finder-sort-dir').forEach(btn => {
        btn.onclick = () => {
            const index = parseInt(btn.dataset.index);
            const layer = deckFinderState.sortLayers[index];
            if (!layer) return;
            updateFinderSortLayer(index, { direction: layer.direction === 'asc' ? 'desc' : 'asc' });
        };
    });
}

// ===== SCORING WEIGHTS UI =====

function renderFinderWeightsList() {
    const container = document.getElementById('finderWeightsList');
    if (!container) return;

    // Ensure customWeights and order are initialized
    if (!deckFinderState.customWeights || !deckFinderState.weightOrder) {
        resetWeightsToDefaults();
    }
    const weights = deckFinderState.customWeights;
    const order = deckFinderState.weightOrder;
    const total = order.length;

    container.innerHTML = order.map((key, index) => {
        const label = WEIGHT_LABELS[key] || key;
        const value = weights[key] || 0;
        return `<div class="finder-weight-item" data-index="${index}">
            <span class="finder-weight-priority">${index + 1}</span>
            <span class="finder-weight-label">${label}</span>
            <div class="finder-weight-controls">
                <input type="number" class="finder-weight-input" data-key="${key}" min="0" max="200" value="${value}">
                <button class="sort-btn finder-weight-btn" data-action="move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Move up">&#8593;</button>
                <button class="sort-btn finder-weight-btn" data-action="move-down" data-index="${index}" ${index === total - 1 ? 'disabled' : ''} title="Move down">&#8595;</button>
            </div>
        </div>`;
    }).join('');

    wireFinderWeightEvents(container);
}

function wireFinderWeightEvents(container) {
    // Wire value change events
    container.querySelectorAll('.finder-weight-input').forEach(input => {
        input.onchange = () => {
            const key = input.dataset.key;
            const val = Math.max(0, Math.min(200, parseInt(input.value) || 0));
            input.value = val;
            if (deckFinderState.customWeights) {
                deckFinderState.customWeights[key] = val;
                _logDeckFinderUI.debug('Weight changed', { key, value: val });
            }
        };
    });

    // Wire move buttons
    container.querySelectorAll('.finder-weight-btn').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;
            const index = parseInt(btn.dataset.index);
            if (action === 'move-up') moveFinderWeight(index, index - 1);
            else if (action === 'move-down') moveFinderWeight(index, index + 1);
        };
    });
}

function moveFinderWeight(fromIndex, toIndex) {
    const order = deckFinderState.weightOrder;
    if (toIndex < 0 || toIndex >= order.length) return;
    _logDeckFinderUI.debug('moveWeight', { from: fromIndex, to: toIndex });
    const [item] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, item);
    renderFinderWeightsList();
}

// ===== SKILL TYPE LAYER UI =====

let _finderSkillTypeLayers = []; // [{ type: 'type_id', min: 1 }, ...]

function addFinderSkillTypeLayer() {
    const usedTypes = new Set(_finderSkillTypeLayers.map(l => l.type));
    const allTypes = (typeof skillTypesData === 'object')
        ? Object.entries(skillTypesData).filter(([id, str]) => id && str).sort((a, b) => a[1].localeCompare(b[1]))
        : [];
    const available = allTypes.find(([id]) => !usedTypes.has(id));
    if (!available) { showToast('All skill types already added.', 'warning'); return; }
    _finderSkillTypeLayers.push({ type: available[0], min: 1 });
    _logDeckFinderUI.debug('addSkillTypeLayer', { type: available[0], total: _finderSkillTypeLayers.length });
    renderFinderSkillTypeLayers();
    wireFinderSkillTypeEvents();
}

function removeFinderSkillTypeLayer(index) {
    _logDeckFinderUI.debug('removeSkillTypeLayer', { index });
    _finderSkillTypeLayers.splice(index, 1);
    renderFinderSkillTypeLayers();
    wireFinderSkillTypeEvents();
}

function renderFinderSkillTypeLayers() {
    const container = document.getElementById('finderSkillTypeLayers');
    if (!container) return;

    if (_finderSkillTypeLayers.length === 0) {
        container.innerHTML = '<div class="no-sorts-message">No skill type requirements. Add layers to require specific types.</div>';
        return;
    }

    const allTypes = (typeof skillTypesData === 'object')
        ? Object.entries(skillTypesData).filter(([id, str]) => id && str).sort((a, b) => a[1].localeCompare(b[1]))
        : [];

    container.innerHTML = _finderSkillTypeLayers.map((layer, index) => {
        const typeLabel = skillTypesData?.[layer.type] || layer.type;
        const typeOptions = allTypes.map(([id, str]) =>
            `<option value="${id}"${id === layer.type ? ' selected' : ''}>${str}</option>`
        ).join('');

        return `<div class="sort-layer" data-index="${index}">
            <div class="sort-layer-header">
                <div class="sort-layer-title">
                    <span class="sort-priority-badge">${index + 1}</span>
                    ${typeLabel}
                </div>
                <div class="sort-controls">
                    <button class="sort-btn danger finder-stype-btn" data-action="remove" data-index="${index}" title="Remove">\u2715</button>
                </div>
            </div>
            <div class="sort-dropdowns has-options">
                <select class="sort-category-select finder-stype-sel" data-index="${index}">${typeOptions}</select>
                <div class="finder-input-suffix finder-stype-min-wrap">
                    <input type="number" class="finder-stype-min" data-index="${index}" min="1" max="20" value="${layer.min}">
                    <span>min</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

function wireFinderSkillTypeEvents() {
    const container = document.getElementById('finderSkillTypeLayers');
    if (!container) return;

    container.querySelectorAll('.finder-stype-btn').forEach(btn => {
        btn.onclick = () => {
            if (btn.dataset.action === 'remove') {
                removeFinderSkillTypeLayer(parseInt(btn.dataset.index));
            }
        };
    });

    container.querySelectorAll('.finder-stype-sel').forEach(sel => {
        sel.onchange = () => {
            const index = parseInt(sel.dataset.index);
            if (_finderSkillTypeLayers[index]) {
                _finderSkillTypeLayers[index].type = sel.value;
                renderFinderSkillTypeLayers();
                wireFinderSkillTypeEvents();
            }
        };
    });

    container.querySelectorAll('.finder-stype-min').forEach(input => {
        input.oninput = () => {
            const index = parseInt(input.dataset.index);
            if (_finderSkillTypeLayers[index]) {
                _finderSkillTypeLayers[index].min = parseInt(input.value) || 1;
            }
        };
    });
}

// ===== REQUIRED SKILLS MULTI-SELECT =====

let _availableSkillsCache = null;
let _selectedRequiredSkills = [];

function initRequiredSkillsSearch(overlay) {
    // Don't wipe selected skills on reopen — they'll be restored by restoreFinderUIFromState
    _availableSkillsCache = null;

    // Populate the hint skills dropdown with checkboxes
    populateHintSkillsDropdown();

    // Wire checkbox changes in the hint skills dropdown
    const dropdown = overlay.querySelector('#finderReqSkillDropdown');
    if (dropdown) {
        dropdown.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                syncSelectedSkillsFromDropdown();
                renderRequiredSkillsList();
                updateFinderMultiSelectText('finderReqSkillSelect', 'Select hint skills...');
            }
        });
    }
}

function populateHintSkillsDropdown() {
    const dropdown = document.getElementById('finderReqSkillDropdown');
    if (!dropdown) return;

    const tempFilters = collectFiltersFromUI();
    const skills = getAvailableHintSkills(tempFilters);
    _availableSkillsCache = skills;

    dropdown.innerHTML = skills.map(s =>
        `<label><input type="checkbox" class="finder-req-skill-check" value="${s.id}" data-skill-name="${s.name}"> ${s.name}</label>`
    ).join('');
}

function syncSelectedSkillsFromDropdown() {
    _selectedRequiredSkills = [];
    document.querySelectorAll('.finder-req-skill-check:checked').forEach(cb => {
        _selectedRequiredSkills.push({ id: cb.value, name: cb.dataset.skillName });
    });
    _logDeckFinderUI.debug('Required skills updated', { count: _selectedRequiredSkills.length, skills: _selectedRequiredSkills.map(s => s.name) });
}

function renderRequiredSkillsList() {
    const container = document.getElementById('finderReqSkillsList');
    if (!container) return;

    if (_selectedRequiredSkills.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = _selectedRequiredSkills.map((skill, idx) =>
        `<span class="finder-exclusion-chip">${skill.name} <button class="finder-chip-remove" data-skill-id="${skill.id}">&times;</button></span>`
    ).join('');

    container.querySelectorAll('.finder-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.skillId;
            // Uncheck the corresponding checkbox
            const cb = document.querySelector(`.finder-req-skill-check[value="${id}"]`);
            if (cb) cb.checked = false;
            syncSelectedSkillsFromDropdown();
            renderRequiredSkillsList();
            updateFinderMultiSelectText('finderReqSkillSelect', 'Select hint skills...');
        });
    });
}

function updateFinderMultiSelectText(selectId, defaultText) {
    const ms = document.getElementById(selectId);
    if (!ms) return;
    const textEl = ms.querySelector('.multi-select-text');
    if (!textEl) return;

    // Support both checkboxes and radios
    let checked = ms.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length === 0) {
        // Check for radio with a non-empty value
        const radio = ms.querySelector('input[type="radio"]:checked');
        if (radio && radio.value) {
            const label = radio.closest('label');
            textEl.textContent = label ? label.textContent.trim() : '1 selected';
            return;
        }
    }

    if (checked.length === 0) {
        textEl.textContent = defaultText;
    } else if (checked.length === 1) {
        const label = checked[0].closest('label');
        textEl.textContent = label ? label.textContent.trim() : '1 selected';
    } else {
        textEl.textContent = `${checked.length} selected`;
    }
}

// ===== FINDER CARD PICKER =====

const FINDER_PICKER_SORT_OPTIONS = [
    { value: 'name',      label: 'Name' },
    { value: 'rarity',    label: 'Rarity' },
    { value: 'effect_15', label: 'Race Bonus' },
    { value: 'effect_8',  label: 'Training Effectiveness' },
    { value: 'effect_1',  label: 'Friendship Bonus' },
    { value: 'effect_30', label: 'Skill Point Bonus' }
];

function openFinderCardPicker({ title, mode, selected, filterFn, onDone, disabledIds }) {
    _logDeckFinderUI.info('openFinderCardPicker', { title, mode, selectedCount: selected?.size || 0 });
    const existingPicker = document.getElementById('finderCardPickerOverlay');
    if (existingPicker) existingPicker.remove();

    // Working copy — mutate this, only commit on Done
    const working = new Set(selected);
    const disabled = disabledIds || new Set();

    // Filter state local to this picker
    const pickerFilter = {
        types: ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'],
        search: '',
        ssrOnly: false,
        sortBy: 'name',
        sortDirection: 'asc'
    };

    const allTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'];

    const overlay = document.createElement('div');
    overlay.className = 'picker-modal-overlay finder-card-picker-overlay';
    overlay.id = 'finderCardPickerOverlay';

    const typeButtonsHtml = `
        <button class="picker-type-btn active" data-type="all">All</button>
        <button class="picker-type-btn" data-type="speed">Speed</button>
        <button class="picker-type-btn" data-type="stamina">Stamina</button>
        <button class="picker-type-btn" data-type="power">Power</button>
        <button class="picker-type-btn" data-type="guts">Guts</button>
        <button class="picker-type-btn" data-type="intelligence">Wit</button>
        <button class="picker-type-btn" data-type="friend">Friend</button>
    `;

    const sortOptionsHtml = FINDER_PICKER_SORT_OPTIONS.map(opt =>
        `<option value="${opt.value}"${pickerFilter.sortBy === opt.value ? ' selected' : ''}>${opt.label}</option>`
    ).join('');

    const footerHtml = mode === 'multi' ? `
        <div class="finder-picker-footer">
            <span class="finder-picker-count" id="finderPickerCount">${working.size} selected</span>
            <button class="btn btn-primary btn-sm" id="finderPickerDoneBtn">Done</button>
        </div>
    ` : '';

    overlay.innerHTML = `
        <div class="picker-modal" id="finderPickerModal">
            <div class="picker-header">
                <h3>${title}</h3>
                <button class="picker-close" id="finderPickerCloseBtn">&times;</button>
            </div>
            <div class="picker-filters">
                <div class="picker-type-filters" id="finderPickerTypeFilters">
                    ${typeButtonsHtml}
                </div>
                <input class="picker-search" id="finderPickerSearch" type="text" placeholder="Search by card name...">
                <div class="picker-filter-row">
                    <label class="picker-ssr-toggle">
                        <input type="checkbox" id="finderPickerSsrOnly">
                        SSR Only
                    </label>
                    <div class="picker-sort-controls">
                        <label class="picker-sort-label">Sort:</label>
                        <select class="picker-sort-select" id="finderPickerSortBy">
                            ${sortOptionsHtml}
                        </select>
                        <button class="picker-sort-dir-btn" id="finderPickerSortDir" title="Toggle sort direction">
                            \u2191 Asc
                        </button>
                    </div>
                </div>
            </div>
            <div class="picker-card-grid" id="finderPickerCardGrid"></div>
            ${footerHtml}
        </div>
    `;

    document.body.appendChild(overlay);

    function closePicker() {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
        document.removeEventListener('keydown', escHandler);
    }

    function renderCards() {
        renderFinderPickerCards('finderPickerCardGrid', pickerFilter, filterFn, working, disabled, mode, onCardClick);
        updateCount();
    }

    function updateCount() {
        const countEl = document.getElementById('finderPickerCount');
        if (countEl) countEl.textContent = `${working.size} selected`;
    }

    function onCardClick(cardId) {
        if (disabled.has(cardId)) return;
        if (mode === 'single') {
            _logDeckFinderUI.debug('Card picker single select', { cardId });
            onDone(new Set([cardId]));
            closePicker();
            return;
        }
        // Multi-mode: toggle
        if (working.has(cardId)) {
            working.delete(cardId);
            _logDeckFinderUI.debug('Card picker deselected', { cardId, remaining: working.size });
        } else {
            working.add(cardId);
            _logDeckFinderUI.debug('Card picker selected', { cardId, total: working.size });
        }
        // Toggle visual state on the tile
        const tile = overlay.querySelector(`.picker-card-tile[data-card-id="${cardId}"]`);
        if (tile) tile.classList.toggle('selected', working.has(cardId));
        updateCount();
    }

    // Close button
    overlay.querySelector('#finderPickerCloseBtn').addEventListener('click', closePicker);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePicker();
    });

    // Done button (multi-mode)
    const doneBtn = overlay.querySelector('#finderPickerDoneBtn');
    if (doneBtn) {
        doneBtn.addEventListener('click', () => {
            onDone(new Set(working));
            closePicker();
        });
    }

    // Type filter buttons
    overlay.querySelectorAll('#finderPickerTypeFilters .picker-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const allBtn = overlay.querySelector('#finderPickerTypeFilters .picker-type-btn[data-type="all"]');

            if (type === 'all') {
                pickerFilter.types = [...allTypes];
                overlay.querySelectorAll('#finderPickerTypeFilters .picker-type-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.type === 'all');
                });
            } else if (allBtn.classList.contains('active')) {
                pickerFilter.types = [type];
                allBtn.classList.remove('active');
                overlay.querySelectorAll('#finderPickerTypeFilters .picker-type-btn').forEach(b => {
                    if (b.dataset.type !== 'all') b.classList.toggle('active', b.dataset.type === type);
                });
            } else {
                const idx = pickerFilter.types.indexOf(type);
                if (idx >= 0) pickerFilter.types.splice(idx, 1);
                else pickerFilter.types.push(type);
                btn.classList.toggle('active');

                if (pickerFilter.types.length === 0 || pickerFilter.types.length === 6) {
                    pickerFilter.types = [...allTypes];
                    allBtn.classList.add('active');
                    overlay.querySelectorAll('#finderPickerTypeFilters .picker-type-btn').forEach(b => {
                        if (b.dataset.type !== 'all') b.classList.remove('active');
                    });
                }
            }
            renderCards();
        });
    });

    // Search
    let searchTimeout;
    overlay.querySelector('#finderPickerSearch').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            pickerFilter.search = e.target.value.trim().toLowerCase();
            renderCards();
        }, 300);
    });

    // SSR only
    overlay.querySelector('#finderPickerSsrOnly').addEventListener('change', (e) => {
        pickerFilter.ssrOnly = e.target.checked;
        renderCards();
    });

    // Sort
    overlay.querySelector('#finderPickerSortBy').addEventListener('change', (e) => {
        pickerFilter.sortBy = e.target.value;
        renderCards();
    });

    overlay.querySelector('#finderPickerSortDir').addEventListener('click', () => {
        pickerFilter.sortDirection = pickerFilter.sortDirection === 'desc' ? 'asc' : 'desc';
        const btn = overlay.querySelector('#finderPickerSortDir');
        const arrow = pickerFilter.sortDirection === 'desc' ? '\u2193' : '\u2191';
        const label = pickerFilter.sortDirection === 'desc' ? 'Desc' : 'Asc';
        btn.textContent = `${arrow} ${label}`;
        renderCards();
    });

    // Escape closes picker only (not finder)
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePicker();
        }
    };
    document.addEventListener('keydown', escHandler, true); // capture phase

    renderCards();
    requestAnimationFrame(() => overlay.classList.add('open'));
}

function renderFinderPickerCards(gridId, filter, filterFn, selectedIds, disabledIds, mode, onCardClick) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const map = getCardDataMap();

    let cards = cardData.filter(card => {
        if (!card.char_name || !card.start_date) return false;
        if (filter.ssrOnly && card.rarity !== 3) return false;
        if (filter.types.length > 0 && !filter.types.includes(card.type)) return false;
        if (filter.search) {
            const s = filter.search;
            if (!(card.char_name || '').toLowerCase().includes(s) &&
                !(card.card_name || '').toLowerCase().includes(s)) return false;
        }
        if (filterFn && !filterFn(card)) return false;
        return true;
    });

    // Sort
    const sortBy = filter.sortBy;
    const dir = filter.sortDirection === 'desc' ? -1 : 1;

    if (sortBy === 'name') {
        cards.sort((a, b) => dir * (a.char_name || '').localeCompare(b.char_name || ''));
    } else if (sortBy === 'rarity') {
        cards.sort((a, b) => dir * (a.rarity - b.rarity));
    } else if (sortBy.startsWith('effect_')) {
        const effectId = parseInt(sortBy.split('_')[1]);
        const getVal = (card) => {
            const eff = card.effects?.find(e => e[0] === effectId);
            if (!eff) return 0;
            try { return calculateEffectValue(eff, limitBreaks[card.rarity]?.[4] || 50); } catch { return 0; }
        };
        cards.sort((a, b) => dir * (getVal(a) - getVal(b)));
    }

    if (cards.length === 0) {
        grid.innerHTML = '<div class="picker-no-results">No cards match your filters.</div>';
        return;
    }

    grid.innerHTML = '';
    cards.forEach(card => {
        const cardId = String(card.support_id);
        const isSelected = selectedIds.has(cardId);
        const isDisabled = disabledIds.has(cardId);

        const tile = document.createElement('div');
        tile.className = 'picker-card-tile' +
            (isSelected ? ' selected' : '') +
            (isDisabled ? ' disabled-tile' : '');
        tile.dataset.cardId = cardId;
        tile.setAttribute('tabindex', isDisabled ? '-1' : '0');
        tile.style.position = 'relative';

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

        topRow.appendChild(info);
        tile.appendChild(topRow);

        if (!isDisabled) {
            tile.addEventListener('click', () => onCardClick(cardId));
        }

        grid.appendChild(tile);
    });
}

function renderFinderThumbGrid(containerId, selectedIds, onRemove) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!selectedIds || selectedIds.size === 0) {
        container.innerHTML = '';
        return;
    }

    const map = getCardDataMap();
    const typeIconIdx = { speed: '0', stamina: '1', power: '2', guts: '3', intelligence: '4', friend: '5' };

    container.innerHTML = '';
    selectedIds.forEach(id => {
        const card = map.get(id) || map.get(Number(id));
        if (!card) return;

        const wrap = document.createElement('div');
        wrap.className = 'finder-thumb-wrap finder-thumb-removable';

        const img = document.createElement('img');
        img.src = `images/supports/${card.support_id}.png`;
        img.className = `finder-result-thumb card-image rarity-${card.rarity}`;
        img.title = card.char_name || '';
        img.loading = 'lazy';
        img.onerror = function() { this.style.display = 'none'; };
        wrap.appendChild(img);

        const typeIcon = document.createElement('img');
        typeIcon.className = 'finder-thumb-type-icon';
        typeIcon.src = `images/supports/utx_ico_obtain_0${typeIconIdx[card.type] || '0'}.png`;
        wrap.appendChild(typeIcon);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'finder-thumb-remove';
        removeBtn.dataset.id = String(card.support_id);
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onRemove(String(card.support_id));
        });
        wrap.appendChild(removeBtn);

        container.appendChild(wrap);
    });
}

// ===== PICKER BUTTON WIRING =====

function wireFinderPickerButtons(overlay) {
    // Exclude card picker
    const excludeBtn = overlay.querySelector('#finderExcludeCardPickBtn');
    if (excludeBtn) {
        excludeBtn.addEventListener('click', () => {
            openFinderCardPicker({
                title: 'Exclude Specific Cards',
                mode: 'multi',
                selected: _finderExcludeCardIds,
                onDone: (ids) => {
                    _logDeckFinderUI.info('Exclude cards updated', { count: ids.size, cardIds: [...ids] });
                    _finderExcludeCardIds = ids;
                    renderExcludeThumbGrid();
                }
            });
        });
    }

    // Include card picker
    const includeBtn = overlay.querySelector('#finderIncludeCardPickBtn');
    if (includeBtn) {
        includeBtn.addEventListener('click', () => {
            const poolBtn = overlay.querySelector('.finder-toggle-btn[data-pool].active');
            const isOwned = (poolBtn?.dataset?.pool || 'owned') === 'owned';

            openFinderCardPicker({
                title: 'Include Player Cards',
                mode: 'multi',
                selected: _finderIncludeCardIds,
                filterFn: isOwned ? (card) => isCardOwned(card.support_id) : null,
                disabledIds: new Set(_finderIncludeFriendIds),
                onDone: (ids) => {
                    _logDeckFinderUI.info('Include cards updated', { count: ids.size, cardIds: [...ids] });
                    _finderIncludeCardIds = ids;
                    renderIncludeThumbsAndInfo();
                }
            });
        });
    }

    // Friend card picker (multi-select — search picks best friend from these)
    const friendBtn = overlay.querySelector('#finderIncludeFriendPickBtn');
    if (friendBtn) {
        friendBtn.addEventListener('click', () => {
            openFinderCardPicker({
                title: 'Add Friend Cards',
                mode: 'multi',
                selected: _finderIncludeFriendIds,
                disabledIds: new Set(),
                onDone: (ids) => {
                    _logDeckFinderUI.info('Friend cards updated', { count: ids.size, cardIds: [...ids] });
                    _finderIncludeFriendIds = ids;
                    renderFriendThumbAndInfo();
                }
            });
        });
    }

    // Render initial thumb grids
    renderExcludeThumbGrid();
    renderIncludeThumbsAndInfo();
    renderFriendThumbAndInfo();
}

function renderExcludeThumbGrid() {
    renderFinderThumbGrid('finderExcludeCardThumbs', _finderExcludeCardIds, (id) => {
        _logDeckFinderUI.debug('Exclude card removed', { cardId: id, remaining: _finderExcludeCardIds.size - 1 });
        _finderExcludeCardIds.delete(id);
        renderExcludeThumbGrid();
    });
}

function renderIncludeThumbsAndInfo() {
    renderFinderThumbGrid('finderIncludeCardThumbs', _finderIncludeCardIds, (id) => {
        _logDeckFinderUI.debug('Include card removed', { cardId: id, remaining: _finderIncludeCardIds.size - 1 });
        _finderIncludeCardIds.delete(id);
        renderIncludeThumbsAndInfo();
    });
    updateIncludeInfo();
    checkIncludeDuplicates();
}

function renderFriendThumbAndInfo() {
    renderFinderThumbGrid('finderIncludeFriendThumb', _finderIncludeFriendIds, (id) => {
        _logDeckFinderUI.debug('Friend card removed', { cardId: id, remaining: _finderIncludeFriendIds.size - 1 });
        _finderIncludeFriendIds.delete(id);
        renderFriendThumbAndInfo();
    });
    checkIncludeDuplicates();
}

// ===== EXCLUSION DROPDOWNS =====

function populateExcludeCharDropdown() {
    const charDropdown = document.getElementById('finderExcludeCharDropdown');
    if (!charDropdown) return;

    // Character dropdown — unique char_name values, sorted
    const charNames = [...new Set(cardData.map(c => c.char_name).filter(Boolean))].sort();
    charDropdown.innerHTML = charNames.map(name =>
        `<label><input type="checkbox" class="finder-exclude-char-check" value="${name}"> ${name}</label>`
    ).join('');
}

function renderExclusionChipsFromDropdown(containerId, dropdownSelector, checkboxSelector) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const checked = document.querySelectorAll(`${dropdownSelector} ${checkboxSelector}:checked`);
    if (checked.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = Array.from(checked).map(cb => {
        const label = cb.closest('label')?.textContent.trim() || cb.value;
        return `<span class="finder-exclusion-chip">${label} <button class="finder-chip-remove" data-value="${cb.value}" data-selector="${checkboxSelector}">&times;</button></span>`;
    }).join('');

    container.querySelectorAll('.finder-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.value;
            const sel = btn.dataset.selector;
            const cb = document.querySelector(`${sel}[value="${val}"]`);
            if (cb) { cb.checked = false; }
            renderExclusionChipsFromDropdown(containerId, dropdownSelector, checkboxSelector);
            if (sel.includes('char')) {
                updateFinderMultiSelectText('finderExcludeCharSelect', 'Select characters...');
            }
        });
    });
}

// (Dead include dropdown/chip code removed — visual picker handles this now)

function updateIncludeInfo() {
    const info = document.getElementById('finderIncludeInfo');
    if (!info) return;

    const count = _finderIncludeCardIds.size;
    if (count === 0) {
        info.textContent = '';
    } else if (count <= 4) {
        const mode = document.querySelector('input[name="finderIncludeMode"]:checked')?.value || 'all';
        info.textContent = mode === 'all'
            ? `${count} card${count > 1 ? 's' : ''} forced into deck \u2014 ${5 - count} slot${5 - count !== 1 ? 's' : ''} searched`
            : `At least 1 of ${count} cards required in deck`;
    } else if (count === 5) {
        info.textContent = '5 cards fill all player slots \u2014 only friend card will be searched';
    } else {
        info.textContent = `${count} cards selected \u2014 best 5 will be chosen from these only`;
    }
}

function checkIncludeDuplicates() {
    const warning = document.getElementById('finderIncludeDupeWarning');
    if (!warning) return;

    if (_finderIncludeFriendIds.size === 0) { warning.style.display = 'none'; return; }

    const dupes = [..._finderIncludeFriendIds].filter(id => _finderIncludeCardIds.has(id));
    if (dupes.length > 0) {
        warning.style.display = '';
        warning.textContent = `Warning: ${dupes.length} card${dupes.length > 1 ? 's' : ''} selected in both player and friend slots.`;
    } else {
        warning.style.display = 'none';
    }
}

// ===== RATIO SUM =====

function updateRatioSum() {
    let sum = 0;
    const ratios = {};
    document.querySelectorAll('.finder-ratio-input').forEach(input => {
        const val = parseInt(input.value) || 0;
        if (!input.disabled) sum += val;
        if (val > 0) ratios[input.dataset.type] = val;
    });
    _logDeckFinderUI.debug('Type composition changed', { ratios, sum });
    const el = document.getElementById('finderRatioSum');
    if (el) {
        el.textContent = `Sum: ${sum} / 6`;
        el.className = 'finder-ratio-sum' + (sum > 6 ? ' finder-ratio-error' : '') + (sum > 0 && sum <= 6 ? ' finder-ratio-ok' : '');
    }
}

// ===== COLLECT FILTERS FROM UI =====

function collectFiltersFromUI() {
    _logDeckFinderUI.debug('collectFiltersFromUI');
    const f = getDefaultFinderFilters();
    const overlay = document.getElementById('deckFinderOverlay');
    if (!overlay) return f;

    // Scenario
    f.scenario = overlay.querySelector('#finderScenario')?.value || '1';

    // Trainee
    f.selectedTrainee = deckFinderState.filters?.selectedTrainee || null;

    // Pool
    const poolBtn = overlay.querySelector('.finder-toggle-btn[data-pool].active');
    f.cardPool = poolBtn?.dataset?.pool || 'owned';

    // Max Potential
    f.maxPotential = overlay.querySelector('#finderMaxPotentialToggle')?.checked || false;

    // Rarity (icon buttons)
    f.rarity.ssr = overlay.querySelector('#finderSSR')?.classList.contains('selected') ?? true;
    f.rarity.sr = overlay.querySelector('#finderSR')?.classList.contains('selected') ?? true;
    f.rarity.r = overlay.querySelector('#finderR')?.classList.contains('selected') ?? false;

    // Types (icon buttons)
    overlay.querySelectorAll('.finder-type-btn').forEach(btn => {
        f.types[btn.dataset.type] = btn.classList.contains('selected');
    });

    // Type ratio — always "at least" mode
    overlay.querySelectorAll('.finder-ratio-input').forEach(input => {
        const val = parseInt(input.value) || 0;
        f.typeRatio[input.dataset.type] = val;
        f.typeRatioAtLeast[input.dataset.type] = val > 0; // always >= mode
    });

    // Thresholds
    f.minRaceBonus = parseInt(overlay.querySelector('#finderMinRace')?.value) || 0;
    f.minTrainingEff = parseInt(overlay.querySelector('#finderMinTrain')?.value) || 0;
    f.minFriendBonus = parseInt(overlay.querySelector('#finderMinFriend')?.value) || 0;
    f.minEnergyCost = parseInt(overlay.querySelector('#finderMinEnergy')?.value) || 0;

    // Required hint skills
    f.requiredSkills = _selectedRequiredSkills.map(s => Number(s.id));
    const modeRadio = overlay.querySelector('input[name="finderReqSkillMode"]:checked');
    f.requiredSkillsMode = modeRadio?.value || 'all';

    // Skill types (from layer system)
    f.requiredSkillTypes = _finderSkillTypeLayers
        .filter(l => l.type && l.min > 0)
        .map(l => ({ type: l.type, min: l.min }));

    // Exclusions — characters from dropdown, cards from Set
    f.excludeCharacters = [];
    overlay.querySelectorAll('.finder-exclude-char-check:checked').forEach(cb => {
        f.excludeCharacters.push(cb.value);
    });
    f.excludeCards = [..._finderExcludeCardIds].map(Number);

    // Include cards from Sets (convert string IDs to numbers for data layer)
    f.includeCards = [..._finderIncludeCardIds].map(Number);
    const includeModeRadio = overlay.querySelector('input[name="finderIncludeMode"]:checked');
    f.includeCardsMode = includeModeRadio?.value || 'all';
    f.includeFriendCards = [..._finderIncludeFriendIds].map(Number);

    // Result count
    const countBtn = overlay.querySelector('.finder-toggle-btn[data-count].active');
    f.resultCount = parseInt(countBtn?.dataset?.count) || 10;

    return f;
}

// ===== SEARCH TRIGGER =====

function startFinderSearch() {
    _logDeckFinderUI.info('Search triggered');
    const filters = collectFiltersFromUI();
    _logDeckFinderUI.debug('Filter state', filters);
    const errors = validateFinderFilters(filters);
    if (errors.length > 0) { showToast(errors[0], 'error'); return; }

    deckFinderState.filters = filters;
    deckFinderState.selectedResultIndex = -1;
    deckFinderState.searchStats = null;

    // Invalidate skill cache since pool may have changed
    _availableSkillsCache = null;

    const searchBtn = document.getElementById('finderSearchBtn');
    const cancelBtn = document.getElementById('finderCancelBtn');
    const progressEl = document.getElementById('finderProgress');
    if (searchBtn) searchBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = '';
    if (progressEl) progressEl.style.display = '';

    renderFinderResults([], null, true);

    runSearch(filters,
        // onProgress(progress, matchCount, statusText)
        (progress, matchCount, statusText) => {
            const fill = document.getElementById('finderProgressFill');
            const text = document.getElementById('finderProgressText');
            const matches = document.getElementById('finderProgressMatches');
            if (progress < 0) {
                // Indeterminate phase (preparing/warm-start)
                if (fill) fill.style.width = '100%';
                if (fill) fill.style.opacity = '0.3';
                if (text) text.textContent = statusText || 'Preparing...';
            } else {
                if (fill) fill.style.opacity = '1';
                if (fill) fill.style.width = progress + '%';
                if (text) text.textContent = progress + '%';
            }
            if (matches && matchCount !== undefined && matchCount > 0) matches.textContent = `${matchCount} matches`;
        },
        // onComplete
        (results, message) => {
            _logDeckFinderUI.info('Results received', { count: results.length, message: message || 'none' });
            if (searchBtn) searchBtn.style.display = '';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (progressEl) progressEl.style.display = 'none';
            // Results are already stored and sorted by sortFinderResults() called from search
            renderFinderResults(deckFinderState.results, message, false);
            // Search completion toast
            const stats = deckFinderState.searchStats;
            const elapsed = stats?.elapsed ? (stats.elapsed / 1000).toFixed(1) + 's' : '';
            if (deckFinderState.results.length > 0) {
                showToast(`Search complete — found ${deckFinderState.results.length} deck${deckFinderState.results.length !== 1 ? 's' : ''}${elapsed ? ' in ' + elapsed : ''}`, 'success');
            } else if (!message) {
                showToast('No decks match your criteria. Try relaxing thresholds or expanding the card pool.', 'warning');
            }
        },
        // onLiveResults — update results panel in real-time during brute force
        (liveResults, matchCount) => {
            deckFinderState.results = liveResults;
            renderLiveResults(liveResults, matchCount);
        }
    );
}

// ===== RESULTS RENDERING =====

function renderFinderResults(results, message, searching) {
    _logDeckFinderUI.time('renderFinderResults');
    const container = document.getElementById('finderResultsBody');
    if (!container) { _logDeckFinderUI.timeEnd('renderFinderResults'); return; }

    if (searching) {
        container.innerHTML = '<div class="finder-results-placeholder"><div class="finder-spinner"></div><div>Searching...</div></div>';
        return;
    }

    if (message && results.length === 0) {
        container.innerHTML = `<div class="finder-results-placeholder">${message}</div>`;
        return;
    }

    let html = '';
    if (message) {
        html += `<div class="finder-warning">${message}</div>`;
    }

    // Search stats
    const stats = deckFinderState.searchStats;
    if (stats) {
        const elapsed = stats.elapsed ? (stats.elapsed / 1000).toFixed(1) + 's' : '?';
        const evaluated = stats.evaluated || 0;
        const pruned = stats.pruned || 0;
        const total = evaluated + pruned;
        const prunePct = total > 0 ? Math.round(pruned / total * 100) : 0;
        html += `<div class="finder-search-stats">`;
        html += `<span>Searched ${total.toLocaleString()} decks in ${elapsed}</span>`;
        if (prunePct > 0) html += `<span>${prunePct}% pruned by optimizer</span>`;
        html += `</div>`;
    }

    // Display only the top N from the sorted pool
    const displayCount = deckFinderState.filters?.resultCount || 10;
    const displayResults = results.slice(0, displayCount);

    html += `<div class="finder-results-header">
        <span class="finder-results-count">${displayResults.length} of ${results.length} deck${results.length !== 1 ? 's' : ''} shown (pool: ${deckFinderState.results?.length || results.length})</span>
        <button class="btn btn-secondary btn-sm" id="finderCompareBtn" style="display:none;">Compare Selected</button>
    </div>`;

    html += '<div class="finder-results-list" id="finderResultsList">';
    displayResults.forEach((result, idx) => {
        html += renderResultCard(result, idx);
    });
    html += '</div>';

    // Comparison area
    html += '<div class="finder-comparison" id="finderComparison"></div>';

    container.innerHTML = html;
    wireResultEvents(container);
    _logDeckFinderUI.timeEnd('renderFinderResults');
}

function renderLiveResults(results, matchCount) {
    _logDeckFinderUI.debug('renderLiveResults', { count: results.length, matchCount });
    const container = document.getElementById('finderResultsBody');
    if (!container) return;

    // Build or update the results list without losing scroll position
    let list = container.querySelector('#finderResultsList');
    let header = container.querySelector('.finder-results-count');

    if (!list) {
        // First live update — create the structure
        container.innerHTML = `
            <div class="finder-results-header">
                <span class="finder-results-count"></span>
            </div>
            <div class="finder-results-list" id="finderResultsList"></div>
            <div class="finder-comparison" id="finderComparison"></div>
        `;
        list = container.querySelector('#finderResultsList');
        header = container.querySelector('.finder-results-count');
    }

    // Limit live preview to display count
    const displayCount = deckFinderState.filters?.resultCount || 10;
    const displayResults = results.slice(0, displayCount);

    if (header) {
        header.textContent = `Top ${displayResults.length} of ${matchCount} matches (searching...)`;
    }

    // Live preview with card thumbnails (rarity border + type icon) and key metrics
    const cardMap = getCardDataMap();
    const typeIconIdx = { speed: '0', stamina: '1', power: '2', guts: '3', intelligence: '4', friend: '5' };
    list.innerHTML = displayResults.map((result, idx) => {
        const m = result.metrics;
        const resultFriendId = result.friendCardId || null;
        const thumbs = result.cardIds.map(id => {
            const card = cardMap.get(id);
            if (!card) return '';
            const isFriend = id === resultFriendId;
            const iconFile = `images/supports/utx_ico_obtain_0${typeIconIdx[card.type] || '0'}.png`;
            return `<div class="finder-thumb-wrap${isFriend ? ' finder-thumb-friend' : ''}">
                <img src="images/supports/${card.support_id}.png"
                     onerror="this.style.display='none'"
                     class="finder-result-thumb card-image rarity-${card.rarity}"
                     title="${card.char_name}${isFriend ? ' (Friend)' : ''}" alt="${card.char_name}">
                <img class="finder-thumb-type-icon" src="${iconFile}" alt="${card.type}">
                ${isFriend ? '<span class="finder-thumb-friend-tag" data-tooltip="Friend slot card" tabindex="0">F</span>' : ''}
            </div>`;
        }).join('');
        const keyMetrics = [];
        if (m.raceBonus > 0) keyMetrics.push(`Race ${m.raceBonus}%`);
        if (m.trainingEff > 0) keyMetrics.push(`TrEff ${m.trainingEff}%`);
        if (m.friendBonus > 0) keyMetrics.push(`Friend ${m.friendBonus}%`);
        return `<div class="finder-result-card finder-live-preview" data-idx="${idx}">
            <div class="finder-result-top">
                <div class="finder-result-rank${idx === 0 ? ' rank-gold' : idx === 1 ? ' rank-silver' : idx === 2 ? ' rank-bronze' : ''}">#${idx + 1}</div>
                <div class="finder-result-thumbs">${thumbs}</div>
            </div>
            <span class="finder-live-metrics">${keyMetrics.join(' | ')}</span>
        </div>`;
    }).join('');
    // Ensure delegation is wired (no-op if already done)
    ensureResultsDelegation(container);
}

function renderResultCard(result, idx) {
    const m = result.metrics;
    const cache = deckFinderState.cardEffectCache;

    // Build type summary
    const typeCounts = {};
    result.cardIds.forEach(id => {
        const data = cache.get(id);
        if (data) typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
    });
    const typeStr = Object.entries(typeCounts)
        .map(([t, c]) => `${getTypeDisplayName(t).substring(0, 3)}&times;${c}`)
        .join(' ');

    // Card thumbnails with rarity borders and type icons
    const typeIconIdx = { speed: '0', stamina: '1', power: '2', guts: '3', intelligence: '4', friend: '5' };
    const resultFriendId = result.friendCardId || null;
    const cardMap = getCardDataMap();
    const cardThumbs = result.cardIds.map(id => {
        const card = cardMap.get(id);
        if (!card) return '';
        const isFriend = id === resultFriendId;
        const iconFile = `images/supports/utx_ico_obtain_0${typeIconIdx[card.type] || '0'}.png`;
        return `<div class="finder-thumb-wrap${isFriend ? ' finder-thumb-friend' : ''}">
            <img src="images/supports/${card.support_id}.png"
                 onerror="this.style.display='none'"
                 class="finder-result-thumb card-image rarity-${card.rarity}"
                 title="${card.char_name}${isFriend ? ' (Friend)' : ''}" alt="${card.char_name}">
            <img class="finder-thumb-type-icon" src="${iconFile}" alt="${card.type}">
            ${isFriend ? '<span class="finder-thumb-friend-tag" data-tooltip="Friend slot card" tabindex="0">F</span>' : ''}
        </div>`;
    }).join('');

    // Metric row
    const metricItems = [];
    if (m.raceBonus > 0) metricItems.push({ label: 'Race', value: m.raceBonus + '%', cls: 'metric-race' });
    if (m.trainingEff > 0) metricItems.push({ label: 'TrEff', value: m.trainingEff + '%', cls: 'metric-train' });
    if (m.friendBonus > 0) metricItems.push({ label: 'Friend', value: m.friendBonus + '%', cls: 'metric-friend' });
    if (m.energyCost > 0) metricItems.push({ label: 'Energy', value: '-' + m.energyCost + '%', cls: 'metric-energy' });
    if (m.eventRecovery > 0) metricItems.push({ label: 'EvtRec', value: m.eventRecovery + '%', cls: 'metric-event' });
    if (m.hintSkillCount > 0) metricItems.push({ label: 'Hints', value: m.hintSkillCount, cls: 'metric-hints' });
    if (m.skillAptitude > 0) metricItems.push({ label: 'Aptitude', value: m.skillAptitude.toFixed(1), cls: 'metric-aptitude' });

    return `
        <div class="finder-result-card" data-idx="${idx}">
            <div class="finder-result-top">
                <div class="finder-result-rank${idx === 0 ? ' rank-gold' : idx === 1 ? ' rank-silver' : idx === 2 ? ' rank-bronze' : ''}" data-tooltip="Rank based on weighted scoring of all deck metrics" tabindex="0">#${idx + 1}</div>
                <div class="finder-result-thumbs">${cardThumbs}</div>
                <div class="finder-result-actions-top">
                    <label class="finder-cmp-label" data-tooltip="Select multiple decks then press Compare at the top to view them side-by-side" tabindex="0"><input type="checkbox" class="finder-compare-check" data-idx="${idx}"> Compare</label>
                </div>
            </div>
            <div class="finder-result-metrics">
                ${metricItems.map(mi => `<div class="finder-metric ${mi.cls}" data-tooltip="${FINDER_METRIC_TOOLTIPS[mi.cls] || ''}" tabindex="0"><span class="finder-metric-label">${mi.label}</span><span class="finder-metric-value">${mi.value}</span></div>`).join('')}
            </div>
            <div class="finder-result-bottom">
                <span class="finder-result-types" data-tooltip="Deck composition — card type abbreviation × count" tabindex="0">${typeStr}</span>
                <div class="finder-result-btns">
                    <button class="btn btn-secondary btn-sm finder-view-btn" data-idx="${idx}">View in Builder</button>
                    <button class="btn btn-primary btn-sm finder-save-btn" data-idx="${idx}">Save as Deck</button>
                </div>
            </div>
            <div class="finder-result-detail" id="finderDetail${idx}" style="display:none;"></div>
        </div>
    `;
}

// Delegated event listener — wired once on the results container, never re-wired
let _resultsDelegateWired = false;
function ensureResultsDelegation(container) {
    if (_resultsDelegateWired) return;
    _resultsDelegateWired = true;

    container.addEventListener('click', (e) => {
        // View button — preview in builder (unsaved)
        const viewBtn = e.target.closest('.finder-view-btn');
        if (viewBtn) {
            e.stopPropagation();
            const idx = parseInt(viewBtn.dataset.idx);
            const result = deckFinderState.results[idx];
            if (result) {
                viewDeckFromFinder(result.cardIds);
                closeDeckFinder();
                showToast('Deck preview loaded — Save or Cancel in the Deck Builder', 'info');
            }
            return;
        }

        // Save button — create a named saved deck
        const saveBtn = e.target.closest('.finder-save-btn');
        if (saveBtn) {
            e.stopPropagation();
            const idx = parseInt(saveBtn.dataset.idx);
            const result = deckFinderState.results[idx];
            if (result) {
                const name = saveDeckFromFinder(result.cardIds);
                showToast(`Saved as "${name}"`, 'success');
            }
            return;
        }

        // Ignore clicks inside the expanded detail area (training controls, assignment, etc.)
        if (e.target.closest('.finder-result-detail')) return;

        // Ignore clicks on buttons/labels/selects/inputs (compare checkboxes handled via change)
        if (e.target.closest('.finder-result-btns') || e.target.closest('.finder-cmp-label')) return;

        // Card header click — expand/collapse detail (only from top/metrics/bottom rows)
        const card = e.target.closest('.finder-result-card');
        if (card) {
            const idx = parseInt(card.dataset.idx);
            toggleResultDetail(idx);
        }
    });

    container.addEventListener('change', (e) => {
        if (e.target.closest('.finder-compare-check')) {
            updateCompareSelection();
        }
    });
}

function wireResultEvents(container) {
    ensureResultsDelegation(container);
}

// ===== CARD EFFECTS TABLE =====

function buildCardEffectsTable(effects, uniqueEffectBonuses, uniqueEffectName) {
    if (!effects || Object.keys(effects).length === 0) return '<em>No effects</em>';
    const entries = Object.entries(effects).sort((a, b) => b[1] - a[1]);
    const ue = uniqueEffectBonuses || {};
    const ueName = uniqueEffectName || 'Unique Effect';

    // Split into two columns
    const mid = Math.ceil(entries.length / 2);
    const col1 = entries.slice(0, mid);
    const col2 = entries.slice(mid);

    function renderRow([eid, val]) {
        const sym = effectsData[eid]?.symbol === 'percent' ? '%' : '';
        const ueVal = ue[eid];
        const ueTag = ueVal
            ? ` <span class="finder-ue-tag" title="+${ueVal}${sym} ${getEffectName(eid)} from Unique Effect '${ueName}'">(+${ueVal}${sym}*)</span>`
            : '';
        return `<tr><td>${getEffectName(eid)}</td><td>${val}${sym}${ueTag}</td></tr>`;
    }

    // Build two side-by-side tables in a grid
    let html = '<div class="finder-effects-2col">';
    html += '<table class="finder-card-effects-table">' + col1.map(renderRow).join('') + '</table>';
    if (col2.length > 0) {
        html += '<table class="finder-card-effects-table">' + col2.map(renderRow).join('') + '</table>';
    }
    html += '</div>';
    return html;
}

// ===== INLINE DETAIL TOGGLE =====

function toggleResultDetail(idx) {
    _logDeckFinderUI.debug('toggleResultDetail', { idx });
    const detail = document.getElementById(`finderDetail${idx}`);
    if (!detail) return;

    const isOpen = detail.style.display !== 'none';

    // Close all others
    document.querySelectorAll('.finder-result-detail').forEach(d => {
        d.style.display = 'none';
        d.closest('.finder-result-card')?.classList.remove('expanded');
    });

    if (isOpen) return;

    // Expand this one
    detail.style.display = '';
    detail.closest('.finder-result-card')?.classList.add('expanded');
    deckFinderState.selectedResultIndex = idx;

    const result = deckFinderState.results[idx];
    if (!result) return;

    // Reset training assignments when switching to a different result
    if (finderTrainingState.resultIdx !== idx) {
        finderTrainingState.assignments = initFinderTrainingAssignments(result.cardIds.length);
        finderTrainingState.resultIdx = idx;
    }

    const analysis = analyzeWhyThisDeck(result, deckFinderState.filters);
    const cache = deckFinderState.cardEffectCache;

    let html = '';

    // Badges
    if (analysis.badges.length > 0) {
        html += '<div class="finder-detail-badges">';
        analysis.badges.forEach(b => {
            const cls = b.type === 'exceeds' ? 'badge-exceeds' : b.type === 'meets' ? 'badge-meets' : 'badge-info';
            html += `<span class="finder-badge ${cls}">${b.label}: ${b.value}</span>`;
        });
        html += '</div>';
    }

    // Card details with images
    const friendCardId = result.friendCardId || null;
    html += '<div class="finder-detail-cards">';
    const cardMap = getCardDataMap();
    result.cardIds.forEach(id => {
        const card = cardMap.get(id);
        const isFriend = id === friendCardId;
        // Use friend-prefixed cache key for friend cards (max level data)
        const data = isFriend ? (cache.get('friend_' + id) || cache.get(id)) : cache.get(id);
        if (!card) return;
        const keyEntry = analysis.keyCards.find(k => k.cardId === id);
        const rarityLabel = card.rarity === 3 ? 'SSR' : card.rarity === 2 ? 'SR' : 'R';
        const effectsTable = data ? buildCardEffectsTable(data.effects, data.uniqueEffectBonuses, data.uniqueEffectName) : '';

        // Build badges for this card
        let cardBadges = '';
        if (isFriend) {
            cardBadges += '<span class="finder-friend-badge" data-tooltip="Friend slot card — borrowed from another player at max level" tabindex="0">Friend</span>';
        }
        if (keyEntry) {
            cardBadges += `<span class="finder-key-badge" data-tooltip="Key Card — top contributor to ${keyEntry.metric} in this deck" tabindex="0">${keyEntry.metric}</span>`;
        }

        const cardClasses = ['finder-detail-card'];
        if (keyEntry) cardClasses.push('key-card');
        if (isFriend) cardClasses.push('friend-card');

        html += `<div class="${cardClasses.join(' ')}">
            <img src="images/supports/${card.support_id}.png"
                 onerror="this.src='images/supports/placeholder.png'"
                 class="finder-detail-img card-image rarity-${card.rarity}">
            <div class="finder-detail-card-info">
                <div class="finder-detail-card-name">
                    ${card.char_name || 'Unknown'}
                    ${cardBadges}
                </div>
                <div class="finder-detail-card-meta">
                    <span class="rarity rarity-${card.rarity}">${rarityLabel}</span>
                    <span class="type type-${card.type}">${getTypeDisplayName(card.type)}</span>
                    <span class="finder-detail-level">Lv.${data?.level || '?'}${isFriend ? ' (Max)' : ''}</span>
                </div>
                <div class="finder-detail-card-effects">${effectsTable}</div>
            </div>
        </div>`;
    });
    html += '</div>';

    // Aggregated effects grid
    const agg = result.aggregated;
    const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    html += '<div class="finder-detail-section-title">Aggregated Effects</div>';
    html += '<div class="finder-detail-agg-grid">';
    sorted.forEach(([eid, val]) => {
        const sym = effectsData[eid]?.symbol === 'percent' ? '%' : '';
        html += `<div class="finder-agg-item"><span>${getEffectName(eid)}</span><strong>${val}${sym}</strong></div>`;
    });
    html += '</div>';

    // Training simulation preview
    html += buildFinderTrainingSection(result, idx);

    // Hint + event skills table
    const hintSkillMap = new Map();
    const _skillLookup = typeof getSkillIdLookup === 'function' ? getSkillIdLookup() : null;

    function _addSkillToMap(skillEntry, cardCharName, source) {
        const sid = typeof skillEntry === 'object' ? skillEntry.id : skillEntry;
        if (!sid) return;
        // Resolve name and types from skill object, or fall back to skillsData lookup
        let skillName = typeof skillEntry === 'object' ? skillEntry.name : null;
        let skillTypes = (typeof skillEntry === 'object' && Array.isArray(skillEntry.type)) ? skillEntry.type : null;
        if ((!skillName || !skillTypes) && _skillLookup && _skillLookup[sid]) {
            const looked = _skillLookup[sid];
            if (!skillName) skillName = looked.name;
            if (!skillTypes) skillTypes = looked.type || [];
        }
        skillTypes = skillTypes || [];

        if (!hintSkillMap.has(sid)) {
            hintSkillMap.set(sid, {
                id: sid,
                name: skillName || `Skill ${sid}`,
                typeIds: skillTypes,
                types: skillTypes.map(t => {
                    const st = skillTypesData?.[t];
                    return (typeof st === 'object' ? st.string : st) || t;
                }).join(', '),
                sources: [cardCharName],
                sourceType: source
            });
        } else {
            const entry = hintSkillMap.get(sid);
            if (!entry.sources.includes(cardCharName)) entry.sources.push(cardCharName);
        }
    }

    result.cardIds.forEach(id => {
        const card = cardMap.get(id);
        if (!card) return;
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(sk => _addSkillToMap(sk, card.char_name, 'hint'));
        }
        if (card.event_skills) {
            card.event_skills.forEach(sk => _addSkillToMap(sk, card.char_name, 'event'));
        }
    });

    if (hintSkillMap.size > 0) {
        // Build sets of required skill IDs and type IDs for highlighting
        const filters = deckFinderState.filters || {};
        const reqSkillIds = new Set((filters.requiredSkills || []).map(String));
        const reqTypeIds = new Set((filters.requiredSkillTypes || []).map(e =>
            typeof e === 'object' ? e.type : e
        ));

        const skillList = [...hintSkillMap.values()].sort((a, b) => a.name.localeCompare(b.name));
        html += `<div class="finder-detail-section-title">Hint Skills (${skillList.length})</div>`;
        html += '<table class="finder-skills-table"><thead><tr><th>Skill</th><th>Types</th><th>Sources</th></tr></thead><tbody>';
        skillList.forEach(sk => {
            const isReqSkill = reqSkillIds.has(String(sk.id));
            const matchedTypes = sk.typeIds.filter(t => reqTypeIds.has(t));
            const hasReqType = matchedTypes.length > 0;
            const rowCls = isReqSkill ? ' class="finder-skill-required"' : '';

            // Build types cell with individual type highlighting
            let typesHtml;
            if (reqTypeIds.size > 0) {
                typesHtml = sk.typeIds.map(t => {
                    const label = skillTypesData[t] || t;
                    return reqTypeIds.has(t)
                        ? `<span class="finder-skill-type-match">${label}</span>`
                        : label;
                }).join(', ');
            } else {
                typesHtml = sk.types;
            }

            html += `<tr${rowCls}>
                <td class="finder-skill-name${isReqSkill ? ' finder-skill-name-match' : ''}">${sk.name}</td>
                <td class="finder-skill-types">${typesHtml}</td>
                <td class="finder-skill-sources">${sk.sources.join(', ')}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }

    detail.innerHTML = html;
    wireFinderTrainingEvents(idx);
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== TRAINING SIMULATION PREVIEW =====

function buildFinderTrainingSection(result, idx) {
    // Initialize training state for this result
    finderTrainingState.resultIdx = idx;
    if (!finderTrainingState.assignments || finderTrainingState.assignments.speed?.length !== result.cardIds.length) {
        finderTrainingState.assignments = initFinderTrainingAssignments(result.cardIds.length);
    }

    const training = calculateFinderAllTraining(result);
    if (!training) return '';

    let html = '<div class="finder-training-section">';
    html += '<div class="finder-detail-section-title">Training Simulation</div>';

    // Controls row
    html += '<div class="finder-training-controls">';
    html += '<label>Facility Lv</label>';
    html += '<div class="finder-training-level-row">';
    for (let lv = 1; lv <= 5; lv++) {
        html += `<button class="finder-training-level-btn${lv === finderTrainingState.trainingLevel ? ' active' : ''}" data-level="${lv}">${lv}</button>`;
    }
    html += '</div>';

    html += '<label>Mood</label>';
    html += '<div class="finder-mood-row">';
    const moods = [
        { key: 'very_good', img: 'images/ui/mood_very_good.png', label: 'Very Good', title: '+20% mood bonus', fallback: '\u{1f601}' },
        { key: 'good', img: 'images/ui/mood_good.png', label: 'Good', title: '+10% mood bonus', fallback: '\u{1f642}' },
        { key: 'normal', img: 'images/ui/mood_normal.png', label: 'Normal', title: '0% mood bonus', fallback: '\u{1f610}' },
        { key: 'bad', img: 'images/ui/mood_bad.png', label: 'Bad', title: '-10% mood bonus', fallback: '\u{1f61e}' },
        { key: 'very_bad', img: 'images/ui/mood_very_bad.png', label: 'Very Bad', title: '-20% mood bonus', fallback: '\u{1f621}' }
    ];
    for (const m of moods) {
        html += `<button class="finder-mood-btn${finderTrainingState.mood === m.key ? ' active' : ''}" data-mood="${m.key}" data-tooltip="${m.title}">
            <img src="${m.img}" alt="${m.label}" onerror="this.replaceWith(document.createTextNode('${m.fallback}'))">
            <span class="mood-label">${m.label}</span>
        </button>`;
    }
    html += '</div>';

    html += `<label class="finder-friendship-toggle">
        <input type="checkbox" id="finderTrainFriendship" ${finderTrainingState.friendshipTraining ? 'checked' : ''}>
        Friendship
    </label>`;
    html += '</div>';

    // Training breakdown table
    html += buildFinderTrainingTable(training, result);

    // Race bonus section
    if (training.raceBonusPct > 0) {
        html += buildFinderRaceBonusSection(training.raceBonusPct);
    }

    html += '</div>';
    return html;
}

function buildFinderTrainingTable(training, result) {
    const { results: tr, failureRates } = training;
    const types = ['speed', 'stamina', 'power', 'guts', 'intelligence'];
    const typeLabels = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wisdom' };

    let html = '<table class="finder-training-table"><thead><tr>';
    html += '<th>Training</th><th>Spd</th><th>Sta</th><th>Pow</th><th>Gut</th><th>Wit</th><th>Skill</th><th>Energy</th><th>Fail</th>';
    html += '</tr></thead><tbody>';

    for (const type of types) {
        const r = tr[type];
        if (!r) continue;

        const presentCount = r.presentCards.length;
        const fail = failureRates?.[type];

        html += `<tr>`;
        // Training name — clickable to open assignment modal
        html += `<td class="finder-train-name" data-training="${type}" title="Click to toggle card assignments">`;
        html += `${typeLabels[type]} <span class="train-cards-count">(${presentCount})</span></td>`;

        // Stats
        for (const key of ['speed', 'stamina', 'power', 'guts', 'wit', 'skillPts']) {
            const val = r[key] || 0;
            html += `<td class="${val > 0 ? 'train-val-positive' : 'train-val-zero'}">${val || '-'}</td>`;
        }

        // Energy
        if (r.energy >= 0) {
            html += `<td class="train-energy-gain">+${r.energy}</td>`;
        } else if (r.energyReduced !== undefined) {
            html += `<td><span class="train-energy-cost">${r.energy}</span> <span class="train-energy-reduced">(${r.energyReduced})</span></td>`;
        } else {
            html += `<td class="train-energy-cost">${r.energy}</td>`;
        }

        // Failure rate
        if (fail) {
            const base = fail.baseRate;
            const eff = fail.effectiveRate;
            if (eff < base) {
                html += `<td><span class="train-failure">${base}%</span> <span class="train-failure-reduced">${eff}%</span></td>`;
            } else if (base > 0) {
                html += `<td class="train-failure">${base}%</td>`;
            } else {
                html += '<td class="train-val-zero">-</td>';
            }
        } else {
            html += '<td class="train-val-zero">-</td>';
        }

        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function buildFinderRaceBonusSection(raceBonusPct) {
    const scenarioId = deckFinderState.filters?.scenario || '1';
    const raceTable = typeof getRaceBonusTable === 'function' ? getRaceBonusTable(scenarioId) : [];
    if (raceTable.length === 0) return '';

    let html = '<div class="finder-detail-section-title">Race Stat Gains (Race Bonus ' + raceBonusPct + '%)</div>';
    html += '<div class="finder-race-bonus-grid">';

    for (const race of raceTable) {
        const statGain = Math.floor(race.baseStats * (1 + raceBonusPct / 100));
        const skillGain = Math.floor(race.baseSkillPt * (1 + raceBonusPct / 100));
        const label = race.allStats ? `${race.label} (all)` : race.label;
        html += `<div class="finder-race-bonus-item">
            <span class="race-label">${label}</span>
            <span class="race-value">+${statGain} / +${skillGain}sp</span>
        </div>`;
    }

    html += '</div>';
    return html;
}

function refreshFinderTraining(idx) {
    const result = deckFinderState.results[idx];
    if (!result) return;

    const detail = document.getElementById(`finderDetail${idx}`);
    if (!detail) return;

    const section = detail.querySelector('.finder-training-section');
    if (!section) return;

    // Rebuild just the training section content
    const training = calculateFinderAllTraining(result);
    if (!training) return;

    // Rebuild table + race bonus
    let innerHtml = '<div class="finder-detail-section-title">Training Simulation</div>';

    // Controls (preserve current state)
    innerHtml += '<div class="finder-training-controls">';
    innerHtml += '<label>Facility Lv</label>';
    innerHtml += '<div class="finder-training-level-row">';
    for (let lv = 1; lv <= 5; lv++) {
        innerHtml += `<button class="finder-training-level-btn${lv === finderTrainingState.trainingLevel ? ' active' : ''}" data-level="${lv}">${lv}</button>`;
    }
    innerHtml += '</div>';
    innerHtml += '<label>Mood</label>';
    innerHtml += '<div class="finder-mood-row">';
    const moods2 = [
        { key: 'very_good', img: 'images/ui/mood_very_good.png', label: 'Very Good', title: '+20% mood bonus', fallback: '\u{1f601}' },
        { key: 'good', img: 'images/ui/mood_good.png', label: 'Good', title: '+10% mood bonus', fallback: '\u{1f642}' },
        { key: 'normal', img: 'images/ui/mood_normal.png', label: 'Normal', title: '0% mood bonus', fallback: '\u{1f610}' },
        { key: 'bad', img: 'images/ui/mood_bad.png', label: 'Bad', title: '-10% mood bonus', fallback: '\u{1f61e}' },
        { key: 'very_bad', img: 'images/ui/mood_very_bad.png', label: 'Very Bad', title: '-20% mood bonus', fallback: '\u{1f621}' }
    ];
    for (const m of moods2) {
        innerHtml += `<button class="finder-mood-btn${finderTrainingState.mood === m.key ? ' active' : ''}" data-mood="${m.key}" data-tooltip="${m.title}">
            <img src="${m.img}" alt="${m.label}" onerror="this.replaceWith(document.createTextNode('${m.fallback}'))">
            <span class="mood-label">${m.label}</span>
        </button>`;
    }
    innerHtml += '</div>';
    innerHtml += `<label class="finder-friendship-toggle">
        <input type="checkbox" id="finderTrainFriendship" ${finderTrainingState.friendshipTraining ? 'checked' : ''}>
        Friendship
    </label>`;
    innerHtml += '</div>';

    innerHtml += buildFinderTrainingTable(training, result);
    if (training.raceBonusPct > 0) {
        innerHtml += buildFinderRaceBonusSection(training.raceBonusPct);
    }

    section.innerHTML = innerHtml;
    wireFinderTrainingEvents(idx);
}

function wireFinderTrainingEvents(idx) {
    const detail = document.getElementById(`finderDetail${idx}`);
    if (!detail) return;

    // Facility level buttons
    detail.querySelectorAll('.finder-training-level-btn').forEach(btn => {
        btn.onclick = () => {
            finderTrainingState.trainingLevel = parseInt(btn.dataset.level) || 1;
            refreshFinderTraining(idx);
        };
    });

    // Mood buttons
    detail.querySelectorAll('.finder-mood-btn').forEach(btn => {
        btn.onclick = () => {
            finderTrainingState.mood = btn.dataset.mood;
            refreshFinderTraining(idx);
        };
    });

    // Friendship toggle
    const friendCb = detail.querySelector('#finderTrainFriendship');
    if (friendCb) {
        friendCb.onchange = () => {
            finderTrainingState.friendshipTraining = friendCb.checked;
            refreshFinderTraining(idx);
        };
    }

    // Entire training row clicks -> assignment modal
    detail.querySelectorAll('.finder-training-table tbody tr').forEach(tr => {
        const trainingType = tr.querySelector('.finder-train-name')?.dataset?.training;
        if (!trainingType) return;
        tr.style.cursor = 'pointer';
        tr.onclick = () => {
            openFinderAssignmentModal(trainingType, idx);
        };
    });
}

function openFinderAssignmentModal(trainingType, resultIdx) {
    const result = deckFinderState.results[resultIdx];
    if (!result) return;

    const cache = deckFinderState.cardEffectCache;
    const cardMap = getCardDataMap();
    const friendCardId = result.friendCardId || null;
    const assignments = finderTrainingState.assignments[trainingType];
    if (!assignments) return;

    const typeLabels = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wisdom' };
    const typeIconIdx = { speed: '0', stamina: '1', power: '2', guts: '3', intelligence: '4', friend: '5' };

    // Build modal
    const overlay = document.createElement('div');
    overlay.className = 'picker-modal-overlay finder-assign-overlay';
    overlay.innerHTML = `
        <div class="picker-modal finder-assign-modal">
            <div class="picker-header">
                <h3>${typeLabels[trainingType] || trainingType} Training — Card Assignment</h3>
                <button class="picker-close" id="finderAssignClose">&times;</button>
            </div>
            <div class="finder-assign-list" id="finderAssignList"></div>
            <div class="finder-picker-footer">
                <button class="btn btn-secondary btn-sm" id="finderAssignResetBtn">Reset All</button>
                <button class="btn btn-primary btn-sm" id="finderAssignDoneBtn">Done</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const localAssign = [...assignments];

    function renderList() {
        const list = overlay.querySelector('#finderAssignList');
        list.innerHTML = result.cardIds.map((id, i) => {
            const card = cardMap.get(id);
            const isFriend = id === friendCardId;
            const data = isFriend ? (cache.get('friend_' + id) || cache.get(id)) : cache.get(id);
            const present = localAssign[i];
            const iconFile = `images/supports/utx_ico_obtain_0${typeIconIdx[card?.type] || '0'}.png`;
            return `<div class="finder-assign-item${present ? '' : ' excluded'}" data-slot="${i}">
                <img src="images/supports/${card?.support_id || 'placeholder'}.png"
                     onerror="this.src='images/supports/placeholder.png'"
                     class="card-image rarity-${card?.rarity || 1}">
                <div class="finder-assign-item-info">
                    <div class="finder-assign-item-name">${card?.char_name || 'Unknown'}${isFriend ? ' (F)' : ''}</div>
                    <div class="finder-assign-item-type">${getTypeDisplayName(card?.type || 'speed')} Lv.${data?.level || '?'}</div>
                </div>
                <span class="finder-assign-status ${present ? 'present' : 'excluded'}">${present ? 'Present' : 'Excluded'}</span>
            </div>`;
        }).join('');

        // Toggle clicks
        list.querySelectorAll('.finder-assign-item').forEach(item => {
            item.onclick = () => {
                const slot = parseInt(item.dataset.slot);
                localAssign[slot] = !localAssign[slot];
                renderList();
            };
        });
    }
    renderList();

    // Close
    overlay.querySelector('#finderAssignClose').onclick = () => {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    };
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); }
    });

    // Reset
    overlay.querySelector('#finderAssignResetBtn').onclick = () => {
        localAssign.fill(true);
        renderList();
    };

    // Done — save and recalculate
    overlay.querySelector('#finderAssignDoneBtn').onclick = () => {
        finderTrainingState.assignments[trainingType] = localAssign;
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
        refreshFinderTraining(resultIdx);
    };
}

// ===== COMPARISON =====

function updateCompareSelection() {
    const checks = document.querySelectorAll('.finder-compare-check:checked');
    deckFinderState.compareIndices = Array.from(checks).map(c => parseInt(c.dataset.idx));
    _logDeckFinderUI.debug('Compare selection', { indices: deckFinderState.compareIndices });

    const compareBtn = document.getElementById('finderCompareBtn');
    if (compareBtn) {
        const count = deckFinderState.compareIndices.length;
        compareBtn.style.display = count >= 2 ? '' : 'none';
        compareBtn.textContent = `Compare ${count} Decks`;
        compareBtn.onclick = renderDeckComparison;
    }
}

function renderDeckComparison() {
    _logDeckFinderUI.info('renderDeckComparison', { indices: deckFinderState.compareIndices });
    const container = document.getElementById('finderComparison');
    if (!container) return;

    const indices = deckFinderState.compareIndices;
    if (indices.length < 2) return;

    const results = indices.map(i => deckFinderState.results[i]);
    const cardMap = getCardDataMap();

    const metrics = [
        { key: 'raceBonus', label: 'Race Bonus %' },
        { key: 'trainingEff', label: 'Training Eff %' },
        { key: 'friendBonus', label: 'Friendship Bonus %' },
        { key: 'energyCost', label: 'Energy Reduction %' },
        { key: 'eventRecovery', label: 'Event Recovery %' },
        { key: 'statBonus', label: 'Stat Bonus Sum' },
        { key: 'specialtyPriority', label: 'Specialty Priority' },
        { key: 'moodEffect', label: 'Mood Effect %' },
        { key: 'initialFriendship', label: 'Initial Friendship' },
        { key: 'hintSkillCount', label: 'Hint Skills' },
        { key: 'hintFrequency', label: 'Hint Frequency %' },
        { key: 'hintLevels', label: 'Hint Levels' },
        { key: 'failureProtection', label: 'Failure Protection %' },
        { key: 'initialStats', label: 'Initial Stats' },
        { key: 'skillTypeCount', label: 'Skill Types' },
        { key: 'uniqueEffects', label: 'Unique Effects' },
        { key: 'skillAptitude', label: 'Skill Aptitude' },
        { key: 'totalEffectSum', label: 'Total Effect Sum' }
    ];

    let html = '<div class="finder-comparison-title">Deck Comparison</div>';
    html += '<table class="finder-comparison-table"><thead><tr><th>Metric</th>';
    indices.forEach(i => { html += `<th>Deck #${i + 1}</th>`; });
    html += '</tr></thead><tbody>';

    metrics.forEach(({ key, label }) => {
        const values = results.map(r => r.metrics[key] || 0);
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);
        html += `<tr><td>${label}</td>`;
        values.forEach(v => {
            let cls = '';
            if (values.length > 1 && maxVal !== minVal) {
                if (v === maxVal) cls = 'finder-cmp-best';
                else if (v === minVal) cls = 'finder-cmp-worst';
            }
            html += `<td class="${cls}">${v}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    // Card diff
    const allCardSets = results.map(r => new Set(r.cardIds));
    const commonCards = [...allCardSets[0]].filter(id => allCardSets.every(s => s.has(id)));
    const uniquePerDeck = results.map((r, i) => r.cardIds.filter(id => !allCardSets.some((s, j) => j !== i && s.has(id))));

    html += '<div class="finder-comparison-diff">';
    if (commonCards.length > 0) {
        html += '<div class="finder-diff-section"><strong>Common:</strong> ' +
            commonCards.map(id => { const c = cardMap.get(id); return c ? c.char_name : '?'; }).join(', ') + '</div>';
    }
    uniquePerDeck.forEach((unique, i) => {
        if (unique.length > 0) {
            html += `<div class="finder-diff-section"><strong>Only #${indices[i] + 1}:</strong> ` +
                unique.map(id => { const c = cardMap.get(id); return c ? c.char_name : '?'; }).join(', ') + '</div>';
        }
    });
    html += '</div>';

    container.innerHTML = html;
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== EXPORTS =====

window.DeckFinderRenderer = { openDeckFinder, closeDeckFinder, renderFinderResults, invalidateCardDataMap, resetDeckFinder };
Object.assign(window, { openDeckFinder, closeDeckFinder });
