// Deck Finder Renderer
// Modal UI, filter panel, results list, preview, and comparison for Best Deck Finder

// ===== MODAL LIFECYCLE =====

function openDeckFinder() {
    deckFinderState.filters = getDefaultFinderFilters();
    deckFinderState.results = [];
    deckFinderState.selectedResultIndex = -1;
    deckFinderState.compareIndices = [];
    deckFinderState.searching = false;
    deckFinderState.progress = 0;
    deckFinderState.searchStats = null;
    deckFinderState.traineeData = null;
    deckFinderState.sortLayers = [];
    _finderSkillTypeLayers = [];

    const existing = document.getElementById('deckFinderOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'deckFinderOverlay';
    overlay.className = 'picker-modal-overlay deck-finder-overlay';
    overlay.innerHTML = buildFinderModalHTML();
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('open'));
    initFinderEvents();
}

function closeDeckFinder() {
    if (deckFinderState.searching) cancelSearch();
    const overlay = document.getElementById('deckFinderOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    }
}

// ===== MODAL HTML =====

function buildFinderModalHTML() {
    return `
        <div class="deck-finder-shield"></div>
        <div class="picker-modal deck-finder-modal">
            <div class="picker-header">
                <h3>Find Best Deck</h3>
                <button class="picker-close" id="finderClose">&times;</button>
            </div>
            <div class="deck-finder-body">
                <div class="deck-finder-filters" id="finderFilters">
                    ${buildFinderFiltersHTML()}
                </div>
                <div class="deck-finder-results" id="finderResults">
                    <div class="finder-search-bar" id="finderSearchBar">
                        <button class="btn btn-primary finder-search-btn" id="finderSearchBtn">Search</button>
                        <button class="btn btn-danger finder-search-btn" id="finderCancelBtn" style="display:none;">Cancel</button>
                        <div class="finder-progress" id="finderProgress" style="display:none;">
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

function buildTraineeOptions() {
    if (typeof charactersData === 'undefined' || !charactersData) return '';

    const entries = Object.entries(charactersData);
    if (entries.length === 0) return '';

    // Check if a character has multiple versions (same character_id)
    const charIdCounts = {};
    entries.forEach(([, char]) => {
        charIdCounts[char.character_id] = (charIdCounts[char.character_id] || 0) + 1;
    });

    // Build display labels, disambiguating multi-version characters
    const options = entries.map(([id, char]) => {
        let label = char.name;
        if (charIdCounts[char.character_id] > 1 && char.growth_rates) {
            // Find top growth rate stat(s) for disambiguation
            const gr = char.growth_rates;
            const statLabels = { speed: 'Spd', stamina: 'Sta', power: 'Pow', guts: 'Gut', wisdom: 'Wis' };
            const sorted = Object.entries(gr).sort((a, b) => b[1] - a[1]);
            const top = sorted.filter(([, v]) => v === sorted[0][1]);
            const disambig = top.map(([k, v]) => `${statLabels[k] || k} ${v}%`).join(' / ');
            label += ` (${disambig})`;
        }
        return { id, label, name: char.name };
    });

    options.sort((a, b) => a.label.localeCompare(b.label));

    // Pre-select from deck builder's selected character
    const preselect = typeof deckBuilderState !== 'undefined' ? deckBuilderState.selectedCharacter : null;

    return options.map(o =>
        `<option value="${o.id}"${o.id === preselect ? ' selected' : ''}>${o.label}</option>`
    ).join('');
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

    // Build trainee options from charactersData
    const traineeOptions = buildTraineeOptions();

    return `
        <!-- ═══ CARD POOL FILTERS ═══ -->
        <div class="finder-group-header">Card Pool</div>

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
            <select class="finder-scenario-select" id="finderTrainee">
                <option value="">— No trainee selected —</option>
                ${traineeOptions}
            </select>
        </div>

        <!-- Card Pool -->
        <div class="finder-section">
            <div class="finder-label">Include Cards From</div>
            <div class="finder-toggle-row">
                <button class="finder-toggle-btn active" data-pool="owned">Owned Only</button>
                <button class="finder-toggle-btn" data-pool="all">All Cards</button>
            </div>
        </div>

        <!-- Rarity -->
        <div class="finder-section">
            <div class="finder-label">Card Rarity</div>
            <div class="quick-add-icon-grid finder-icon-grid">
                <button class="quick-add-icon-btn selected rainbow-border" data-rarity="3" id="finderSSR">
                    <img class="quick-add-rarity-icon" src="support_card_images/utx_txt_rarity_03.png" alt="SSR">
                </button>
                <button class="quick-add-icon-btn selected" data-rarity="2" id="finderSR">
                    <img class="quick-add-rarity-icon" src="support_card_images/utx_txt_rarity_02.png" alt="SR">
                </button>
                <button class="quick-add-icon-btn" data-rarity="1" id="finderR">
                    <img class="quick-add-rarity-icon" src="support_card_images/utx_txt_rarity_01.png" alt="R">
                </button>
            </div>
        </div>

        <!-- Types -->
        <div class="finder-section">
            <div class="finder-label">Card Types</div>
            <div class="quick-add-icon-grid finder-icon-grid">
                ${typeOptions.map(t => `
                    <button class="quick-add-icon-btn selected finder-type-btn" data-type="${t.key}">
                        <img class="quick-add-type-icon" src="support_card_images/utx_ico_obtain_0${typeIconIdx[t.key]}.png" alt="${t.label}"> ${t.label}
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
            <div class="finder-collapse-body" id="finderExcludeBody" style="display:none;">
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
                <div class="multi-select" id="finderExcludeCardSelect">
                    <div class="multi-select-trigger">
                        <span class="multi-select-text">Select cards...</span>
                        <span class="multi-select-arrow">&#9660;</span>
                    </div>
                    <div class="multi-select-dropdown" id="finderExcludeCardDropdown"></div>
                </div>
                <div class="finder-exclusion-list" id="finderExcludeCards"></div>
            </div>
        </div>

        <!-- ═══ DECK REQUIREMENTS ═══ -->
        <div class="finder-group-header">Deck Requirements</div>

        <!-- Result Count -->
        <div class="finder-section">
            <div class="finder-label">Top Results to Show</div>
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
            <div class="finder-collapse-body" id="finderSortBody" style="display:none;">
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
            </button>
            <div class="finder-collapse-body" id="finderRatioBody" style="display:none;">
                <div class="finder-ratio-grid">
                    ${typeOptions.map(t => `
                        <div class="finder-ratio-item" data-type="${t.key}">
                            <img class="finder-ratio-icon" src="support_card_images/utx_ico_obtain_0${typeIconIdx[t.key]}.png" alt="${t.label}">
                            <input type="number" class="finder-ratio-input" data-type="${t.key}" min="0" max="6" value="0">
                        </div>
                    `).join('')}
                </div>
                <div class="finder-ratio-sum" id="finderRatioSum">Sum: 0 / 6</div>
            </div>
        </div>

        <!-- Minimum Deck Effects (collapsible) -->
        <div class="finder-section finder-collapsible">
            <button class="finder-collapse-btn" data-target="finderThresholdBody">
                <span class="finder-collapse-icon">&#9654;</span> Minimum Deck Effects
                <span class="finder-hint">(combined across all 6 cards)</span>
            </button>
            <div class="finder-collapse-body" id="finderThresholdBody" style="display:none;">
                <div class="finder-threshold-grid">
                    <div class="finder-threshold-item">
                        <label>Race Bonus</label>
                        <div class="finder-input-suffix"><input type="number" id="finderMinRace" min="0" value="0"><span>%</span></div>
                    </div>
                    <div class="finder-threshold-item">
                        <label>Train Eff</label>
                        <div class="finder-input-suffix"><input type="number" id="finderMinTrain" min="0" value="0"><span>%</span></div>
                    </div>
                    <div class="finder-threshold-item">
                        <label>Friendship</label>
                        <div class="finder-input-suffix"><input type="number" id="finderMinFriend" min="0" value="0"><span>%</span></div>
                    </div>
                    <div class="finder-threshold-item">
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
            <div class="finder-collapse-body" id="finderSkillBody" style="display:none;">
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
                    <label class="finder-pill finder-pill-sm active"><input type="radio" name="finderReqSkillMode" value="all" checked hidden> ALL</label>
                    <label class="finder-pill finder-pill-sm"><input type="radio" name="finderReqSkillMode" value="any" hidden> ANY</label>
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
            });
        });
    });

    // Rarity icon-button toggles
    overlay.querySelectorAll('.finder-icon-grid .quick-add-icon-btn[data-rarity]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
        });
    });

    // Type icon-button toggles
    overlay.querySelectorAll('.finder-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isSelected = btn.classList.toggle('selected');
            const type = btn.dataset.type;
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
                const isOpen = target.style.display !== 'none';
                target.style.display = isOpen ? 'none' : '';
                btn.querySelector('.finder-collapse-icon').textContent = isOpen ? '\u25B6' : '\u25BC';
            }
        });
    });

    // Ratio sum update
    overlay.querySelectorAll('.finder-ratio-input').forEach(input => {
        input.addEventListener('input', updateRatioSum);
    });

    // Required skills search
    initRequiredSkillsSearch(overlay);

    // Exclusion dropdowns
    populateExcludeDropdowns();

    const excludeCharDropdown = overlay.querySelector('#finderExcludeCharDropdown');
    if (excludeCharDropdown) {
        excludeCharDropdown.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                renderExclusionChipsFromDropdown('finderExcludeChars', '#finderExcludeCharDropdown', '.finder-exclude-char-check');
                updateFinderMultiSelectText('finderExcludeCharSelect', 'Select characters...');
            }
        });
    }

    const excludeCardDropdown = overlay.querySelector('#finderExcludeCardDropdown');
    if (excludeCardDropdown) {
        excludeCardDropdown.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                renderExclusionChipsFromDropdown('finderExcludeCards', '#finderExcludeCardDropdown', '.finder-exclude-card-check');
                updateFinderMultiSelectText('finderExcludeCardSelect', 'Select cards...');
            }
        });
    }

    // Sort layer management
    overlay.querySelector('#finderAddSortBtn')?.addEventListener('click', addFinderSortLayer);
    wireFinderSortEvents();

    // Skill type layer management
    overlay.querySelector('#finderAddSkillTypeBtn')?.addEventListener('click', addFinderSkillTypeLayer);
    wireFinderSkillTypeEvents();

    // Search
    overlay.querySelector('#finderSearchBtn').addEventListener('click', startFinderSearch);
    overlay.querySelector('#finderCancelBtn').addEventListener('click', () => cancelSearch());
}

// ===== SORT LAYER UI =====

function addFinderSortLayer() {
    const layers = deckFinderState.sortLayers;
    // Default: first unused non-hasOptions category, or 'score'
    const usedKeys = new Set(layers.map(l => l.key));
    const available = Object.keys(FINDER_SORT_CATEGORIES).find(k => !usedKeys.has(k)) || 'score';
    const cat = FINDER_SORT_CATEGORIES[available];
    layers.push({ key: available, option: null, direction: cat?.defaultDirection || 'desc' });
    renderFinderSortLayers();
    wireFinderSortEvents();
}

function removeFinderSortLayer(index) {
    deckFinderState.sortLayers.splice(index, 1);
    renderFinderSortLayers();
    wireFinderSortEvents();
}

function moveFinderSortLayer(fromIndex, toIndex) {
    const layers = deckFinderState.sortLayers;
    if (toIndex < 0 || toIndex >= layers.length) return;
    const [item] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, item);
    renderFinderSortLayers();
    wireFinderSortEvents();
}

function updateFinderSortLayer(index, updates) {
    const layer = deckFinderState.sortLayers[index];
    if (!layer) return;
    Object.assign(layer, updates);
    renderFinderSortLayers();
    wireFinderSortEvents();
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

// ===== SKILL TYPE LAYER UI =====

let _finderSkillTypeLayers = []; // [{ type: 'type_id', min: 1 }, ...]

function addFinderSkillTypeLayer() {
    // Pick first unused type
    const usedTypes = new Set(_finderSkillTypeLayers.map(l => l.type));
    const allTypes = (typeof skillTypesData === 'object')
        ? Object.entries(skillTypesData).filter(([id, str]) => id && str).sort((a, b) => a[1].localeCompare(b[1]))
        : [];
    const available = allTypes.find(([id]) => !usedTypes.has(id));
    if (!available) { showToast('All skill types already added.', 'warning'); return; }
    _finderSkillTypeLayers.push({ type: available[0], min: 1 });
    renderFinderSkillTypeLayers();
    wireFinderSkillTypeEvents();
}

function removeFinderSkillTypeLayer(index) {
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
    _selectedRequiredSkills = [];
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
    const checked = ms.querySelectorAll('input[type="checkbox"]:checked');
    const textEl = ms.querySelector('.multi-select-text');
    if (!textEl) return;
    if (checked.length === 0) {
        textEl.textContent = defaultText;
    } else if (checked.length === 1) {
        const label = checked[0].closest('label');
        textEl.textContent = label ? label.textContent.trim() : '1 selected';
    } else {
        textEl.textContent = `${checked.length} selected`;
    }
}

// ===== EXCLUSION DROPDOWNS =====

function populateExcludeDropdowns() {
    const charDropdown = document.getElementById('finderExcludeCharDropdown');
    const cardDropdown = document.getElementById('finderExcludeCardDropdown');
    if (!charDropdown || !cardDropdown) return;

    // Character dropdown — unique char_name values, sorted
    const charNames = [...new Set(cardData.map(c => c.char_name).filter(Boolean))].sort();
    charDropdown.innerHTML = charNames.map(name =>
        `<label><input type="checkbox" class="finder-exclude-char-check" value="${name}"> ${name}</label>`
    ).join('');

    // Card dropdown — all cards with "Name (Type, Rarity)" label
    const rarityLabels = { 3: 'SSR', 2: 'SR', 1: 'R' };
    const sortedCards = [...cardData]
        .filter(c => c.char_name)
        .sort((a, b) => a.char_name.localeCompare(b.char_name) || a.support_id - b.support_id);
    cardDropdown.innerHTML = sortedCards.map(c => {
        const typeLabel = getTypeDisplayName(c.type);
        const rLabel = rarityLabels[c.rarity] || '?';
        const displayName = `${c.char_name} (${typeLabel}, ${rLabel})`;
        return `<label><input type="checkbox" class="finder-exclude-card-check" value="${c.support_id}"> ${displayName}</label>`;
    }).join('');
}

function renderExclusionChipsFromDropdown(containerId, dropdownSelector, checkboxSelector) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const checked = document.querySelectorAll(`${dropdownSelector} ${checkboxSelector}:checked`);
    if (checked.length === 0) { container.innerHTML = ''; return; }

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
            // Update trigger text
            if (sel.includes('char')) {
                updateFinderMultiSelectText('finderExcludeCharSelect', 'Select characters...');
            } else {
                updateFinderMultiSelectText('finderExcludeCardSelect', 'Select cards...');
            }
        });
    });
}

// ===== RATIO SUM =====

function updateRatioSum() {
    let sum = 0;
    document.querySelectorAll('.finder-ratio-input').forEach(input => {
        if (!input.disabled) sum += parseInt(input.value) || 0;
    });
    const el = document.getElementById('finderRatioSum');
    if (el) {
        el.textContent = `Sum: ${sum} / 6`;
        el.className = 'finder-ratio-sum' + (sum > 6 ? ' finder-ratio-error' : '') + (sum > 0 && sum <= 6 ? ' finder-ratio-ok' : '');
    }
}

// ===== COLLECT FILTERS FROM UI =====

function collectFiltersFromUI() {
    const f = getDefaultFinderFilters();
    const overlay = document.getElementById('deckFinderOverlay');
    if (!overlay) return f;

    // Scenario
    f.scenario = overlay.querySelector('#finderScenario')?.value || '1';

    // Trainee
    f.selectedTrainee = overlay.querySelector('#finderTrainee')?.value || null;

    // Pool
    const poolBtn = overlay.querySelector('.finder-toggle-btn[data-pool].active');
    f.cardPool = poolBtn?.dataset?.pool || 'owned';

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

    // Exclusions (from multi-select dropdowns)
    f.excludeCharacters = [];
    overlay.querySelectorAll('.finder-exclude-char-check:checked').forEach(cb => {
        f.excludeCharacters.push(cb.value);
    });
    f.excludeCards = [];
    overlay.querySelectorAll('.finder-exclude-card-check:checked').forEach(cb => {
        f.excludeCards.push(cb.value);
    });

    // Result count
    const countBtn = overlay.querySelector('.finder-toggle-btn[data-count].active');
    f.resultCount = parseInt(countBtn?.dataset?.count) || 10;

    return f;
}

// ===== SEARCH TRIGGER =====

function startFinderSearch() {
    const filters = collectFiltersFromUI();
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
        // onProgress
        (progress, matchCount) => {
            const fill = document.getElementById('finderProgressFill');
            const text = document.getElementById('finderProgressText');
            const matches = document.getElementById('finderProgressMatches');
            if (fill) fill.style.width = progress + '%';
            if (text) text.textContent = progress + '%';
            if (matches && matchCount !== undefined) matches.textContent = `${matchCount} matches`;
        },
        // onComplete
        (results, message) => {
            if (searchBtn) searchBtn.style.display = '';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (progressEl) progressEl.style.display = 'none';
            deckFinderState.results = results;
            // Apply multi-layer sort if configured
            if (deckFinderState.sortLayers.length > 0) {
                const layers = deckFinderState.sortLayers;
                enrichResultsForSort(results);
                results.sort((a, b) => {
                    for (const layer of layers) {
                        const dir = layer.direction === 'asc' ? 1 : -1;
                        const va = getFinderSortValue(a, layer);
                        const vb = getFinderSortValue(b, layer);
                        if (va !== vb) return (va - vb) * dir;
                    }
                    return 0;
                });
            }
            renderFinderResults(results, message, false);
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
    const container = document.getElementById('finderResultsBody');
    if (!container) return;

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
        html += `<div class="finder-search-stats">`;
        if (stats.totalCombos) html += `<span>${stats.totalCombos.toLocaleString()} possible</span>`;
        html += `<span>${stats.evaluated?.toLocaleString() || '?'} evaluated</span>`;
        if (stats.pruned > 0) html += `<span>${stats.pruned.toLocaleString()} branches pruned</span>`;
        html += `<span>${stats.elapsed ? (stats.elapsed / 1000).toFixed(1) + 's' : '?'}</span>`;
        html += `</div>`;
    }

    html += `<div class="finder-results-header">
        <span class="finder-results-count">${results.length} deck${results.length !== 1 ? 's' : ''} found</span>
        <button class="btn btn-secondary btn-sm" id="finderCompareBtn" style="display:none;">Compare Selected</button>
    </div>`;

    html += '<div class="finder-results-list" id="finderResultsList">';
    results.forEach((result, idx) => {
        html += renderResultCard(result, idx);
    });
    html += '</div>';

    // Comparison area
    html += '<div class="finder-comparison" id="finderComparison"></div>';

    container.innerHTML = html;
    wireResultEvents(container);
}

function renderLiveResults(results, matchCount) {
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

    if (header) {
        header.textContent = `Top ${results.length} of ${matchCount} matches (searching...)`;
    }

    // Re-render the list
    list.innerHTML = results.map((result, idx) => renderResultCard(result, idx)).join('');
    wireResultEvents(container);
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
    const cardThumbs = result.cardIds.map(id => {
        const card = cardData.find(c => c.support_id === id);
        if (!card) return '';
        const iconFile = `support_card_images/utx_ico_obtain_0${typeIconIdx[card.type] || '0'}.png`;
        return `<div class="finder-thumb-wrap">
            <img src="support_card_images/${card.support_id}.png"
                 onerror="this.style.display='none'"
                 class="finder-result-thumb card-image rarity-${card.rarity}"
                 title="${card.char_name}" alt="${card.char_name}">
            <img class="finder-thumb-type-icon" src="${iconFile}" alt="${card.type}">
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
                <div class="finder-result-rank">#${idx + 1}</div>
                <div class="finder-result-thumbs">${cardThumbs}</div>
                <div class="finder-result-actions-top">
                    <label class="finder-cmp-label"><input type="checkbox" class="finder-compare-check" data-idx="${idx}"> Cmp</label>
                </div>
            </div>
            <div class="finder-result-metrics">
                ${metricItems.map(mi => `<div class="finder-metric ${mi.cls}"><span class="finder-metric-label">${mi.label}</span><span class="finder-metric-value">${mi.value}</span></div>`).join('')}
            </div>
            <div class="finder-result-bottom">
                <span class="finder-result-types">${typeStr}</span>
                <div class="finder-result-btns">
                    <button class="btn btn-secondary btn-sm finder-view-btn" data-idx="${idx}">View in Builder</button>
                    <button class="btn btn-primary btn-sm finder-save-btn" data-idx="${idx}">Save as Deck</button>
                </div>
            </div>
            <div class="finder-result-detail" id="finderDetail${idx}" style="display:none;"></div>
        </div>
    `;
}

function wireResultEvents(container) {
    // Click card to expand inline preview
    container.querySelectorAll('.finder-result-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.finder-result-btns') || e.target.closest('.finder-cmp-label') || e.target.closest('button') || e.target.closest('label')) return;
            const idx = parseInt(card.dataset.idx);
            toggleResultDetail(idx);
        });
    });

    // Compare checkboxes
    container.querySelectorAll('.finder-compare-check').forEach(check => {
        check.addEventListener('change', updateCompareSelection);
    });

    // View — creates a new saved deck
    container.querySelectorAll('.finder-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const result = deckFinderState.results[idx];
            if (result) {
                const name = saveDeckFromFinder(result.cardIds);
                closeDeckFinder();
                showToast(`Created deck "${name}" and loaded into builder.`, 'success');
            }
        });
    });

    // Save
    container.querySelectorAll('.finder-save-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const result = deckFinderState.results[idx];
            if (result) {
                const name = saveDeckFromFinder(result.cardIds);
                showToast(`Saved as "${name}"`, 'success');
            }
        });
    });
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
    html += '<div class="finder-detail-cards">';
    result.cardIds.forEach(id => {
        const card = cardData.find(c => c.support_id === id);
        const data = cache.get(id);
        if (!card) return;

        const isKey = analysis.keyCards.some(k => k.cardId === id);
        const rarityLabel = card.rarity === 3 ? 'SSR' : card.rarity === 2 ? 'SR' : 'R';
        const effectsTable = data ? buildCardEffectsTable(data.effects, data.uniqueEffectBonuses, data.uniqueEffectName) : '';

        html += `<div class="finder-detail-card ${isKey ? 'key-card' : ''}">
            <img src="support_card_images/${card.support_id}.png"
                 onerror="this.src='support_card_images/placeholder.png'"
                 class="finder-detail-img card-image rarity-${card.rarity}">
            <div class="finder-detail-card-info">
                <div class="finder-detail-card-name">
                    ${card.char_name || 'Unknown'}
                    ${isKey ? '<span class="finder-key-badge">Key</span>' : ''}
                </div>
                <div class="finder-detail-card-meta">
                    <span class="rarity rarity-${card.rarity}">${rarityLabel}</span>
                    <span class="type type-${card.type}">${getTypeDisplayName(card.type)}</span>
                    <span class="finder-detail-level">Lv.${data?.level || '?'}</span>
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

    // Hint skills table
    const hintSkillMap = new Map();
    result.cardIds.forEach(id => {
        const card = cardData.find(c => c.support_id === id);
        if (!card?.hints?.hint_skills) return;
        card.hints.hint_skills.forEach(skill => {
            if (!skill) return;
            const sid = typeof skill === 'object' ? skill.id : skill;
            const skillName = typeof skill === 'object' ? skill.name : null;
            const skillTypes = (typeof skill === 'object' && Array.isArray(skill.type)) ? skill.type : [];
            if (!sid) return;
            if (!hintSkillMap.has(sid)) {
                const typesStr = skillTypes
                    .map(t => skillTypesData[t] || t)
                    .join(', ');
                hintSkillMap.set(sid, {
                    name: skillName || `Skill ${sid}`,
                    types: typesStr,
                    sources: [card.char_name]
                });
            } else {
                hintSkillMap.get(sid).sources.push(card.char_name);
            }
        });
    });

    if (hintSkillMap.size > 0) {
        const skillList = [...hintSkillMap.values()].sort((a, b) => a.name.localeCompare(b.name));
        html += `<div class="finder-detail-section-title">Hint Skills (${skillList.length})</div>`;
        html += '<table class="finder-skills-table"><thead><tr><th>Skill</th><th>Types</th><th>Sources</th></tr></thead><tbody>';
        skillList.forEach(sk => {
            html += `<tr>
                <td class="finder-skill-name">${sk.name}</td>
                <td class="finder-skill-types">${sk.types}</td>
                <td class="finder-skill-sources">${sk.sources.join(', ')}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }

    detail.innerHTML = html;
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== COMPARISON =====

function updateCompareSelection() {
    const checks = document.querySelectorAll('.finder-compare-check:checked');
    deckFinderState.compareIndices = Array.from(checks).map(c => parseInt(c.dataset.idx));

    const compareBtn = document.getElementById('finderCompareBtn');
    if (compareBtn) {
        const count = deckFinderState.compareIndices.length;
        compareBtn.style.display = count >= 2 ? '' : 'none';
        compareBtn.textContent = `Compare ${count} Decks`;
        compareBtn.onclick = renderDeckComparison;
    }
}

function renderDeckComparison() {
    const container = document.getElementById('finderComparison');
    if (!container) return;

    const indices = deckFinderState.compareIndices;
    if (indices.length < 2) return;

    const results = indices.map(i => deckFinderState.results[i]);

    const metrics = [
        { key: 'raceBonus', label: 'Race Bonus %' },
        { key: 'trainingEff', label: 'Training Eff %' },
        { key: 'friendBonus', label: 'Friendship Bonus %' },
        { key: 'energyCost', label: 'Energy Reduction %' },
        { key: 'eventRecovery', label: 'Event Recovery %' },
        { key: 'statBonus', label: 'Stat Bonus Sum' },
        { key: 'hintSkillCount', label: 'Hint Skills' },
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
            commonCards.map(id => { const c = cardData.find(x => x.support_id === id); return c ? c.char_name : '?'; }).join(', ') + '</div>';
    }
    uniquePerDeck.forEach((unique, i) => {
        if (unique.length > 0) {
            html += `<div class="finder-diff-section"><strong>Only #${indices[i] + 1}:</strong> ` +
                unique.map(id => { const c = cardData.find(x => x.support_id === id); return c ? c.char_name : '?'; }).join(', ') + '</div>';
        }
    });
    html += '</div>';

    container.innerHTML = html;
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== EXPORTS =====

window.DeckFinderRenderer = { openDeckFinder, closeDeckFinder, renderFinderResults };
Object.assign(window, { openDeckFinder, closeDeckFinder });
