import { type DesignTool } from './types';

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

/** The tool a key starts when held on its own: Option draws, Control picks. */
export const holdToolForKey = (e: KeyboardEvent): DesignTool | null => {
    if (e.repeat || e.metaKey || e.shiftKey) return null;
    if (e.key === 'Alt' && !e.ctrlKey) return 'stylus';
    if (e.key === 'Control' && !e.altKey) return 'cursor';
    return null;
};

/** Marks the bubble's own text box, where Esc throws the bubble away. */
export const DESIGN_INPUT_ATTRIBUTE = 'data-design-input';

const TYPED_INTO =
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const CLOSES_ON_ESCAPE = '[role="dialog"], [role="listbox"], [role="menu"]';

/** Esc is Design Mode's unless it is held, composing, or meant for something else on the page. */
export const escapeIsForDesignMode = (e: KeyboardEvent): boolean => {
    if (e.repeat || e.isComposing) return false;
    const el = e.target instanceof Element ? e.target : null;
    if (!el || el.closest(`[${DESIGN_INPUT_ATTRIBUTE}]`)) return true;
    return !el.closest(TYPED_INTO) && !el.closest(CLOSES_ON_ESCAPE);
};

/** Any key that is not a modifier, such as the character Option+e types. */
export const cancelsHold = (e: KeyboardEvent): boolean =>
    !MODIFIER_KEYS.has(e.key);
