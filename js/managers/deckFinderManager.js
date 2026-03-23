// Deck Finder Manager
// Search algorithm, scoring, and filter validation for the Best Deck Finder

const _logDeckFinder = _debug.create('DeckFinder');

// ===== SCENARIO WEIGHTS =====

// Scoring weights per scenario.
// Values are on comparable scales AFTER normalization in scoreDeck:
//   raceBonus, trainingEff, friendBonus, energyCost, eventRecovery: typically 0-60% → used raw
//   statBonus: sum of 6 effects, can be 0-300 → divided by 5 to normalize to ~0-60 range
//   hintSkillCount: 0-20 → multiplied by 3 to normalize to ~0-60 range
//   totalEffectSum: 0-800 → used as weak tiebreaker only (weight ~1)
const SCENARIO_WEIGHTS = {
    '1': {
        name: 'URA',
        raceBreakpoint: 34,
        weights: {
            friendBonus: 110, specialtyPriority: 90, trainingEff: 85,
            raceBonus: 70, moodEffect: 60, energyCost: 55,
            initialFriendship: 50, statBonus: 35, initialStats: 30,
            failureProtection: 25, skillAptitude: 25, hintSkillCount: 20,
            hintFrequency: 18, hintLevels: 15, totalEffectSum: 1
        }
    },
    '2': {
        name: 'Aoharu',
        raceBreakpoint: 34,
        weights: {
            trainingEff: 100, friendBonus: 90, specialtyPriority: 90,
            raceBonus: 60, moodEffect: 55, energyCost: 60,
            initialFriendship: 50, statBonus: 45, initialStats: 30,
            failureProtection: 25, skillAptitude: 25, hintSkillCount: 20,
            hintFrequency: 18, hintLevels: 15, totalEffectSum: 1
        }
    },
    '4': {
        name: 'Trackblazer',
        raceBreakpoint: 50,
        weights: {
            raceBonus: 130, energyCost: 80, friendBonus: 75,
            specialtyPriority: 70, trainingEff: 65, eventRecovery: 65,
            moodEffect: 50, initialFriendship: 40, statBonus: 30,
            failureProtection: 30, initialStats: 25, skillAptitude: 20,
            hintSkillCount: 15, hintFrequency: 12, hintLevels: 10,
            totalEffectSum: 1
        }
    }
};

// Display labels for weight editor UI
const WEIGHT_LABELS = {
    friendBonus: 'Friendship Bonus', specialtyPriority: 'Specialty Priority',
    trainingEff: 'Training Efficiency', raceBonus: 'Race Bonus',
    moodEffect: 'Mood Effect', energyCost: 'Energy Cost Reduction',
    initialFriendship: 'Initial Friendship', statBonus: 'Stat Bonus',
    initialStats: 'Initial Stats', failureProtection: 'Failure Protection',
    skillAptitude: 'Skill Aptitude', hintSkillCount: 'Hint Skill Count',
    hintFrequency: 'Hint Frequency', hintLevels: 'Hint Levels',
    totalEffectSum: 'Total Effect Sum', eventRecovery: 'Event Recovery'
};

// Stat bonus effect IDs: speed(3), stamina(4), power(5), guts(6), wit(7), skill_pt(30)
const STAT_BONUS_EFFECT_IDS = [3, 4, 5, 6, 7, 30];

// ===== TRAINEE CONSTANTS =====

// Card type -> growth rate key mapping
const CARD_TYPE_GROWTH_KEY = {
    speed: 'speed', stamina: 'stamina', power: 'power',
    guts: 'guts', intelligence: 'wisdom'
    // friend: no mapping
};

// Aptitude grade -> score mapping for skill-aptitude weighting
const APTITUDE_GRADE_SCORE = { A: 1.0, B: 0.7, C: 0.4, D: 0.2, E: 0.1, F: 0.05, G: 0.0 };

// Skill type tag -> aptitude category/key mapping
const SKILL_TYPE_TO_APTITUDE = {
    short: { cat: 'distance', key: 'short' },
    mile: { cat: 'distance', key: 'mile' },
    medium: { cat: 'distance', key: 'medium' },
    long: { cat: 'distance', key: 'long' },
    front_runner: { cat: 'running_style', key: 'front_runner' },
    pace_chaser: { cat: 'running_style', key: 'stalker' },
    late_surger: { cat: 'running_style', key: 'stretch' },
    turf: { cat: 'ground', key: 'turf' },
    dirt: { cat: 'ground', key: 'dirt' }
};

// Build Focus off-focus penalty — skills not matching the focus get this multiplier
const BUILD_FOCUS_OFF_PENALTY = 0.15;

// Map buildFocus keys to SKILL_TYPE_TO_APTITUDE category names
const BUILD_FOCUS_CAT_MAP = {
    distance: 'distance',
    style: 'running_style',
    surface: 'ground'
};

// Auto-weight adjustment tiers for skillAptitude
const SKILL_APTITUDE_WEIGHT_TIERS = {
    none: null,       // No trainee → use scenario default
    trainee: 45,      // Trainee selected, no focus → mild boost
    focused: 75       // Trainee + build focus → significant boost
};

// Skill weight framework — placeholder for future per-skill tier weighting
const SKILL_WEIGHTS = {};  // skillId -> multiplier, default 1.0
function getSkillWeight(skillId) { return SKILL_WEIGHTS[skillId] || 1.0; }

// ===== MIN-HEAP =====

class MinHeap {
    constructor(maxSize, compareFn) {
        this.maxSize = maxSize;
        this.heap = [];
        this.keySet = new Set();
        // compareFn(a, b): positive if a is BETTER than b (higher priority to keep)
        this._compare = compareFn || ((a, b) => a.score - b.score);
    }

    insert(entry) {
        const key = entry._key;
        if (this.keySet.has(key)) return false;

        if (this.heap.length < this.maxSize) {
            this.heap.push(entry);
            this.keySet.add(key);
            this._bubbleUp(this.heap.length - 1);
            return true;
        }

        if (this._compare(entry, this.heap[0]) > 0) {
            this.keySet.delete(this.heap[0]._key);
            this.heap[0] = entry;
            this.keySet.add(key);
            this._sinkDown(0);
            return true;
        }
        return false;
    }

    minEntry() {
        return this.heap.length > 0 ? this.heap[0] : null;
    }

    size() {
        return this.heap.length;
    }

    isFull() {
        return this.heap.length >= this.maxSize;
    }

    toSortedArray() {
        const cmp = this._compare;
        return this.heap.slice().sort((a, b) => cmp(b, a));
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this._compare(this.heap[i], this.heap[parent]) < 0) {
                [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this.heap.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this._compare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
            if (right < n && this._compare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
            if (smallest === i) break;
            [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
            i = smallest;
        }
    }
}

// ===== STATE =====

let deckFinderState = {
    filters: getDefaultFinderFilters(),
    results: [],
    searching: false,
    cancelled: false,
    progress: 0,
    selectedResultIndex: -1,
    compareIndices: [],
    // Pre-computed card data for fast search
    cardEffectCache: new Map(),
    // Trainee data resolved from filters
    traineeData: null,
    // Worker references
    worker: null,
    workers: null,
    // Search stats
    searchStats: null,
    // Multi-layer sort state — array of { key, direction } objects (post-search display ordering only)
    sortLayers: [],
    // Custom scoring weights — null until initialized from scenario defaults
    customWeights: null,
    // Weight display order — array of weight keys; null until initialized
    weightOrder: null,
    // Search tuning parameters
    searchSettings: { workerCount: 'auto', warmStartCount: 1500, stabilityPercent: 30, searchPoolSize: 500 },
    // Track whether skillAptitude weight was manually edited (prevents auto-adjustment)
    _skillAptitudeManuallyEdited: false
};

// ===== DISPLAY CACHE PROXY =====

/**
 * Creates a lightweight proxy over owned and friend caches that avoids
 * copying all entries into a merged Map. Supports the same .get(key) API
 * used by the renderer and scoring helpers.
 *
 * Lookup rules:
 *   'friend_' + id  → friendCache entry first, then owned cache fallback
 *   plain id        → owned cache first, then friendCache (for friend-only cards)
 */
function createDisplayCacheProxy(ownedCache, friendCache) {
    return {
        get(key) {
            if (typeof key === 'string' && key.startsWith('friend_')) {
                const realId = parseInt(key.slice(7), 10);
                if (friendCache) {
                    const val = friendCache.get(realId);
                    if (val !== undefined) return val;
                }
                return ownedCache.get(realId);
            }
            const val = ownedCache.get(key);
            if (val !== undefined) return val;
            return friendCache ? friendCache.get(key) : undefined;
        }
    };
}

// ===== CUSTOM WEIGHT HELPERS =====

function getActiveWeights(scenarioId) {
    if (deckFinderState.customWeights) return deckFinderState.customWeights;
    const id = scenarioId || deckFinderState.filters?.scenario || '1';
    return SCENARIO_WEIGHTS[id]?.weights || SCENARIO_WEIGHTS['1'].weights;
}

function resetWeightsToDefaults(scenarioId) {
    const id = scenarioId || deckFinderState.filters?.scenario || '1';
    const defaults = SCENARIO_WEIGHTS[id]?.weights || SCENARIO_WEIGHTS['1'].weights;
    deckFinderState.customWeights = { ...defaults };
    // Reset order to scenario default (sorted by value descending)
    deckFinderState.weightOrder = Object.entries(defaults)
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => key);
}

// ===== RESULT SORT =====

// Effect ID -> scoring metric key mapping (for effect sub-options)
const EFFECT_ID_TO_METRIC = {
    15: 'raceBonus', 8: 'trainingEff', 1: 'friendBonus',
    28: 'energyCost', 25: 'eventRecovery'
};

const FINDER_SORT_CATEGORIES = {
    score: {
        label: 'Score',
        defaultDirection: 'desc'
    },
    effect: {
        label: 'Effect',
        defaultDirection: 'desc',
        hasOptions: true,
        getOptions: () => {
            if (typeof effectsData !== 'object') return [];
            return Object.values(effectsData)
                .filter(e => e && e.name)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(e => ({ value: String(e.id), label: e.name }));
        }
    },
    skillType: {
        label: 'Skill Type',
        defaultDirection: 'desc',
        hasOptions: true,
        getOptions: () => {
            if (typeof skillTypesData !== 'object') return [];
            return Object.entries(skillTypesData)
                .filter(([id, str]) => id && str)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, str]) => ({ value: id, label: str }));
        }
    },
    statBonus:          { label: 'Stat Bonus (total)',    defaultDirection: 'desc', metricKey: 'statBonus' },
    specialtyPriority:  { label: 'Specialty Priority',    defaultDirection: 'desc', metricKey: 'specialtyPriority' },
    moodEffect:         { label: 'Mood Effect',           defaultDirection: 'desc', metricKey: 'moodEffect' },
    initialFriendship:  { label: 'Initial Friendship',    defaultDirection: 'desc', metricKey: 'initialFriendship' },
    hintSkillCount:     { label: 'Hint Skills',           defaultDirection: 'desc', metricKey: 'hintSkillCount' },
    hintFrequency:      { label: 'Hint Frequency',        defaultDirection: 'desc', metricKey: 'hintFrequency' },
    hintLevels:         { label: 'Hint Levels',            defaultDirection: 'desc', metricKey: 'hintLevels' },
    failureProtection:  { label: 'Failure Protection',    defaultDirection: 'desc', metricKey: 'failureProtection' },
    initialStats:       { label: 'Initial Stats',         defaultDirection: 'desc', metricKey: 'initialStats' },
    skillAptitude:      { label: 'Skill Aptitude',        defaultDirection: 'desc', metricKey: 'skillAptitude' },
    uniqueEffects:      { label: 'Unique Effects',        defaultDirection: 'desc', metricKey: 'uniqueEffects' },
    totalEffectSum:     { label: 'Total Effect Sum',      defaultDirection: 'desc', metricKey: 'totalEffectSum' }
};

function getFinderSortValue(result, layer) {
    const key = typeof layer === 'string' ? layer : layer.key;
    const option = typeof layer === 'object' ? layer.option : null;

    if (key === 'score') return result.score;

    // Effect sub-option: look up by effect ID in aggregated effects
    if (key === 'effect' && option) {
        return result.aggregated?.[option] || 0;
    }

    // Skill type sub-option: count skills of that type across deck
    if (key === 'skillType' && option) {
        return result._skillTypeCounts?.[option] || 0;
    }

    const cat = FINDER_SORT_CATEGORIES[key];
    if (!cat) return 0;
    return result.metrics[cat.metricKey || key] || 0;
}

// Precompute per-skill-type unique skill counts on each result for sorting
function enrichResultsForSort(results) {
    const cache = deckFinderState.cardEffectCache;
    for (const result of results) {
        if (result._skillTypeCounts) continue;
        const uniqueSets = {};
        result.cardIds.forEach(id => {
            const data = cache.get(id);
            if (data && data.skillsByType) {
                for (const [t, skillSet] of Object.entries(data.skillsByType)) {
                    if (!uniqueSets[t]) uniqueSets[t] = new Set();
                    skillSet.forEach(sid => uniqueSets[t].add(sid));
                }
            }
        });
        const counts = {};
        for (const [t, s] of Object.entries(uniqueSets)) counts[t] = s.size;
        result._skillTypeCounts = counts;
    }
}

function sortFinderResults() {
    const layers = deckFinderState.sortLayers;
    const results = deckFinderState.results;
    if (!results || results.length === 0) return;

    _logDeckFinder.debug('Sorting results', { layers: layers.length, results: results.length });

    if (layers.length === 0) {
        results.sort((a, b) => (b.baseScore || b.score || 0) - (a.baseScore || a.score || 0));
    } else {
        enrichResultsForSort(results);
        results.sort((a, b) => {
            for (const layer of layers) {
                const dir = layer.direction === 'asc' ? 1 : -1;
                const va = getFinderSortValue(a, layer);
                const vb = getFinderSortValue(b, layer);
                if (va !== vb) return (va - vb) * dir;
            }
            return (b.baseScore || b.score || 0) - (a.baseScore || a.score || 0);
        });
    }

    renderFinderResults(results, null, false);
}

// Get label for a sort layer (used by renderer)
function getFinderSortLayerLabel(layer) {
    const cat = FINDER_SORT_CATEGORIES[layer.key];
    if (!cat) return layer.key;
    if (cat.hasOptions && layer.option) {
        const opts = cat.getOptions();
        const opt = opts.find(o => o.value === layer.option);
        return `${cat.label}: ${opt ? opt.label : layer.option}`;
    }
    return cat.label;
}

// ===== DEFAULT FILTERS =====

function getDefaultFinderFilters() {
    return {
        cardPool: 'owned',           // 'owned' or 'all'
        rarity: { ssr: true, sr: true, r: false },
        types: {
            speed: true, stamina: true, power: true,
            guts: true, intelligence: true, friend: true
        },
        typeRatio: {
            speed: 0, stamina: 0, power: 0,
            guts: 0, intelligence: 0, friend: 0
        },
        typeRatioAtLeast: {
            speed: false, stamina: false, power: false,
            guts: false, intelligence: false, friend: false
        },
        minRaceBonus: 0,
        minTrainingEff: 0,
        minFriendBonus: 0,
        minEnergyCost: 0,
        minEventRecovery: 0,
        requiredSkills: [],           // skill IDs
        requiredSkillsMode: 'all',    // 'all' or 'any'
        requiredSkillTypes: [],       // [{ type, min }] objects
        minHintSkills: 0,
        minUniqueEffects: 0,
        excludeCharacters: [],        // character names
        excludeCards: [],             // card support_ids
        includeCards: [],             // card support_ids to force into player slots
        includeCardsMode: 'all',      // 'all' = must contain all, 'any' = at least one
        includeFriendCards: [],       // support_ids restricting friend slot pool (empty = unrestricted)
        resultCount: 10,
        scenario: '1',               // scenario ID for scoring weights
        selectedTrainee: null,        // trainee version ID from charactersData
        buildFocus: null,             // { distance, style, surface } or null — skill aptitude focus
        maxPotential: false           // use max level at current LB for all cards
    };
}

// ===== FILTER VALIDATION =====

function validateFinderFilters(filters) {
    _logDeckFinder.debug('validateFinderFilters', {
        cardPool: filters.cardPool, scenario: filters.scenario, trainee: filters.selectedTrainee,
        types: Object.keys(filters.types).filter(t => filters.types[t]),
        rarity: filters.rarity,
        minRaceBonus: filters.minRaceBonus, minTrainingEff: filters.minTrainingEff,
        minFriendBonus: filters.minFriendBonus, minEnergyCost: filters.minEnergyCost,
        requiredSkills: filters.requiredSkills.length, requiredSkillTypes: filters.requiredSkillTypes.length,
        includeCards: (filters.includeCards || []).length, excludeCards: (filters.excludeCards || []).length,
        resultCount: filters.resultCount
    });
    const errors = [];

    // Check type ratio sums
    const checkedTypes = Object.keys(filters.types).filter(t => filters.types[t]);
    if (checkedTypes.length === 0) {
        errors.push('At least one card type must be selected.');
        return errors;
    }

    const ratioSum = Object.keys(filters.typeRatio).reduce((sum, t) => {
        return sum + (filters.types[t] ? (filters.typeRatio[t] || 0) : 0);
    }, 0);

    const hasAnyAtLeast = Object.keys(filters.typeRatioAtLeast).some(t =>
        filters.types[t] && filters.typeRatioAtLeast[t] && filters.typeRatio[t] > 0
    );

    // Skip ratio validation when "all" mode include cards override it
    const includeAllMode = (filters.includeCards || []).length > 0 && filters.includeCardsMode === 'all';

    if (ratioSum > 0 && !includeAllMode) {
        if (hasAnyAtLeast) {
            if (ratioSum > 6) {
                errors.push(`Type "at least" minimums sum to ${ratioSum} — must be ≤ 6.`);
            }
        } else {
            if (ratioSum !== 6) {
                errors.push(`Type ratio must sum to exactly 6 (currently ${ratioSum}).`);
            }
        }
    }

    // Validate include cards
    if ((filters.includeCards || []).length > 0 && filters.includeCardsMode === 'all' && filters.includeCards.length > 5) {
        // 6+ cards: we'll find best 5 from them — just need enough cards
        if (filters.includeCards.length < 5) {
            errors.push('Need at least 5 included cards to fill player slots.');
        }
    }

    return errors;
}

// ===== CARD POOL BUILDING =====

function buildCardPool(filters) {
    // Filter directly on cardData — filter() returns a new array, no spread-copy needed
    let pool = filters.cardPool === 'owned'
        ? cardData.filter(c => isCardOwned(c.support_id))
        : cardData;

    // Rarity filter
    const allowedRarities = [];
    if (filters.rarity.ssr) allowedRarities.push(3);
    if (filters.rarity.sr) allowedRarities.push(2);
    if (filters.rarity.r) allowedRarities.push(1);
    pool = pool.filter(c => allowedRarities.includes(c.rarity));

    // Type filter
    pool = pool.filter(c => filters.types[c.type]);

    // Release filter - only include released cards
    pool = pool.filter(c => c.start_date && c.start_date <= new Date().toISOString().split('T')[0]);

    // Exclusions
    if (filters.excludeCharacters.length > 0) {
        const excludeNamesLower = new Set(filters.excludeCharacters.map(n => n.toLowerCase()));
        pool = pool.filter(c => {
            const names = [c.char_name, c.char_name_jp, c.char_name_kr, c.char_name_zhtw]
                .filter(Boolean).map(n => n.toLowerCase());
            return !names.some(n => excludeNamesLower.has(n));
        });
    }

    if (filters.excludeCards.length > 0) {
        const excludeSet = new Set(filters.excludeCards);
        pool = pool.filter(c => !excludeSet.has(c.support_id));
    }

    // Trainee exclusion — can't use support cards of the same character being trained
    if (filters.selectedTrainee && typeof charactersData !== 'undefined' && charactersData[filters.selectedTrainee]) {
        const traineeCharId = charactersData[filters.selectedTrainee].character_id;
        if (traineeCharId) {
            pool = pool.filter(c => c.char_id !== traineeCharId);
        }
    }

    return pool;
}

function groupCardsByType(pool) {
    const groups = {};
    pool.forEach(card => {
        if (!groups[card.type]) groups[card.type] = [];
        groups[card.type].push(card);
    });
    return groups;
}

// ===== PRE-COMPUTATION =====

function precomputeCardEffects(pool, traineeData, forceMaxLevel, maxPotential, buildFocus) {
    const cache = new Map();
    const skillLookup = getSkillIdLookup();
    pool.forEach(card => {
        const cardId = card.support_id;
        const level = getCardFinderLevel(card, forceMaxLevel, maxPotential);
        const effects = {};

        if (card.effects) {
            card.effects.forEach(effectArray => {
                const effectId = effectArray[0];
                if (!effectId) return;
                const value = calculateEffectValue(effectArray, level);
                if (value > 0) effects[effectId] = value;
            });
        }

        // Pre-compute hint skill IDs, types, and per-type skill sets
        // hint_skills are skill objects {id, name, type, description} after cardManager processing
        const hintSkillIds = new Set();
        const hintSkillTypes = new Set();
        const skillsByType = {};  // type -> Set<skillId>
        let skillTypeMask = 0;
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                const skillId = typeof skill === 'object' ? skill.id : skill;
                if (!skillId) return;
                hintSkillIds.add(skillId);
                // Use type from skill object directly, or fall back to lookup
                const types = (typeof skill === 'object' && Array.isArray(skill.type))
                    ? skill.type
                    : (skillLookup?.[skillId]?.type || []);
                if (Array.isArray(types)) {
                    types.forEach(t => {
                        hintSkillTypes.add(t);
                        if (!skillsByType[t]) skillsByType[t] = new Set();
                        skillsByType[t].add(skillId);
                        const bitPos = getSkillTypeBitPosition(t);
                        if (bitPos >= 0) skillTypeMask |= (1 << bitPos);
                    });
                }
            });
        }

        // Include event skills in skill tracking (same format as hint_skills: numeric IDs)
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                const skillId = typeof skill === 'object' ? skill.id : skill;
                if (!skillId) return;
                hintSkillIds.add(skillId);
                const types = (typeof skill === 'object' && Array.isArray(skill.type))
                    ? skill.type
                    : (skillLookup?.[skillId]?.type || []);
                if (Array.isArray(types)) {
                    types.forEach(t => {
                        hintSkillTypes.add(t);
                        if (!skillsByType[t]) skillsByType[t] = new Set();
                        skillsByType[t].add(skillId);
                        const bitPos = getSkillTypeBitPosition(t);
                        if (bitPos >= 0) skillTypeMask |= (1 << bitPos);
                    });
                }
            });
        }

        // Unique effect — add its bonuses to the effects map when active
        const uniqueEffectActive = card.unique_effect ? level >= card.unique_effect.level : false;
        const uniqueEffectBonuses = {}; // effectId -> value from unique effect
        if (uniqueEffectActive && card.unique_effect.effects) {
            card.unique_effect.effects.forEach(ue => {
                const ueId = ue.type;
                const ueVal = ue.value;
                if (ueId && ueVal > 0) {
                    effects[ueId] = (effects[ueId] || 0) + ueVal;
                    uniqueEffectBonuses[ueId] = (uniqueEffectBonuses[ueId] || 0) + ueVal;
                }
            });
        }

        // Skill-aptitude score for trainee matching
        const skillAptitudeScore = computeCardSkillAptitudeScore(card, traineeData, skillLookup, buildFocus);

        // Pre-compute effect keys/values arrays to avoid Object.keys() in hot loops
        const effectKeyArr = Object.keys(effects);
        const effectValArr = effectKeyArr.map(k => effects[k]);

        cache.set(cardId, {
            effects,
            effectKeyArr,
            effectValArr,
            uniqueEffectBonuses,
            uniqueEffectName: card.unique_effect?.name || null,
            level,
            hintSkillIds,
            hintSkillTypes,
            skillsByType,
            skillTypeMask,
            uniqueEffectActive,
            skillAptitudeScore,
            type: card.type,
            charId: card.char_id,
            charName: card.char_name,
            rarity: card.rarity,
            support_id: card.support_id
        });
    });
    return cache;
}

// ===== SKILL ID LOOKUP =====
// skillsData is keyed by array index; build a map from skill.id -> skill object
let _skillIdLookup = null;
function getSkillIdLookup() {
    if (!_skillIdLookup && typeof skillsData === 'object') {
        _skillIdLookup = {};
        for (const s of Object.values(skillsData)) {
            if (s && s.id) _skillIdLookup[s.id] = s;
        }
    }
    return _skillIdLookup;
}

// ===== SKILL TYPE BITMASK =====

const _skillTypeBitMap = new Map();
let _nextSkillTypeBit = 0;

function getSkillTypeBitPosition(typeId) {
    if (!_skillTypeBitMap.has(typeId)) {
        if (_nextSkillTypeBit >= 30) return -1; // JS bitwise limit
        _skillTypeBitMap.set(typeId, _nextSkillTypeBit++);
    }
    return _skillTypeBitMap.get(typeId);
}

function buildRequiredSkillTypeMask(requiredTypes) {
    let mask = 0;
    for (const entry of requiredTypes) {
        const t = typeof entry === 'object' ? entry.type : entry;
        const bit = getSkillTypeBitPosition(t);
        if (bit >= 0) mask |= (1 << bit);
    }
    return mask;
}

function getCardFinderLevel(card, forceMax, maxPotential) {
    if (forceMax) return limitBreaks[card.rarity][4];
    if (isCardOwned(card.support_id)) {
        if (maxPotential) {
            // Max level at the card's current LB
            const lb = getOwnedCardLimitBreak(card.support_id);
            return limitBreaks[card.rarity][lb];
        }
        const level = getOwnedCardLevel(card.support_id);
        if (level !== null && level > 0) return level;
    }
    // Default to max LB for unowned or missing level
    return limitBreaks[card.rarity][4];
}

function buildFriendPool(filters) {
    let pool = cardData;

    // Rarity filter (same as main pool)
    const allowedRarities = [];
    if (filters.rarity.ssr) allowedRarities.push(3);
    if (filters.rarity.sr) allowedRarities.push(2);
    if (filters.rarity.r) allowedRarities.push(1);
    pool = pool.filter(c => allowedRarities.includes(c.rarity));

    // Type filter
    pool = pool.filter(c => filters.types[c.type]);

    // Release filter
    pool = pool.filter(c => c.start_date && c.start_date <= new Date().toISOString().split('T')[0]);

    // Card exclusions (same as main pool)
    if (filters.excludeCharacters.length > 0) {
        const excludeNamesLower = new Set(filters.excludeCharacters.map(n => n.toLowerCase()));
        pool = pool.filter(c => {
            const names = [c.char_name, c.char_name_jp, c.char_name_kr, c.char_name_zhtw]
                .filter(Boolean).map(n => n.toLowerCase());
            return !names.some(n => excludeNamesLower.has(n));
        });
    }
    if (filters.excludeCards.length > 0) {
        const excludeSet = new Set(filters.excludeCards);
        pool = pool.filter(c => !excludeSet.has(c.support_id));
    }

    // Trainee exclusion
    if (filters.selectedTrainee && typeof charactersData !== 'undefined' && charactersData[filters.selectedTrainee]) {
        const traineeCharId = charactersData[filters.selectedTrainee].character_id;
        if (traineeCharId) {
            pool = pool.filter(c => c.char_id !== traineeCharId);
        }
    }

    return pool;
}

// ===== SKILL-APTITUDE SCORING =====

function computeCardSkillAptitudeScore(card, traineeData, skillLookup, buildFocus) {
    if (!traineeData || !card.hints?.hint_skills) return 0;
    const aptitudes = traineeData.aptitudes;
    if (!aptitudes) return 0;

    let totalScore = 0;
    for (const skill of card.hints.hint_skills) {
        if (!skill) continue;
        const skillId = typeof skill === 'object' ? skill.id : skill;
        if (!skillId) continue;

        // Get types from skill object or lookup
        const types = (typeof skill === 'object' && Array.isArray(skill.type))
            ? skill.type
            : (skillLookup?.[skillId]?.type || []);
        if (!Array.isArray(types)) continue;

        let bestAptScore = 0;
        for (const typeTag of types) {
            const mapping = SKILL_TYPE_TO_APTITUDE[typeTag];
            if (!mapping) continue;
            const grade = aptitudes[mapping.cat]?.[mapping.key];
            if (grade) {
                let aptScore = APTITUDE_GRADE_SCORE[grade] || 0;

                // Apply build focus penalty for off-focus skills
                if (buildFocus && aptScore > 0) {
                    for (const [focusKey, focusCat] of Object.entries(BUILD_FOCUS_CAT_MAP)) {
                        const focusVal = buildFocus[focusKey];
                        if (focusVal && mapping.cat === focusCat && mapping.key !== focusVal) {
                            aptScore *= BUILD_FOCUS_OFF_PENALTY;
                            break;
                        }
                    }
                }

                if (aptScore > bestAptScore) bestAptScore = aptScore;
            }
        }
        totalScore += bestAptScore * getSkillWeight(skillId);
    }
    return totalScore;
}

// Resolve trainee data from filters
function resolveTraineeData(filters) {
    if (!filters.selectedTrainee || typeof charactersData === 'undefined' || !charactersData[filters.selectedTrainee]) {
        return null;
    }
    const char = charactersData[filters.selectedTrainee];
    return {
        characterId: char.character_id,
        growthRates: char.growth_rates,
        aptitudes: char.aptitudes
    };
}

// ===== PRECOMPUTATION TABLES =====

function buildMaxContributionTable(groups, cache) {
    const table = {};
    for (const [type, cards] of Object.entries(groups)) {
        const effectValues = {};
        for (const card of cards) {
            const data = cache.get(card.support_id);
            if (!data) continue;
            for (const [eid, val] of Object.entries(data.effects)) {
                if (!effectValues[eid]) effectValues[eid] = [];
                effectValues[eid].push(val);
            }
        }
        // Sort each effect's values descending
        for (const eid of Object.keys(effectValues)) {
            effectValues[eid].sort((a, b) => b - a);
        }
        table[type] = effectValues;
    }
    return table;
}

function getMaxEffectContribution(maxTable, type, effectId, count) {
    const vals = maxTable[type]?.[effectId];
    if (!vals) return 0;
    let sum = 0;
    for (let i = 0; i < Math.min(count, vals.length); i++) sum += vals[i];
    return sum;
}

function isDistributionFeasible(dist, filters, maxTable) {
    // Check each threshold filter against max possible contribution
    const checks = [
        { threshold: filters.minRaceBonus, effectId: 15 },
        { threshold: filters.minTrainingEff, effectId: 8 },
        { threshold: filters.minFriendBonus, effectId: 1 },
        { threshold: filters.minEnergyCost, effectId: 28 },
        { threshold: filters.minEventRecovery, effectId: 25 }
    ];

    for (const { threshold, effectId } of checks) {
        if (threshold <= 0) continue;
        let maxPossible = 0;
        for (const [type, count] of Object.entries(dist)) {
            if (count === 0) continue;
            maxPossible += getMaxEffectContribution(maxTable, type, effectId, count);
        }
        if (maxPossible < threshold) return false;
    }
    return true;
}

function isDistributionFeasibleWithFriend(ownedDist, friendType, filters, maxTable, friendMaxTable) {
    const checks = [
        { threshold: filters.minRaceBonus, effectId: 15 },
        { threshold: filters.minTrainingEff, effectId: 8 },
        { threshold: filters.minFriendBonus, effectId: 1 },
        { threshold: filters.minEnergyCost, effectId: 28 },
        { threshold: filters.minEventRecovery, effectId: 25 }
    ];

    for (const { threshold, effectId } of checks) {
        if (threshold <= 0) continue;
        let maxPossible = 0;
        // Owned contribution
        for (const [type, count] of Object.entries(ownedDist)) {
            if (count === 0) continue;
            maxPossible += getMaxEffectContribution(maxTable, type, effectId, count);
        }
        // Friend contribution (best single card of friendType)
        maxPossible += getMaxEffectContribution(friendMaxTable, friendType, effectId, 1);
        if (maxPossible < threshold) return false;
    }
    return true;
}

function presortCardGroups(groups, filters, cache, traineeData) {
    for (const type of Object.keys(groups)) {
        groups[type].sort((a, b) =>
            individualCardScore(b.support_id, filters, cache, traineeData) -
            individualCardScore(a.support_id, filters, cache, traineeData)
        );
    }
}

// ===== DECK EVALUATION =====

function aggregateFinderDeckEffects(cardIds, cache) {
    const aggregated = {};
    cardIds.forEach(id => {
        const data = cache.get(id);
        if (!data) return;
        for (const [effectId, value] of Object.entries(data.effects)) {
            aggregated[effectId] = (aggregated[effectId] || 0) + value;
        }
    });
    return aggregated;
}

function checkHardFilters(cardIds, filters, cache) {
    const agg = aggregateFinderDeckEffects(cardIds, cache);

    // Effect thresholds
    if (filters.minRaceBonus > 0 && (agg[15] || 0) < filters.minRaceBonus) return false;
    if (filters.minTrainingEff > 0 && (agg[8] || 0) < filters.minTrainingEff) return false;
    if (filters.minFriendBonus > 0 && (agg[1] || 0) < filters.minFriendBonus) return false;
    if (filters.minEnergyCost > 0 && (agg[28] || 0) < filters.minEnergyCost) return false;
    if (filters.minEventRecovery > 0 && (agg[25] || 0) < filters.minEventRecovery) return false;

    // Required skills
    if (filters.requiredSkills.length > 0) {
        const deckSkills = new Set();
        cardIds.forEach(id => {
            const data = cache.get(id);
            if (data) data.hintSkillIds.forEach(s => deckSkills.add(s));
        });
        if (filters.requiredSkillsMode === 'any') {
            if (!filters.requiredSkills.some(s => deckSkills.has(s))) return false;
        } else {
            for (const reqSkill of filters.requiredSkills) {
                if (!deckSkills.has(reqSkill)) return false;
            }
        }
    }

    // Required skill types (each entry: { type, min }) — count unique skills per type
    if (filters.requiredSkillTypes.length > 0) {
        const uniqueSkillsByType = {};
        cardIds.forEach(id => {
            const data = cache.get(id);
            if (data && data.skillsByType) {
                for (const [t, skillSet] of Object.entries(data.skillsByType)) {
                    if (!uniqueSkillsByType[t]) uniqueSkillsByType[t] = new Set();
                    skillSet.forEach(sid => uniqueSkillsByType[t].add(sid));
                }
            }
        });
        for (const req of filters.requiredSkillTypes) {
            const reqType = typeof req === 'object' ? req.type : req;
            const reqMin = typeof req === 'object' ? (req.min || 1) : 1;
            if ((uniqueSkillsByType[reqType]?.size || 0) < reqMin) return false;
        }
    }

    // Minimum hint skills
    if (filters.minHintSkills > 0) {
        const allSkills = new Set();
        cardIds.forEach(id => {
            const data = cache.get(id);
            if (data) data.hintSkillIds.forEach(s => allSkills.add(s));
        });
        if (allSkills.size < filters.minHintSkills) return false;
    }

    // Minimum unique effects
    if (filters.minUniqueEffects > 0) {
        let activeCount = 0;
        cardIds.forEach(id => {
            const data = cache.get(id);
            if (data && data.uniqueEffectActive) activeCount++;
        });
        if (activeCount < filters.minUniqueEffects) return false;
    }

    return true;
}

function scoreDeck(cardIds, filters, cache, traineeData, metricNorms) {
    const agg = aggregateFinderDeckEffects(cardIds, cache);

    // Compute stat bonus sum
    let statBonus = 0;
    for (const eid of STAT_BONUS_EFFECT_IDS) {
        statBonus += (agg[eid] || 0);
    }

    // Collect all metrics
    const metrics = {
        raceBonus: agg[15] || 0,
        trainingEff: agg[8] || 0,
        friendBonus: agg[1] || 0,
        energyCost: agg[28] || 0,
        eventRecovery: agg[25] || 0,
        statBonus
    };

    // Count unique hint skills
    const allSkills = new Set();
    const allTypes = new Set();
    cardIds.forEach(id => {
        const data = cache.get(id);
        if (data) {
            data.hintSkillIds.forEach(s => allSkills.add(s));
            data.hintSkillTypes.forEach(t => allTypes.add(t));
        }
    });
    metrics.hintSkillCount = allSkills.size;
    metrics.skillTypeCount = allTypes.size;

    // Total effect sum (tiebreaker)
    metrics.totalEffectSum = Object.values(agg).reduce((s, v) => s + v, 0);

    // Active unique effects
    let ueCount = 0;
    cardIds.forEach(id => {
        const data = cache.get(id);
        if (data && data.uniqueEffectActive) ueCount++;
    });
    metrics.uniqueEffects = ueCount;

    // Skill-aptitude aggregate
    let skillAptitude = 0;
    cardIds.forEach(id => {
        const data = cache.get(id);
        if (data) skillAptitude += (data.skillAptitudeScore || 0);
    });
    metrics.skillAptitude = skillAptitude;
    metrics.specialtyPriority = agg[19] || 0;
    metrics.moodEffect = agg[2] || 0;
    metrics.initialFriendship = agg[14] || 0;
    metrics.hintFrequency = agg[18] || 0;
    metrics.hintLevels = agg[17] || 0;
    metrics.failureProtection = agg[27] || 0;
    metrics.initialStats = (agg[9]||0) + (agg[10]||0) + (agg[11]||0) + (agg[12]||0) + (agg[13]||0);

    // Count cards per type for friendship multiplier boost
    const typeCounts = {};
    cardIds.forEach(id => {
        const data = cache.get(id);
        if (data) typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
    });

    // Base score: active weights (custom or scenario defaults)
    const scenarioId = filters.scenario || '1';
    const scenarioWeights = getActiveWeights(scenarioId);
    const scenario = SCENARIO_WEIGHTS[scenarioId] || SCENARIO_WEIGHTS['1'];
    const norms = metricNorms || METRIC_NORM_FALLBACK;

    // Normalize metrics to comparable ranges before applying weights
    const normalized = {};
    for (const key of Object.keys(scenarioWeights)) {
        const norm = norms[key] || 1;
        normalized[key] = (metrics[key] || 0) * norm;
    }
    normalized.raceBonus = scoreRaceBonus(metrics.raceBonus, scenario.raceBreakpoint || 34);

    let score = 0;
    for (const key of Object.keys(scenarioWeights)) {
        score += (normalized[key] || 0) * (scenarioWeights[key] || 0);
    }

    // Friendship bonus multiplier: when 3+ cards of the same type,
    // friendship is multiplicatively valuable — boost it
    const maxTypeCount = Math.max(...Object.values(typeCounts), 0);
    if (maxTypeCount >= 3 && metrics.friendBonus > 0) {
        const stackCount = Math.min(maxTypeCount - 2, 4);
        const diminishing = stackCount <= 1 ? 1 : 1 + (stackCount - 1) * 0.6;
        score += metrics.friendBonus * (norms.friendBonus || 1/3) * diminishing * 8;
    }

    // Type diversity multiplier
    score *= (0.85 + computeDiversityBonus(typeCounts) * 0.15);

    // Growth rate boost: cards matching trainee's strong growth stats score higher
    if (traineeData?.growthRates) {
        cardIds.forEach(id => {
            const data = cache.get(id);
            if (!data) return;
            const growthKey = CARD_TYPE_GROWTH_KEY[data.type];
            if (growthKey) {
                const rate = traineeData.growthRates[growthKey] || 0;
                if (rate > 0) {
                    // Boost stat bonuses for matching card type
                    const statEffectId = { speed: 3, stamina: 4, power: 5, guts: 6, wisdom: 7 }[growthKey];
                    const cardStatBonus = data.effects[statEffectId] || 0;
                    score += cardStatBonus * (rate / 100) * (scenarioWeights.statBonus || 40);
                }
            }
        });
    }

    return { score, metrics, aggregated: agg };
}

// ===== TYPE DISTRIBUTION ENUMERATION =====

function enumerateTypeDistributions(filters, totalSlots) {
    const total = totalSlots || 6;
    const types = Object.keys(filters.types).filter(t => filters.types[t]);
    const ratioSum = types.reduce((s, t) => s + (filters.typeRatio[t] || 0), 0);

    // If no ratio specified, enumerate all distributions summing to total
    if (ratioSum === 0) {
        return enumerateAllDistributions(types, total);
    }

    const hasAtLeast = types.some(t => filters.typeRatioAtLeast[t] && filters.typeRatio[t] > 0);

    if (!hasAtLeast) {
        // Exact ratio — only valid if it sums to total
        const dist = {};
        let sum = 0;
        types.forEach(t => { dist[t] = filters.typeRatio[t] || 0; sum += dist[t]; });
        if (sum !== total) return [];
        return [dist];
    }

    // "At least" mode: enumerate valid distributions
    const mins = {};
    const flexTypes = [];
    let fixedSum = 0;

    types.forEach(t => {
        const val = filters.typeRatio[t] || 0;
        if (filters.typeRatioAtLeast[t] && val > 0) {
            mins[t] = val;
            fixedSum += val;
            flexTypes.push(t);
        } else if (val > 0) {
            mins[t] = val;
            fixedSum += val;
        } else {
            mins[t] = 0;
            flexTypes.push(t);
        }
    });

    const remaining = total - fixedSum;
    if (remaining < 0) return [];

    return distributeRemaining(types, mins, flexTypes, remaining);
}

function enumerateAllDistributions(types, total) {
    const results = [];
    const n = types.length;

    function recurse(idx, remaining, current) {
        if (idx === n - 1) {
            current[types[idx]] = remaining;
            results.push({ ...current });
            return;
        }
        for (let i = 0; i <= remaining; i++) {
            current[types[idx]] = i;
            recurse(idx + 1, remaining - i, current);
        }
    }

    if (n === 0) return results;
    recurse(0, total, {});
    return results;
}

function distributeRemaining(types, mins, flexTypes, remaining) {
    const results = [];
    const n = flexTypes.length;

    function recurse(idx, rem, current) {
        if (idx === n - 1) {
            current[flexTypes[idx]] = (mins[flexTypes[idx]] || 0) + rem;
            // Build full dist
            const dist = {};
            types.forEach(t => {
                dist[t] = current[t] !== undefined ? current[t] : (mins[t] || 0);
            });
            results.push(dist);
            return;
        }
        const t = flexTypes[idx];
        for (let i = 0; i <= rem; i++) {
            current[t] = (mins[t] || 0) + i;
            recurse(idx + 1, rem - i, { ...current });
        }
    }

    if (n === 0) {
        const dist = {};
        types.forEach(t => { dist[t] = mins[t] || 0; });
        results.push(dist);
        return results;
    }

    recurse(0, remaining, {});
    return results;
}

// ===== COMBINATION GENERATION =====

function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    if (arr.length === k) return [arr.slice()];

    const result = [];
    function combine(start, combo) {
        if (combo.length === k) {
            result.push(combo.slice());
            return;
        }
        const remaining = k - combo.length;
        for (let i = start; i <= arr.length - remaining; i++) {
            combo.push(arr[i]);
            combine(i + 1, combo);
            combo.pop();
        }
    }
    combine(0, []);
    return result;
}

function estimateComboCount(groups, dist) {
    let total = 1;
    for (const [type, count] of Object.entries(dist)) {
        if (count === 0) continue;
        const poolSize = groups[type]?.length || 0;
        if (poolSize < count) return 0;
        total *= binomial(poolSize, count);
        if (total > 100000000) return total; // Early exit for huge numbers
    }
    return total;
}

function binomial(n, k) {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n - k) k = n - k;
    let result = 1;
    for (let i = 0; i < k; i++) {
        result = result * (n - i) / (i + 1);
    }
    return Math.round(result);
}

// ===== GREEDY WARM-START =====

function greedyWarmStart(groups, filters, cache, validDists, resultCount, traineeData, metricNorms, friendGroups, friendCache) {
    const startTime = performance.now();
    const TIME_BUDGET = 3000; // 3 seconds
    const seenKeys = new Set();
    const results = [];

    function compareResults(a, b) {
        return a.baseScore - b.baseScore;
    }

    // Lightweight proxy: check owned cache first, then friend cache
    // Avoids copying the entire cache into a new Map
    const evalCache = createDisplayCacheProxy(cache, friendCache);

    // Pre-score and sort each type's cards once (deterministic order)
    const scoredByType = {};
    for (const [type, cards] of Object.entries(groups)) {
        scoredByType[type] = cards.map(c => ({
            id: c.support_id,
            charId: cache.get(c.support_id)?.charId,
            score: individualCardScore(c.support_id, filters, cache, traineeData)
        })).sort((a, b) => b.score - a.score);
    }
    let scoredFriendByType = null;
    if (friendGroups && friendCache) {
        scoredFriendByType = {};
        for (const [type, cards] of Object.entries(friendGroups)) {
            scoredFriendByType[type] = cards.map(c => ({
                id: c.support_id,
                charId: friendCache.get(c.support_id)?.charId,
                score: individualCardScore(c.support_id, filters, friendCache, traineeData)
            })).sort((a, b) => b.score - a.score);
        }
    }

    // Deterministic diversity: for each type slot, cycle through the top-K
    // candidates at each position. startIdx encodes which offset to use per slot.
    // Slot i picks candidate at offset: floor(startIdx / K^i) % K
    // This systematically covers K^numSlots combinations without randomness.
    const DEPTH = 5; // explore top-5 candidates per slot position

    // Phase 1: Greedy construction across distributions
    // Visit each distribution multiple times with different offsets
    const distsToTry = Math.min(validDists.length, 50);
    const targetStarts = deckFinderState.searchSettings?.warmStartCount || 1500;
    const startsPerDist = Math.max(DEPTH * DEPTH, Math.ceil(targetStarts / distsToTry));
    const totalStarts = distsToTry * startsPerDist;

    for (let startIdx = 0; startIdx < totalStarts; startIdx++) {
        if (performance.now() - startTime > TIME_BUDGET) break;

        const distIdx = startIdx % distsToTry;
        const variationIdx = Math.floor(startIdx / distsToTry);
        const distEntry = validDists[distIdx];
        const { dist, friendType } = distEntry;
        const typeEntries = Object.entries(dist).filter(([, c]) => c > 0);

        // Greedy construction — deterministic offset per slot
        const deck = [];
        const usedIds = new Set();
        const usedCharIds = new Set();
        let slotNum = 0;

        for (const [type, count] of typeEntries) {
            const allCandidates = scoredByType[type] || [];

            for (let s = 0; s < count; s++) {
                // Deterministic offset: cycle through top-DEPTH at each slot
                const offset = Math.floor(variationIdx / Math.pow(DEPTH, slotNum)) % DEPTH;
                let picked = false;
                // Try from offset, then fall back through the list
                for (let attempt = 0; attempt < allCandidates.length; attempt++) {
                    const idx = (offset + attempt) % allCandidates.length;
                    const cand = allCandidates[idx];
                    if (usedIds.has(cand.id)) continue;
                    if (cand.charId && usedCharIds.has(cand.charId)) continue;
                    deck.push(cand.id);
                    usedIds.add(cand.id);
                    if (cand.charId) usedCharIds.add(cand.charId);
                    picked = true;
                    break;
                }
                if (!picked) break;
                slotNum++;
            }
        }

        // Friend card — also deterministic
        let friendCardId = null;
        if (friendType && scoredFriendByType) {
            const fCandidates = scoredFriendByType[friendType] || [];
            const fOffset = variationIdx % Math.max(1, Math.min(DEPTH, fCandidates.length));
            for (let attempt = 0; attempt < fCandidates.length; attempt++) {
                const idx = (fOffset + attempt) % fCandidates.length;
                const cand = fCandidates[idx];
                if (cand.charId && usedCharIds.has(cand.charId)) continue;
                deck.push(cand.id);
                friendCardId = cand.id;
                break;
            }
        }

        if (deck.length < 6) continue;

        // De-duplicate before local search
        const sortedIds = deck.slice().sort();
        const key = sortedIds.join(',');
        if (seenKeys.has(key)) continue;

        // Local search: try improving each player slot against ALL candidates of same type
        const playerSlots = friendCardId ? deck.length - 1 : deck.length;
        const _warmStartUsedChars = new Set(); // Reused across slots to avoid per-slot allocation
        for (let pass = 0; pass < 5; pass++) {
            if (performance.now() - startTime > TIME_BUDGET) break;
            let improved = false;

            for (let si = 0; si < playerSlots; si++) {
                const currentId = deck[si];
                const currentData = evalCache.get(currentId);
                if (!currentData) continue;

                // Try ALL candidates of same type (not just top-15)
                // Build used chars excluding current slot (reuses single Set per slot)
                const candidates = groups[currentData.type] || [];
                const currentUsedChars = _warmStartUsedChars;
                currentUsedChars.clear();
                for (let di = 0; di < deck.length; di++) {
                    if (di === si) continue;
                    const d = evalCache.get(deck[di]);
                    if (d && d.charId) currentUsedChars.add(d.charId);
                }

                let bestResult = null;
                if (checkHardFilters(deck, filters, evalCache)) {
                    const { score, metrics, aggregated } = scoreDeck(deck, filters, evalCache, traineeData, metricNorms);
                    bestResult = { score, baseScore: score };
                }
                let bestId = currentId;

                for (const cand of candidates) {
                    if (cand.support_id === currentId) continue;
                    if (deck.includes(cand.support_id)) continue;
                    const candData = evalCache.get(cand.support_id);
                    if (candData && candData.charId && currentUsedChars.has(candData.charId)) continue;

                    deck[si] = cand.support_id;
                    if (!checkHardFilters(deck, filters, evalCache)) { deck[si] = bestId; continue; }
                    const { score, metrics, aggregated } = scoreDeck(deck, filters, evalCache, traineeData, metricNorms);
                    const candidateResult = { score, baseScore: score };

                    if (!bestResult || compareResults(candidateResult, bestResult) > 0) {
                        bestResult = candidateResult;
                        bestId = cand.support_id;
                        improved = true;
                    }
                    deck[si] = bestId;
                }
                deck[si] = bestId;
            }
            if (!improved) break;
        }

        if (!checkHardFilters(deck, filters, evalCache)) continue;
        const { score, metrics, aggregated } = scoreDeck(deck, filters, evalCache, traineeData, metricNorms);
        const finalSortedIds = deck.slice().sort();
        const finalKey = finalSortedIds.join(',');
        if (seenKeys.has(finalKey)) continue;
        seenKeys.add(finalKey);

        results.push({
            cardIds: deck.slice(), score, baseScore: score,
            metrics, aggregated, friendCardId, _key: finalKey
        });
    }

    results.sort((a, b) => compareResults(b, a));
    _logDeckFinder.info('Warm-start complete', {
        totalStarts, uniqueDecks: results.length,
        elapsed: Math.round(performance.now() - startTime) + 'ms'
    });
    return results.slice(0, resultCount * 2);
}

// ===== SEARCH ALGORITHMS =====

async function runSearch(filters, onProgress, onComplete, onLiveResults) {
    _logDeckFinder.info('runSearch started', { cardPool: filters.cardPool, scenario: filters.scenario, resultCount: filters.resultCount });
    _logDeckFinder.time('runSearch');

    deckFinderState.searching = true;
    deckFinderState.cancelled = false;
    deckFinderState.progress = 0;
    deckFinderState.results = [];
    deckFinderState.searchStats = null;
    // Free previous search's display cache before allocating new one
    deckFinderState.cardEffectCache = null;

    // Yield to let the UI repaint (show spinner/progress bar) before heavy work
    await new Promise(r => setTimeout(r, 0));

    // Resolve trainee data once for the entire search
    const traineeData = resolveTraineeData(filters);
    deckFinderState.traineeData = traineeData;

    const isOwnedMode = filters.cardPool === 'owned';

    // === Include Cards Logic ===
    const includeCards = filters.includeCards || [];
    const includeMode = filters.includeCardsMode || 'all';
    const includeFriendCards = filters.includeFriendCards || [];
    const lockedPlayerCards = (includeMode === 'all') ? includeCards : [];
    const anyRequiredCards = (includeMode === 'any' && includeCards.length > 0) ? includeCards : [];

    // Remove include-card conflicts from exclude list
    const includeFriendSet = new Set(includeFriendCards);
    const effectiveExcludeCards = (filters.excludeCards || []).filter(id =>
        !includeCards.includes(id) && !includeFriendSet.has(id)
    );
    const effectiveFilters = { ...filters, excludeCards: effectiveExcludeCards };

    let pool = buildCardPool(effectiveFilters);

    // For "all" mode with 6+ locked cards: restrict pool to just those cards
    if (lockedPlayerCards.length >= 6) {
        const lockedSet = new Set(lockedPlayerCards);
        pool = cardData.filter(c => lockedSet.has(String(c.support_id)) || lockedSet.has(c.support_id));
    } else if (lockedPlayerCards.length > 0) {
        // Ensure locked cards are in the pool even if not normally included
        const poolIds = new Set(pool.map(c => String(c.support_id)));
        for (const id of lockedPlayerCards) {
            if (!poolIds.has(String(id))) {
                const card = cardData.find(c => String(c.support_id) === String(id));
                if (card) pool.push(card);
            }
        }
    }

    // For "any" mode: ensure at least the required cards are in the pool
    if (anyRequiredCards.length > 0) {
        const poolIds = new Set(pool.map(c => String(c.support_id)));
        for (const id of anyRequiredCards) {
            if (!poolIds.has(String(id))) {
                const card = cardData.find(c => String(c.support_id) === String(id));
                if (card) pool.push(card);
            }
        }
    }

    // Friend-included cards should also be eligible for player slots
    // (they only restrict the friend slot pool, not the player pool)
    if (includeFriendCards.length > 0) {
        const poolIds = new Set(pool.map(c => c.support_id));
        for (const id of includeFriendCards) {
            if (!poolIds.has(id)) {
                const card = cardData.find(c => c.support_id === id);
                if (card && (!isOwnedMode || isCardOwned(card.support_id))) {
                    pool.push(card);
                }
            }
        }
    }

    if (pool.length === 0) {
        _logDeckFinder.warn('Card pool is empty — no cards match filters');
        deckFinderState.searching = false;
        onComplete([], 'No cards match the current pool filters. Try expanding your card pool or relaxing type filters.');
        return;
    }

    if (pool.length < 6) {
        _logDeckFinder.warn('Card pool too small', { poolSize: pool.length });
        deckFinderState.searching = false;
        onComplete([], `Not enough cards to build a full deck (${pool.length} in pool, need at least 6). Try including more card types or switching to "All Cards".`);
        return;
    }

    _logDeckFinder.info('Card pool built', { poolSize: pool.length });
    if (pool.length > 500) {
        showToast(`Large card pool (${pool.length} cards) — search may use significant memory. Consider narrowing filters.`, 'warning');
    } else {
        showToast(`Card pool: ${pool.length} cards`, 'info');
    }

    // For owned mode: owned cards at actual levels + friend pool at max level
    // For all mode: all cards at max level for all 6 slots
    _logDeckFinder.time('precomputeCardEffects');
    const maxPotential = filters.maxPotential || false;
    const buildFocus = filters.buildFocus || null;
    let cache = precomputeCardEffects(pool, traineeData, !isOwnedMode, maxPotential, buildFocus);
    _logDeckFinder.timeEnd('precomputeCardEffects');
    let groups = groupCardsByType(pool);
    _logDeckFinder.debug('Groups by type', Object.fromEntries(Object.entries(groups).map(([t, c]) => [t, c.length])));

    let friendCache = null;
    let friendGroups = null;

    // Build friend pool — selected friend cards restrict pool to those cards
    if (includeFriendCards.length > 0) {
        const friendPool = cardData.filter(c => includeFriendSet.has(c.support_id));
        if (friendPool.length > 0) {
            friendCache = precomputeCardEffects(friendPool, traineeData, true, false, buildFocus);
            friendGroups = groupCardsByType(friendPool);
            if (friendPool.length > 1) presortCardGroups(friendGroups, filters, friendCache, traineeData);
        }
    } else if (isOwnedMode) {
        const friendPool = buildFriendPool(effectiveFilters);
        friendCache = precomputeCardEffects(friendPool, traineeData, true, false, buildFocus);
        friendGroups = groupCardsByType(friendPool);
        presortCardGroups(friendGroups, filters, friendCache, traineeData);
    }

    if (friendCache) {
        _logDeckFinder.info('Friend pool built', Object.fromEntries(Object.entries(friendGroups).map(([t, c]) => [t, c.length])));
    }

    // Compute dynamic normalization from actual card pool
    const metricNorms = computeMetricNorms(cache);
    if (friendCache) {
        const friendNorms = computeMetricNorms(friendCache);
        // Merge: use the lower norm (= higher P90 = more generous bound)
        for (const [k, v] of Object.entries(friendNorms)) {
            if (!metricNorms[k] || v < metricNorms[k]) metricNorms[k] = v;
        }
    }

    // Lightweight proxy that delegates to owned cache + friend cache on demand,
    // avoiding the memory cost of copying all entries into a merged Map.
    // Lookup rules:
    //   'friend_' + id → friendCache first, then owned cache
    //   plain id       → owned cache first, then friendCache (for friend-only cards)
    deckFinderState.cardEffectCache = createDisplayCacheProxy(cache, friendCache);

    // Phase 1d: Pre-sort card groups by individual score descending
    presortCardGroups(groups, filters, cache, traineeData);

    // Phase 1b: Build max contribution table for pruning
    const maxTable = buildMaxContributionTable(groups, cache);
    const friendMaxTable = friendGroups ? buildMaxContributionTable(friendGroups, friendCache) : null;

    // For "all" mode locked cards, compute locked type counts to constrain distributions
    const lockedTypeCounts = {};
    if (lockedPlayerCards.length > 0 && lockedPlayerCards.length < 6) {
        for (const id of lockedPlayerCards) {
            const data = cache.get(id);
            if (data) lockedTypeCounts[data.type] = (lockedTypeCounts[data.type] || 0) + 1;
        }
    }
    // Override type ratio constraints for "all" mode with locked cards
    const distFilters = (lockedPlayerCards.length > 0)
        ? { ...filters, typeRatio: { speed: 0, stamina: 0, power: 0, guts: 0, intelligence: 0, friend: 0 } }
        : filters;

    let distributions;
    if (lockedPlayerCards.length >= 5) {
        // All player slots are locked — single empty distribution
        // If 6+: use combinations of locked cards; handled by restricting pool above
        distributions = [{ speed: 0, stamina: 0, power: 0, guts: 0, intelligence: 0, friend: 0 }];
        // Set actual types from locked cards
        if (lockedPlayerCards.length === 5) {
            const dist = { speed: 0, stamina: 0, power: 0, guts: 0, intelligence: 0, friend: 0 };
            for (const id of lockedPlayerCards) {
                const data = cache.get(id);
                if (data) dist[data.type] = (dist[data.type] || 0) + 1;
            }
            distributions = [dist];
        }
    } else {
        distributions = enumerateTypeDistributions(distFilters);
    }

    if (distributions.length === 0) {
        deckFinderState.searching = false;
        onComplete([], 'No valid type distributions possible.');
        return;
    }

    // For "all" mode locked cards, filter distributions that are compatible with locked types
    if (lockedPlayerCards.length > 0 && lockedPlayerCards.length < 5) {
        const filtered = distributions.filter(dist => {
            for (const [type, count] of Object.entries(lockedTypeCounts)) {
                if ((dist[type] || 0) < count) return false;
            }
            return true;
        });
        if (filtered.length > 0) {
            distributions.length = 0;
            distributions.push(...filtered);
        }
    }

    // Phase 1c: Filter infeasible distributions
    // For owned mode, we generate "friend variants" — each distribution produces
    // multiple variants where one slot of a specific type is filled by a friend card
    const validDists = [];
    let totalCombos = 0;

    // Determine if friend slot is used (owned mode or restricted friend cards)
    const hasFriendRestriction = includeFriendCards.length > 0;
    const useFriendSlot = isOwnedMode || hasFriendRestriction;

    if (useFriendSlot && friendGroups) {
        for (const dist of distributions) {
            // For each type with count > 0, create a variant where the friend fills that type
            const friendTypes = hasFriendRestriction
                ? Object.keys(friendGroups) // restricted friend: only its type(s) available
                : Object.keys(dist).filter(t => dist[t] > 0);
            for (const friendType of friendTypes) {
                // Friend type must have at least 1 slot in the distribution to borrow from
                if ((dist[friendType] || 0) <= 0) continue;
                // Owned distribution: one fewer of friendType
                const ownedDist = { ...dist, [friendType]: dist[friendType] - 1 };
                // Check feasibility using combined max tables
                if (!isDistributionFeasibleWithFriend(ownedDist, friendType, filters, maxTable, friendMaxTable)) continue;
                const ownedCount = estimateComboCount(groups, ownedDist);
                const friendCount = friendGroups[friendType]?.length || 0;
                if (ownedCount === 0 || friendCount === 0) continue;
                const count = ownedCount * friendCount;
                totalCombos += count;
                validDists.push({ dist: ownedDist, friendType, count });
            }
        }
    } else {
        for (const dist of distributions) {
            if (!isDistributionFeasible(dist, filters, maxTable)) continue;
            const count = estimateComboCount(groups, dist);
            if (count > 0) {
                totalCombos += count;
                validDists.push({ dist, friendType: null, count });
            }
        }
    }

    _logDeckFinder.debug('Metric norms', metricNorms);

    if (validDists.length === 0) {
        _logDeckFinder.warn('No feasible distributions found');
        deckFinderState.searching = false;
        onComplete([], 'No feasible distributions found — try relaxing your thresholds.');
        return;
    }

    _logDeckFinder.info('Distributions', { valid: validDists.length, totalCombos });

    // === Option 1: Rank distributions by estimated score potential ===
    // Sum top-k individualCardScore values per type for each distribution
    // Reuse the already-computed cache (no need to re-precompute)
    const distCardScores = {};
    for (const [type, cards] of Object.entries(groups)) {
        distCardScores[type] = cards
            .map(c => individualCardScore(c.support_id, filters, cache, traineeData))
            .sort((a, b) => b - a);
    }
    for (const entry of validDists) {
        let potential = 0;
        for (const [type, count] of Object.entries(entry.dist)) {
            if (count === 0) continue;
            const scores = distCardScores[type] || [];
            for (let i = 0; i < Math.min(count, scores.length); i++) potential += scores[i];
        }
        // Add friend potential if present
        if (entry.friendType && friendGroups) {
            const friendScores = (friendGroups[entry.friendType] || [])
                .map(c => individualCardScore(c.support_id, filters, friendCache || cache, traineeData))
                .sort((a, b) => b - a);
            if (friendScores.length > 0) potential += friendScores[0];
        }
        entry.potential = potential;
    }
    validDists.sort((a, b) => b.potential - a.potential);

    let warningMessage = null;

    // Search pool size — larger internal pool for sort layers to reorder
    const searchPoolSize = deckFinderState.searchSettings?.searchPoolSize || 500;

    // Yield to let UI show progress before warm-start
    onProgress(-1, 0, 'Preparing search...');
    await new Promise(r => setTimeout(r, 0));

    // Run greedy warm-start
    let warmStartSeeds = [];
    if (validDists.length > 0) {
        onProgress(-1, 0, 'Warm-start...');
        _logDeckFinder.time('greedyWarmStart');
        warmStartSeeds = greedyWarmStart(groups, effectiveFilters, cache, validDists, searchPoolSize, traineeData, metricNorms, friendGroups, friendCache);
        _logDeckFinder.timeEnd('greedyWarmStart');
        _logDeckFinder.info('Warm-start seeds', { count: warmStartSeeds.length });
    }

    // Try to use Web Worker for search
    onProgress(0, warmStartSeeds.length > 0 ? warmStartSeeds.length : 0);
    if (typeof Worker !== 'undefined') {
        try {
            _logDeckFinder.info('Spawning worker search');
            await runWorkerSearch(filters, pool, cache, groups, maxTable, validDists, totalCombos, onProgress, onComplete, onLiveResults, warningMessage, friendCache, friendGroups, friendMaxTable, metricNorms, warmStartSeeds, searchPoolSize);
            _logDeckFinder.timeEnd('runSearch');
            return;
        } catch (workerErr) {
            // Fall back to main thread
            _logDeckFinder.warn('Worker search failed, falling back to main thread', workerErr.message);
        }
    }

    try {
        _logDeckFinder.info('Running main-thread fallback search');
        const startTime = performance.now();
        const results = await bruteForceSearch(groups, filters, cache, validDists, totalCombos, searchPoolSize, onProgress, onLiveResults, maxTable, traineeData, friendGroups, friendCache, metricNorms, warmStartSeeds);
        const elapsed = performance.now() - startTime;

        deckFinderState.results = results;
        deckFinderState.searching = false;
        if (deckFinderState.searchStats) {
            deckFinderState.searchStats.elapsed = Math.round(elapsed);
        }
        _logDeckFinder.info('Main-thread search complete', { results: results.length, elapsed: Math.round(elapsed) + 'ms' });
        _logDeckFinder.timeEnd('runSearch');
        // Apply post-search sort layers
        sortFinderResults();
        onComplete(results, warningMessage);
    } catch (err) {
        deckFinderState.searching = false;
        _logDeckFinder.timeEnd('runSearch');
        if (err.message === 'cancelled') {
            _logDeckFinder.info('Search cancelled');
            onComplete(deckFinderState.results.length > 0 ? deckFinderState.results : [], 'Search cancelled.');
        } else {
            _logDeckFinder.error('Search error', err.message);
            onComplete([], `Search error: ${err.message}`);
        }
    }
}

// ===== BRANCH AND BOUND SEARCH =====
//
// Card-by-card DFS with MUTABLE state and backtracking.
// Zero allocations in the hot loop — no array spreads, no object copies.
// Memory usage: O(deck_size=6) stack depth, O(1) per step.

async function bruteForceSearch(groups, filters, cache, validDists, totalCombos, resultCount, onProgress, onLiveResults, maxTable, traineeData, friendGroups, friendCache, metricNorms, initialSeeds) {
    const topN = new MinHeap(resultCount);

    // Seed heap with warm-start results
    if (initialSeeds && initialSeeds.length > 0) {
        for (const seed of initialSeeds) {
            if (!seed._key) seed._key = seed.cardIds.slice().sort().join(',');
            if (seed.baseScore === undefined) seed.baseScore = seed.score || 0;
            topN.insert(seed);
        }
    }

    let evaluated = 0;
    let pruned = 0;
    let matchesFound = 0;
    let lastLiveCount = 0;
    let lastLiveUITime = 0;
    const LIVE_BATCH = 100;
    let yieldCounter = 0;
    const YIELD_INTERVAL = 80000;
    const startTime = performance.now();

    // Derive include-card constraints from filters
    const lockedPlayerCards = (filters.includeCardsMode === 'all') ? (filters.includeCards || []) : [];
    const anyRequiredCards = (filters.includeCardsMode === 'any' && (filters.includeCards || []).length > 0) ? filters.includeCards : [];

    // Build threshold checks — pure hard constraints
    const thresholdChecks = [];
    if (filters.minRaceBonus > 0) thresholdChecks.push({ effectId: '15', threshold: filters.minRaceBonus });
    if (filters.minTrainingEff > 0) thresholdChecks.push({ effectId: '8', threshold: filters.minTrainingEff });
    if (filters.minFriendBonus > 0) thresholdChecks.push({ effectId: '1', threshold: filters.minFriendBonus });
    if (filters.minEnergyCost > 0) thresholdChecks.push({ effectId: '28', threshold: filters.minEnergyCost });
    if (filters.minEventRecovery > 0) thresholdChecks.push({ effectId: '25', threshold: filters.minEventRecovery });

    // Build required skill type mask
    const requiredSkillTypeMask = buildRequiredSkillTypeMask(filters.requiredSkillTypes);

    // Scoring weights: active weights (custom or scenario defaults)
    const scenarioId = filters.scenario || '1';
    const scenarioWeights = getActiveWeights(scenarioId);
    const scoringKeys = Object.keys(scenarioWeights);
    const combinedWeights = {};
    for (const key of scoringKeys) {
        combinedWeights[key] = scenarioWeights[key] || 0;
    }

    // Precompute per-card score contribution for O(1) running score tracking.
    // Must match the normalization in the leaf scoring:
    //   raceBonus(15): *1, trainingEff(8): *1, friendBonus(1): *1,
    //   energyCost(28): *1, eventRecovery(25): *1,
    //   statBonus(3,4,5,6,7,30): /5, totalEffectSum(all): /10
    const cardScoreContrib = new Map();

    // Use dynamically computed norms (fall back to defaults if not provided)
    const norms = metricNorms || METRIC_NORM_FALLBACK;

    // Build effectId -> normalized weight
    const effectWeightMap = {};
    let totalEffectSumWeight = 0;
    const skillAptWeight = (combinedWeights.skillAptitude || 0) * (norms.skillAptitude || 1);
    for (const [metricKey, weight] of Object.entries(combinedWeights)) {
        if (weight === 0) continue;
        const norm = norms[metricKey] || 1;
        const effectIds = METRIC_EFFECT_MAP[metricKey];
        if (effectIds === null) {
            // totalEffectSum — every effect contributes
            totalEffectSumWeight += weight * norm;
        } else if (effectIds !== undefined) {
            for (const eid of effectIds) {
                effectWeightMap[eid] = (effectWeightMap[eid] || 0) + weight * norm;
            }
        }
    }

    // Growth rate multiplier for cardScoreContrib
    const traineeGrowthRates = traineeData?.growthRates;

    function computeCardScore(data) {
        let cs = 0;
        for (const [eid, val] of Object.entries(data.effects)) {
            cs += val * (effectWeightMap[eid] || 0);
            cs += val * totalEffectSumWeight;
        }
        if (traineeGrowthRates) {
            const growthKey = CARD_TYPE_GROWTH_KEY[data.type];
            if (growthKey) {
                const rate = traineeGrowthRates[growthKey] || 0;
                if (rate > 0) {
                    const statEffectId = { speed: '3', stamina: '4', power: '5', guts: '6', wisdom: '7' }[growthKey];
                    const statVal = data.effects[statEffectId] || 0;
                    cs += statVal * (rate / 100) * (combinedWeights.statBonus || 35);
                }
            }
        }
        if (data.skillAptitudeScore > 0 && skillAptWeight > 0) {
            cs += data.skillAptitudeScore * skillAptWeight;
        }
        return cs;
    }

    cache.forEach((data, cardId) => {
        cardScoreContrib.set(cardId, computeCardScore(data));
    });

    // Friend card score contributions (at max level — may differ from owned)
    const friendCardScoreContrib = new Map();
    if (friendCache) {
        friendCache.forEach((data, cardId) => {
            friendCardScoreContrib.set(cardId, computeCardScore(data));
        });
    }

    // Pre-extract required skill types for running state tracking
    const reqSkillTypes = (filters.requiredSkillTypes || []).map(r => ({
        type: typeof r === 'object' ? r.type : r,
        min: typeof r === 'object' ? (r.min || 1) : 1
    }));
    const hasReqSkillTypes = reqSkillTypes.length > 0;

    // Mutable state shared across all recursions — never allocated in the hot loop
    const deckIds = [];                     // max length 6
    const partialEffects = {};              // mutable, add/subtract
    const usedCharIds = new Set();
    let skillMask = 0;
    let ueCount = 0;
    let partialScore = 0;                   // running score from card contributions
    let partialEffectSum = 0;               // running total of all effect values
    const deckTypeCounts = {};              // running type counts for diversity
    let maxTypeCount = 0;                   // max type count for friendship stacking

    // Running unique-skill-per-type tracking (ref-counted)
    const skillTypeRefCounts = {};
    const skillTypeUniqueCounts = {};
    if (hasReqSkillTypes) {
        for (const r of reqSkillTypes) {
            skillTypeRefCounts[r.type] = {};
            skillTypeUniqueCounts[r.type] = 0;
        }
    }

    // === Option 1: Early termination tracking ===
    let distsWithoutImprovement = 0;
    let prevMinScore = -Infinity;
    const stabilityPct = (deckFinderState.searchSettings?.stabilityPercent || 30) / 100;
    const STABILITY_THRESHOLD = Math.max(50, Math.ceil(validDists.length * stabilityPct));
    const PER_DIST_EVAL_CAP = 2000000;

    // Per-distribution flattened card list: cards are grouped by type,
    // and we build a flat "slot plan" that says for each of the 6 card slots,
    // which pool of cards to pick from and what index range.
    for (const { dist, friendType } of validDists) {
        if (deckFinderState.cancelled) throw new Error('cancelled');

        // Early termination: stop if results have stabilized
        if (topN.isFull() && distsWithoutImprovement >= STABILITY_THRESHOLD) break;

        // Get types in order: smallest pool first for tighter early pruning
        const typeEntries = Object.entries(dist)
            .filter(([, count]) => count > 0)
            .sort((a, b) => (groups[a[0]]?.length || 0) - (groups[b[0]]?.length || 0));

        if (typeEntries.some(([type, count]) => (groups[type]?.length || 0) < count)) continue;

        // Build a flat slot plan: [{pool: [...cardIds], type, isLastOfType, isFriend}]
        // Each slot picks one card. Slots for the same type must pick in ascending index order.
        // The friend slot (if any) is appended last so owned cards are picked first.
        const slots = [];
        const typeOrder = [];
        for (const [type, count] of typeEntries) {
            const pool = (groups[type] || []).map(c => c.support_id);
            typeOrder.push({ type, count });
            for (let s = 0; s < count; s++) {
                slots.push({
                    pool,
                    type,
                    isLastOfType: s === count - 1,
                    slotInType: s,
                    isFriend: false
                });
            }
        }

        // Append friend slot last (if owned mode)
        if (friendType && friendGroups) {
            const fPool = (friendGroups[friendType] || []).map(c => c.support_id);
            if (fPool.length === 0) continue;
            typeOrder.push({ type: friendType, count: 1 });
            slots.push({
                pool: fPool,
                type: friendType,
                isLastOfType: true,
                slotInType: 0,
                isFriend: true
            });
        }
        const totalSlots = slots.length; // should be 6

        // Build per-slot effect bounds: for slot i, what's the max remaining effect
        // from all cards in slots i+1..end. We need bounds per effect.
        // Since cards within a type are pre-sorted, the max remaining for a type
        // starting at slot rank j is sum of top-(count-j) values.
        const slotEffectBounds = buildSlotEffectBounds(slots, typeOrder, maxTable);
        const slotScoreBounds = buildSlotScoreBounds(slotEffectBounds, combinedWeights, norms);

        // Build required-skill reachability: for each required skill,
        // a bitmask of which slot indices have pools containing that skill.
        // Used to prune early when remaining slots can't provide missing skills.
        const reqSkills = filters.requiredSkills;
        const reqSkillSlotMasks = []; // reqSkillSlotMasks[i] = bitmask of slots that CAN provide reqSkills[i]
        const hasReqSkills = reqSkills.length > 0;
        if (hasReqSkills) {
            for (const skillId of reqSkills) {
                let mask = 0;
                for (let s = 0; s < totalSlots; s++) {
                    const pool = slots[s].pool;
                    for (const cardId of pool) {
                        const data = cache.get(cardId);
                        if (data && data.hintSkillIds.has(skillId)) {
                            mask |= (1 << s);
                            break; // at least one card in this slot's pool has the skill
                        }
                    }
                }
                reqSkillSlotMasks.push(mask);
            }
        }
        let foundSkillBits = 0; // bitmask: bit i set = reqSkills[i] already found in partial deck

        // Reset mutable state
        deckIds.length = 0;
        for (const k of Object.keys(partialEffects)) delete partialEffects[k];
        usedCharIds.clear();
        skillMask = 0;
        ueCount = 0;
        partialScore = 0;
        partialEffectSum = 0;
        for (const k of Object.keys(deckTypeCounts)) delete deckTypeCounts[k];
        maxTypeCount = 0;
        foundSkillBits = 0;
        // Reset running skill-type unique counts
        if (hasReqSkillTypes) {
            for (const r of reqSkillTypes) {
                const refs = skillTypeRefCounts[r.type];
                for (const k of Object.keys(refs)) delete refs[k];
                skillTypeUniqueCounts[r.type] = 0;
            }
        }

        // Card-by-card DFS — slot 0 picks from its pool starting at index 0.
        // slot 1 of the same type picks at a higher index than slot 0.
        // Slot 0 of a different type picks at index 0.
        const minIndices = new Array(totalSlots).fill(0);
        let distEvaluated = 0;

        await dfsSlot(0);

        // Track early termination stability (use base score as proxy)
        const worstEntry = topN.minEntry();
        const currentMinScore = worstEntry ? worstEntry.baseScore : -Infinity;
        if (topN.isFull() && currentMinScore > prevMinScore) {
            prevMinScore = currentMinScore;
            distsWithoutImprovement = 0;
        } else {
            distsWithoutImprovement++;
        }

        async function dfsSlot(slotIdx) {
            if (distEvaluated >= PER_DIST_EVAL_CAP) return;

            if (slotIdx === totalSlots) {
                // LEAF: complete deck
                evaluated++;
                distEvaluated++;
                yieldCounter++;

                // Include card checks (both deckIds and locked/required are strings)
                if (lockedPlayerCards.length > 0) {
                    for (const lid of lockedPlayerCards) {
                        if (!deckIds.includes(lid)) return;
                    }
                }
                if (anyRequiredCards.length > 0) {
                    let found = false;
                    for (const rid of anyRequiredCards) {
                        if (deckIds.includes(rid)) { found = true; break; }
                    }
                    if (!found) return;
                }

                // Helper: get correct cache entry for a deck card
                const friendSlotIdx = friendType ? totalSlots - 1 : -1;
                function getDeckCardData(idx) {
                    if (idx === friendSlotIdx && friendCache) return friendCache.get(deckIds[idx]);
                    return cache.get(deckIds[idx]);
                }

                // Check skill-based hard filters (can't prune these during traversal)
                if (filters.requiredSkills.length > 0) {
                    const deckSkills = new Set();
                    for (let i = 0; i < totalSlots; i++) {
                        const data = getDeckCardData(i);
                        if (data) data.hintSkillIds.forEach(s => deckSkills.add(s));
                    }
                    if (filters.requiredSkillsMode === 'any') {
                        if (!filters.requiredSkills.some(s => deckSkills.has(s))) return;
                    } else {
                        for (const rs of filters.requiredSkills) {
                            if (!deckSkills.has(rs)) return;
                        }
                    }
                }

                if (filters.minHintSkills > 0) {
                    const allSkills = new Set();
                    for (let i = 0; i < totalSlots; i++) {
                        const data = getDeckCardData(i);
                        if (data) data.hintSkillIds.forEach(s => allSkills.add(s));
                    }
                    if (allSkills.size < filters.minHintSkills) return;
                }

                if (filters.minUniqueEffects > 0 && ueCount < filters.minUniqueEffects) return;

                // Skill type unique count check (uses running state)
                if (hasReqSkillTypes) {
                    let stFail = false;
                    for (let rt = 0; rt < reqSkillTypes.length; rt++) {
                        if (skillTypeUniqueCounts[reqSkillTypes[rt].type] < reqSkillTypes[rt].min) { stFail = true; break; }
                    }
                    if (stFail) return;
                }

                // Score — use running counters where possible
                let statBonus = 0;
                for (const eid of STAT_BONUS_EFFECT_IDS) statBonus += (partialEffects[eid] || 0);

                // Still need skills/types (not easily maintained as running counters)
                const allSkills = new Set();
                const allTypes = new Set();
                for (let i = 0; i < totalSlots; i++) {
                    const data = getDeckCardData(i);
                    if (!data) continue;
                    data.hintSkillIds.forEach(s => allSkills.add(s));
                    data.hintSkillTypes.forEach(t => allTypes.add(t));
                }

                // Skill-aptitude sum
                let skillAptSum = 0;
                for (let i = 0; i < totalSlots; i++) {
                    const data = getDeckCardData(i);
                    if (data) skillAptSum += (data.skillAptitudeScore || 0);
                }

                const metrics = {
                    raceBonus: partialEffects[15] || 0,
                    trainingEff: partialEffects[8] || 0,
                    friendBonus: partialEffects[1] || 0,
                    energyCost: partialEffects[28] || 0,
                    eventRecovery: partialEffects[25] || 0,
                    statBonus,
                    hintSkillCount: allSkills.size,
                    skillTypeCount: allTypes.size,
                    totalEffectSum: partialEffectSum,
                    uniqueEffects: ueCount,
                    skillAptitude: skillAptSum,
                    specialtyPriority: partialEffects[19] || 0,
                    moodEffect: partialEffects[2] || 0,
                    initialFriendship: partialEffects[14] || 0,
                    hintFrequency: partialEffects[18] || 0,
                    hintLevels: partialEffects[17] || 0,
                    failureProtection: partialEffects[27] || 0,
                    initialStats: (partialEffects[9]||0) + (partialEffects[10]||0) + (partialEffects[11]||0) + (partialEffects[12]||0) + (partialEffects[13]||0)
                };

                // Base score — scenario weights only, no boosts
                const scenarioObj = SCENARIO_WEIGHTS[scenarioId] || SCENARIO_WEIGHTS['1'];
                const normVals = {};
                for (const key of scoringKeys) {
                    const nf = norms[key] || 1;
                    normVals[key] = (metrics[key] || 0) * nf;
                }
                normVals.raceBonus = scoreRaceBonus(metrics.raceBonus, scenarioObj.raceBreakpoint || 34);

                let baseScore = 0;
                for (const key of scoringKeys) {
                    baseScore += (normVals[key] || 0) * combinedWeights[key];
                }
                if (maxTypeCount >= 3 && metrics.friendBonus > 0) {
                    const stackCount = Math.min(maxTypeCount - 2, 4);
                    const diminishing = stackCount <= 1 ? 1 : 1 + (stackCount - 1) * 0.6;
                    baseScore += metrics.friendBonus * (norms.friendBonus || 1/3) * diminishing * 8;
                }

                baseScore *= (0.85 + computeDiversityBonus(deckTypeCounts) * 0.15);

                if (traineeGrowthRates) {
                    const statEffectIds = { speed: 3, stamina: 4, power: 5, guts: 6, wisdom: 7 };
                    for (let ci = 0; ci < totalSlots; ci++) {
                        const cdata = getDeckCardData(ci);
                        if (!cdata) continue;
                        const growthKey = CARD_TYPE_GROWTH_KEY[cdata.type];
                        if (growthKey) {
                            const rate = traineeGrowthRates[growthKey] || 0;
                            if (rate > 0) {
                                const cardStatBonus = cdata.effects[statEffectIds[growthKey]] || 0;
                                baseScore += cardStatBonus * (rate / 100) * (combinedWeights.statBonus || 40);
                            }
                        }
                    }
                }

                const aggCopy = {};
                for (const k of Object.keys(partialEffects)) aggCopy[k] = partialEffects[k];

                const friendCardId = friendType ? deckIds[totalSlots - 1] : null;
                const sortedIds = deckIds.slice().sort();
                topN.insert({ cardIds: deckIds.slice(), score: baseScore, baseScore, metrics, aggregated: aggCopy, friendCardId, _key: sortedIds.join(',') });
                matchesFound++;

                if (onLiveResults && matchesFound - lastLiveCount >= LIVE_BATCH) {
                    const now = performance.now();
                    if (now - lastLiveUITime >= 500) {
                        lastLiveCount = matchesFound;
                        lastLiveUITime = now;
                        deckFinderState.results = topN.toSortedArray();
                        onLiveResults(deckFinderState.results, matchesFound);
                    }
                }

                // Yield to UI periodically
                if (yieldCounter >= YIELD_INTERVAL) {
                    yieldCounter = 0;
                    deckFinderState.progress = Math.min(99, Math.round((evaluated + pruned) / totalCombos * 100));
                    onProgress(deckFinderState.progress, matchesFound);
                    await yieldToUI();
                    if (deckFinderState.cancelled) throw new Error('cancelled');
                }
                return;
            }

            const slot = slots[slotIdx];
            const slotPool = slot.pool;
            const slotCache = slot.isFriend ? friendCache : cache;
            const slotScoreMap = slot.isFriend ? friendCardScoreContrib : cardScoreContrib;
            const startFrom = slot.slotInType === 0 ? 0 : minIndices[slotIdx];
            const slotsRemaining = totalSlots - slotIdx;
            const eb = slotEffectBounds[slotIdx + 1]; // bounds for slots after this one

            for (let i = startFrom; i < slotPool.length; i++) {
                const cardId = slotPool[i];
                const data = slotCache ? slotCache.get(cardId) : cache.get(cardId);
                if (!data) continue;

                // Same-character exclusion
                if (data.charId && usedCharIds.has(data.charId)) continue;

                // ADD card effects to mutable state (use pre-computed arrays)
                const effectKeys = data.effectKeyArr || Object.keys(data.effects);
                const effectVals = data.effectValArr;
                let cardEffectSum = 0;
                for (let e = 0; e < effectKeys.length; e++) {
                    const eid = effectKeys[e];
                    const val = effectVals ? effectVals[e] : data.effects[eid];
                    partialEffects[eid] = (partialEffects[eid] || 0) + val;
                    cardEffectSum += val;
                }
                partialEffectSum += cardEffectSum;
                const prevSkillMask = skillMask;
                skillMask |= data.skillTypeMask;
                const prevUECount = ueCount;
                if (data.uniqueEffectActive) ueCount++;
                if (data.charId) usedCharIds.add(data.charId);
                const cardScore = slotScoreMap ? slotScoreMap.get(cardId) || 0 : cardScoreContrib.get(cardId) || 0;
                partialScore += cardScore;
                // Track type counts for diversity scoring
                const prevTypeCount = deckTypeCounts[data.type] || 0;
                deckTypeCounts[data.type] = prevTypeCount + 1;
                const prevMaxTypeCount = maxTypeCount;
                if (prevTypeCount + 1 > maxTypeCount) maxTypeCount = prevTypeCount + 1;
                deckIds.push(cardId);

                // Update running unique-skill-per-type counts
                if (hasReqSkillTypes && data.skillsByType) {
                    for (let rt = 0; rt < reqSkillTypes.length; rt++) {
                        const rType = reqSkillTypes[rt].type;
                        const skills = data.skillsByType[rType];
                        if (!skills) continue;
                        const refs = skillTypeRefCounts[rType];
                        skills.forEach(sid => {
                            refs[sid] = (refs[sid] || 0) + 1;
                            if (refs[sid] === 1) skillTypeUniqueCounts[rType]++;
                        });
                    }
                }

                // Track required skills found by this card
                let prevFoundSkillBits = foundSkillBits;
                if (hasReqSkills) {
                    for (let rs = 0; rs < reqSkills.length; rs++) {
                        if (!(foundSkillBits & (1 << rs)) && data.hintSkillIds.has(reqSkills[rs])) {
                            foundSkillBits |= (1 << rs);
                        }
                    }
                }

                // PRUNE 1: feasibility — can remaining slots satisfy thresholds?
                let dominated = false;
                for (let tc = 0; tc < thresholdChecks.length; tc++) {
                    const { effectId, threshold } = thresholdChecks[tc];
                    const current = partialEffects[effectId] || 0;
                    const maxAdd = eb ? (eb[effectId] || 0) : 0;
                    if (current + maxAdd < threshold) {
                        dominated = true;
                        break;
                    }
                }

                // PRUNE 2: base score optimality
                if (!dominated && topN.isFull()) {
                    const maxRemaining = slotScoreBounds[slotIdx + 1] || 0;
                    if (partialScore + maxRemaining < (topN.minEntry()?.baseScore ?? -Infinity)) {
                        dominated = true;
                    }
                }

                // PRUNE 3: required skills — can remaining slots provide missing skills?
                if (!dominated && hasReqSkills) {
                    const allFound = (1 << reqSkills.length) - 1;
                    if (foundSkillBits !== allFound && filters.requiredSkillsMode !== 'any') {
                        // For each missing skill, check if any remaining slot can provide it
                        for (let rs = 0; rs < reqSkills.length; rs++) {
                            if (foundSkillBits & (1 << rs)) continue; // already found
                            // Check if any slot after current can provide this skill
                            // Remaining slots are slotIdx+1..totalSlots-1
                            const remainingMask = reqSkillSlotMasks[rs] >> (slotIdx + 1);
                            if (remainingMask === 0) {
                                dominated = true;
                                break;
                            }
                        }
                    } else if (filters.requiredSkillsMode === 'any' && foundSkillBits !== 0) {
                        // ANY mode: already found at least one, no need to prune
                    } else if (filters.requiredSkillsMode === 'any' && foundSkillBits === 0) {
                        // ANY mode: check if ANY required skill is reachable from remaining slots
                        let anyReachable = false;
                        for (let rs = 0; rs < reqSkills.length; rs++) {
                            const remainingMask = reqSkillSlotMasks[rs] >> (slotIdx + 1);
                            if (remainingMask !== 0) { anyReachable = true; break; }
                        }
                        if (!anyReachable) dominated = true;
                    }
                }

                if (!dominated) {
                    // PRUNE 4: skill type mask at final slot
                    if (requiredSkillTypeMask && slotIdx === totalSlots - 1) {
                        if ((skillMask & requiredSkillTypeMask) !== requiredSkillTypeMask) {
                            dominated = true;
                        }
                    }
                }

                if (dominated) {
                    pruned++;
                    distEvaluated++;
                    yieldCounter++;
                    // Yield even on prune paths to keep UI responsive
                    if (yieldCounter >= YIELD_INTERVAL) {
                        yieldCounter = 0;
                        deckFinderState.progress = Math.min(99, Math.round((evaluated + pruned) / totalCombos * 100));
                        onProgress(deckFinderState.progress, matchesFound);
                        await yieldToUI();
                        if (deckFinderState.cancelled) throw new Error('cancelled');
                    }
                } else {
                    // Set min index for next slot of same type
                    if (slotIdx + 1 < totalSlots && slots[slotIdx + 1].type === slot.type) {
                        minIndices[slotIdx + 1] = i + 1;
                    }
                    await dfsSlot(slotIdx + 1);
                }

                // BACKTRACK: remove card effects from mutable state
                deckIds.pop();
                partialScore -= cardScore;
                partialEffectSum -= cardEffectSum;
                deckTypeCounts[data.type] = prevTypeCount;
                maxTypeCount = prevMaxTypeCount;
                foundSkillBits = prevFoundSkillBits;
                if (data.charId) usedCharIds.delete(data.charId);
                ueCount = prevUECount;
                skillMask = prevSkillMask;
                // Undo unique-skill-per-type counts
                if (hasReqSkillTypes && data.skillsByType) {
                    for (let rt = 0; rt < reqSkillTypes.length; rt++) {
                        const rType = reqSkillTypes[rt].type;
                        const skills = data.skillsByType[rType];
                        if (!skills) continue;
                        const refs = skillTypeRefCounts[rType];
                        skills.forEach(sid => {
                            refs[sid]--;
                            if (refs[sid] === 0) {
                                skillTypeUniqueCounts[rType]--;
                                delete refs[sid];
                            }
                        });
                    }
                }
                for (let e = 0; e < effectKeys.length; e++) {
                    const eid = effectKeys[e];
                    const val = effectVals ? effectVals[e] : data.effects[eid];
                    partialEffects[eid] -= val;
                    if (partialEffects[eid] === 0) delete partialEffects[eid];
                }
            }
        }
    }

    deckFinderState.progress = 100;
    onProgress(100, matchesFound);

    deckFinderState.searchStats = {
        totalCombos,
        evaluated,
        pruned,
        matchesFound,
        elapsed: Math.round(performance.now() - startTime)
    };

    return topN.toSortedArray();
}

function buildSlotEffectBounds(slots, typeOrder, maxTable) {
    // For each slot index, compute the max possible effect contribution
    // from ALL slots at index > slotIdx.
    // We build this backwards: bounds[totalSlots] = {}, bounds[i] = bounds[i+1] + slot[i]'s max
    const n = slots.length;
    const bounds = new Array(n + 1);
    bounds[n] = {};

    for (let i = n - 1; i >= 0; i--) {
        const slot = slots[i];
        const typeEffects = maxTable[slot.type] || {};
        bounds[i] = { ...bounds[i + 1] };
        for (const [eid, vals] of Object.entries(typeEffects)) {
            const maxVal = (vals[slot.slotInType] || 0);
            bounds[i][eid] = (bounds[i][eid] || 0) + maxVal;
        }
    }

    return bounds;
}

// Map scoring metric keys to effect IDs for fast score-bound computation
const METRIC_EFFECT_MAP = {
    raceBonus: ['15'],
    trainingEff: ['8'],
    friendBonus: ['1'],
    energyCost: ['28'],
    eventRecovery: ['25'],
    statBonus: ['3', '4', '5', '6', '7', '30'],
    specialtyPriority: ['19'],
    moodEffect: ['2'],
    initialFriendship: ['14'],
    hintFrequency: ['18'],
    hintLevels: ['17'],
    failureProtection: ['27'],
    initialStats: ['9', '10', '11', '12', '13'],
    skillAptitude: undefined,
    totalEffectSum: null
};

// Fallback normalization factors — used only by individualCardScore (presort)
// before dynamic norms are computed. Overridden by computeMetricNorms() for actual scoring.
const METRIC_NORM_FALLBACK = {
    raceBonus: 1, trainingEff: 1,
    friendBonus: 1/3, energyCost: 1/3, failureProtection: 1/3,
    eventRecovery: 1/6, moodEffect: 1/6, hintFrequency: 1/6,
    specialtyPriority: 1/8,
    statBonus: 10, hintSkillCount: 3, skillTypeCount: 3,
    hintLevels: 5, initialFriendship: 1/3, initialStats: 1/15,
    totalEffectSum: 1 / 10, uniqueEffects: 5, skillAptitude: 5
};

// Reverse lookup: effect ID -> metric key (built from METRIC_EFFECT_MAP)
const METRIC_EFFECT_MAP_REVERSE = {};
for (const [metric, eids] of Object.entries(METRIC_EFFECT_MAP)) {
    if (!Array.isArray(eids)) continue;
    for (const eid of eids) METRIC_EFFECT_MAP_REVERSE[eid] = metric;
}

// Compute dynamic normalization from the actual card pool.
// Uses P90 per-card value × 6 as reference so outliers don't skew everything.
// Target: metric_value * norm ≈ 50 for a competitive 6-card deck.
function computeMetricNorms(cache) {
    const metricValues = {};

    cache.forEach((data) => {
        const cardMetrics = {};
        for (const [eid, val] of Object.entries(data.effects)) {
            const metric = METRIC_EFFECT_MAP_REVERSE[eid];
            if (metric) cardMetrics[metric] = (cardMetrics[metric] || 0) + val;
        }
        for (const [m, v] of Object.entries(cardMetrics)) {
            if (!metricValues[m]) metricValues[m] = [];
            metricValues[m].push(v);
        }
    });

    const norms = {};
    const TARGET = 50;
    const DECK_SIZE = 6;

    for (const [metric, values] of Object.entries(metricValues)) {
        values.sort((a, b) => a - b);
        const p90idx = Math.floor(values.length * 0.9);
        const p90 = values[p90idx] || values[values.length - 1] || 1;
        norms[metric] = TARGET / (p90 * DECK_SIZE);
    }

    // Metrics not derived from effects — use sensible defaults
    norms.hintSkillCount = norms.hintSkillCount || 2.5;
    norms.skillTypeCount = norms.skillTypeCount || 3;
    norms.uniqueEffects = norms.uniqueEffects || 8.33;
    norms.skillAptitude = norms.skillAptitude || 5;
    norms.totalEffectSum = norms.totalEffectSum || 1/15;

    return norms;
}

function scoreRaceBonus(rawBonus, breakpoint) {
    if (rawBonus <= 0) return 0;
    if (rawBonus <= breakpoint) return rawBonus;
    return breakpoint + (rawBonus - breakpoint) * 0.3;
}

function computeDiversityBonus(typeCounts) {
    const sorted = Object.values(typeCounts).sort((a, b) => b - a);
    const [p, s] = [sorted[0] || 0, sorted[1] || 0];
    if (p === 4 && s === 2) return 1.0;
    if (p === 3 && s === 2) return 0.95;
    if (p === 3 && s === 3) return 0.9;
    if (p === 4 && s === 1) return 0.85;
    if (p === 2 && s === 2) return 0.8;
    if (p === 5 && s === 1) return 0.65;
    if (p === 5 && s === 0) return 0.5;
    if (p === 6) return 0.4;
    return 0.7;
}

function buildSlotScoreBounds(slotEffectBounds, combinedWeights, metricNorms) {
    const n = slotEffectBounds.length;
    const scoreBounds = new Array(n);
    const norms = metricNorms || METRIC_NORM_FALLBACK;

    for (let i = 0; i < n; i++) {
        const eb = slotEffectBounds[i];
        let maxScore = 0;

        for (const [metricKey, weight] of Object.entries(combinedWeights)) {
            if (weight === 0) continue;
            const norm = norms[metricKey] || 1;
            const effectIds = METRIC_EFFECT_MAP[metricKey];

            if (effectIds === null) {
                let sum = 0;
                for (const v of Object.values(eb)) sum += v;
                maxScore += sum * norm * weight;
            } else if (effectIds === undefined) {
                // hintSkillCount, skillTypeCount, uniqueEffects, skillAptitude — generous upper bounds
                if (metricKey === 'hintSkillCount') maxScore += 30 * norm * weight;
                else if (metricKey === 'skillTypeCount') maxScore += 20 * norm * weight;
                else if (metricKey === 'uniqueEffects') maxScore += 6 * norm * weight;
                else if (metricKey === 'skillAptitude') maxScore += 12 * norm * weight;
            } else {
                let metricMax = 0;
                for (const eid of effectIds) {
                    metricMax += (eb[eid] || 0);
                }
                maxScore += metricMax * norm * weight;
            }
        }

        // Generous friendship stacking upper bound (capped)
        const friendMax = eb['1'] || 0;
        if (friendMax > 0) maxScore += friendMax * (norms.friendBonus || 0.29) * 2.8 * 8;

        scoreBounds[i] = maxScore;
    }

    return scoreBounds;
}

// ===== SIMULATED ANNEALING SEARCH =====

async function simulatedAnnealingSearch(groups, filters, cache, validDists, resultCount, onProgress, traineeData) {
    const topN = new MinHeap(resultCount);
    const NUM_STARTS = 60;

    // Rank distributions by potential
    const rankedDists = validDists.map(({ dist, count }) => {
        let potential = 0;
        for (const [type, cnt] of Object.entries(dist)) {
            if (cnt === 0) continue;
            const typeCards = groups[type] || [];
            const topCards = typeCards
                .map(c => individualCardScore(c.support_id, filters, cache, traineeData))
                .sort((a, b) => b - a)
                .slice(0, cnt);
            potential += topCards.reduce((s, v) => s + v, 0);
        }
        return { dist, count, potential };
    });
    rankedDists.sort((a, b) => b.potential - a.potential);

    for (let startIdx = 0; startIdx < NUM_STARTS; startIdx++) {
        if (deckFinderState.cancelled) throw new Error('cancelled');

        const distEntry = startIdx < rankedDists.length
            ? rankedDists[startIdx]
            : rankedDists[startIdx % rankedDists.length];
        const { dist } = distEntry;
        const typeEntries = Object.entries(dist).filter(([, count]) => count > 0);

        // Build initial deck (greedy with jitter for restarts)
        let currentDeck = buildGreedyDeck(typeEntries, groups, filters, cache, startIdx);
        if (!currentDeck || currentDeck.length !== 6) continue;

        // Enforce same-character constraint on initial deck
        currentDeck = enforceSameCharConstraint(currentDeck, cache);
        if (!currentDeck || currentDeck.length !== 6) continue;

        let currentScore = checkHardFilters(currentDeck, filters, cache)
            ? scoreDeck(currentDeck, filters, cache, traineeData).score
            : -Infinity;

        // Simulated annealing
        let T = 100;
        const cooling = 0.995;
        const itersPerTemp = 20;

        while (T > 0.1) {
            if (deckFinderState.cancelled) throw new Error('cancelled');

            for (let iter = 0; iter < itersPerTemp; iter++) {
                // Generate neighbor by swapping one card
                const neighbor = [...currentDeck];
                const slotIdx = Math.floor(Math.random() * 6);
                const slotData = cache.get(neighbor[slotIdx]);
                if (!slotData) continue;

                const candidates = groups[slotData.type] || [];
                if (candidates.length <= 1) continue;

                // Pick a random replacement from the same type
                const usedIds = new Set(neighbor);
                const usedCharIds = new Set();
                neighbor.forEach(id => {
                    const d = cache.get(id);
                    if (d) usedCharIds.add(d.charId);
                });
                // Remove current card's char_id so its slot can be replaced
                usedCharIds.delete(slotData.charId);

                const validCandidates = candidates.filter(c =>
                    !usedIds.has(c.support_id) &&
                    !usedCharIds.has(cache.get(c.support_id)?.charId)
                );
                if (validCandidates.length === 0) continue;

                const replacement = validCandidates[Math.floor(Math.random() * validCandidates.length)];
                neighbor[slotIdx] = replacement.support_id;

                if (!checkHardFilters(neighbor, filters, cache)) continue;
                const neighborScore = scoreDeck(neighbor, filters, cache, traineeData).score;

                const delta = neighborScore - currentScore;
                if (delta > 0 || Math.random() < Math.exp(delta / T)) {
                    currentDeck = neighbor;
                    currentScore = neighborScore;
                }
            }
            T *= cooling;
        }

        // Also do a hill-climbing pass after SA
        let improved = true;
        let passes = 0;
        while (improved && passes < 10) {
            improved = false;
            passes++;

            for (let slotIdx = 0; slotIdx < 6; slotIdx++) {
                const currentId = currentDeck[slotIdx];
                const currentData = cache.get(currentId);
                if (!currentData) continue;

                const candidates = groups[currentData.type] || [];
                const usedIds = new Set(currentDeck);
                const usedCharIds = new Set();
                currentDeck.forEach(id => {
                    const d = cache.get(id);
                    if (d) usedCharIds.add(d.charId);
                });
                usedCharIds.delete(currentData.charId);

                let bestScore = currentScore;
                let bestId = currentId;

                for (const candidate of candidates) {
                    if (usedIds.has(candidate.support_id) && candidate.support_id !== currentId) continue;
                    if (candidate.support_id === currentId) continue;
                    const candData = cache.get(candidate.support_id);
                    if (candData && usedCharIds.has(candData.charId)) continue;

                    const testDeck = [...currentDeck];
                    testDeck[slotIdx] = candidate.support_id;

                    if (!checkHardFilters(testDeck, filters, cache)) continue;
                    const { score } = scoreDeck(testDeck, filters, cache, traineeData);
                    if (score > bestScore) {
                        bestScore = score;
                        bestId = candidate.support_id;
                        improved = true;
                    }
                }

                if (bestId !== currentId) {
                    currentDeck[slotIdx] = bestId;
                    currentScore = bestScore;
                }
            }
        }

        // Score final deck
        if (checkHardFilters(currentDeck, filters, cache)) {
            const { score, metrics, aggregated } = scoreDeck(currentDeck, filters, cache, traineeData);
            const sortedIds = [...currentDeck].sort();
            topN.insert({ cardIds: [...currentDeck], score, metrics, aggregated, _key: sortedIds.join(',') });
        }

        deckFinderState.progress = Math.round((startIdx + 1) / NUM_STARTS * 100);
        onProgress(deckFinderState.progress);
        await yieldToUI();
    }

    return topN.toSortedArray();
}

function buildGreedyDeck(typeEntries, groups, filters, cache, startIdx) {
    let currentDeck = [];
    const usedCharIds = new Set();

    for (const [type, count] of typeEntries) {
        const typeCards = groups[type] || [];
        if (typeCards.length < count) return null;

        const scored = typeCards.map(c => ({
            id: c.support_id,
            charId: cache.get(c.support_id)?.charId,
            score: individualCardScore(c.support_id, filters, cache, traineeData)
        }));

        if (startIdx > 0) {
            const jitter = Math.min(0.8, 0.15 + startIdx * 0.02);
            scored.forEach(s => { s.score += Math.random() * s.score * jitter; });
        }

        scored.sort((a, b) => b.score - a.score);

        const usedIds = new Set(currentDeck);
        let picked = 0;
        for (const s of scored) {
            if (picked >= count) break;
            if (usedIds.has(s.id)) continue;
            if (s.charId && usedCharIds.has(s.charId)) continue;
            currentDeck.push(s.id);
            usedIds.add(s.id);
            if (s.charId) usedCharIds.add(s.charId);
            picked++;
        }
    }

    return currentDeck;
}

function enforceSameCharConstraint(deck, cache) {
    const charIds = new Map();
    for (let i = 0; i < deck.length; i++) {
        const data = cache.get(deck[i]);
        if (!data || !data.charId) continue;
        if (charIds.has(data.charId)) {
            // Duplicate character — remove the lower-index one (keep later card)
            return null; // Greedy builder should already handle this
        }
        charIds.set(data.charId, i);
    }
    return deck;
}

function individualCardScore(cardId, filters, cache, traineeData) {
    const data = cache.get(cardId);
    if (!data) return 0;
    const e = data.effects;

    // Use active weights (custom or scenario defaults)
    const scenarioId = filters.scenario || '1';
    const sw = getActiveWeights(scenarioId);

    let score = 0;
    // Score all effects using METRIC_EFFECT_MAP and fallback norms (presort only)
    for (const [metricKey, weight] of Object.entries(sw)) {
        if (weight === 0) continue;
        const norm = METRIC_NORM_FALLBACK[metricKey] || 1;
        const effectIds = METRIC_EFFECT_MAP[metricKey];
        if (effectIds === null) {
            // totalEffectSum
            let sum = 0;
            for (const v of Object.values(e)) sum += v;
            score += sum * norm * weight;
        } else if (effectIds !== undefined) {
            let metricVal = 0;
            for (const eid of effectIds) metricVal += (e[eid] || 0);
            score += metricVal * norm * weight;
        }
    }
    score += data.hintSkillIds.size * (METRIC_NORM_FALLBACK.hintSkillCount || 3) * (sw.hintSkillCount || 20);
    if (data.uniqueEffectActive) score += (METRIC_NORM_FALLBACK.uniqueEffects || 5) * (sw.uniqueEffects || 0);

    // Growth rate boost — only boost matching stat bonus, not entire score
    if (traineeData?.growthRates) {
        const growthKey = CARD_TYPE_GROWTH_KEY[data.type];
        if (growthKey) {
            const rate = traineeData.growthRates[growthKey] || 0;
            if (rate > 0) {
                const statEffectId = { speed: 3, stamina: 4, power: 5, guts: 6, wisdom: 7 }[growthKey];
                const cardStatBonus = e[statEffectId] || 0;
                score += cardStatBonus * (rate / 100) * (sw.statBonus || 35);
            }
        }
    }

    // Skill-aptitude score for trainee
    if (data.skillAptitudeScore > 0) {
        score += data.skillAptitudeScore * (METRIC_NORM_FALLBACK.skillAptitude || 5) * (sw.skillAptitude || 25);
    }

    return score;
}

// ===== WEB WORKER SEARCH (Multi-Worker Pool) =====

async function runWorkerSearch(filters, pool, cache, groups, maxTable, validDists, totalCombos, onProgress, onComplete, onLiveResults, warningMessage, friendCache, friendGroups, friendMaxTable, metricNorms, warmStartSeeds, searchPoolSize) {
    return new Promise((resolve, reject) => {
        // Determine worker count from search settings
        const workerSetting = deckFinderState.searchSettings?.workerCount || 'auto';
        // Estimate cache size for memory-aware worker count
        // With per-shard filtering (1B), each worker gets ~1/numTypes of the cache, not the full thing
        const cacheEntryCount = cache.size + (friendCache ? friendCache.size : 0);
        const numTypes = Object.keys(groups).length || 1;
        const estimatedPerShardMB = (cacheEntryCount / numTypes) * 0.5; // ~500 bytes per entry with clone overhead
        const memoryBudgetMB = 512;
        const maxWorkersByMemory = Math.max(1, Math.floor(memoryBudgetMB / Math.max(1, estimatedPerShardMB)));

        let numWorkers;
        if (workerSetting === 'auto') {
            const coreWorkers = Math.min(4, Math.max(1, navigator.hardwareConcurrency || 1));
            numWorkers = Math.min(coreWorkers, maxWorkersByMemory);
        } else {
            numWorkers = Math.min(parseInt(workerSetting) || 1, navigator.hardwareConcurrency || 8, maxWorkersByMemory);
        }
        _logDeckFinder.info('Worker pool', { numWorkers, cores: navigator.hardwareConcurrency, cacheEntries: cacheEntryCount, estimatedPerShardMB: estimatedPerShardMB.toFixed(1) });

        // Serialize cache to plain object (shared across all workers)
        const cacheObj = {};
        cache.forEach((val, key) => {
            // Serialize Sets to arrays for worker transfer
            const sbt = {};
            if (val.skillsByType) {
                for (const [t, s] of Object.entries(val.skillsByType)) sbt[t] = [...s];
            }
            cacheObj[key] = {
                ...val,
                hintSkillIds: [...val.hintSkillIds],
                hintSkillTypes: [...val.hintSkillTypes],
                skillsByType: sbt,
                effectKeyArr: val.effectKeyArr,
                effectValArr: val.effectValArr
            };
        });

        const groupsObj = {};
        for (const [type, cards] of Object.entries(groups)) {
            groupsObj[type] = cards.map(c => ({ support_id: c.support_id }));
        }

        let friendCacheObj = null;
        let friendGroupsObj = null;
        if (friendCache && friendGroups) {
            friendCacheObj = {};
            friendCache.forEach((val, key) => {
                // Skip friend entries identical to owned (same level = same effects)
                // Worker falls back to main cache for these cards
                const ownedEntry = cache.get(key);
                if (ownedEntry && ownedEntry.level === val.level) return;

                const fsbt = {};
                if (val.skillsByType) {
                    for (const [t, s] of Object.entries(val.skillsByType)) fsbt[t] = [...s];
                }
                friendCacheObj[key] = {
                    ...val,
                    hintSkillIds: [...val.hintSkillIds],
                    hintSkillTypes: [...val.hintSkillTypes],
                    skillsByType: fsbt,
                    effectKeyArr: val.effectKeyArr,
                    effectValArr: val.effectValArr
                };
            });
            friendGroupsObj = {};
            for (const [type, cards] of Object.entries(friendGroups)) {
                friendGroupsObj[type] = cards.map(c => ({ support_id: c.support_id }));
            }
        }

        // Release Map references — data is now in serialized cacheObj/friendCacheObj
        cache = null;
        friendCache = null;
        pool = null;

        // Shard distributions round-robin across workers (already sorted by potential)
        const shards = Array.from({ length: numWorkers }, () => []);
        const shardCombos = new Array(numWorkers).fill(0);
        for (let i = 0; i < validDists.length; i++) {
            const workerIdx = i % numWorkers;
            shards[workerIdx].push(validDists[i]);
            shardCombos[workerIdx] += validDists[i].count || 0;
        }

        // Global result heap — merges results from all workers
        const globalTopN = new MinHeap(searchPoolSize);
        const workers = [];
        let completedWorkers = 0;
        let globalEvaluated = 0;
        let globalPruned = 0;
        let globalMatches = 0;
        let globalElapsed = 0;
        const workerProgress = new Array(numWorkers).fill(0);
        const workerMatches = new Array(numWorkers).fill(0);
        let failed = false;
        let lastLiveUIUpdate = 0;

        // Store cancel handler
        deckFinderState._workerCancelResolve = () => {
            for (const w of workers) {
                try { w.postMessage({ type: 'cancel' }); } catch (e) {}
                try { w.terminate(); } catch (e) {}
            }
            workers.length = 0;
            deckFinderState.workers = null;
            const partialResults = deckFinderState.results.length > 0 ? deckFinderState.results : [];
            onComplete(partialResults, 'Search cancelled.');
            resolve();
        };

        // Send active weights so worker uses custom weights transparently
        const scenarioId = filters.scenario || '1';
        const activeWeights = getActiveWeights(scenarioId);
        const scenarioWeightsForWorker = {};
        for (const [id, data] of Object.entries(SCENARIO_WEIGHTS)) {
            scenarioWeightsForWorker[id] = { ...data, weights: id === scenarioId ? activeWeights : data.weights };
        }

        const stabilityPct = deckFinderState.searchSettings?.stabilityPercent || 30;
        const lockedCardIds = (filters.includeCardsMode === 'all') ? (filters.includeCards || []) : [];
        const anyRequiredCardIds = (filters.includeCardsMode === 'any' && (filters.includeCards || []).length > 0) ? filters.includeCards : [];

        // Collect types needed by locked/required cards (these must be in every worker's cache)
        const globalRequiredIds = new Set([...lockedCardIds, ...anyRequiredCardIds]);

        // Build per-worker filtered caches: only include cards of types in the worker's shard
        function filterCacheByTypes(fullCache, neededTypes) {
            if (!fullCache) return null;
            const filtered = {};
            for (const [id, val] of Object.entries(fullCache)) {
                if (neededTypes.has(val.type) || globalRequiredIds.has(parseInt(id, 10) || id)) {
                    filtered[id] = val;
                }
            }
            return filtered;
        }

        function filterGroupsByTypes(fullGroups, neededTypes) {
            if (!fullGroups) return null;
            const filtered = {};
            for (const [type, cards] of Object.entries(fullGroups)) {
                if (neededTypes.has(type)) filtered[type] = cards;
            }
            return filtered;
        }

        const commonPayload = {
            maxTable,
            totalCombos,
            filters: { ...filters, _stabilityPercent: stabilityPct },
            resultCount: searchPoolSize,
            scenarioWeights: scenarioWeightsForWorker,
            statBonusEffectIds: STAT_BONUS_EFFECT_IDS,
            skillTypeBitMap: Object.fromEntries(_skillTypeBitMap),
            traineeData: deckFinderState.traineeData,
            cardTypeGrowthKey: CARD_TYPE_GROWTH_KEY,
            initialSeeds: warmStartSeeds || [],
            metricNorms,
            lockedCardIds,
            anyRequiredCardIds
        };

        for (let wi = 0; wi < numWorkers; wi++) {
            let worker;
            try {
                worker = new Worker('js/workers/deckFinderWorker.js');
            } catch (e) {
                if (wi === 0) { reject(new Error('Worker creation failed')); return; }
                continue; // Use fewer workers if some fail to spawn
            }
            workers.push(worker);

            const workerIdx = wi;
            worker.onmessage = (e) => {
                if (failed) return;
                const msg = e.data;

                switch (msg.type) {
                    case 'progress': {
                        workerProgress[workerIdx] = msg.progress || 0;
                        workerMatches[workerIdx] = msg.matchCount || 0;
                        // Aggregate: average of worker progress values (each is distribution-based)
                        let avgProgress = 0;
                        for (let k = 0; k < numWorkers; k++) avgProgress += workerProgress[k];
                        avgProgress = Math.min(99, Math.round(avgProgress / numWorkers));
                        deckFinderState.progress = avgProgress;
                        const totalMatches = workerMatches.reduce((s, v) => s + v, 0);
                        onProgress(avgProgress, totalMatches);
                        break;
                    }
                    case 'liveResults': {
                        // Merge worker's live results into global heap
                        if (msg.results) {
                            for (const entry of msg.results) {
                                if (!entry._key) entry._key = entry.cardIds.slice().sort().join(',');
                                globalTopN.insert(entry);
                            }
                        }
                        workerMatches[workerIdx] = msg.matchCount || 0;
                        // Throttle UI updates to max 1 per 500ms
                        const now = performance.now();
                        if (onLiveResults && now - lastLiveUIUpdate >= 500) {
                            lastLiveUIUpdate = now;
                            deckFinderState.results = null; // Release previous array before allocating new one
                            const liveResults = globalTopN.toSortedArray();
                            deckFinderState.results = liveResults;
                            const totalMatches = workerMatches.reduce((s, v) => s + v, 0);
                            onLiveResults(liveResults, totalMatches);
                        }
                        // Broadcast updated min-score to all workers for tighter pruning
                        if (globalTopN.heap.length >= searchPoolSize) {
                            const globalMin = globalTopN.minEntry()?.baseScore ?? -Infinity;
                            for (const w of workers) {
                                try { w.postMessage({ type: 'updateMinScore', minScore: globalMin }); } catch (e) {}
                            }
                        }
                        break;
                    }
                    case 'complete': {
                        // Merge final results
                        if (msg.results) {
                            for (const entry of msg.results) {
                                if (!entry._key) entry._key = entry.cardIds.slice().sort().join(',');
                                globalTopN.insert(entry);
                            }
                        }
                        if (msg.stats) {
                            globalEvaluated += msg.stats.evaluated || 0;
                            globalPruned += msg.stats.pruned || 0;
                            globalElapsed = Math.max(globalElapsed, msg.stats.elapsed || 0);
                        }
                        workerProgress[workerIdx] = 100;
                        worker.terminate();
                        completedWorkers++;

                        // Update live results after each worker completes (skip last — final render follows)
                        if (completedWorkers < numWorkers) {
                            deckFinderState.results = null;
                            const currentResults = globalTopN.toSortedArray();
                            deckFinderState.results = currentResults;
                            if (onLiveResults) {
                                const totalMatches = workerMatches.reduce((s, v) => s + v, 0);
                                onLiveResults(currentResults, totalMatches);
                            }
                        }

                        if (completedWorkers >= workers.length) {
                            _logDeckFinder.info('All workers complete', { evaluated: globalEvaluated, pruned: globalPruned, elapsed: globalElapsed + 'ms' });
                            const finalResults = globalTopN.toSortedArray();
                            deckFinderState.results = finalResults;
                            deckFinderState.searching = false;
                            deckFinderState.searchStats = {
                                totalCombos,
                                evaluated: globalEvaluated,
                                pruned: globalPruned,
                                elapsed: globalElapsed
                            };
                            deckFinderState.workers = null;
                            // Free the heap — final results are already extracted
                            globalTopN.heap.length = 0;
                            // Apply post-search sort layers
                            sortFinderResults();
                            onComplete(finalResults, warningMessage);
                            resolve();
                        }
                        break;
                    }
                    case 'error':
                        failed = true;
                        for (const w of workers) { try { w.terminate(); } catch (e) {} }
                        deckFinderState.searching = false;
                        deckFinderState.workers = null;
                        reject(new Error(msg.message));
                        break;
                }
            };

            worker.onerror = (e) => {
                if (failed) return;
                failed = true;
                for (const w of workers) { try { w.terminate(); } catch (e2) {} }
                deckFinderState.searching = false;
                deckFinderState.workers = null;
                reject(new Error(e.message || 'Worker error'));
            };

            // Compute the set of card types needed by this worker's shard
            const shardTypes = new Set();
            for (const entry of shards[workerIdx]) {
                // entry = { dist: { speed: 2, stamina: 1, ... }, friendType: 'speed', count: N }
                for (const [type, count] of Object.entries(entry.dist)) {
                    if (count > 0) shardTypes.add(type);
                }
                if (entry.friendType) shardTypes.add(entry.friendType);
            }

            // Send shard to this worker with filtered caches (only types it needs)
            worker.postMessage({
                type: 'start',
                debugConfig: _debug.getConfig(),
                payload: {
                    ...commonPayload,
                    cache: filterCacheByTypes(cacheObj, shardTypes),
                    groups: filterGroupsByTypes(groupsObj, shardTypes),
                    friendCache: filterCacheByTypes(friendCacheObj, shardTypes),
                    friendGroups: filterGroupsByTypes(friendGroupsObj, shardTypes),
                    validDists: shards[workerIdx],
                    totalCombos: shardCombos[workerIdx]
                }
            });
        }

        deckFinderState.workers = workers;

        // Release serialized data — workers have their own copies now
        commonPayload.initialSeeds = null;
        warmStartSeeds = null;
    });
}

// ===== UTILITY =====

function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// ===== FINDER TRAINING SIMULATION =====
// Self-contained training calculations that don't depend on deckBuilderState.
// Reuses global data lookups (getBaseTrainingValues, getApplicableBonusIds, etc.)

// Per-result training preview state (only one result expanded at a time)
let finderTrainingState = {
    trainingLevel: 1,
    mood: 'very_good',
    friendshipTraining: true,
    // assignments[trainingType][slotIndex] = bool
    assignments: null,
    // The result index currently showing training
    resultIdx: -1
};

const FINDER_MOOD_VALUES = {
    very_good: 0.20, good: 0.10, normal: 0.00, bad: -0.10, very_bad: -0.20
};

const FINDER_CARD_TYPE_TRAINING = {
    speed: 'speed', stamina: 'stamina', power: 'power',
    guts: 'guts', intelligence: 'intelligence'
};

const FINDER_STAT_BONUS_INDEX = {
    3: 0, 4: 1, 5: 2, 6: 3, 7: 4, 30: 5
};

function initFinderTrainingAssignments(numCards) {
    const a = {};
    for (const t of ['speed', 'stamina', 'power', 'guts', 'intelligence']) {
        a[t] = new Array(numCards).fill(true);
    }
    return a;
}

/**
 * Calculate training gains for a finder result at one training type.
 * @param {string} trainingType - 'speed'|'stamina'|'power'|'guts'|'intelligence'
 * @param {Array} slots - [{cardId, level}, ...] built from result
 * @param {Object} aggregated - deck-wide effect sums {effectId: value}
 * @param {Object} options - {trainingLevel, mood, friendshipTraining, scenario}
 * @param {Array} assignments - boolean array, one per slot
 * @param {Object|null} growthRates - {speed,stamina,power,guts,wisdom} or null
 */
function calculateFinderTrainingGains(trainingType, slots, aggregated, options, assignments, growthRates) {
    const { trainingLevel, mood, friendshipTraining, scenario } = options;
    const scenarioId = scenario || '1';

    const baseValues = getBaseTrainingValues(trainingType, scenarioId, trainingLevel);
    if (!baseValues) return null;

    const base = [
        baseValues.speed, baseValues.stamina, baseValues.power,
        baseValues.guts, baseValues.wisdom, baseValues.skill_pt
    ];
    const energy = baseValues.energy;

    // Filter present cards
    const presentCards = [];
    const presentSlots = [];
    slots.forEach((slot, idx) => {
        if (!slot) return;
        if (!assignments[idx]) return;
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card) return;
        presentCards.push(card.type);
        presentSlots.push(slot);
    });

    const supportCount = presentCards.length;

    // Stat bonuses from present cards
    const statBonuses = [0, 0, 0, 0, 0, 0];
    const applicableBonusIds = getApplicableBonusIds(trainingType, scenarioId, trainingLevel);

    presentSlots.forEach(slot => {
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card?.effects) return;
        card.effects.forEach(eff => {
            const eid = eff[0];
            if (applicableBonusIds.includes(eid) && FINDER_STAT_BONUS_INDEX[eid] !== undefined) {
                const val = calculateEffectValue(eff, slot.level);
                if (val > 0) statBonuses[FINDER_STAT_BONUS_INDEX[eid]] += val;
            }
        });
    });

    // Training Effectiveness (8) and Mood Effect (2) from present cards
    let trainingEff = 0, moodEffect = 0;
    presentSlots.forEach(slot => {
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card?.effects) return;
        card.effects.forEach(eff => {
            if (eff[0] === 8) { const v = calculateEffectValue(eff, slot.level); if (v > 0) trainingEff += v; }
            else if (eff[0] === 2) { const v = calculateEffectValue(eff, slot.level); if (v > 0) moodEffect += v; }
        });
    });

    const moodBase = FINDER_MOOD_VALUES[mood] || 0;
    const moodMultiplier = 1 + moodBase * (1 + moodEffect / 100);
    const trainingEffMultiplier = 1 + trainingEff / 100;
    const supportMultiplier = 1 + 0.05 * supportCount;

    // Friendship multiplier
    let friendshipMultiplier = 1;
    if (friendshipTraining && supportCount > 0) {
        presentSlots.forEach(slot => {
            const card = cardData.find(c => c.support_id === slot.cardId);
            if (!card?.effects) return;
            const isMatch = card.type === 'friend' || FINDER_CARD_TYPE_TRAINING[card.type] === trainingType;
            if (!isMatch) return;
            card.effects.forEach(eff => {
                if (eff[0] === 1) {
                    const val = calculateEffectValue(eff, slot.level);
                    if (val > 0) friendshipMultiplier *= (1 + val / 100);
                }
            });
        });
    }

    // Calculate final gains
    const growthKeys = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
    const resultKeys = ['speed', 'stamina', 'power', 'guts', 'wit', 'skillPts'];
    const result = { speed: 0, stamina: 0, power: 0, guts: 0, wit: 0, skillPts: 0, energy, presentCards };

    for (let i = 0; i < 6; i++) {
        const statBase = base[i] + statBonuses[i];
        if (statBase > 0) {
            let gain = statBase * moodMultiplier * trainingEffMultiplier * supportMultiplier * friendshipMultiplier;
            if (i < 5 && growthRates) gain *= (1 + (growthRates[growthKeys[i]] || 0) / 100);
            result[resultKeys[i]] = Math.floor(gain);
        }
    }

    // Energy reduction (deck-wide effect 28)
    if (energy < 0) {
        const energyReduction = aggregated[28] || 0;
        if (energyReduction > 0) {
            result.energyReduced = Math.floor(energy * (1 - energyReduction / 100));
        }
    }

    return result;
}

/**
 * Calculate all 5 training types for a finder result.
 */
function calculateFinderAllTraining(result) {
    const cache = deckFinderState.cardEffectCache;
    const cardMap = typeof getCardDataMap === 'function' ? getCardDataMap() : new Map(cardData.map(c => [c.support_id, c]));
    const friendCardId = result.friendCardId || null;

    // Build slots array: [{cardId, level}, ...]
    const slots = result.cardIds.map(id => {
        const isFriend = id === friendCardId;
        const data = isFriend ? (cache.get('friend_' + id) || cache.get(id)) : cache.get(id);
        return data ? { cardId: id, level: data.level } : null;
    });

    // Aggregate effects using actual card data + levels
    const aggregated = {};
    slots.forEach(slot => {
        if (!slot) return;
        const card = cardData.find(c => c.support_id === slot.cardId);
        if (!card?.effects) return;
        card.effects.forEach(eff => {
            const eid = eff[0];
            if (!eid) return;
            const val = calculateEffectValue(eff, slot.level);
            if (val > 0) aggregated[eid] = (aggregated[eid] || 0) + val;
        });
    });

    const scenarioId = deckFinderState.filters?.scenario || '1';
    const traineeId = deckFinderState.filters?.selectedTrainee;
    const growthRates = (traineeId && typeof charactersData !== 'undefined' && charactersData[traineeId])
        ? charactersData[traineeId].growth_rates : null;

    const ts = finderTrainingState;
    if (!ts.assignments) ts.assignments = initFinderTrainingAssignments(slots.length);

    const options = {
        trainingLevel: ts.trainingLevel,
        mood: ts.mood,
        friendshipTraining: ts.friendshipTraining,
        scenario: scenarioId
    };

    const results = {};
    for (const type of ['speed', 'stamina', 'power', 'guts', 'intelligence']) {
        results[type] = calculateFinderTrainingGains(type, slots, aggregated, options, ts.assignments[type], growthRates);
    }

    // Failure rates
    const failureRates = getFinderTrainingFailureRates(aggregated, ts.trainingLevel);

    // Race bonus
    const raceBonusPct = aggregated[15] || 0;

    return { results, aggregated, failureRates, raceBonusPct, slots };
}

function getFinderTrainingFailureRates(aggregated, trainingLevel) {
    if (typeof trainingConfigData === 'undefined' || !trainingConfigData?.training_failure) return null;
    const level = String(trainingLevel || 1);
    const failProt = aggregated[27] || 0;

    const COMMAND_IDS = { speed: '101', power: '102', guts: '103', stamina: '105', intelligence: '106' };
    const rates = {};
    for (const [type, cmdId] of Object.entries(COMMAND_IDS)) {
        const data = trainingConfigData.training_failure[cmdId];
        if (!data || !data[level]) continue;
        const baseRate = data[level].failure_rate / 100;
        const effectiveRate = failProt > 0
            ? Math.floor(baseRate * (1 - failProt / 100) * 100) / 100
            : baseRate;
        rates[type] = { baseRate, effectiveRate, maxChara: data[level].max_chara };
    }
    return rates;
}

function cancelSearch() {
    _logDeckFinder.info('cancelSearch');
    deckFinderState.cancelled = true;
    // Terminate all workers (multi-worker pool)
    if (deckFinderState.workers) {
        for (const w of deckFinderState.workers) {
            try { w.postMessage({ type: 'cancel' }); } catch (e) {}
            try { w.terminate(); } catch (e) {}
        }
        deckFinderState.workers = null;
    }
    // Legacy single-worker support
    if (deckFinderState.worker) {
        try { deckFinderState.worker.postMessage({ type: 'cancel' }); } catch (e) {}
        try { deckFinderState.worker.terminate(); } catch (e) {}
        deckFinderState.worker = null;
    }
    deckFinderState.searching = false;
    if (deckFinderState._workerCancelResolve) {
        deckFinderState._workerCancelResolve();
        deckFinderState._workerCancelResolve = null;
    }
}

// ===== AVAILABLE HINT SKILLS (for required skills picker) =====

function getAvailableHintSkills(filters) {
    const pool = buildCardPool(filters);
    const skillMap = new Map();

    for (const card of pool) {
        if (!card.hints?.hint_skills) continue;
        for (const skill of card.hints.hint_skills) {
            if (!skill) continue;
            const skillId = typeof skill === 'object' ? skill.id : skill;
            const skillName = typeof skill === 'object' ? skill.name : null;
            if (!skillId) continue;
            if (!skillMap.has(skillId)) {
                skillMap.set(skillId, {
                    id: skillId,
                    name: skillName || `Skill ${skillId}`,
                    count: 1
                });
            } else {
                skillMap.get(skillId).count++;
            }
        }
    }

    return [...skillMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ===== "WHY THIS DECK" ANALYSIS =====

function analyzeWhyThisDeck(result, filters) {
    const badges = [];
    const m = result.metrics;

    const checks = [
        { label: 'Race Bonus', value: m.raceBonus, threshold: filters.minRaceBonus, unit: '%' },
        { label: 'Training Eff', value: m.trainingEff, threshold: filters.minTrainingEff, unit: '%' },
        { label: 'Friendship Bonus', value: m.friendBonus, threshold: filters.minFriendBonus, unit: '%' },
        { label: 'Energy Reduction', value: m.energyCost, threshold: filters.minEnergyCost, unit: '%' },
        { label: 'Event Recovery', value: m.eventRecovery, threshold: filters.minEventRecovery, unit: '%' },
    ];

    checks.forEach(({ label, value, threshold, unit }) => {
        if (threshold > 0) {
            if (value >= threshold * 1.2) {
                badges.push({ type: 'exceeds', label, value: `${value}${unit}`, detail: `>${Math.round(threshold * 1.2)}${unit}` });
            } else if (value >= threshold) {
                badges.push({ type: 'meets', label, value: `${value}${unit}` });
            }
        } else if (value > 0) {
            badges.push({ type: 'info', label, value: `${value}${unit}` });
        }
    });

    if (m.hintSkillCount > 0) {
        badges.push({ type: 'info', label: 'Hint Skills', value: `${m.hintSkillCount}` });
    }
    if (m.uniqueEffects > 0) {
        badges.push({ type: 'info', label: 'Unique Effects', value: `${m.uniqueEffects} active` });
    }

    // Find key cards — top 2 contributors to the deck's highest metric
    const topMetric = checks.reduce((best, c) => c.value > (best?.value || 0) ? c : best, null);
    const keyCards = [];
    if (topMetric) {
        const effectIdMap = { 'Race Bonus': 15, 'Training Eff': 8, 'Friendship Bonus': 1, 'Energy Reduction': 28, 'Event Recovery': 25 };
        const effectId = effectIdMap[topMetric.label];
        if (effectId) {
            const candidates = [];
            result.cardIds.forEach(id => {
                const data = deckFinderState.cardEffectCache.get(id);
                if (data && data.effects[effectId]) {
                    candidates.push({
                        cardId: id,
                        contribution: data.effects[effectId],
                        metric: topMetric.label
                    });
                }
            });
            candidates.sort((a, b) => b.contribution - a.contribution);
            // Only mark top 2 as key cards
            keyCards.push(...candidates.slice(0, 2));
        }
    }

    return { badges, keyCards };
}

// ===== LOAD DECK FROM FINDER =====

function loadDeckFromFinder(cardIds, saveName) {
    _logDeckFinder.info('loadDeckFromFinder', { cardIds, saveName });
    const isAllCardsMode = deckFinderState.filters?.cardPool === 'all';
    // Create slots array matching deckBuilderState format
    const slots = cardIds.map((cardId, idx) => {
        const card = cardData.find(c => c.support_id === cardId);
        if (!card) return null;

        const isFriend = card.type === 'friend';
        let level, lb;

        const useMaxPotential = deckFinderState.filters?.maxPotential;

        if (isFriend) {
            // Friend cards belong to another player — always default to max
            lb = 4;
            level = limitBreaks[card.rarity][lb];
        } else if (isAllCardsMode) {
            // "All cards" finder uses forceMax — all cards at LB4 max level
            lb = 4;
            level = limitBreaks[card.rarity][lb];
        } else if (isCardOwned(cardId)) {
            lb = getOwnedCardLimitBreak(cardId);
            level = useMaxPotential
                ? limitBreaks[card.rarity][lb]
                : getOwnedCardLevel(cardId);
        } else {
            lb = 4;
            level = limitBreaks[card.rarity][lb];
        }

        return { cardId, level, limitBreak: lb, isFriend };
    });

    // Ensure friend card is in slot 5
    const friendIdx = slots.findIndex(s => s && s.isFriend);
    if (friendIdx !== -1 && friendIdx !== 5) {
        const friendSlot = slots.splice(friendIdx, 1)[0];
        // Remove any existing slot 5 and place friend there
        const nonFriendSlots = slots.filter(s => s && !s.isFriend);
        while (nonFriendSlots.length < 5) nonFriendSlots.push(null);
        nonFriendSlots.length = 5;
        nonFriendSlots.push(friendSlot);
        slots.length = 0;
        slots.push(...nonFriendSlots);
    }

    while (slots.length < 6) slots.push(null);
    slots.length = 6;

    return slots;
}

function saveDeckFromFinder(cardIds) {
    _logDeckFinder.info('saveDeckFromFinder', { cardIds });
    // Exit preview/dirty mode
    deckBuilderState.previewMode = false;
    deckBuilderState.dirty = false;
    const slots = loadDeckFromFinder(cardIds);
    const deckId = 'deck_' + Date.now();
    const typeCounts = {};
    cardIds.forEach(id => {
        const card = cardData.find(c => c.support_id === id);
        if (card) typeCounts[card.type] = (typeCounts[card.type] || 0) + 1;
    });
    const typeStr = Object.entries(typeCounts)
        .map(([t, c]) => `${getTypeDisplayName(t).substring(0, 3)}${c}`)
        .join('/');
    const name = `Finder: ${typeStr}`;

    // Propagate trainee selection to builder
    const selectedTrainee = deckFinderState.filters?.selectedTrainee || null;

    const isAllCardsMode = deckFinderState.filters?.cardPool === 'all';
    const maxPotential = isAllCardsMode ? false : (deckFinderState.filters?.maxPotential || false);
    const allCardsMax = isAllCardsMode;

    const newDeck = {
        id: deckId,
        name,
        slots,
        selectedCharacter: selectedTrainee,
        maxPotential,
        allCardsMax,
        lastModified: Date.now()
    };
    deckBuilderState.savedDecks.push(newDeck);
    if (selectedTrainee) {
        deckBuilderState.selectedCharacter = selectedTrainee;
    }
    deckBuilderState.maxPotential = maxPotential;
    deckBuilderState.allCardsMax = allCardsMax;
    switchToDeck(deckId);
    saveDeckToStorage();
    renderDeckSelect();
    return name;
}

function viewDeckFromFinder(cardIds) {
    _logDeckFinder.info('viewDeckFromFinder', { cardIds });
    const slots = loadDeckFromFinder(cardIds);
    const selectedTrainee = deckFinderState.filters?.selectedTrainee || null;
    const isAllCardsMode = deckFinderState.filters?.cardPool === 'all';
    const maxPotential = isAllCardsMode ? false : (deckFinderState.filters?.maxPotential || false);
    const allCardsMax = isAllCardsMode;
    enterPreviewMode(slots, selectedTrainee, maxPotential, allCardsMax);
}

// ===== EXPORTS =====

window.DeckFinderManager = {
    deckFinderState,
    getDefaultFinderFilters,
    validateFinderFilters,
    buildCardPool,
    runSearch,
    cancelSearch,
    scoreDeck,
    checkHardFilters,
    analyzeWhyThisDeck,
    loadDeckFromFinder,
    saveDeckFromFinder,
    viewDeckFromFinder,
    precomputeCardEffects,
    getAvailableHintSkills,
    resolveTraineeData,
    computeCardSkillAptitudeScore,
    SCENARIO_WEIGHTS,
    CARD_TYPE_GROWTH_KEY,
    APTITUDE_GRADE_SCORE,
    SKILL_TYPE_TO_APTITUDE,
    individualCardScore,
    getActiveWeights,
    METRIC_NORM_FALLBACK
};

Object.assign(window, {
    deckFinderState,
    getDefaultFinderFilters,
    validateFinderFilters,
    runSearch,
    cancelSearch,
    analyzeWhyThisDeck,
    saveDeckFromFinder,
    viewDeckFromFinder,
    getAvailableHintSkills,
    resolveTraineeData,
    SCENARIO_WEIGHTS,
    CARD_TYPE_GROWTH_KEY
});
