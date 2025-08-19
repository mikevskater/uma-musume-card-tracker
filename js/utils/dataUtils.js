// Data Processing Utilities
// Centralized functions for calculations, formatting, and data manipulation

// ===== EFFECT CALCULATIONS =====

// Calculate effect value at specific level with caching
const effectValueCache = new Map();

function calculateEffectValue(effectArray, level) {
    if (!effectArray || effectArray.length < 2) return 0;
    
    const cacheKey = `${effectArray[0]}-${level}`;
    if (effectValueCache.has(cacheKey)) {
        return effectValueCache.get(cacheKey);
    }
    
    const [effectId, ...values] = effectArray;
    const levelMap = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    
    // Find the appropriate values to interpolate between
    let prevIndex = 0;
    let prevLevel = 1;
    let prevValue = values[0];
    
    for (let i = 0; i < levelMap.length; i++) {
        if (values[i] !== -1 && levelMap[i] <= level) {
            prevIndex = i;
            prevLevel = levelMap[i];
            prevValue = values[i];
        }
    }
    
    // Find next valid value
    let nextLevel = prevLevel;
    let nextValue = prevValue;
    
    for (let i = prevIndex + 1; i < levelMap.length; i++) {
        if (values[i] !== -1) {
            nextLevel = levelMap[i];
            nextValue = values[i];
            break;
        }
    }
    
    // Calculate result
    let result;
    if (level === prevLevel) {
        result = prevValue;
    } else if (level === nextLevel) {
        result = nextValue;
    } else if (nextLevel > prevLevel) {
        const ratio = (level - prevLevel) / (nextLevel - prevLevel);
        result = Math.round(prevValue + (nextValue - prevValue) * ratio);
    } else {
        result = prevValue;
    }
    
    effectValueCache.set(cacheKey, result);
    return result;
}

// Check if effect is locked at current level
function isEffectLocked(effectArray, level) {
    if (!effectArray || effectArray.length < 2) return true;
    
    const [effectId, ...values] = effectArray;
    const levelMap = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    
    for (let i = 0; i < levelMap.length; i++) {
        if (values[i] !== -1 && levelMap[i] <= level) {
            return false;
        }
    }
    return true;
}

// ===== LEVEL CALCULATIONS =====

// Limit break requirements by rarity
const limitBreaks = {
    1: [1, 25, 30, 35, 40],  // R
    2: [1, 30, 35, 40, 45],  // SR
    3: [1, 35, 40, 45, 50]   // SSR
};

// Calculate limit break level based on card level and rarity
function getLimitBreakLevel(level, rarity) {
    const breaks = limitBreaks[rarity];
    if (!breaks) return 0;
    
    for (let i = breaks.length - 1; i >= 0; i--) {
        if (level >= breaks[i]) {
            return i;
        }
    }
    return 0;
}

// Get effective level for a card (considering ownership, global LB, and display mode)
function getEffectiveLevel(card) {
    const cardId = card.support_id;
    
    // If global limit break is set
    if (globalLimitBreakLevel !== null) {
        if (globalLimitBreakOverrideOwned || !isCardOwned(cardId)) {
            return limitBreaks[card.rarity][globalLimitBreakLevel];
        }
    }
    
    // If card is owned, use owned card level/limit break
    if (isCardOwned(cardId)) {
        const currentLevel = getOwnedCardLevel(cardId);
        const currentLimitBreak = getOwnedCardLimitBreak(cardId);
        
        if (showMaxPotentialLevels) {
            return limitBreaks[card.rarity][currentLimitBreak];
        } else {
            return currentLevel;
        }
    }
    
    // Default to LB 2 for unowned cards
    return limitBreaks[card.rarity][2];
}

// ===== DATA FORMATTING =====

// Format display names
function getTypeDisplayName(type) {
    const typeMap = {
        'speed': 'Speed',
        'stamina': 'Stamina', 
        'power': 'Power',
        'guts': 'Guts',
        'wisdom': 'Wit',
        'intelligence': 'Wit',
        'friend': 'Friend'
    };
    return typeMap[type] || type;
}

// Get effect name with fallback
function getEffectName(effectId) {
    return effectsData[effectId]?.name_en || `Effect ${effectId}`;
}

// Get skill name with fallback
function getSkillName(skillId) {
    return skillsData[skillId]?.name_en || skillsData[skillId]?.enname || `Skill ${skillId}`;
}

// Get skill description
function getSkillDescription(skillId) {
    return skillsData[skillId]?.desc_en || skillsData[skillId]?.endesc || '';
}

// Get skill type description
function getSkillTypeDescription(typeId) {
    return skillTypesData[typeId] || typeId;
}

// ===== CARD DATA PROCESSING =====

// Get priority effects for display based on sort configuration
function getPriorityEffects(card, targetCount = 4, overrideLevel = null) {
    const cardLevel = overrideLevel !== null ? overrideLevel : getEffectiveLevel(card);
    const priorityEffects = [];
    const usedEffectIds = new Set();
    
    // Add effects from sort configuration first (only if unlocked)
    multiSort.forEach(sort => {
        if (sort.category === 'effect' && sort.option && !usedEffectIds.has(parseInt(sort.option))) {
            const effectArray = card.effects?.find(effect => effect[0] == sort.option);
            if (effectArray && !isEffectLocked(effectArray, cardLevel)) {
                const value = calculateEffectValue(effectArray, cardLevel);
                const effectName = getEffectName(sort.option);
                const symbol = effectsData[sort.option]?.symbol === 'percent' ? '%' : '';
                priorityEffects.push(`${effectName}: ${value}${symbol}`);
                usedEffectIds.add(parseInt(sort.option));
            }
        }
    });
    
    // Fill remaining slots with highest value effects not already included
    if (priorityEffects.length < targetCount && card.effects) {
        const remainingEffects = card.effects
            .filter(effect => effect[0] && effectsData[effect[0]] && !usedEffectIds.has(effect[0]))
            .filter(effect => !isEffectLocked(effect, cardLevel))
            .map(effect => {
                const value = calculateEffectValue(effect, cardLevel);
                const effectName = getEffectName(effect[0]);
                const symbol = effectsData[effect[0]].symbol === 'percent' ? '%' : '';
                return {
                    display: `${effectName}: ${value}${symbol}`,
                    value: value,
                    effectId: effect[0]
                };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, targetCount - priorityEffects.length);
        
        remainingEffects.forEach(effect => {
            priorityEffects.push(effect.display);
        });
    }
    
    return priorityEffects;
}

// Get all skill types from a card
function getCardSkillTypes(card) {
    const skillTypes = new Set();
    
    // Check hint skills
    if (card.hints?.hint_skills) {
        card.hints.hint_skills.forEach(skill => {
            if (skill.type && Array.isArray(skill.type)) {
                skill.type.forEach(type => skillTypes.add(type));
            }
        });
    }
    
    // Check event skills
    if (card.event_skills) {
        card.event_skills.forEach(skill => {
            if (skill.type && Array.isArray(skill.type)) {
                skill.type.forEach(type => skillTypes.add(type));
            }
        });
    }
    
    return Array.from(skillTypes);
}

// ===== RANGE CALCULATIONS =====

// Calculate min/max effect values for filtered cards
function calculateEffectRanges(cards) {
    const ranges = {};
    
    const availableEffects = Object.values(effectsData)
        .filter(effect => effect.name_en)
        .map(effect => effect.id);
    
    availableEffects.forEach(effectId => {
        const values = [];
        
        cards.forEach(card => {
            const effectArray = card.effects?.find(effect => effect[0] == effectId);
            if (effectArray) {
                const level = getEffectiveLevel(card);
                const value = calculateEffectValue(effectArray, level);
                if (value > 0) {
                    values.push(value);
                }
            }
        });
        
        if (values.length > 0) {
            ranges[effectId] = {
                min: Math.min(...values),
                max: Math.max(...values)
            };
        } else {
            ranges[effectId] = { min: 0, max: 0 };
        }
    });
    
    return ranges;
}

// Calculate skill counts for filtered cards
function calculateSkillCounts(cards) {
    const hintSkillCounts = {};
    const eventSkillCounts = {};
    const skillTypeCounts = {};
    
    cards.forEach(card => {
        // Count hint skills
        if (card.hints?.hint_skills) {
            card.hints.hint_skills.forEach(skill => {
                hintSkillCounts[skill.id] = (hintSkillCounts[skill.id] || 0) + 1;
                
                if (skill.type && Array.isArray(skill.type)) {
                    skill.type.forEach(type => {
                        skillTypeCounts[type] = (skillTypeCounts[type] || 0) + 1;
                    });
                }
            });
        }
        
        // Count event skills
        if (card.event_skills) {
            card.event_skills.forEach(skill => {
                eventSkillCounts[skill.id] = (eventSkillCounts[skill.id] || 0) + 1;
                
                if (skill.type && Array.isArray(skill.type)) {
                    skill.type.forEach(type => {
                        skillTypeCounts[type] = (skillTypeCounts[type] || 0) + 1;
                    });
                }
            });
        }
    });
    
    return { hintSkillCounts, eventSkillCounts, skillTypeCounts };
}

// ===== EVENT EFFECT FORMATTING =====

// Format event effects for display
function formatEventEffects(effects) {
    if (!effects || effects.length === 0) return 'No effects';
    
    return effects.map(effect => {
        const [type, value, skillId] = effect;
        
        const effectMap = {
            'sp': `Speed ${value}`,
            'st': `Stamina ${value}`,
            'po': `Power ${value}`,
            'pt': `Skill Points ${value}`,
            'gu': `Guts ${value}`,
            'in': `Wit ${value}`,
            'en': `Energy ${value}`,
            'mo': `Mood ${value}`,
            'bo': `Bond ${value}`,
            'me': `Maximum Energy ${value}`,
            'sk': `Skill: ${getSkillName(skillId)}`,
            '5s': `All Stats ${value}`,
            'rs': `Random Stats (${value})`,
            'sg': `Obtain Skill: ${getSkillName(skillId)}`,
            'sre': `Lose Skill: ${getSkillName(skillId)}`,
            'srh': `Strategy Related Hint (${value || 1})`,
            'sr': `Skill Hint: ${getSkillName(skillId)} hint ${value}`,
            'bo_l': `Bond Low ${value}`,
            'fa': `Fans ${value}`,
            'ct': `${value}`,
            'ha': 'Heal All Statuses',
            'hp': `Heal Status: ${getSkillName(skillId)}`,
            'nsl': 'Not Scenario Linked',
            'ps_h': `Condition Healed: ${getSkillName(skillId)}`,
            'ps_nh': `Condition Not Healed: ${getSkillName(skillId)}`,
            'pa': `Passion ${value}`,
            'mn': `Mental ${value}`,
            'rf': 'Red Fragment',
            'bf': 'Blue Fragment',
            'yf': 'Yellow Fragment',
            'wl_e': `Win Level Exact: ${value}`,
            'wl_l': `Win Level Less: ${value}`,
            'wl_c': `Win Level Combined: ${value}`,
            'app': `Aptitude Points ${value}`,
            'ntsr': `NTSR ${value}`,
            'ls': `Last Trained Stat: ${value}`,
            'mt': `Minimum Token: ${value}`,
            'ee': 'Event Chain Ended',
            'ds': 'Can Start Dating',
            'rr': 'Normal Race Rewards',
            'fe': 'Full Energy',
            'no': 'Nothing Happens'
        };
        
        return effectMap[type] || `${type}: ${value}`;
    }).join(', ');
}

// ===== EXPORTS =====

// Export all utility functions to global scope for compatibility
window.DataUtils = {
    calculateEffectValue,
    isEffectLocked,
    getLimitBreakLevel,
    getEffectiveLevel,
    getTypeDisplayName,
    getEffectName,
    getSkillName,
    getSkillDescription,
    getSkillTypeDescription,
    getPriorityEffects,
    getCardSkillTypes,
    calculateEffectRanges,
    calculateSkillCounts,
    formatEventEffects,
    limitBreaks
};

// Also export individual functions to global scope for backward compatibility
Object.assign(window, window.DataUtils);