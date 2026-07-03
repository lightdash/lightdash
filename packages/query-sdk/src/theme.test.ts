import { beforeEach, describe, expect, it, vi } from 'vitest';

// `mountThemeSync` is module-level idempotent, so each test gets a fresh module.
async function loadTheme() {
    vi.resetModules();
    return import('./theme');
}

function postTheme(data: unknown) {
    window.dispatchEvent(new MessageEvent('message', { data }));
}

beforeEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    window.location.hash = '';
});

describe('getHashColorScheme', () => {
    it('reads the theme param from the URL hash', async () => {
        const { getHashColorScheme } = await loadTheme();
        window.location.hash =
            '#transport=postMessage&projectUuid=abc&theme=dark';
        expect(getHashColorScheme()).toBe('dark');
        window.location.hash = '#transport=postMessage&theme=light';
        expect(getHashColorScheme()).toBe('light');
    });

    it('returns null when the param is missing or invalid', async () => {
        const { getHashColorScheme } = await loadTheme();
        window.location.hash = '#transport=postMessage&projectUuid=abc';
        expect(getHashColorScheme()).toBeNull();
        window.location.hash = '#theme=blue';
        expect(getHashColorScheme()).toBeNull();
    });
});

describe('mountThemeSync', () => {
    it('applies the URL-hash scheme immediately', async () => {
        const { mountThemeSync } = await loadTheme();
        window.location.hash = '#transport=postMessage&theme=dark';
        mountThemeSync();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('leaves the document untouched when the host sends no signal', async () => {
        const { mountThemeSync } = await loadTheme();
        mountThemeSync();
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('');
    });

    it('follows lightdash:sdk:theme messages', async () => {
        const { mountThemeSync } = await loadTheme();
        mountThemeSync();

        postTheme({ type: 'lightdash:sdk:theme', colorScheme: 'dark' });
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');

        postTheme({ type: 'lightdash:sdk:theme', colorScheme: 'light' });
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('ignores unrelated and malformed messages', async () => {
        const { mountThemeSync } = await loadTheme();
        window.location.hash = '#transport=postMessage&theme=dark';
        mountThemeSync();

        postTheme({ type: 'lightdash:sdk:ready' });
        postTheme({ type: 'lightdash:sdk:theme', colorScheme: 'blue' });
        postTheme(null);
        postTheme('lightdash:sdk:theme');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
});
