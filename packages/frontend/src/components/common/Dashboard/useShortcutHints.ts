import { useOs } from '@mantine/hooks';
import { useEffect } from 'react';
import { isModalOpen } from './editShortcuts';

export const useModKeyLabel = () => {
    const os = useOs();
    return os === 'macos' || os === 'ios' ? '⌘' : 'Ctrl';
};

// Long enough that a quick ⌘C or ⌘Z never flashes the hints
const HINT_DELAY_MS = 150;
const HINTS_ATTRIBUTE = 'shortcutHints';
const MODIFIER_KEYS = ['Meta', 'Control'];

// The targets useHotkeys ignores: the shortcuts do nothing while typing
const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Reveals every ShortcutHint on the page while ⌘ or Ctrl is held */
export const useShortcutHints = (enabled: boolean) => {
    useEffect(() => {
        if (!enabled) return;
        let timer: number | undefined;
        const hide = () => {
            window.clearTimeout(timer);
            delete document.body.dataset[HINTS_ATTRIBUTE];
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (!MODIFIER_KEYS.includes(event.key)) {
                // A shortcut typed straight away needs no hint; shown hints stay
                window.clearTimeout(timer);
                return;
            }
            if (event.repeat || isTypingTarget(event.target) || isModalOpen())
                return;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                document.body.dataset[HINTS_ATTRIBUTE] = '';
            }, HINT_DELAY_MS);
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (MODIFIER_KEYS.includes(event.key)) hide();
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        // The key-up is never seen after ⌘-Tab or a switch of browser tab
        window.addEventListener('blur', hide);
        document.addEventListener('visibilitychange', hide);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', hide);
            document.removeEventListener('visibilitychange', hide);
            hide();
        };
    }, [enabled]);
};
