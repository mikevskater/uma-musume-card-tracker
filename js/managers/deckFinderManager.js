// Deck Finder Manager
// Search algorithm, scoring, and filter validation for the Best Deck Finder

// ===== SCENARIO WEIGHTS =====

// Scoring weights per scenario.
// Values are on comparable scales AFTER normalization in scoreDeck:
//   raceBonus, trainingEff, friendBonus, energyCost, eventRecovery: typically 0-60% → used raw
//   statBonus: sum of 6 effects, can be 0-300 → divided by 5 to normalize to ~0-60 range
//   hintSkillCount: 0-20 → multiplied by 3 to normalize to ~0-60 range
//   totalEffectSum: 0-800 → used as weak tiebreaker only (weight ~1)
const SCENARIO_WEIGHTS = {
    '1': { // URA — balanced, race bonus focused
        name: 'URA',
        weights: { raceBonus: 100, trainingEff: 70, friendBonus: 90, statBonus: 40, energyCost: 40, eventRecovery: 30, hintSkillCount: 20, skillAptitude: 25, totalEffectSum: 1 },
        thresholdHints: { raceBonus: 35 }
    },
    '2': { // Aoharu — training efficiency focused
        name: 'Aoharu',
        weights: { raceBonus: 70, trainingEff: 100, friendBonus: 90, statBonus: 50, energyCost: 50, eventRecovery: 30, hintSkillCount: 20, skillAptitude: 25, totalEffectSum: 1 },
        thresholdHints: { raceBonus: 35 }
    },
    '4': { // Trailblazer — high race bonus + energy management
        name: 'Trailblazer',
        weights: { raceBonus: 100, trainingEff: 80, friendBonus: 80, statBonus: 35, energyCost: 70, eventRecovery: 50, hintSkillCount: 15, skillAptitude: 25, totalEffectSum: 1 },
        thresholdHints: { raceBonus: 50 }
    }
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

// Skill weight framework — placeholder for future per-skill tier weighting
const SKILL_WEIGHTS = {};  // skillId -> multiplier, default 1.0
function getSkillWeight(skillId) { return SKILL_WEIGHTS[skillId] || 1.0; }

// ===== MIN-HEAP =====

class MinHeap {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.heap = [];
        this.keySet = new Set();
    }

    _makeKey(cardIds) {
        return cardIds.slice().sort().join(',');
    }

    insert(entry) {
        const key = this._makeKey(entry.cardIds);
        if (this.keySet.has(key)) return false;

        if (this.heap.length < this.maxSize) {
            this.heap.push(entry);
            this.keySet.add(key);
            this._bubbleUp(this.heap.length - 1);
            return true;
        }

        // Heap is full — only insert if better than the min
        if (entry.score > this.heap[0].score) {
            const evictedKey = this._makeKey(this.heap[0].cardIds);
            this.keySet.delete(evictedKey);
            this.heap[0] = entry;
            this.keySet.add(key);
            this._sinkDown(0);
            return true;
        }
        return false;
    }

    minScore() {
        return this.heap.length > 0 ? this.heap[0].score : -Infinity;
    }

    size() {
        return this.heap.length;
    }

    isFull() {
        return this.heap.length >= this.maxSize;
    }

    toSortedArray() {
        return this.heap.slice().sort((a, b) => b.score - a.score);
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.heap[i].score < this.heap[parent].score) {
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
            if (left < n && this.heap[left].score < this.heap[smallest].score) smallest = left;
            if (right < n && this.heap[right].score < this.heap[smallest].score) smallest = right;
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
    // Worker reference
    worker: null,
    // Search stats
    searchStats: null,
    // Multi-layer sort state — array of { key, direction } objects
    sortLayers: []
};

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
    statBonus:       { label: 'Stat Bonus (total)',   defaultDirection: 'desc', metricKey: 'statBonus' },
    hintSkillCount:  { label: 'Hint Skills',          defaultDirection: 'desc', metricKey: 'hintSkillCount' },
    skillAptitude:   { label: 'Skill Aptitude',       defaultDirection: 'desc', metricKey: 'skillAptitude' },
    uniqueEffects:   { label: 'Unique Effects',       defaultDirection: 'desc', metricKey: 'uniqueEffects' },
    totalEffectSum:  { label: 'Total Effect Sum',     defaultDirection: 'desc', metricKey: 'totalEffectSum' }
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

// Precompute per-skill-type counts on each result for sorting
function enrichResultsForSort(results) {
    const cache = deckFinderState.cardEffectCache;
    for (const result of results) {
        if (result._skillTypeCounts) continue;
        const counts = {};
        result.cardIds.forEach(id => {
            const data = cache.get(id);
            if (data) data.hintSkillTypes.forEach(t => {
                counts[t] = (counts[t] || 0) + 1;
            });
        });
        result._skillTypeCounts = counts;
    }
}

function sortFinderResults() {
    const layers = deckFinderState.sortLayers;
    const results = deckFinderState.results;
    if (!results || results.length === 0) return;

    if (layers.length === 0) {
        results.sort((a, b) => b.score - a.score);
    } else {
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

    renderFinderResults(deckFinderState.results, null, false);
}

// Build sort boost weights from sort layers for search scoring
function buildSortBoostWeights() {
    const boosts = {};
    const layers = deckFinderState.sortLayers;
    let boostValue = 120;
    for (const layer of layers) {
        let weightKey = null;
        if (layer.key === 'effect' && layer.option) {
            weightKey = EFFECT_ID_TO_METRIC[layer.option];
        } else if (layer.key !== 'effect' && layer.key !== 'skillType') {
            weightKey = layer.key;
        }
        if (weightKey && !boosts[weightKey]) {
            boosts[weightKey] = boostValue;
            boostValue = Math.max(boostValue - 30, 10);
        }
    }
    return boosts;
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
        resultCount: 10,
        scenario: '1',               // scenario ID for scoring weights
        selectedTrainee: null         // trainee version ID from charactersData
    };
}

// ===== FILTER VALIDATION =====

function validateFinderFilters(filters) {
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

    if (ratioSum > 0) {
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

    return errors;
}

// ===== CARD POOL BUILDING =====

function buildCardPool(filters) {
    let pool = [...cardData];

    // Card pool filter
    if (filters.cardPool === 'owned') {
        pool = pool.filter(c => isCardOwned(c.support_id));
    }

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

function precomputeCardEffects(pool, traineeData) {
    const cache = new Map();
    const skillLookup = getSkillIdLookup();
    pool.forEach(card => {
        const cardId = card.support_id;
        const level = getCardFinderLevel(card);
        const effects = {};

        if (card.effects) {
            card.effects.forEach(effectArray => {
                const effectId = effectArray[0];
                if (!effectId) return;
                const value = calculateEffectValue(effectArray, level);
                if (value > 0) effects[effectId] = value;
            });
        }

        // Pre-compute hint skill IDs and types
        // hint_skills are skill objects {id, name, type, description} after cardManager processing
        const hintSkillIds = new Set();
        const hintSkillTypes = new Set();
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
        const skillAptitudeScore = computeCardSkillAptitudeScore(card, traineeData, skillLookup);

        cache.set(cardId, {
            effects,
            uniqueEffectBonuses,
            uniqueEffectName: card.unique_effect?.name || null,
            level,
            hintSkillIds,
            hintSkillTypes,
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

function getCardFinderLevel(card) {
    if (isCardOwned(card.support_id)) {
        return getOwnedCardLevel(card.support_id);
    }
    // Default to max LB for unowned
    return limitBreaks[card.rarity][4];
}

// ===== SKILL-APTITUDE SCORING =====

function computeCardSkillAptitudeScore(card, traineeData, skillLookup) {
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
                const aptScore = APTITUDE_GRADE_SCORE[grade] || 0;
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

    // Required skill types (each entry: { type, min })
    if (filters.requiredSkillTypes.length > 0) {
        const typeCounts = {};
        cardIds.forEach(id => {
            const data = cache.get(id);
            if (data) data.hintSkillTypes.forEach(t => {
                typeCounts[t] = (typeCounts[t] || 0) + 1;
            });
        });
        for (const req of filters.requiredSkillTypes) {
            const reqType = typeof req === 'object' ? req.type : req;
            const reqMin = typeof req === 'object' ? (req.min || 1) : 1;
            if ((typeCounts[reqType] || 0) < reqMin) return false;
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

function scoreDeck(cardIds, filters, cache, traineeData) {
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

    // Count cards per type for friendship multiplier boost
    const typeCounts = {};
    cardIds.forEach(id => {
        const data = cache.get(id);
        if (data) typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
    });

    // Layered scoring: scenario base + filter boost
    const scenarioId = filters.scenario || '1';
    const scenarioWeights = SCENARIO_WEIGHTS[scenarioId]?.weights || SCENARIO_WEIGHTS['1'].weights;

    // Build filter boost weights
    const filterBoosts = {};
    const boostOrder = [
        { key: 'raceBonus', active: filters.minRaceBonus > 0 },
        { key: 'trainingEff', active: filters.minTrainingEff > 0 },
        { key: 'friendBonus', active: filters.minFriendBonus > 0 },
        { key: 'energyCost', active: filters.minEnergyCost > 0 },
        { key: 'eventRecovery', active: filters.minEventRecovery > 0 },
        { key: 'hintSkillCount', active: filters.minHintSkills > 0 },
        { key: 'skillTypeCount', active: filters.requiredSkillTypes.length > 0 }
    ];
    let boostMultiplier = 150;
    for (const { key, active } of boostOrder) {
        if (active) {
            filterBoosts[key] = boostMultiplier;
            boostMultiplier -= 20;
        }
    }

    // Sort layer boosts — user's sort priorities also influence scoring
    const sortBoosts = buildSortBoostWeights();
    for (const [key, val] of Object.entries(sortBoosts)) {
        filterBoosts[key] = (filterBoosts[key] || 0) + val;
    }

    // Normalize metrics to comparable 0-60ish ranges before applying weights
    const normalized = {
        raceBonus: metrics.raceBonus,           // 0-60%  → already in range
        trainingEff: metrics.trainingEff,       // 0-60%  → already in range
        friendBonus: metrics.friendBonus,       // 0-80%  → already in range
        energyCost: metrics.energyCost,         // 0-50%  → already in range
        eventRecovery: metrics.eventRecovery,   // 0-50%  → already in range
        statBonus: metrics.statBonus / 5,       // 0-300  → /5 = 0-60
        hintSkillCount: metrics.hintSkillCount * 3, // 0-20 → *3 = 0-60
        skillTypeCount: metrics.skillTypeCount * 3,
        totalEffectSum: metrics.totalEffectSum / 10, // 0-800 → /10 = 0-80 (weak tiebreaker)
        uniqueEffects: metrics.uniqueEffects * 5,    // 0-6  → *5 = 0-30
        skillAptitude: metrics.skillAptitude * 5     // 0-12 → *5 = 0-60
    };

    // Combined score using normalized values
    let score = 0;
    for (const key of Object.keys(scenarioWeights)) {
        const metricVal = normalized[key] || 0;
        const sw = scenarioWeights[key] || 0;
        const fb = filterBoosts[key] || 0;
        score += metricVal * (sw + fb);
    }

    // Friendship bonus multiplier: when 3+ cards of the same type,
    // friendship is multiplicatively valuable — boost it
    const maxTypeCount = Math.max(...Object.values(typeCounts), 0);
    if (maxTypeCount >= 3 && metrics.friendBonus > 0) {
        score += metrics.friendBonus * (maxTypeCount - 2) * 20;
    }

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

function enumerateTypeDistributions(filters) {
    const types = Object.keys(filters.types).filter(t => filters.types[t]);
    const ratioSum = types.reduce((s, t) => s + (filters.typeRatio[t] || 0), 0);

    // If no ratio specified, enumerate all distributions summing to 6
    if (ratioSum === 0) {
        return enumerateAllDistributions(types, 6);
    }

    const hasAtLeast = types.some(t => filters.typeRatioAtLeast[t] && filters.typeRatio[t] > 0);

    if (!hasAtLeast) {
        // Exact ratio
        const dist = {};
        types.forEach(t => { dist[t] = filters.typeRatio[t] || 0; });
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

    const remaining = 6 - fixedSum;
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

// ===== SEARCH ALGORITHMS =====

const BRUTE_FORCE_LIMIT = 5000000;
const CHUNK_SIZE = 50000;

async function runSearch(filters, onProgress, onComplete, onLiveResults) {
    deckFinderState.searching = true;
    deckFinderState.cancelled = false;
    deckFinderState.progress = 0;
    deckFinderState.results = [];
    deckFinderState.searchStats = null;

    // Resolve trainee data once for the entire search
    const traineeData = resolveTraineeData(filters);
    deckFinderState.traineeData = traineeData;

    const pool = buildCardPool(filters);
    if (pool.length === 0) {
        deckFinderState.searching = false;
        onComplete([], 'No cards match the current pool filters.');
        return;
    }

    const cache = precomputeCardEffects(pool, traineeData);
    deckFinderState.cardEffectCache = cache;
    const groups = groupCardsByType(pool);

    // Phase 1d: Pre-sort card groups by individual score descending
    presortCardGroups(groups, filters, cache, traineeData);

    // Phase 1b: Build max contribution table for pruning
    const maxTable = buildMaxContributionTable(groups, cache);

    const distributions = enumerateTypeDistributions(filters);
    if (distributions.length === 0) {
        deckFinderState.searching = false;
        onComplete([], 'No valid type distributions possible.');
        return;
    }

    // Phase 1c: Filter infeasible distributions
    const validDists = [];
    let totalCombos = 0;
    for (const dist of distributions) {
        if (!isDistributionFeasible(dist, filters, maxTable)) continue;
        const count = estimateComboCount(groups, dist);
        if (count > 0) {
            totalCombos += count;
            validDists.push({ dist, count });
        }
    }

    if (validDists.length === 0) {
        deckFinderState.searching = false;
        onComplete([], 'No feasible distributions found — try relaxing your thresholds.');
        return;
    }

    let useGreedy = false; // Always exhaustive search
    let warningMessage = null;

    // Try to use Web Worker for search
    if (typeof Worker !== 'undefined' && !useGreedy) {
        try {
            await runWorkerSearch(filters, pool, cache, groups, maxTable, validDists, totalCombos, onProgress, onComplete, onLiveResults, warningMessage);
            return;
        } catch (workerErr) {
            // Fall back to main thread
            console.warn('Worker search failed, falling back to main thread:', workerErr.message);
        }
    }

    try {
        let results;
        const startTime = performance.now();
        if (useGreedy) {
            results = await simulatedAnnealingSearch(groups, filters, cache, validDists, filters.resultCount, onProgress, traineeData);
        } else {
            results = await bruteForceSearch(groups, filters, cache, validDists, totalCombos, filters.resultCount, onProgress, onLiveResults, maxTable, traineeData);
        }
        const elapsed = performance.now() - startTime;

        deckFinderState.results = results;
        deckFinderState.searching = false;
        if (deckFinderState.searchStats) {
            deckFinderState.searchStats.elapsed = Math.round(elapsed);
        }
        onComplete(results, warningMessage);
    } catch (err) {
        deckFinderState.searching = false;
        if (err.message === 'cancelled') {
            onComplete(deckFinderState.results.length > 0 ? deckFinderState.results : [], 'Search cancelled.');
        } else {
            onComplete([], `Search error: ${err.message}`);
        }
    }
}

// ===== BRANCH AND BOUND SEARCH =====
//
// Card-by-card DFS with MUTABLE state and backtracking.
// Zero allocations in the hot loop — no array spreads, no object copies.
// Memory usage: O(deck_size=6) stack depth, O(1) per step.

async function bruteForceSearch(groups, filters, cache, validDists, totalCombos, resultCount, onProgress, onLiveResults, maxTable, traineeData) {
    const topN = new MinHeap(resultCount);
    let evaluated = 0;
    let pruned = 0;
    let matchesFound = 0;
    let lastLiveCount = 0;
    const LIVE_BATCH = 10;
    let yieldCounter = 0;
    const YIELD_INTERVAL = 80000;
    const startTime = performance.now();

    // Build threshold checks for B&B pruning
    const thresholdChecks = [];
    if (filters.minRaceBonus > 0) thresholdChecks.push({ effectId: '15', threshold: filters.minRaceBonus });
    if (filters.minTrainingEff > 0) thresholdChecks.push({ effectId: '8', threshold: filters.minTrainingEff });
    if (filters.minFriendBonus > 0) thresholdChecks.push({ effectId: '1', threshold: filters.minFriendBonus });
    if (filters.minEnergyCost > 0) thresholdChecks.push({ effectId: '28', threshold: filters.minEnergyCost });
    if (filters.minEventRecovery > 0) thresholdChecks.push({ effectId: '25', threshold: filters.minEventRecovery });

    // Build required skill type mask
    const requiredSkillTypeMask = buildRequiredSkillTypeMask(filters.requiredSkillTypes);

    // Precompute scoring constants once (avoid recomputing per leaf)
    const scenarioId = filters.scenario || '1';
    const scenarioWeights = SCENARIO_WEIGHTS[scenarioId]?.weights || SCENARIO_WEIGHTS['1'].weights;
    const filterBoosts = {};
    const boostOrder = [
        { key: 'raceBonus', active: filters.minRaceBonus > 0 },
        { key: 'trainingEff', active: filters.minTrainingEff > 0 },
        { key: 'friendBonus', active: filters.minFriendBonus > 0 },
        { key: 'energyCost', active: filters.minEnergyCost > 0 },
        { key: 'eventRecovery', active: filters.minEventRecovery > 0 },
        { key: 'hintSkillCount', active: filters.minHintSkills > 0 },
        { key: 'skillTypeCount', active: filters.requiredSkillTypes.length > 0 }
    ];
    let bm = 150;
    for (const { key, active } of boostOrder) {
        if (active) { filterBoosts[key] = bm; bm -= 20; }
    }
    // Sort layer boosts
    const sortBoosts = buildSortBoostWeights();
    for (const [sbKey, sbVal] of Object.entries(sortBoosts)) {
        filterBoosts[sbKey] = (filterBoosts[sbKey] || 0) + sbVal;
    }
    // Pre-merge scenario + filter weights into a single combined weights array
    const scoringKeys = Object.keys(scenarioWeights);
    const combinedWeights = {};
    for (const key of scoringKeys) {
        combinedWeights[key] = (scenarioWeights[key] || 0) + (filterBoosts[key] || 0);
    }

    // Precompute per-card score contribution for O(1) running score tracking.
    // Must match the normalization in the leaf scoring:
    //   raceBonus(15): *1, trainingEff(8): *1, friendBonus(1): *1,
    //   energyCost(28): *1, eventRecovery(25): *1,
    //   statBonus(3,4,5,6,7,30): /5, totalEffectSum(all): /10
    const cardScoreContrib = new Map();

    // Normalization factors per metric
    const METRIC_NORM_BF = {
        raceBonus: 1, trainingEff: 1, friendBonus: 1,
        energyCost: 1, eventRecovery: 1,
        statBonus: 1 / 5, hintSkillCount: 3, skillTypeCount: 3,
        totalEffectSum: 1 / 10, uniqueEffects: 5, skillAptitude: 5
    };

    // Build effectId -> normalized weight
    const effectWeightMap = {};
    let totalEffectSumWeight = 0;
    const skillAptWeight = (combinedWeights.skillAptitude || 0) * (METRIC_NORM_BF.skillAptitude || 1);
    for (const [metricKey, weight] of Object.entries(combinedWeights)) {
        if (weight === 0) continue;
        const norm = METRIC_NORM_BF[metricKey] || 1;
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

    cache.forEach((data, cardId) => {
        let cs = 0;
        for (const [eid, val] of Object.entries(data.effects)) {
            cs += val * (effectWeightMap[eid] || 0);
            cs += val * totalEffectSumWeight;
        }
        // Growth rate multiplier
        if (traineeGrowthRates) {
            const growthKey = CARD_TYPE_GROWTH_KEY[data.type];
            if (growthKey) {
                const rate = traineeGrowthRates[growthKey] || 0;
                cs *= (1 + rate / 100);
            }
        }
        // Skill-aptitude contribution
        if (data.skillAptitudeScore > 0 && skillAptWeight > 0) {
            cs += data.skillAptitudeScore * skillAptWeight;
        }
        cardScoreContrib.set(cardId, cs);
    });

    // Mutable state shared across all recursions — never allocated in the hot loop
    const deckIds = [];                     // max length 6
    const partialEffects = {};              // mutable, add/subtract
    const usedCharIds = new Set();
    let skillMask = 0;
    let ueCount = 0;
    let partialScore = 0;                   // running score from card contributions

    // Per-distribution flattened card list: cards are grouped by type,
    // and we build a flat "slot plan" that says for each of the 6 card slots,
    // which pool of cards to pick from and what index range.
    for (const { dist } of validDists) {
        if (deckFinderState.cancelled) throw new Error('cancelled');

        // Get types in order: smallest pool first for tighter early pruning
        const typeEntries = Object.entries(dist)
            .filter(([, count]) => count > 0)
            .sort((a, b) => (groups[a[0]]?.length || 0) - (groups[b[0]]?.length || 0));

        if (typeEntries.some(([type, count]) => (groups[type]?.length || 0) < count)) continue;

        // Build a flat slot plan: [{pool: [...cardIds], type, isLastOfType, effectBoundsIdx}]
        // Each slot picks one card. Slots for the same type must pick in ascending index order.
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
                    slotInType: s
                });
            }
        }
        const totalSlots = slots.length; // should be 6

        // Build per-slot effect bounds: for slot i, what's the max remaining effect
        // from all cards in slots i+1..end. We need bounds per effect.
        // Since cards within a type are pre-sorted, the max remaining for a type
        // starting at slot rank j is sum of top-(count-j) values.
        const slotEffectBounds = buildSlotEffectBounds(slots, typeOrder, maxTable);
        const slotScoreBounds = buildSlotScoreBounds(slotEffectBounds, combinedWeights);

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
        foundSkillBits = 0;

        // Card-by-card DFS — slot 0 picks from its pool starting at index 0.
        // slot 1 of the same type picks at a higher index than slot 0.
        // Slot 0 of a different type picks at index 0.
        const minIndices = new Array(totalSlots).fill(0);

        await dfsSlot(0);

        async function dfsSlot(slotIdx) {
            if (slotIdx === totalSlots) {
                // LEAF: complete deck
                evaluated++;
                yieldCounter++;

                // Check skill-based hard filters (can't prune these during traversal)
                if (filters.requiredSkills.length > 0) {
                    const deckSkills = new Set();
                    for (let i = 0; i < 6; i++) {
                        const data = cache.get(deckIds[i]);
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
                    for (let i = 0; i < 6; i++) {
                        const data = cache.get(deckIds[i]);
                        if (data) data.hintSkillIds.forEach(s => allSkills.add(s));
                    }
                    if (allSkills.size < filters.minHintSkills) return;
                }

                if (filters.minUniqueEffects > 0 && ueCount < filters.minUniqueEffects) return;

                // Score — read from mutable partialEffects directly
                let statBonus = 0;
                for (const eid of STAT_BONUS_EFFECT_IDS) statBonus += (partialEffects[eid] || 0);

                const allSkills = new Set();
                const allTypes = new Set();
                const typeCounts = {};
                for (let i = 0; i < 6; i++) {
                    const data = cache.get(deckIds[i]);
                    if (!data) continue;
                    data.hintSkillIds.forEach(s => allSkills.add(s));
                    data.hintSkillTypes.forEach(t => allTypes.add(t));
                    typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
                }

                let totalEffectSum = 0;
                for (const k of Object.keys(partialEffects)) totalEffectSum += partialEffects[k];

                // Skill-aptitude sum
                let skillAptSum = 0;
                for (let i = 0; i < 6; i++) {
                    const data = cache.get(deckIds[i]);
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
                    totalEffectSum,
                    uniqueEffects: ueCount,
                    skillAptitude: skillAptSum
                };

                // Normalize for scoring (same as scoreDeck)
                const norm = {
                    raceBonus: metrics.raceBonus,
                    trainingEff: metrics.trainingEff,
                    friendBonus: metrics.friendBonus,
                    energyCost: metrics.energyCost,
                    eventRecovery: metrics.eventRecovery,
                    statBonus: metrics.statBonus / 5,
                    hintSkillCount: metrics.hintSkillCount * 3,
                    skillTypeCount: metrics.skillTypeCount * 3,
                    totalEffectSum: metrics.totalEffectSum / 10,
                    uniqueEffects: metrics.uniqueEffects * 5,
                    skillAptitude: metrics.skillAptitude * 5
                };

                let score = 0;
                for (const key of scoringKeys) {
                    score += (norm[key] || 0) * combinedWeights[key];
                }
                const maxTypeCount = Math.max(...Object.values(typeCounts), 0);
                if (maxTypeCount >= 3 && metrics.friendBonus > 0) {
                    score += metrics.friendBonus * (maxTypeCount - 2) * 20;
                }

                // Growth rate boost: cards matching trainee's strong growth stats score higher
                if (traineeGrowthRates) {
                    const statEffectIds = { speed: 3, stamina: 4, power: 5, guts: 6, wisdom: 7 };
                    for (let ci = 0; ci < 6; ci++) {
                        const cdata = cache.get(deckIds[ci]);
                        if (!cdata) continue;
                        const growthKey = CARD_TYPE_GROWTH_KEY[cdata.type];
                        if (growthKey) {
                            const rate = traineeGrowthRates[growthKey] || 0;
                            if (rate > 0) {
                                const cardStatBonus = cdata.effects[statEffectIds[growthKey]] || 0;
                                score += cardStatBonus * (rate / 100) * (combinedWeights.statBonus || 40);
                            }
                        }
                    }
                }

                // Copy effects for storage (only at leaf — rare relative to pruned branches)
                const aggCopy = {};
                for (const k of Object.keys(partialEffects)) aggCopy[k] = partialEffects[k];

                topN.insert({ cardIds: deckIds.slice(), score, metrics, aggregated: aggCopy });
                matchesFound++;

                if (onLiveResults && matchesFound - lastLiveCount >= LIVE_BATCH) {
                    lastLiveCount = matchesFound;
                    deckFinderState.results = topN.toSortedArray();
                    onLiveResults(deckFinderState.results, matchesFound);
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
            const pool = slot.pool;
            const startFrom = slot.slotInType === 0 ? 0 : minIndices[slotIdx];
            const slotsRemaining = totalSlots - slotIdx;
            const eb = slotEffectBounds[slotIdx + 1]; // bounds for slots after this one

            for (let i = startFrom; i < pool.length; i++) {
                // Ensure enough cards left for remaining slots of this type
                // (handled implicitly by the ascending index constraint + pool size check)
                const cardId = pool[i];
                const data = cache.get(cardId);
                if (!data) continue;

                // Same-character exclusion
                if (data.charId && usedCharIds.has(data.charId)) continue;

                // ADD card effects to mutable state
                const cardEffects = data.effects;
                const effectKeys = Object.keys(cardEffects);
                for (let e = 0; e < effectKeys.length; e++) {
                    const eid = effectKeys[e];
                    partialEffects[eid] = (partialEffects[eid] || 0) + cardEffects[eid];
                }
                const prevSkillMask = skillMask;
                skillMask |= data.skillTypeMask;
                const prevUECount = ueCount;
                if (data.uniqueEffectActive) ueCount++;
                if (data.charId) usedCharIds.add(data.charId);
                const cardScore = cardScoreContrib.get(cardId) || 0;
                partialScore += cardScore;
                deckIds.push(cardId);

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

                // PRUNE 2: optimality — can this branch beat the worst result in top-N?
                if (!dominated && topN.isFull()) {
                    const maxRemaining = slotScoreBounds[slotIdx + 1] || 0;
                    if (partialScore + maxRemaining < topN.minScore()) {
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
                foundSkillBits = prevFoundSkillBits;
                if (data.charId) usedCharIds.delete(data.charId);
                ueCount = prevUECount;
                skillMask = prevSkillMask;
                for (let e = 0; e < effectKeys.length; e++) {
                    const eid = effectKeys[e];
                    partialEffects[eid] -= cardEffects[eid];
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
    skillAptitude: undefined,  // no effect mapping — uses pre-computed score
    totalEffectSum: null  // special: sum of ALL effects
};

// Normalization factors matching scoreDeck
const METRIC_NORM = {
    raceBonus: 1, trainingEff: 1, friendBonus: 1,
    energyCost: 1, eventRecovery: 1,
    statBonus: 1 / 5, hintSkillCount: 3, skillTypeCount: 3,
    totalEffectSum: 1 / 10, uniqueEffects: 5, skillAptitude: 5
};

function buildSlotScoreBounds(slotEffectBounds, combinedWeights) {
    const n = slotEffectBounds.length;
    const scoreBounds = new Array(n);

    for (let i = 0; i < n; i++) {
        const eb = slotEffectBounds[i];
        let maxScore = 0;

        for (const [metricKey, weight] of Object.entries(combinedWeights)) {
            if (weight === 0) continue;
            const norm = METRIC_NORM[metricKey] || 1;
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

        // Generous friendship multiplier upper bound
        const friendMax = eb['1'] || 0;
        if (friendMax > 0) maxScore += friendMax * 4 * 20;

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
            topN.insert({ cardIds: [...currentDeck], score, metrics, aggregated });
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

    // Use scenario weights if available
    const scenarioId = filters.scenario || '1';
    const sw = SCENARIO_WEIGHTS[scenarioId]?.weights || SCENARIO_WEIGHTS['1'].weights;

    let score = 0;
    score += (e[15] || 0) * (sw.raceBonus / 30);     // Race bonus
    score += (e[8] || 0) * (sw.trainingEff / 30);     // Training eff
    score += (e[1] || 0) * (sw.friendBonus / 30);     // Friendship
    score += (e[28] || 0) * (sw.energyCost / 30);     // Energy reduction
    score += (e[25] || 0) * (sw.eventRecovery / 30);  // Event recovery
    // Stat bonuses
    for (const eid of STAT_BONUS_EFFECT_IDS) {
        score += (e[eid] || 0) * (sw.statBonus / 100);
    }
    score += data.hintSkillIds.size * 2;
    if (data.uniqueEffectActive) score += 5;

    // Growth rate multiplier for trainee
    if (traineeData?.growthRates) {
        const growthKey = CARD_TYPE_GROWTH_KEY[data.type];
        if (growthKey) {
            const rate = traineeData.growthRates[growthKey] || 0;
            score *= (1 + rate / 100);
        }
    }

    // Skill-aptitude score for trainee
    if (data.skillAptitudeScore > 0) {
        score += data.skillAptitudeScore * 5;
    }

    return score;
}

// ===== WEB WORKER SEARCH =====

async function runWorkerSearch(filters, pool, cache, groups, maxTable, validDists, totalCombos, onProgress, onComplete, onLiveResults, warningMessage) {
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker('js/workers/deckFinderWorker.js');
        } catch (e) {
            reject(new Error('Worker creation failed'));
            return;
        }
        deckFinderState.worker = worker;

        // Store resolve so cancelSearch can break the promise
        deckFinderState._workerCancelResolve = () => {
            const partialResults = deckFinderState.results.length > 0 ? deckFinderState.results : [];
            onComplete(partialResults, 'Search cancelled.');
            resolve();
        };

        // Serialize cache to plain object (include skillAptitudeScore for worker)
        const cacheObj = {};
        cache.forEach((val, key) => {
            cacheObj[key] = {
                ...val,
                hintSkillIds: [...val.hintSkillIds],
                hintSkillTypes: [...val.hintSkillTypes]
            };
        });

        // Serialize groups
        const groupsObj = {};
        for (const [type, cards] of Object.entries(groups)) {
            groupsObj[type] = cards.map(c => ({ support_id: c.support_id }));
        }

        worker.onmessage = (e) => {
            const msg = e.data;
            switch (msg.type) {
                case 'progress':
                    deckFinderState.progress = msg.progress;
                    onProgress(msg.progress, msg.matchCount);
                    break;
                case 'liveResults':
                    deckFinderState.results = msg.results;
                    if (onLiveResults) onLiveResults(msg.results, msg.matchCount);
                    break;
                case 'complete':
                    deckFinderState.results = msg.results;
                    deckFinderState.searching = false;
                    deckFinderState.searchStats = msg.stats;
                    deckFinderState.worker = null;
                    worker.terminate();
                    onComplete(msg.results, warningMessage);
                    resolve();
                    break;
                case 'error':
                    deckFinderState.searching = false;
                    deckFinderState.worker = null;
                    worker.terminate();
                    reject(new Error(msg.message));
                    break;
            }
        };

        worker.onerror = (e) => {
            deckFinderState.searching = false;
            deckFinderState.worker = null;
            worker.terminate();
            reject(new Error(e.message || 'Worker error'));
        };

        worker.postMessage({
            type: 'start',
            payload: {
                cache: cacheObj,
                groups: groupsObj,
                maxTable,
                validDists,
                totalCombos,
                filters,
                resultCount: filters.resultCount,
                scenarioWeights: SCENARIO_WEIGHTS,
                statBonusEffectIds: STAT_BONUS_EFFECT_IDS,
                skillTypeBitMap: Object.fromEntries(_skillTypeBitMap),
                traineeData: deckFinderState.traineeData,
                cardTypeGrowthKey: CARD_TYPE_GROWTH_KEY,
                sortBoosts: buildSortBoostWeights()
            }
        });
    });
}

// ===== UTILITY =====

function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function cancelSearch() {
    deckFinderState.cancelled = true;
    if (deckFinderState.worker) {
        deckFinderState.worker.terminate();
        deckFinderState.worker = null;
        deckFinderState.searching = false;
        // Call the stored cancel callback to resolve the hanging promise
        if (deckFinderState._workerCancelResolve) {
            deckFinderState._workerCancelResolve();
            deckFinderState._workerCancelResolve = null;
        }
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

    // Find key cards — which card contributes most to top metric
    const topMetric = checks.reduce((best, c) => c.value > (best?.value || 0) ? c : best, null);
    const keyCards = [];
    if (topMetric) {
        const effectIdMap = { 'Race Bonus': 15, 'Training Eff': 8, 'Friendship Bonus': 1, 'Energy Reduction': 28, 'Event Recovery': 25 };
        const effectId = effectIdMap[topMetric.label];
        if (effectId) {
            result.cardIds.forEach(id => {
                const data = deckFinderState.cardEffectCache.get(id);
                if (data && data.effects[effectId]) {
                    keyCards.push({
                        cardId: id,
                        contribution: data.effects[effectId],
                        metric: topMetric.label
                    });
                }
            });
            keyCards.sort((a, b) => b.contribution - a.contribution);
        }
    }

    return { badges, keyCards };
}

// ===== LOAD DECK FROM FINDER =====

function loadDeckFromFinder(cardIds, saveName) {
    // Create slots array matching deckBuilderState format
    const slots = cardIds.map((cardId, idx) => {
        const card = cardData.find(c => c.support_id === cardId);
        if (!card) return null;

        const isFriend = card.type === 'friend';
        let level, lb;

        if (isCardOwned(cardId)) {
            level = getOwnedCardLevel(cardId);
            lb = getOwnedCardLimitBreak(cardId);
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

    const newDeck = {
        id: deckId,
        name,
        slots,
        selectedCharacter: selectedTrainee,
        lastModified: Date.now()
    };
    deckBuilderState.savedDecks.push(newDeck);
    if (selectedTrainee) {
        deckBuilderState.selectedCharacter = selectedTrainee;
    }
    switchToDeck(deckId);
    saveDeckToStorage();
    renderDeckSelect();
    return name;
}

function viewDeckFromFinder(cardIds) {
    // Always create a new saved deck so we never overwrite user's current deck
    return saveDeckFromFinder(cardIds);
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
    SKILL_TYPE_TO_APTITUDE
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
