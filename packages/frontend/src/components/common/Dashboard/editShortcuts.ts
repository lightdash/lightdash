import { type HotkeyItem } from '@mantine/hooks';

export type EditShortcut = {
    /** Each one is pressed with the platform's modifier (⌘ or Ctrl) */
    hotkeys: string[];
    /** The keys after the modifier, as drawn in hints and tooltips */
    keys: string[];
    /** Matches the key's position, for symbols and digits that move or shift between layouts */
    usePhysicalKeys: boolean;
};

export const EDIT_SHORTCUTS = {
    undo: { hotkeys: ['mod+Z'], keys: ['Z'], usePhysicalKeys: false },
    redo: {
        hotkeys: ['mod+shift+Z', 'mod+Y'],
        keys: ['⇧', 'Z'],
        usePhysicalKeys: false,
    },
    addTile: { hotkeys: ['mod+I'], keys: ['I'], usePhysicalKeys: false },
    tidy: {
        hotkeys: ['mod+shift+L'],
        keys: ['⇧', 'L'],
        usePhysicalKeys: false,
    },
    zoomOut: { hotkeys: ['mod+Minus'], keys: ['−'], usePhysicalKeys: true },
    zoomReset: { hotkeys: ['mod+Digit0'], keys: ['0'], usePhysicalKeys: true },
    zoomIn: {
        hotkeys: ['mod+Equal', 'mod+shift+Equal'],
        keys: ['+'],
        usePhysicalKeys: true,
    },
    zoomToFit: {
        hotkeys: ['mod+shift+Digit1'],
        keys: ['⇧', '1'],
        usePhysicalKeys: true,
    },
    background: { hotkeys: ['mod+Quote'], keys: ["'"], usePhysicalKeys: true },
    filters: {
        hotkeys: ['mod+shift+F'],
        keys: ['⇧', 'F'],
        usePhysicalKeys: false,
    },
    save: { hotkeys: ['mod+S'], keys: ['S'], usePhysicalKeys: false },
} satisfies Record<string, EditShortcut>;

// The canvas is out of reach behind a modal, so the keys leave it alone
export const isModalOpen = () =>
    document.querySelector('[aria-modal="true"]') !== null;

/** The shortcut's entries for `useHotkeys`. The browser's own action is always replaced. */
export const toHotkeyItems = (
    shortcut: EditShortcut,
    run: () => void,
): HotkeyItem[] =>
    shortcut.hotkeys.map((hotkey) => [
        hotkey,
        () => {
            if (!isModalOpen()) run();
        },
        { usePhysicalKeys: shortcut.usePhysicalKeys },
    ]);

export const nextInCycle = <T>(values: readonly T[], current: T): T =>
    values[(values.indexOf(current) + 1) % values.length];
