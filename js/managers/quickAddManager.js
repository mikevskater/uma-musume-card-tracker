// Quick Add Manager
// State management, navigation, filtering/sorting, undo, and save coordination

// ===== STATE =====

let quickAddState = {
    isOpen: false,
    screen: 'setup',
    cards: [],
    currentIndex: 0,
    skipMLB: false,
    changeHistory: [],
    totalModified: 0,
    modifiedCardIds: new Set(),
    selectedTypes: ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend', 'group'],
    selectedRarities: [1, 2, 3],
    ownershipFilter: 'all',
    sortOrder: 'alpha',
    sortDirection: 'asc'
};

const QUICK_ADD_SORT_DEFAULT_DIRECTION = {
    alpha: 'asc',
    type: 'asc',
    rarity: 'desc',
    release: 'desc'
};

// ===== OPEN / CLOSE =====

function openQuickAdd() {
    // Reset state
    quickAddState.isOpen = true;
    quickAddState.screen = 'setup';
    quickAddState.cards = [];
    quickAddState.currentIndex = 0;
    quickAddState.skipMLB = false;
    quickAddState.changeHistory = [];
    quickAddState.totalModified = 0;
    quickAddState.modifiedCardIds = new Set();
    quickAddState.selectedTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend', 'group'];
    quickAddState.selectedRarities = [1, 2, 3];
    quickAddState.ownershipFilter = 'all';
    quickAddState.sortOrder = 'alpha';
    quickAddState.sortDirection = QUICK_ADD_SORT_DEFAULT_DIRECTION.alpha;

    renderQuickAddSetup();

    const overlay = document.getElementById('quickAddOverlay');
    if (overlay) {
        overlay.classList.add('active');
    }
    document.body.style.overflow = 'hidden';

    // Add keyboard listener
    document.addEventListener('keydown', handleQuickAddKeydown);
}

function closeQuickAdd() {
    const modified = quickAddState.totalModified;
    quickAddState.isOpen = false;

    const overlay = document.getElementById('quickAddOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    document.body.style.overflow = '';

    // Remove keyboard listener
    document.removeEventListener('keydown', handleQuickAddKeydown);

    // Refresh main table
    if (typeof filterAndSortCards === 'function') {
        filterAndSortCards();
    }

    // Show summary toast
    if (modified > 0) {
        showToast(`Saved ${modified} card${modified !== 1 ? 's' : ''}`, 'success');
    }
}

function cancelQuickAdd() {
    // Revert all changes by replaying history in reverse
    while (quickAddState.changeHistory.length > 0) {
        const entry = quickAddState.changeHistory.pop();
        const { cardId, prev } = entry;

        if (prev.owned) {
            setCardOwnership(cardId, true);
            if (prev.lb !== null) setOwnedCardLimitBreak(cardId, prev.lb);
            if (prev.level !== null) setOwnedCardLevel(cardId, prev.level);
        } else {
            setCardOwnership(cardId, false);
        }
    }

    quickAddState.isOpen = false;

    const overlay = document.getElementById('quickAddOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    document.body.style.overflow = '';

    document.removeEventListener('keydown', handleQuickAddKeydown);

    if (typeof filterAndSortCards === 'function') {
        filterAndSortCards();
    }

    showToast('Changes cancelled', 'warning');
}

// ===== SETUP SCREEN LOGIC =====

function toggleQuickAddType(type) {
    const idx = quickAddState.selectedTypes.indexOf(type);
    if (idx >= 0) {
        quickAddState.selectedTypes.splice(idx, 1);
    } else {
        quickAddState.selectedTypes.push(type);
    }
    updateQuickAddSetupUI();
}

function toggleQuickAddRarity(rarity) {
    const idx = quickAddState.selectedRarities.indexOf(rarity);
    if (idx >= 0) {
        quickAddState.selectedRarities.splice(idx, 1);
    } else {
        quickAddState.selectedRarities.push(rarity);
    }
    updateQuickAddSetupUI();
}

function selectAllQuickAddTypes() {
    quickAddState.selectedTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend', 'group'];
    updateQuickAddSetupUI();
}

function deselectAllQuickAddTypes() {
    quickAddState.selectedTypes = [];
    updateQuickAddSetupUI();
}

function selectAllQuickAddRarities() {
    quickAddState.selectedRarities = [1, 2, 3];
    updateQuickAddSetupUI();
}

function deselectAllQuickAddRarities() {
    quickAddState.selectedRarities = [];
    updateQuickAddSetupUI();
}

function setQuickAddOwnershipFilter(value) {
    quickAddState.ownershipFilter = value;
    updateQuickAddSetupUI();
}

function setQuickAddSortOrder(value) {
    quickAddState.sortOrder = value;
    // Smart default direction when category changes
    quickAddState.sortDirection = QUICK_ADD_SORT_DEFAULT_DIRECTION[value] || 'asc';
    updateQuickAddSetupUI();
}

function setQuickAddSortDirection(dir) {
    quickAddState.sortDirection = dir === 'asc' ? 'asc' : 'desc';
}

function resortQuickAddCards() {
    const curId = quickAddState.cards[quickAddState.currentIndex]?.support_id;
    quickAddState.cards = sortQuickAddCards(quickAddState.cards);
    if (curId !== undefined) {
        const newIdx = quickAddState.cards.findIndex(c => c.support_id === curId);
        quickAddState.currentIndex = newIdx >= 0 ? newIdx : 0;
    }
}

// ===== CARD FILTERING & SORTING =====

function getQuickAddMatchingCards() {
    let cards = cardData.filter(card => {
        // Global release only — JP-only cards lack a start_date
        if (!card.start_date) return false;

        // Type filter
        if (!quickAddState.selectedTypes.includes(card.type)) return false;

        // Rarity filter
        if (!quickAddState.selectedRarities.includes(card.rarity)) return false;

        // Ownership filter
        if (quickAddState.ownershipFilter === 'owned' && !isCardOwned(card.support_id)) return false;
        if (quickAddState.ownershipFilter === 'unowned' && isCardOwned(card.support_id)) return false;

        return true;
    });

    // Sort
    cards = sortQuickAddCards(cards);

    return cards;
}

function getQuickAddCardName(card) {
    return card.char_name || '';
}

function sortQuickAddCards(cards) {
    const order = quickAddState.sortOrder;
    const sign = quickAddState.sortDirection === 'asc' ? 1 : -1;
    return cards.slice().sort((a, b) => {
        switch (order) {
            case 'alpha': {
                const nameDiff = getQuickAddCardName(a).localeCompare(getQuickAddCardName(b));
                if (nameDiff !== 0) return nameDiff * sign;
                return b.rarity - a.rarity;
            }
            case 'type': {
                const typeOrder = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend', 'group'];
                const diff = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
                if (diff !== 0) return diff * sign;
                return getQuickAddCardName(a).localeCompare(getQuickAddCardName(b));
            }
            case 'rarity': {
                const diff = a.rarity - b.rarity;
                if (diff !== 0) return diff * sign;
                return getQuickAddCardName(a).localeCompare(getQuickAddCardName(b));
            }
            case 'release': {
                const dateA = a.start_date || '';
                const dateB = b.start_date || '';
                const dateDiff = dateA.localeCompare(dateB);
                if (dateDiff !== 0) return dateDiff * sign;
                const nameDiff = getQuickAddCardName(a).localeCompare(getQuickAddCardName(b));
                if (nameDiff !== 0) return nameDiff;
                return b.rarity - a.rarity;
            }
            default:
                return 0;
        }
    });
}

function getQuickAddCardCount() {
    return getQuickAddMatchingCards().length;
}

// ===== START CARD VIEW =====

function startQuickAddCards() {
    const cards = getQuickAddMatchingCards();
    if (cards.length === 0) return;

    quickAddState.cards = cards;
    quickAddState.currentIndex = 0;
    quickAddState.screen = 'cards';

    renderQuickAddCardView();
    renderQuickAddCard(0);
    ensureQuickAddVisible();
}

// ===== NAVIGATION =====

function navigateQuickAdd(direction) {
    if (quickAddState.cards.length === 0) return;

    let newIndex = quickAddState.currentIndex;
    const total = quickAddState.cards.length;

    if (isQuickAddSkipActive()) {
        // Find next card that doesn't match the skip filters
        let attempts = 0;
        do {
            newIndex = (newIndex + direction + total) % total;
            attempts++;
            // Prevent infinite loop if all cards match the skip filters
            if (attempts >= total) {
                newIndex = (quickAddState.currentIndex + direction + total) % total;
                break;
            }
        } while (shouldSkipQuickAddCard(quickAddState.cards[newIndex]));
    } else {
        newIndex = (newIndex + direction + total) % total;
    }

    quickAddState.currentIndex = newIndex;
    renderQuickAddCard(newIndex);
}

function setQuickAddSkipMLB(skip) {
    quickAddState.skipMLB = skip;
}

function shouldSkipQuickAddCard(card) {
    if (!card) return false;
    const cardId = card.support_id;
    const owned = isCardOwned(cardId);
    if (quickAddState.skipMLB && owned && getOwnedCardLimitBreak(cardId) === 4) return true;
    if (quickAddState.ownershipFilter === 'owned' && !owned) return true;
    if (quickAddState.ownershipFilter === 'unowned' && owned) return true;
    return false;
}

function isQuickAddSkipActive() {
    return quickAddState.skipMLB || quickAddState.ownershipFilter !== 'all';
}

function getQuickAddVisibleCount() {
    if (!isQuickAddSkipActive()) return quickAddState.cards.length;
    let n = 0;
    for (const card of quickAddState.cards) {
        if (!shouldSkipQuickAddCard(card)) n++;
    }
    return n;
}

function ensureQuickAddVisible() {
    if (!isQuickAddSkipActive()) return false;
    if (quickAddState.cards.length === 0) return false;
    const cur = quickAddState.cards[quickAddState.currentIndex];
    if (!cur || !shouldSkipQuickAddCard(cur)) return false;
    navigateQuickAdd(1);
    return true;
}

function getQuickAddVisiblePosition() {
    if (!isQuickAddSkipActive()) return quickAddState.currentIndex + 1;
    const curCard = quickAddState.cards[quickAddState.currentIndex];
    if (!curCard || shouldSkipQuickAddCard(curCard)) return 0;
    let pos = 0;
    for (let i = 0; i <= quickAddState.currentIndex; i++) {
        if (!shouldSkipQuickAddCard(quickAddState.cards[i])) pos++;
    }
    return pos;
}

// ===== CARD OPERATIONS =====

function quickAddSetOwnership(owned) {
    const card = quickAddState.cards[quickAddState.currentIndex];
    if (!card) return;

    const cardId = card.support_id;
    const wasOwned = isCardOwned(cardId);

    // Save undo state
    const prevState = wasOwned
        ? { owned: true, lb: getOwnedCardLimitBreak(cardId), level: getOwnedCardLevel(cardId) }
        : { owned: false, lb: null, level: null };

    setCardOwnership(cardId, owned);

    const newState = owned
        ? { owned: true, lb: getOwnedCardLimitBreak(cardId), level: getOwnedCardLevel(cardId) }
        : { owned: false, lb: null, level: null };

    pushQuickAddHistory(cardId, prevState, newState);

    // Track modified
    if (!quickAddState.modifiedCardIds.has(cardId)) {
        quickAddState.modifiedCardIds.add(cardId);
        quickAddState.totalModified++;
    }

    updateQuickAddCardControls();
}

function quickAddSetLimitBreak(lb) {
    const card = quickAddState.cards[quickAddState.currentIndex];
    if (!card) return;

    const cardId = card.support_id;
    if (!isCardOwned(cardId)) return;

    const prevLB = getOwnedCardLimitBreak(cardId);
    const prevLevel = getOwnedCardLevel(cardId);

    const result = setOwnedCardLimitBreak(cardId, lb);

    const newLevel = result ? result.newLevel : prevLevel;

    pushQuickAddHistory(cardId,
        { owned: true, lb: prevLB, level: prevLevel },
        { owned: true, lb: lb, level: newLevel }
    );

    if (!quickAddState.modifiedCardIds.has(cardId)) {
        quickAddState.modifiedCardIds.add(cardId);
        quickAddState.totalModified++;
    }

    updateQuickAddCardControls();
}

function quickAddSetLevel(level) {
    const card = quickAddState.cards[quickAddState.currentIndex];
    if (!card) return;

    const cardId = card.support_id;
    if (!isCardOwned(cardId)) return;

    const prevLevel = getOwnedCardLevel(cardId);
    const currentLB = getOwnedCardLimitBreak(cardId);
    const maxLevel = limitBreaks[card.rarity][currentLB];

    level = Math.max(1, Math.min(level, maxLevel));

    setOwnedCardLevel(cardId, level);

    pushQuickAddHistory(cardId,
        { owned: true, lb: currentLB, level: prevLevel },
        { owned: true, lb: currentLB, level: level }
    );

    if (!quickAddState.modifiedCardIds.has(cardId)) {
        quickAddState.modifiedCardIds.add(cardId);
        quickAddState.totalModified++;
    }

    // Update only the slider/input sync, not the full controls
    syncQuickAddLevelControls(level);
}

// ===== UNDO =====

function pushQuickAddHistory(cardId, prevState, newState) {
    quickAddState.changeHistory.push({ cardId, prev: prevState, next: newState });
}

function quickAddUndo() {
    if (quickAddState.changeHistory.length === 0) return;

    const entry = quickAddState.changeHistory.pop();
    const { cardId, prev } = entry;

    // Restore previous state
    if (prev.owned) {
        setCardOwnership(cardId, true);
        if (prev.lb !== null) setOwnedCardLimitBreak(cardId, prev.lb);
        if (prev.level !== null) setOwnedCardLevel(cardId, prev.level);
    } else {
        setCardOwnership(cardId, false);
    }

    // If current card is the undone card, refresh controls
    const currentCard = quickAddState.cards[quickAddState.currentIndex];
    if (currentCard && currentCard.support_id === cardId) {
        updateQuickAddCardControls();
    }

    updateQuickAddUndoBtn();
}

// ===== KEYBOARD =====

function handleQuickAddKeydown(e) {
    if (!quickAddState.isOpen) return;

    // Don't capture when typing in inputs
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (quickAddState.screen === 'cards') {
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                navigateQuickAdd(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                navigateQuickAdd(1);
                break;
            case 'o':
            case 'O': {
                e.preventDefault();
                const card = quickAddState.cards[quickAddState.currentIndex];
                if (card) {
                    quickAddSetOwnership(!isCardOwned(card.support_id));
                }
                break;
            }
            case '1': case '2': case '3': case '4': case '5':
                e.preventDefault();
                quickAddSetLimitBreak(parseInt(e.key) - 1);
                break;
            case 'z':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    quickAddUndo();
                }
                break;
        }
    }

    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelQuickAdd();
    }
}

// ===== EXPORTS =====

window.QuickAddManager = {
    openQuickAdd,
    closeQuickAdd,
    cancelQuickAdd,
    toggleQuickAddType,
    toggleQuickAddRarity,
    selectAllQuickAddTypes,
    deselectAllQuickAddTypes,
    selectAllQuickAddRarities,
    deselectAllQuickAddRarities,
    setQuickAddOwnershipFilter,
    setQuickAddSortOrder,
    setQuickAddSortDirection,
    resortQuickAddCards,
    getQuickAddCardName,
    getQuickAddCardCount,
    startQuickAddCards,
    navigateQuickAdd,
    setQuickAddSkipMLB,
    getQuickAddVisibleCount,
    getQuickAddVisiblePosition,
    ensureQuickAddVisible,
    quickAddSetOwnership,
    quickAddSetLimitBreak,
    quickAddSetLevel,
    quickAddUndo,
    quickAddState
};

Object.assign(window, window.QuickAddManager);
