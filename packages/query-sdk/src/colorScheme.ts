/**
 * Host color scheme — the iframe-side half of "data apps follow the host's
 * light/dark mode". The Lightdash host owns the resolved scheme (its own theme
 * toggle, or an embed's `?theme=`) and it reaches the app two ways, each doing
 * a job the other can't:
 *
 *   - a `theme=` seed in the iframe URL hash, read **synchronously** by
 *     `mountColorScheme()` from `createClient()`. That runs before React
 *     renders, so the app's first rendered frame is already in the right
 *     scheme. Only the seed can do this: a message reply lands a tick later,
 *     by which point React may already have committed the wrong mode.
 *   - `lightdash:sdk:theme` messages, which keep the app in step with every
 *     later host toggle without reloading the iframe.
 *
 * Delivery is a handshake, like `vizContext`: `mountColorScheme()` posts
 * `lightdash:sdk:theme-request` once its listener is live, and re-posts it
 * whenever the host announces `lightdash:sdk:ready` (the same belt-and-braces
 * `manifest` uses). Whichever side mounts first, the app ends up on the host's
 * scheme. Without it the app would depend on `createClient()` having run before
 * the host's iframe `load` push, which the template happens to guarantee but
 * app-owned `main.jsx` can silently break.
 *
 * Applying means toggling `.dark` on `<html>` (Tailwind's `darkMode: ['class']`
 * hook, and the only scope Radix portals inherit) plus the CSS `color-scheme`
 * property, so form controls and scrollbars follow too.
 *
 * Seed and message both cross a trust boundary — the hash is user-editable and
 * the message is postMessage — so both are validated, and messages are only
 * accepted from the window the client was created against.
 */

import { useSyncExternalStore } from 'react';

export type HostColorScheme = 'light' | 'dark';

/** Host → iframe, in reply to a request and on every host theme change. */
export type HostColorSchemeMessage = {
    type: 'lightdash:sdk:theme';
    colorScheme: HostColorScheme;
};

/** Iframe → host, once this module's listener is live. */
export type HostColorSchemeRequestMessage = {
    type: 'lightdash:sdk:theme-request';
};

export const HOST_COLOR_SCHEME_MESSAGE = 'lightdash:sdk:theme';
export const HOST_COLOR_SCHEME_REQUEST_MESSAGE = 'lightdash:sdk:theme-request';

const SDK_READY_MESSAGE = 'lightdash:sdk:ready';

// Mirrored by the host in packages/frontend/src/features/apps/utils/appIframeUrl.ts
const COLOR_SCHEME_PARAM = 'theme';

const DARK_CLASS = 'dark';

const isHostColorScheme = (value: unknown): value is HostColorScheme =>
    value === 'light' || value === 'dark';

/**
 * Read the scheme seed. The iframe hash is where the host forwards it; the
 * search param is the top-level (local dev) fallback. Null when absent or not
 * one of the two valid values.
 */
export function parseColorSchemeSeed(location: {
    hash: string;
    search: string;
}): HostColorScheme | null {
    const raw =
        new URLSearchParams(location.hash.replace(/^#/, '')).get(
            COLOR_SCHEME_PARAM,
        ) ?? new URLSearchParams(location.search).get(COLOR_SCHEME_PARAM);
    return isHostColorScheme(raw) ? raw : null;
}

/** Stamp the scheme onto `<html>`. Idempotent. */
export function applyColorScheme(scheme: HostColorScheme): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle(DARK_CLASS, scheme === 'dark');
    root.style.colorScheme = scheme;
}

export type ColorSchemeStore = {
    getScheme: () => HostColorScheme;
    /**
     * Stamp `<html>` and publish. Always re-applies (the DOM may have been
     * clobbered since), but only notifies when the value actually changed.
     */
    setScheme: (scheme: HostColorScheme) => void;
    subscribe: (listener: () => void) => () => void;
};

/**
 * Minimal external store: synchronous reads for useSyncExternalStore. The seed
 * is resolved by the caller and passed in, so the value never depends on when
 * it was first read. Exported for tests — app code uses `useColorScheme`.
 */
export function createColorSchemeStore(options: {
    seed: HostColorScheme;
    apply?: (scheme: HostColorScheme) => void;
}): ColorSchemeStore {
    const apply = options.apply ?? applyColorScheme;
    let scheme = options.seed;
    const listeners = new Set<() => void>();

    return {
        getScheme: () => scheme,
        setScheme: (next) => {
            const changed = next !== scheme;
            scheme = next;
            apply(next);
            if (changed) listeners.forEach((listener) => listener());
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

/**
 * Initial value: the URL seed, else whatever is already on `<html>` — an app
 * that pins its own scheme in `:root`/`index.html` keeps reporting that one
 * until the host says otherwise.
 */
function readSeed(): HostColorScheme {
    if (typeof window === 'undefined') return 'light';
    const seed = parseColorSchemeSeed(window.location);
    if (seed) return seed;
    return document.documentElement.classList.contains(DARK_CLASS)
        ? 'dark'
        : 'light';
}

// Lazily created so tests (and SSR) never touch window at import time.
let sharedStore: ColorSchemeStore | null = null;
function getSharedStore(): ColorSchemeStore {
    if (sharedStore === null) {
        sharedStore = createColorSchemeStore({ seed: readSeed() });
    }
    return sharedStore;
}

let activeCleanup: (() => void) | null = null;

/**
 * Apply the URL seed and nothing else. Used by `createClient()` on the API
 * transport (top-level local dev), where there is no host to talk to but
 * `?theme=dark` should still render the app dark — otherwise an author can
 * never see the dark half of the contract `skill.md` asks them to satisfy.
 */
export function applyColorSchemeSeed(): void {
    applyColorScheme(getSharedStore().getScheme());
}

/**
 * Follow the host's scheme: apply the seed, listen for `lightdash:sdk:theme`
 * from `targetWindow`, and ask the host to send the current value now. Called
 * by `createClient()` when the postMessage transport is detected. One listener
 * per bundle — re-mounting replaces the previous listener rather than stacking.
 */
export function mountColorScheme(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};

    const store = getSharedStore();
    applyColorScheme(store.getScheme());

    const request: HostColorSchemeRequestMessage = {
        type: HOST_COLOR_SCHEME_REQUEST_MESSAGE,
    };
    // Wildcard for the same reason as every other outbound bridge message: the
    // sandboxed iframe has an opaque origin and can't derive the parent's.
    const post = () => targetWindow.postMessage(request, '*');

    const handler = (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const data = event.data as
            | Partial<HostColorSchemeMessage>
            | { type?: unknown }
            | undefined;
        // Re-ask on `sdk:ready`: if the host mounted its bridge after our first
        // request, that request went nowhere and this is the recovery.
        if (data?.type === SDK_READY_MESSAGE) {
            post();
            return;
        }
        if (data?.type !== HOST_COLOR_SCHEME_MESSAGE) return;
        const { colorScheme } = data as Partial<HostColorSchemeMessage>;
        if (!isHostColorScheme(colorScheme)) return;
        store.setScheme(colorScheme);
    };

    activeCleanup?.();
    window.addEventListener('message', handler);
    const cleanup = () => {
        window.removeEventListener('message', handler);
        if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;
    post();
    return cleanup;
}

/**
 * The scheme the app is currently rendering in. CSS should follow the `.dark`
 * class through the theme tokens; reach for this hook only where a value can't
 * be expressed in CSS — a charting library's theme object, an image swap.
 *
 *   const colorScheme = useColorScheme();
 *   <ResponsiveContainer theme={colorScheme === 'dark' ? darkTheme : lightTheme} />
 */
export function useColorScheme(): HostColorScheme {
    const store = getSharedStore();
    return useSyncExternalStore(
        store.subscribe,
        store.getScheme,
        () => 'light',
    );
}

/**
 * Test-only seam: drops the listener and the shared store so the next mount
 * re-reads the seed. The store itself is covered directly through
 * `createColorSchemeStore`; this exists so the mount tests can vary the URL.
 */
export function resetColorSchemeState(): void {
    activeCleanup?.();
    sharedStore = null;
}
