// Deck Finder Web Worker
// Self-contained search computation — no DOM or window references
// Card-by-card DFS with mutable state — zero allocations in the hot loop

'use strict';

importScripts('../utils/debug.js');
const log = _debug.create('Worker');

let cancelled = false;
let globalMinBaseScore = -Infinity; // Updated by manager for cross-worker pruning

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

// ===== MIN-HEAP (comparison-function-based) =====
// compareFn(a, b): positive if a is BETTER than b (higher priority to keep)
// The heap root is the WORST entry (lowest priority) — candidate for eviction.

class MinHeap {
    constructor(maxSize, compareFn) {
        this.maxSize = maxSize;
        this.heap = [];
        this.keySet = new Set();
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

// ===== SEARCH LOGIC =====

function buildRequiredSkillTypeMask(requiredTypes, bitMap) {
    let mask = 0;
    for (const entry of requiredTypes) {
        const t = typeof entry === 'object' ? entry.type : entry;
        const bit = bitMap[t];
        if (bit !== undefined && bit >= 0) mask |= (1 << bit);
    }
    return mask;
}

function buildSlotEffectBounds(slots, maxTable) {
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

function buildSlotScoreBounds(slotEffectBounds, combinedWeights, metricNorms) {
    const n = slotEffectBounds.length;
    const scoreBounds = new Array(n);

    for (let i = 0; i < n; i++) {
        const eb = slotEffectBounds[i];
        let maxScore = 0;

        for (const [metricKey, weight] of Object.entries(combinedWeights)) {
            if (weight === 0) continue;
            const norm = metricNorms[metricKey] || 1;
            const effectIds = METRIC_EFFECT_MAP[metricKey];

            if (effectIds === null) {
                let sum = 0;
                for (const v of Object.values(eb)) sum += v;
                maxScore += sum * norm * weight;
            } else if (effectIds === undefined) {
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

        const friendMax = eb['1'] || 0;
        if (friendMax > 0) maxScore += friendMax * (metricNorms.friendBonus || 0.29) * 2.8 * 8;

        scoreBounds[i] = maxScore;
    }

    return scoreBounds;
}

// ===== BRANCH AND BOUND SEARCH =====

function runBranchAndBound(payload) {
    const {
        cache, groups, maxTable, validDists, totalCombos,
        filters, resultCount, scenarioWeights: scenarioWeightsMap,
        statBonusEffectIds, skillTypeBitMap, traineeData, cardTypeGrowthKey,
        metricNorms, friendCache, friendGroups,
        lockedCardIds, anyRequiredCardIds,
        initialSeeds
    } = payload;

    // Include cards support
    const lockedSet = new Set(lockedCardIds || []);
    const anyRequiredSet = new Set(anyRequiredCardIds || []);
    const hasLockedCards = lockedSet.size > 0;
    const hasAnyRequired = anyRequiredSet.size > 0;

    const topN = new MinHeap(resultCount);

    // Seed heap with initial results from greedy warm-start
    if (initialSeeds && initialSeeds.length > 0) {
        for (const seed of initialSeeds) {
            if (!seed._key) seed._key = seed.cardIds.slice().sort().join(',');
            if (seed.baseScore === undefined) seed.baseScore = seed.score || 0;
            topN.insert(seed);
        }
        log.debug('Seeded heap with ' + initialSeeds.length + ' warm-start results');
    }

    let evaluated = 0;
    let pruned = 0;
    let matchesFound = 0;
    let lastProgressUpdate = 0;
    let lastLiveUpdate = 0;
    const startTime = performance.now();
    const PROGRESS_INTERVAL = 50000;
    const LIVE_INTERVAL = 100;

    const scenarioId = filters.scenario || '1';
    const sw = scenarioWeightsMap[scenarioId]?.weights || scenarioWeightsMap['1'].weights;

    // Build threshold checks — pure hard constraints, never affect scoring
    const thresholdChecks = [];
    if (filters.minRaceBonus > 0) thresholdChecks.push({ effectId: '15', threshold: filters.minRaceBonus });
    if (filters.minTrainingEff > 0) thresholdChecks.push({ effectId: '8', threshold: filters.minTrainingEff });
    if (filters.minFriendBonus > 0) thresholdChecks.push({ effectId: '1', threshold: filters.minFriendBonus });
    if (filters.minEnergyCost > 0) thresholdChecks.push({ effectId: '28', threshold: filters.minEnergyCost });
    if (filters.minEventRecovery > 0) thresholdChecks.push({ effectId: '25', threshold: filters.minEventRecovery });

    const requiredSkillTypeMask = buildRequiredSkillTypeMask(filters.requiredSkillTypes, skillTypeBitMap);

    // Scoring weights: scenario weights ONLY — no filter/sort boosts.
    // This ensures the same deck is found regardless of threshold settings.
    const scoringKeys = Object.keys(sw);
    const combinedWeights = {};
    for (const key of scoringKeys) {
        combinedWeights[key] = sw[key] || 0;
    }

    // Precompute per-card score contribution (with normalization)
    const effectWeightMap = {};
    let totalEffectSumWeight = 0;
    const skillAptWeight = (combinedWeights.skillAptitude || 0) * (metricNorms.skillAptitude || 1);
    for (const [metricKey, weight] of Object.entries(combinedWeights)) {
        if (weight === 0) continue;
        const norm = metricNorms[metricKey] || 1;
        const effectIds = METRIC_EFFECT_MAP[metricKey];
        if (effectIds === null) {
            totalEffectSumWeight += weight * norm;
        } else if (effectIds !== undefined) {
            for (const eid of effectIds) {
                effectWeightMap[eid] = (effectWeightMap[eid] || 0) + weight * norm;
            }
        }
    }

    const traineeGrowthRates = traineeData?.growthRates;

    function computeWorkerCardScore(data) {
        let cs = 0;
        for (const [eid, val] of Object.entries(data.effects)) {
            cs += val * (effectWeightMap[eid] || 0);
            cs += val * totalEffectSumWeight;
        }
        if (traineeGrowthRates && cardTypeGrowthKey) {
            const growthKey = cardTypeGrowthKey[data.type];
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

    const cardScoreContrib = {};
    for (const [cardId, data] of Object.entries(cache)) {
        cardScoreContrib[cardId] = computeWorkerCardScore(data);
    }

    const friendCardScoreContrib = {};
    if (friendCache) {
        for (const [cardId, data] of Object.entries(friendCache)) {
            friendCardScoreContrib[cardId] = computeWorkerCardScore(data);
        }
    }

    // Pre-extract required skill types for running state tracking
    const reqSkillTypes = (filters.requiredSkillTypes || []).map(r => ({
        type: typeof r === 'object' ? r.type : r,
        min: typeof r === 'object' ? (r.min || 1) : 1
    }));
    const hasReqSkillTypes = reqSkillTypes.length > 0;

    // Mutable state
    const deckIds = [];
    const partialEffects = {};
    const usedCharIds = new Set();
    let skillMask = 0;
    let ueCount = 0;
    let partialScore = 0;
    let partialEffectSum = 0;
    const deckTypeCounts = {};
    let maxTypeCount = 0;

    // Running unique-skill-per-type tracking (ref-counted)
    // skillTypeRefCounts[type][skillId] = number of cards providing this skill
    // skillTypeUniqueCounts[type] = number of unique skills (refcount > 0)
    const skillTypeRefCounts = {};
    const skillTypeUniqueCounts = {};
    if (hasReqSkillTypes) {
        for (const r of reqSkillTypes) {
            skillTypeRefCounts[r.type] = {};
            skillTypeUniqueCounts[r.type] = 0;
        }
    }

    // === Rank distributions by estimated score potential ===
    for (const entry of validDists) {
        let potential = 0;
        for (const [type, count] of Object.entries(entry.dist)) {
            if (count === 0) continue;
            const typeCards = (groups[type] || []).map(c => c.support_id);
            const scores = typeCards.map(id => cardScoreContrib[id] || 0).sort((a, b) => b - a);
            for (let i = 0; i < Math.min(count, scores.length); i++) potential += scores[i];
        }
        if (entry.friendType && friendGroups) {
            const fCards = (friendGroups[entry.friendType] || []).map(c => c.support_id);
            const fScores = fCards.map(id => friendCardScoreContrib[id] || 0).sort((a, b) => b - a);
            if (fScores.length > 0) potential += fScores[0];
        }
        entry.potential = potential;
    }
    validDists.sort((a, b) => b.potential - a.potential);

    // === Early termination tracking ===
    let distsWithoutImprovement = 0;
    let prevWorstBaseScore = -Infinity;
    const stabilityPct = (filters._stabilityPercent || 30) / 100;
    const STABILITY_THRESHOLD = Math.max(50, Math.ceil(validDists.length * stabilityPct));
    const PER_DIST_EVAL_CAP = 2000000;

    for (const { dist, friendType } of validDists) {
        if (cancelled) break;

        // Early termination: stop if results have stabilized
        if (topN.heap.length >= resultCount && distsWithoutImprovement >= STABILITY_THRESHOLD) break;

        const typeEntries = Object.entries(dist)
            .filter(([, count]) => count > 0)
            .sort((a, b) => (groups[a[0]]?.length || 0) - (groups[b[0]]?.length || 0));

        if (typeEntries.some(([type, count]) => (groups[type]?.length || 0) < count)) continue;

        // Build flat slot plan
        const slots = [];
        for (const [type, count] of typeEntries) {
            const pool = (groups[type] || []).map(c => c.support_id);
            for (let s = 0; s < count; s++) {
                slots.push({ pool, type, slotInType: s, isFriend: false });
            }
        }

        // Append friend slot last (if present)
        if (friendType && friendGroups) {
            const fPool = (friendGroups[friendType] || []).map(c => c.support_id);
            if (fPool.length === 0) continue;
            slots.push({ pool: fPool, type: friendType, slotInType: 0, isFriend: true });
        }
        const totalSlots = slots.length;
        const slotEffectBounds = buildSlotEffectBounds(slots, maxTable);
        const slotScoreBounds = buildSlotScoreBounds(slotEffectBounds, combinedWeights, metricNorms);
        const minIndices = new Array(totalSlots).fill(0);

        // Required-skill reachability pruning
        const reqSkills = filters.requiredSkills;
        const hasReqSkills = reqSkills.length > 0;
        const reqSkillSlotMasks = [];
        if (hasReqSkills) {
            for (const skillId of reqSkills) {
                let mask = 0;
                for (let s = 0; s < totalSlots; s++) {
                    const pool = slots[s].pool;
                    for (const cardId of pool) {
                        const data = cache[cardId];
                        if (data && data.hintSkillIds && data.hintSkillIds.includes(skillId)) {
                            mask |= (1 << s);
                            break;
                        }
                    }
                }
                reqSkillSlotMasks.push(mask);
            }
        }
        let foundSkillBits = 0;

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

        let distEvaluated = 0;
        dfsSlot(0);

        // Track early termination stability (use base score as proxy)
        const worstEntry = topN.minEntry();
        const currentWorstBase = worstEntry ? worstEntry.baseScore : -Infinity;
        if (topN.heap.length >= resultCount && currentWorstBase > prevWorstBaseScore) {
            prevWorstBaseScore = currentWorstBase;
            distsWithoutImprovement = 0;
        } else {
            distsWithoutImprovement++;
        }

        function dfsSlot(slotIdx) {
            if (cancelled) return;
            if (distEvaluated >= PER_DIST_EVAL_CAP) return;

            if (slotIdx === totalSlots) {
                evaluated++;
                distEvaluated++;

                // Include card checks
                if (hasLockedCards) {
                    for (const lid of lockedSet) {
                        if (!deckIds.includes(lid)) return;
                    }
                }
                if (hasAnyRequired) {
                    let found = false;
                    for (const rid of anyRequiredSet) {
                        if (deckIds.includes(rid)) { found = true; break; }
                    }
                    if (!found) return;
                }

                // Helper: get correct cache for a deck card index
                const fSlotIdx = friendType ? totalSlots - 1 : -1;
                function getCardData(idx) {
                    if (idx === fSlotIdx && friendCache) return friendCache[deckIds[idx]];
                    return cache[deckIds[idx]];
                }

                // Skill-based hard filters
                if (filters.requiredSkills.length > 0) {
                    const deckSkills = new Set();
                    for (let i = 0; i < totalSlots; i++) {
                        const data = getCardData(i);
                        if (data && data.hintSkillIds) data.hintSkillIds.forEach(s => deckSkills.add(s));
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
                        const data = getCardData(i);
                        if (data && data.hintSkillIds) data.hintSkillIds.forEach(s => allSkills.add(s));
                    }
                    if (allSkills.size < filters.minHintSkills) return;
                }

                if (filters.minUniqueEffects > 0 && ueCount < filters.minUniqueEffects) return;

                // Skill type count check — uses running unique counts (maintained during add/backtrack)
                if (hasReqSkillTypes) {
                    for (let rt = 0; rt < reqSkillTypes.length; rt++) {
                        if (skillTypeUniqueCounts[reqSkillTypes[rt].type] < reqSkillTypes[rt].min) return;
                    }
                }

                // Compute metrics from running counters
                let statBonus = 0;
                for (const eid of statBonusEffectIds) statBonus += (partialEffects[eid] || 0);

                const allSkills = new Set();
                const allTypes = new Set();
                for (let i = 0; i < totalSlots; i++) {
                    const data = getCardData(i);
                    if (!data) continue;
                    if (data.hintSkillIds) data.hintSkillIds.forEach(s => allSkills.add(s));
                    if (data.hintSkillTypes) data.hintSkillTypes.forEach(t => allTypes.add(t));
                }

                let skillAptSum = 0;
                for (let i = 0; i < totalSlots; i++) {
                    const data = getCardData(i);
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

                // Base score — scenario weights only, NO filter/sort boosts
                const raceBreakpoint = scenarioWeightsMap[scenarioId]?.raceBreakpoint || 34;
                const normVals = {};
                for (const key of scoringKeys) {
                    const nf = metricNorms[key] || 1;
                    normVals[key] = (metrics[key] || 0) * nf;
                }
                normVals.raceBonus = scoreRaceBonus(metrics.raceBonus, raceBreakpoint);

                let baseScore = 0;
                for (const key of scoringKeys) {
                    baseScore += (normVals[key] || 0) * combinedWeights[key];
                }
                // Friendship stacking bonus
                if (maxTypeCount >= 3 && metrics.friendBonus > 0) {
                    const stackCount = Math.min(maxTypeCount - 2, 4);
                    const diminishing = stackCount <= 1 ? 1 : 1 + (stackCount - 1) * 0.6;
                    baseScore += metrics.friendBonus * (metricNorms.friendBonus || 0.29) * diminishing * 8;
                }

                // Type diversity multiplier
                baseScore *= (0.85 + computeDiversityBonus(deckTypeCounts) * 0.15);

                // Growth rate boost
                if (traineeGrowthRates && cardTypeGrowthKey) {
                    const statEffectIds = { speed: 3, stamina: 4, power: 5, guts: 6, wisdom: 7 };
                    for (let ci = 0; ci < totalSlots; ci++) {
                        const cdata = getCardData(ci);
                        if (!cdata) continue;
                        const growthKey = cardTypeGrowthKey[cdata.type];
                        if (growthKey) {
                            const rate = traineeGrowthRates[growthKey] || 0;
                            if (rate > 0) {
                                const cardStatBonus = cdata.effects[statEffectIds[growthKey]] || 0;
                                baseScore += cardStatBonus * (rate / 100) * (combinedWeights.statBonus || 35);
                            }
                        }
                    }
                }

                const aggCopy = {};
                for (const k of Object.keys(partialEffects)) aggCopy[k] = partialEffects[k];

                const friendCardId = friendType ? deckIds[totalSlots - 1] : null;
                const sortedIds = deckIds.slice().sort();
                topN.insert({
                    cardIds: deckIds.slice(),
                    score: baseScore,
                    baseScore,
                    metrics,
                    aggregated: aggCopy,
                    friendCardId,
                    _key: sortedIds.join(',')
                });
                matchesFound++;

                // Progress & live results
                if (evaluated - lastProgressUpdate >= PROGRESS_INTERVAL) {
                    lastProgressUpdate = evaluated;
                    const pct = Math.min(99, Math.round((evaluated + pruned) / totalCombos * 100));
                    log.debug(`Progress: ${pct}% | evaluated=${evaluated} pruned=${pruned} matches=${matchesFound} heapMinBase=${topN.minEntry()?.baseScore?.toFixed(1) || 'N/A'}`);
                    postMessage({ type: 'progress', progress: pct, matchCount: matchesFound });
                }
                if (matchesFound - lastLiveUpdate >= LIVE_INTERVAL) {
                    lastLiveUpdate = matchesFound;
                    postMessage({ type: 'liveResults', results: topN.toSortedArray(), matchCount: matchesFound });
                }
                return;
            }

            const slot = slots[slotIdx];
            const slotPool = slot.pool;
            const slotCache = slot.isFriend && friendCache ? friendCache : cache;
            const slotScoreMap = slot.isFriend && friendCache ? friendCardScoreContrib : cardScoreContrib;
            const startFrom = slot.slotInType === 0 ? 0 : minIndices[slotIdx];
            const eb = slotEffectBounds[slotIdx + 1];

            for (let i = startFrom; i < slotPool.length; i++) {
                if (cancelled) return;

                const cardId = slotPool[i];
                const data = slotCache[cardId];
                if (!data) continue;

                // Same-character exclusion
                if (data.charId && usedCharIds.has(data.charId)) continue;

                // ADD card (use pre-computed arrays to avoid Object.keys allocation)
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
                skillMask |= (data.skillTypeMask || 0);
                const prevUECount = ueCount;
                if (data.uniqueEffectActive) ueCount++;
                if (data.charId) usedCharIds.add(data.charId);
                const cardScore = slotScoreMap[cardId] || 0;
                partialScore += cardScore;
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
                        for (let si = 0; si < skills.length; si++) {
                            const sid = skills[si];
                            refs[sid] = (refs[sid] || 0) + 1;
                            if (refs[sid] === 1) skillTypeUniqueCounts[rType]++;
                        }
                    }
                }

                // Track required skills
                let prevFoundSkillBits = foundSkillBits;
                if (hasReqSkills) {
                    for (let rs = 0; rs < reqSkills.length; rs++) {
                        if (!(foundSkillBits & (1 << rs)) && data.hintSkillIds && data.hintSkillIds.includes(reqSkills[rs])) {
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
                if (!dominated) {
                    const localMin = topN.heap.length >= resultCount ? (topN.minEntry()?.baseScore ?? -Infinity) : -Infinity;
                    const effectiveMin = Math.max(localMin, globalMinBaseScore);
                    if (effectiveMin > -Infinity) {
                        const maxRemaining = slotScoreBounds[slotIdx + 1] || 0;
                        if (partialScore + maxRemaining < effectiveMin) {
                            dominated = true;
                        }
                    }
                }

                // PRUNE 3: required skills reachability
                if (!dominated && hasReqSkills) {
                    const allFound = (1 << reqSkills.length) - 1;
                    if (filters.requiredSkillsMode !== 'any') {
                        if (foundSkillBits !== allFound) {
                            for (let rs = 0; rs < reqSkills.length; rs++) {
                                if (foundSkillBits & (1 << rs)) continue;
                                const remainingMask = reqSkillSlotMasks[rs] >> (slotIdx + 1);
                                if (remainingMask === 0) { dominated = true; break; }
                            }
                        }
                    } else if (foundSkillBits === 0) {
                        let anyReachable = false;
                        for (let rs = 0; rs < reqSkills.length; rs++) {
                            const remainingMask = reqSkillSlotMasks[rs] >> (slotIdx + 1);
                            if (remainingMask !== 0) { anyReachable = true; break; }
                        }
                        if (!anyReachable) dominated = true;
                    }
                }

                // PRUNE 4: skill type mask
                if (!dominated && requiredSkillTypeMask && slotIdx === totalSlots - 1) {
                    if ((skillMask & requiredSkillTypeMask) !== requiredSkillTypeMask) {
                        dominated = true;
                    }
                }

                if (dominated) {
                    pruned++;
                    evaluated++;
                    distEvaluated++;
                    if (evaluated - lastProgressUpdate >= PROGRESS_INTERVAL) {
                        lastProgressUpdate = evaluated;
                        postMessage({ type: 'progress', progress: Math.min(99, Math.round((evaluated + pruned) / totalCombos * 100)), matchCount: matchesFound });
                    }
                } else {
                    // Set ascending constraint for next slot of same type
                    if (slotIdx + 1 < totalSlots && slots[slotIdx + 1].type === slot.type) {
                        minIndices[slotIdx + 1] = i + 1;
                    }
                    dfsSlot(slotIdx + 1);
                }

                // BACKTRACK
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
                        for (let si = 0; si < skills.length; si++) {
                            const sid = skills[si];
                            refs[sid]--;
                            if (refs[sid] === 0) {
                                skillTypeUniqueCounts[rType]--;
                                delete refs[sid];
                            }
                        }
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

    return { topN, totalCombos, evaluated, pruned, matchesFound, elapsed: Math.round(performance.now() - startTime) };
}

// ===== MESSAGE HANDLER =====

self.onmessage = function(e) {
    const msg = e.data;

    if (msg.type === 'cancel') {
        cancelled = true;
        return;
    }

    if (msg.type === 'updateMinScore') {
        // Cross-worker min-score broadcasting for tighter PRUNE 2
        if (msg.minScore > globalMinBaseScore) {
            globalMinBaseScore = msg.minScore;
        }
        return;
    }

    if (msg.type === 'start') {
        cancelled = false;
        globalMinBaseScore = -Infinity;

        if (msg.debugConfig) _debug.applyConfig(msg.debugConfig);

        log.info('Search starting', {
            distributions: msg.payload.validDists.length,
            totalCombos: msg.payload.totalCombos,
            cacheSize: Object.keys(msg.payload.cache).length,
            initialSeeds: (msg.payload.initialSeeds || []).length
        });

        try {
            const result = runBranchAndBound(msg.payload);
            log.info('Search complete', {
                evaluated: result.evaluated,
                pruned: result.pruned,
                matches: result.matchesFound,
                elapsed: result.elapsed + 'ms'
            });
            postMessage({
                type: 'complete',
                results: result.topN.toSortedArray(),
                stats: { totalCombos: result.totalCombos, evaluated: result.evaluated, pruned: result.pruned, elapsed: result.elapsed }
            });
        } catch (err) {
            log.error('Search error', err.message);
            postMessage({ type: 'error', message: err.message });
        }
    }
};
