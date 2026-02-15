// Quick Add Manager
// State management, navigation, filtering/sorting, undo, and save coordination

// ===== STATE =====

let quickAddState = {
    isOpen: false,
    screen: 'setup',
    cards: [],
    currentIndex: 0,
    skipOwned: false,
    changeHistory: [],
    totalModified: 0,
    modifiedCardIds: new Set(),
    selectedTypes: ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'],
    selectedRarities: [1, 2, 3],
    ownershipFilter: 'all',
    sortOrder: 'alpha',
    region: 'global'
};

// ===== OPEN / CLOSE =====

function openQuickAdd() {
    // Reset state
    quickAddState.isOpen = true;
    quickAddState.screen = 'setup';
    quickAddState.cards = [];
    quickAddState.currentIndex = 0;
    quickAddState.skipOwned = false;
    quickAddState.changeHistory = [];
    quickAddState.totalModified = 0;
    quickAddState.modifiedCardIds = new Set();
    quickAddState.selectedTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'];
    quickAddState.selectedRarities = [1, 2, 3];
    quickAddState.ownershipFilter = 'all';
    quickAddState.sortOrder = 'alpha';
    quickAddState.region = 'global';

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
    quickAddState.selectedTypes = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'];
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
    updateQuickAddSetupUI();
}

function setQuickAddRegion(value) {
    quickAddState.region = value;
    updateQuickAddSetupUI();
}

// ===== CARD FILTERING & SORTING =====

function getQuickAddMatchingCards() {
    let cards = cardData.filter(card => {
        // Region filter — global only shows cards with release_en
        if (quickAddState.region === 'global' && !card.release_en) return false;

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
    if (quickAddState.region === 'global') {
        return card.name_en || card.char_name || '';
    }
    return card.char_name || card.name_en || '';
}

function sortQuickAddCards(cards) {
    const order = quickAddState.sortOrder;
    return cards.slice().sort((a, b) => {
        switch (order) {
            case 'alpha': {
                const nameDiff = getQuickAddCardName(a).localeCompare(getQuickAddCardName(b));
                if (nameDiff !== 0) return nameDiff;
                return b.rarity - a.rarity;
            }
            case 'type': {
                const typeOrder = ['speed', 'stamina', 'power', 'guts', 'intelligence', 'friend'];
                const diff = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
                if (diff !== 0) return diff;
                return getQuickAddCardName(a).localeCompare(getQuickAddCardName(b));
            }
            case 'rarity': {
                const diff = b.rarity - a.rarity;
                if (diff !== 0) return diff;
                return getQuickAddCardName(a).localeCompare(getQuickAddCardName(b));
            }
            case 'release':
                return (b.support_id || 0) - (a.support_id || 0);
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
}

// ===== NAVIGATION =====

function navigateQuickAdd(direction) {
    if (quickAddState.cards.length === 0) return;

    let newIndex = quickAddState.currentIndex;
    const total = quickAddState.cards.length;

    if (quickAddState.skipOwned) {
        // Find next non-owned card in direction
        let attempts = 0;
        do {
            newIndex = (newIndex + direction + total) % total;
            attempts++;
            // Prevent infinite loop if all cards are owned
            if (attempts >= total) {
                newIndex = (quickAddState.currentIndex + direction + total) % total;
                break;
            }
        } while (isCardOwned(quickAddState.cards[newIndex].support_id));
    } else {
        newIndex = (newIndex + direction + total) % total;
    }

    quickAddState.currentIndex = newIndex;
    renderQuickAddCard(newIndex);
}

function setQuickAddSkipOwned(skip) {
    quickAddState.skipOwned = skip;
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
    setQuickAddRegion,
    getQuickAddCardName,
    getQuickAddCardCount,
    startQuickAddCards,
    navigateQuickAdd,
    setQuickAddSkipOwned,
    quickAddSetOwnership,
    quickAddSetLimitBreak,
    quickAddSetLevel,
    quickAddUndo,
    quickAddState
};

Object.assign(window, window.QuickAddManager);
