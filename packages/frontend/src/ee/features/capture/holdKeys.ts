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

/** Any key that is not a modifier, such as the character Option+e types. */
export const cancelsHold = (e: KeyboardEvent): boolean =>
    !MODIFIER_KEYS.has(e.key);
