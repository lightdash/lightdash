import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    applyColorScheme,
    applyColorSchemeSeed,
    createColorSchemeStore,
    HOST_COLOR_SCHEME_MESSAGE,
    HOST_COLOR_SCHEME_REQUEST_MESSAGE,
    mountColorScheme,
    parseColorSchemeSeed,
    resetColorSchemeState,
} from './colorScheme';

describe('parseColorSchemeSeed', () => {
    it('reads the seed from the iframe hash', () => {
        expect(
            parseColorSchemeSeed({
                hash: '#transport=postMessage&projectUuid=abc&theme=dark',
                search: '',
            }),
        ).toEqual('dark');
    });

    it('falls back to the search param when the hash has none (local dev)', () => {
        expect(
            parseColorSchemeSeed({ hash: '', search: '?theme=dark' }),
        ).toEqual('dark');
    });

    it('prefers the hash over the search param', () => {
        expect(
            parseColorSchemeSeed({
                hash: '#theme=light',
                search: '?theme=dark',
            }),
        ).toEqual('light');
    });

    it('returns null when absent or not a known scheme', () => {
        expect(parseColorSchemeSeed({ hash: '', search: '' })).toBeNull();
        expect(
            parseColorSchemeSeed({ hash: '#theme=sepia', search: '' }),
        ).toBeNull();
        expect(
            parseColorSchemeSeed({ hash: '#theme=', search: '' }),
        ).toBeNull();
    });
});

describe('applyColorScheme', () => {
    afterEach(() => {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = '';
    });

    it('stamps the dark class and the CSS color-scheme onto <html>', () => {
        applyColorScheme('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toEqual('dark');
    });

    it('clears the dark class when going back to light', () => {
        applyColorScheme('dark');
        applyColorScheme('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toEqual('light');
    });
});

describe('createColorSchemeStore', () => {
    it('starts on the seed it was given, with no dependency on read order', () => {
        expect(createColorSchemeStore({ seed: 'dark' }).getScheme()).toEqual(
            'dark',
        );
    });

    it('notifies subscribers only when the value changes', () => {
        const store = createColorSchemeStore({ seed: 'light', apply: vi.fn() });
        const listener = vi.fn();
        store.subscribe(listener);

        store.setScheme('dark');
        store.setScheme('dark');
        expect(listener).toHaveBeenCalledTimes(1);

        store.setScheme('light');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('re-applies even when the value is unchanged, so a clobbered <html> is repaired', () => {
        const apply = vi.fn();
        const store = createColorSchemeStore({ seed: 'light', apply });
        store.setScheme('dark');
        store.setScheme('dark');
        expect(apply).toHaveBeenCalledTimes(2);
        expect(apply).toHaveBeenLastCalledWith('dark');
    });

    it('stops notifying after unsubscribe', () => {
        const store = createColorSchemeStore({ seed: 'light', apply: vi.fn() });
        const listener = vi.fn();
        store.subscribe(listener)();
        store.setScheme('dark');
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('mountColorScheme', () => {
    let cleanup: () => void = () => {};

    const setHash = (hash: string) => {
        window.location.hash = hash;
    };

    const postToApp = (
        source: MessageEventSource | null,
        data: unknown,
    ): void => {
        window.dispatchEvent(new MessageEvent('message', { data, source }));
    };

    const requestCount = (spy: { mock: { calls: unknown[][] } }) =>
        spy.mock.calls.filter(
            (call) =>
                (call[0] as { type?: string })?.type ===
                HOST_COLOR_SCHEME_REQUEST_MESSAGE,
        ).length;

    beforeEach(() => {
        setHash('');
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = '';
        resetColorSchemeState();
    });

    afterEach(() => {
        cleanup();
        resetColorSchemeState();
        vi.restoreAllMocks();
    });

    it('applies the hash seed on mount', () => {
        setHash('#transport=postMessage&theme=dark');
        cleanup = mountColorScheme(window as unknown as Window);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    // The handshake: without it the app depends on createClient() having run
    // before the host's iframe-load push, which app-owned main.jsx can break.
    it('asks the host for the current scheme once its listener is live', () => {
        const postSpy = vi.spyOn(window, 'postMessage');
        cleanup = mountColorScheme(window as unknown as Window);
        expect(postSpy).toHaveBeenCalledWith(
            { type: HOST_COLOR_SCHEME_REQUEST_MESSAGE },
            '*',
        );
    });

    it('re-asks when the host announces it is ready, in case the first ask was too early', () => {
        const parent = window as unknown as Window;
        const postSpy = vi.spyOn(window, 'postMessage');
        cleanup = mountColorScheme(parent);
        expect(requestCount(postSpy)).toEqual(1);

        postToApp(parent as unknown as MessageEventSource, {
            type: 'lightdash:sdk:ready',
        });
        expect(requestCount(postSpy)).toEqual(2);
    });

    it('does not re-ask on a ready message from another window', () => {
        const postSpy = vi.spyOn(window, 'postMessage');
        cleanup = mountColorScheme(window as unknown as Window);
        postToApp(null, { type: 'lightdash:sdk:ready' });
        expect(requestCount(postSpy)).toEqual(1);
    });

    it('applies a scheme pushed by the host after load', () => {
        const parent = window as unknown as Window;
        cleanup = mountColorScheme(parent);
        postToApp(parent as unknown as MessageEventSource, {
            type: HOST_COLOR_SCHEME_MESSAGE,
            colorScheme: 'dark',
        });
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        postToApp(parent as unknown as MessageEventSource, {
            type: HOST_COLOR_SCHEME_MESSAGE,
            colorScheme: 'light',
        });
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('repairs <html> when the host re-sends the scheme the app is already on', () => {
        const parent = window as unknown as Window;
        cleanup = mountColorScheme(parent);
        postToApp(parent as unknown as MessageEventSource, {
            type: HOST_COLOR_SCHEME_MESSAGE,
            colorScheme: 'dark',
        });
        // Something else stripped the class (app code, a hot reload, a library).
        document.documentElement.classList.remove('dark');
        postToApp(parent as unknown as MessageEventSource, {
            type: HOST_COLOR_SCHEME_MESSAGE,
            colorScheme: 'dark',
        });
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('ignores malformed payloads', () => {
        const parent = window as unknown as MessageEventSource;
        cleanup = mountColorScheme(parent as unknown as Window);
        postToApp(parent, { type: HOST_COLOR_SCHEME_MESSAGE });
        postToApp(parent, {
            type: HOST_COLOR_SCHEME_MESSAGE,
            colorScheme: 'sepia',
        });
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('ignores messages from windows other than the host', () => {
        cleanup = mountColorScheme(window as unknown as Window);
        postToApp(null, {
            type: HOST_COLOR_SCHEME_MESSAGE,
            colorScheme: 'dark',
        });
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('does not stack listeners when mounted repeatedly', () => {
        const parent = window as unknown as Window;
        const addSpy = vi.spyOn(window, 'addEventListener');
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        mountColorScheme(parent);
        cleanup = mountColorScheme(parent);
        const messageListeners = (spy: typeof addSpy) =>
            spy.mock.calls.filter(([type]) => type === 'message').length;
        // Second mount tore the first listener down before registering its own.
        expect(messageListeners(addSpy)).toEqual(2);
        expect(messageListeners(removeSpy)).toEqual(1);
    });

    it('stops applying after cleanup', () => {
        const parent = window as unknown as Window;
        const stop = mountColorScheme(parent);
        stop();
        postToApp(parent as unknown as MessageEventSource, {
            type: HOST_COLOR_SCHEME_MESSAGE,
            colorScheme: 'dark',
        });
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});

// Top-level dev (API transport): no host, but `?theme=` must still render the
// app dark, or an author can't check the both-modes contract skill.md asks for.
describe('applyColorSchemeSeed', () => {
    beforeEach(() => {
        window.location.hash = '';
        document.documentElement.classList.remove('dark');
        resetColorSchemeState();
    });

    afterEach(() => {
        window.location.hash = '';
        resetColorSchemeState();
    });

    it('applies the seed without registering a host listener', () => {
        window.location.hash = '#theme=dark';
        const addSpy = vi.spyOn(window, 'addEventListener');
        applyColorSchemeSeed();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(
            addSpy.mock.calls.filter(([type]) => type === 'message'),
        ).toHaveLength(0);
        addSpy.mockRestore();
    });
});
