/**
 * Host color-scheme sync for apps running inside the Lightdash iframe.
 *
 * The host owns light/dark mode; the app follows. Two delivery paths:
 * the initial scheme rides the iframe URL hash (`theme=`) so the first
 * paint is correct, and live toggles arrive as `lightdash:sdk:theme`
 * postMessages. Applying a scheme toggles the `dark` class on `<html>`
 * (Tailwind `darkMode: ['class']`) and sets the CSS `color-scheme` so
 * native controls and scrollbars follow.
 *
 * Hosts older than this protocol send neither signal — the document is
 * left untouched and the app keeps its authored scheme.
 */

import { useSyncExternalStore } from 'react';

export type ColorScheme = 'light' | 'dark';

/** Pushed by the host on iframe load and on every theme toggle. */
export type SdkThemeMessage = {
    type: 'lightdash:sdk:theme';
    colorScheme: ColorScheme;
};

const THEME_MESSAGE = 'lightdash:sdk:theme';

let currentColorScheme: ColorScheme = 'light';
const listeners = new Set<() => void>();

function isColorScheme(value: unknown): value is ColorScheme {
    return value === 'light' || value === 'dark';
}

/** Initial scheme from the URL hash (`theme=`), or null when the host didn't send one. */
export function getHashColorScheme(): ColorScheme | null {
    if (typeof window === 'undefined' || !window.location.hash) return null;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const theme = params.get('theme');
    return isColorScheme(theme) ? theme : null;
}

function applyColorScheme(colorScheme: ColorScheme): void {
    currentColorScheme = colorScheme;
    document.documentElement.classList.toggle('dark', colorScheme === 'dark');
    document.documentElement.style.colorScheme = colorScheme;
    listeners.forEach((listener) => listener());
}

let mounted = false;

/**
 * Applies the URL-hash scheme immediately, then follows the host's
 * `lightdash:sdk:theme` messages. Mounted by `createClient()` on the
 * postMessage transport path; idempotent.
 */
export function mountThemeSync(): void {
    if (mounted || typeof window === 'undefined') return;
    mounted = true;

    const initial = getHashColorScheme();
    if (initial) applyColorScheme(initial);

    window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as Partial<SdkThemeMessage> | undefined;
        if (data?.type !== THEME_MESSAGE) return;
        if (!isColorScheme(data.colorScheme)) return;
        applyColorScheme(data.colorScheme);
    });
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

const getSnapshot = (): ColorScheme => currentColorScheme;
const getServerSnapshot = (): ColorScheme => 'light';

/**
 * Current host color scheme — 'light' until the host signals otherwise.
 * For JS that can't read the CSS variables (e.g. imperative chart config);
 * token-based styling adapts through the `dark` class without this hook.
 */
export function useColorScheme(): ColorScheme {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
