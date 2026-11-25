const MODIFIER_KEYS = new Set([
    'Alt',
    'AltGraph',
    'CapsLock',
    'Control',
    'Fn',
    'FnLock',
    'Hyper',
    'Meta',
    'NumLock',
    'OS',
    'ScrollLock',
    'Shift',
    'Super',
    'Symbol',
    'SymbolLock',
]);

/** Option pressed on its own starts a hold. AltGr reports Control too, so it never does. */
export const startsHold = (e: KeyboardEvent): boolean =>
    e.key === 'Alt' && !e.repeat && !e.metaKey && !e.shiftKey && !e.ctrlKey;

/** Marks the bubble's own text box, where Esc throws the bubble away. */
export const DESIGN_INPUT_ATTRIBUTE = 'data-design-input';

const TYPED_INTO =
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const CLOSES_ON_ESCAPE = '[role="dialog"], [role="listbox"], [role="menu"]';

/** Marks a bubble on the page; a conversation's reply box sits inside one. */
const BUBBLE = '[data-bubble-id]';

const isEmptyBox = (box: Element): boolean =>
    box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement
        ? box.value === ''
        : (box.textContent ?? '').trim() === '';

/** Esc is Design Mode's unless it is held, composing, or meant for something else on the page. */
export const escapeIsForDesignMode = (e: KeyboardEvent): boolean => {
    if (e.repeat || e.isComposing) return false;
    const el = e.target instanceof Element ? e.target : null;
    if (!el || el.closest(`[${DESIGN_INPUT_ATTRIBUTE}]`)) return true;
    if (el.closest(CLOSES_ON_ESCAPE)) return false;
    const box = el.closest(TYPED_INTO);
    if (!box) return true;
    // A bubble's reply box: Esc lets go of the bubble, unless words would be lost.
    return el.closest(BUBBLE) !== null && isEmptyBox(box);
};

/** Any key that is not a modifier, such as the character Option+e types. */
export const cancelsHold = (e: KeyboardEvent): boolean =>
    !MODIFIER_KEYS.has(e.key);
