// Deck Finder Web Worker
// Self-contained search computation — no DOM or window references
// Card-by-card DFS with mutable state — zero allocations in the hot loop

'use strict';

let cancelled = false;

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
    skillAptitude: undefined,
    totalEffectSum: null
};

function buildSlotScoreBounds(slotEffectBounds, combinedWeights) {
    const n = slotEffectBounds.length;
    const scoreBounds = new Array(n);

    for (let i = 0; i < n; i++) {
        const eb = slotEffectBounds[i];
        let maxScore = 0;

        const METRIC_NORM = {
            raceBonus: 1, trainingEff: 1, friendBonus: 1,
            energyCost: 1, eventRecovery: 1,
            statBonus: 1/5, hintSkillCount: 3, skillTypeCount: 3,
            totalEffectSum: 1/10, uniqueEffects: 5, skillAptitude: 5
        };

        for (const [metricKey, weight] of Object.entries(combinedWeights)) {
            if (weight === 0) continue;
            const norm = METRIC_NORM[metricKey] || 1;
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
        if (friendMax > 0) maxScore += friendMax * 4 * 20;

        scoreBounds[i] = maxScore;
    }

    return scoreBounds;
}

function runBranchAndBound(payload) {
    const {
        cache, groups, maxTable, validDists, totalCombos,
        filters, resultCount, scenarioWeights: scenarioWeightsMap,
        statBonusEffectIds, skillTypeBitMap, traineeData, cardTypeGrowthKey
    } = payload;

    const topN = new MinHeap(resultCount);
    let evaluated = 0;
    let pruned = 0;
    let matchesFound = 0;
    let lastProgressUpdate = 0;
    let lastLiveUpdate = 0;
    const startTime = performance.now();
    const PROGRESS_INTERVAL = 50000;
    const LIVE_INTERVAL = 10;

    const scenarioId = filters.scenario || '1';
    const sw = scenarioWeightsMap[scenarioId]?.weights || scenarioWeightsMap['1'].weights;

    // Build threshold checks
    const thresholdChecks = [];
    if (filters.minRaceBonus > 0) thresholdChecks.push({ effectId: '15', threshold: filters.minRaceBonus });
    if (filters.minTrainingEff > 0) thresholdChecks.push({ effectId: '8', threshold: filters.minTrainingEff });
    if (filters.minFriendBonus > 0) thresholdChecks.push({ effectId: '1', threshold: filters.minFriendBonus });
    if (filters.minEnergyCost > 0) thresholdChecks.push({ effectId: '28', threshold: filters.minEnergyCost });
    if (filters.minEventRecovery > 0) thresholdChecks.push({ effectId: '25', threshold: filters.minEventRecovery });

    const requiredSkillTypeMask = buildRequiredSkillTypeMask(filters.requiredSkillTypes, skillTypeBitMap);

    // Precompute scoring weights
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
    // Sort layer boosts from main thread
    const sortBoosts = payload.sortBoosts || {};
    for (const [key, val] of Object.entries(sortBoosts)) {
        filterBoosts[key] = (filterBoosts[key] || 0) + val;
    }
    const scoringKeys = Object.keys(sw);
    const combinedWeights = {};
    for (const key of scoringKeys) {
        combinedWeights[key] = (sw[key] || 0) + (filterBoosts[key] || 0);
    }

    // Precompute per-card score contribution (with normalization)
    const METRIC_NORM_W = {
        raceBonus: 1, trainingEff: 1, friendBonus: 1,
        energyCost: 1, eventRecovery: 1,
        statBonus: 1/5, hintSkillCount: 3, skillTypeCount: 3,
        totalEffectSum: 1/10, uniqueEffects: 5, skillAptitude: 5
    };
    const effectWeightMap = {};
    let totalEffectSumWeight = 0;
    const skillAptWeight = (combinedWeights.skillAptitude || 0) * (METRIC_NORM_W.skillAptitude || 1);
    for (const [metricKey, weight] of Object.entries(combinedWeights)) {
        if (weight === 0) continue;
        const norm = METRIC_NORM_W[metricKey] || 1;
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

    const cardScoreContrib = {};
    for (const [cardId, data] of Object.entries(cache)) {
        let cs = 0;
        for (const [eid, val] of Object.entries(data.effects)) {
            cs += val * (effectWeightMap[eid] || 0);
            cs += val * totalEffectSumWeight;
        }
        // Growth rate multiplier
        if (traineeGrowthRates && cardTypeGrowthKey) {
            const growthKey = cardTypeGrowthKey[data.type];
            if (growthKey) {
                const rate = traineeGrowthRates[growthKey] || 0;
                cs *= (1 + rate / 100);
            }
        }
        // Skill-aptitude contribution
        if (data.skillAptitudeScore > 0 && skillAptWeight > 0) {
            cs += data.skillAptitudeScore * skillAptWeight;
        }
        cardScoreContrib[cardId] = cs;
    }

    // Mutable state
    const deckIds = [];
    const partialEffects = {};
    const usedCharIds = new Set();
    let skillMask = 0;
    let ueCount = 0;
    let partialScore = 0;

    for (const { dist } of validDists) {
        if (cancelled) break;

        const typeEntries = Object.entries(dist)
            .filter(([, count]) => count > 0)
            .sort((a, b) => (groups[a[0]]?.length || 0) - (groups[b[0]]?.length || 0));

        if (typeEntries.some(([type, count]) => (groups[type]?.length || 0) < count)) continue;

        // Build flat slot plan
        const slots = [];
        for (const [type, count] of typeEntries) {
            const pool = (groups[type] || []).map(c => c.support_id);
            for (let s = 0; s < count; s++) {
                slots.push({ pool, type, slotInType: s });
            }
        }
        const totalSlots = slots.length;
        const slotEffectBounds = buildSlotEffectBounds(slots, maxTable);
        const slotScoreBounds = buildSlotScoreBounds(slotEffectBounds, combinedWeights);
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
        foundSkillBits = 0;

        dfsSlot(0);

        function dfsSlot(slotIdx) {
            if (cancelled) return;

            if (slotIdx === totalSlots) {
                evaluated++;

                // Skill-based hard filters
                if (filters.requiredSkills.length > 0) {
                    const deckSkills = new Set();
                    for (let i = 0; i < 6; i++) {
                        const data = cache[deckIds[i]];
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
                    for (let i = 0; i < 6; i++) {
                        const data = cache[deckIds[i]];
                        if (data && data.hintSkillIds) data.hintSkillIds.forEach(s => allSkills.add(s));
                    }
                    if (allSkills.size < filters.minHintSkills) return;
                }

                if (filters.minUniqueEffects > 0 && ueCount < filters.minUniqueEffects) return;

                // Skill type count check (layers with min counts)
                if (filters.requiredSkillTypes.length > 0) {
                    const stCounts = {};
                    for (let i = 0; i < 6; i++) {
                        const data = cache[deckIds[i]];
                        if (data && data.hintSkillTypes) data.hintSkillTypes.forEach(t => {
                            stCounts[t] = (stCounts[t] || 0) + 1;
                        });
                    }
                    for (const req of filters.requiredSkillTypes) {
                        const rt = typeof req === 'object' ? req.type : req;
                        const rm = typeof req === 'object' ? (req.min || 1) : 1;
                        if ((stCounts[rt] || 0) < rm) return;
                    }
                }

                // Score
                let statBonus = 0;
                for (const eid of statBonusEffectIds) statBonus += (partialEffects[eid] || 0);

                const allSkills = new Set();
                const allTypes = new Set();
                const typeCounts = {};
                for (let i = 0; i < 6; i++) {
                    const data = cache[deckIds[i]];
                    if (!data) continue;
                    if (data.hintSkillIds) data.hintSkillIds.forEach(s => allSkills.add(s));
                    if (data.hintSkillTypes) data.hintSkillTypes.forEach(t => allTypes.add(t));
                    typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
                }

                let totalEffectSum = 0;
                for (const k of Object.keys(partialEffects)) totalEffectSum += partialEffects[k];

                // Skill-aptitude sum
                let skillAptSum = 0;
                for (let i = 0; i < 6; i++) {
                    const data = cache[deckIds[i]];
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

                // Normalize for scoring
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

                // Growth rate boost
                if (traineeGrowthRates && cardTypeGrowthKey) {
                    const statEffectIds = { speed: 3, stamina: 4, power: 5, guts: 6, wisdom: 7 };
                    for (let ci = 0; ci < 6; ci++) {
                        const cdata = cache[deckIds[ci]];
                        if (!cdata) continue;
                        const growthKey = cardTypeGrowthKey[cdata.type];
                        if (growthKey) {
                            const rate = traineeGrowthRates[growthKey] || 0;
                            if (rate > 0) {
                                const cardStatBonus = cdata.effects[statEffectIds[growthKey]] || 0;
                                score += cardStatBonus * (rate / 100) * (combinedWeights.statBonus || 40);
                            }
                        }
                    }
                }

                const aggCopy = {};
                for (const k of Object.keys(partialEffects)) aggCopy[k] = partialEffects[k];

                topN.insert({ cardIds: deckIds.slice(), score, metrics, aggregated: aggCopy });
                matchesFound++;

                // Progress & live results
                if (evaluated - lastProgressUpdate >= PROGRESS_INTERVAL) {
                    lastProgressUpdate = evaluated;
                    postMessage({ type: 'progress', progress: Math.min(99, Math.round((evaluated + pruned) / totalCombos * 100)), matchCount: matchesFound });
                }
                if (matchesFound - lastLiveUpdate >= LIVE_INTERVAL) {
                    lastLiveUpdate = matchesFound;
                    postMessage({ type: 'liveResults', results: topN.toSortedArray(), matchCount: matchesFound });
                }
                return;
            }

            const slot = slots[slotIdx];
            const pool = slot.pool;
            const startFrom = slot.slotInType === 0 ? 0 : minIndices[slotIdx];
            const eb = slotEffectBounds[slotIdx + 1];

            for (let i = startFrom; i < pool.length; i++) {
                if (cancelled) return;

                const cardId = pool[i];
                const data = cache[cardId];
                if (!data) continue;

                // Same-character exclusion
                if (data.charId && usedCharIds.has(data.charId)) continue;

                // ADD card
                const cardEffects = data.effects;
                const effectKeys = Object.keys(cardEffects);
                for (let e = 0; e < effectKeys.length; e++) {
                    const eid = effectKeys[e];
                    partialEffects[eid] = (partialEffects[eid] || 0) + cardEffects[eid];
                }
                const prevSkillMask = skillMask;
                skillMask |= (data.skillTypeMask || 0);
                const prevUECount = ueCount;
                if (data.uniqueEffectActive) ueCount++;
                if (data.charId) usedCharIds.add(data.charId);
                const cardScore = cardScoreContrib[cardId] || 0;
                partialScore += cardScore;
                deckIds.push(cardId);

                // Track required skills
                let prevFoundSkillBits = foundSkillBits;
                if (hasReqSkills) {
                    for (let rs = 0; rs < reqSkills.length; rs++) {
                        if (!(foundSkillBits & (1 << rs)) && data.hintSkillIds && data.hintSkillIds.includes(reqSkills[rs])) {
                            foundSkillBits |= (1 << rs);
                        }
                    }
                }

                // PRUNE 1: feasibility
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

                // PRUNE 2: optimality — can't beat worst in top-N
                if (!dominated && topN.heap.length >= resultCount) {
                    const maxRemaining = slotScoreBounds[slotIdx + 1] || 0;
                    if (partialScore + maxRemaining < topN.minScore()) {
                        dominated = true;
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

    return { topN, totalCombos, evaluated, pruned, matchesFound, elapsed: Math.round(performance.now() - startTime) };
}

// ===== MESSAGE HANDLER =====

self.onmessage = function(e) {
    const msg = e.data;

    if (msg.type === 'cancel') {
        cancelled = true;
        return;
    }

    if (msg.type === 'start') {
        cancelled = false;

        try {
            const result = runBranchAndBound(msg.payload);
            postMessage({
                type: 'complete',
                results: result.topN.toSortedArray(),
                stats: { totalCombos: result.totalCombos, evaluated: result.evaluated, pruned: result.pruned, elapsed: result.elapsed }
            });
        } catch (err) {
            postMessage({ type: 'error', message: err.message });
        }
    }
};
