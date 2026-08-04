import { describe, expect, it } from 'vitest';
import { withColorSchemeParam } from './appIframeUrl';

const BASE =
    'https://preview.example/api/apps/a/versions/1/t/tok/?r=0#transport=postMessage&projectUuid=p';

describe('withColorSchemeParam', () => {
    it('adds the scheme to the hash without disturbing the rest of the URL', () => {
        const url = new URL(withColorSchemeParam(BASE, 'dark'));
        expect(url.pathname).toEqual('/api/apps/a/versions/1/t/tok/');
        expect(url.search).toEqual('?r=0');
        const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
        expect(hash.get('transport')).toEqual('postMessage');
        expect(hash.get('projectUuid')).toEqual('p');
        expect(hash.get('theme')).toEqual('dark');
    });

    it('preserves an encoded url-state seed', () => {
        const state = JSON.stringify({ period: 'last_month', q: 'a b&c' });
        const seeded = `${BASE}&state=${encodeURIComponent(state)}`;
        const hash = new URLSearchParams(
            withColorSchemeParam(seeded, 'dark').split('#')[1],
        );
        expect(hash.get('state')).toEqual(state);
        expect(hash.get('theme')).toEqual('dark');
    });

    it('replaces an existing scheme rather than appending a second one', () => {
        const result = withColorSchemeParam(
            withColorSchemeParam(BASE, 'dark'),
            'light',
        );
        const hash = new URLSearchParams(result.split('#')[1]);
        expect(hash.getAll('theme')).toEqual(['light']);
    });

    it('adds a hash to a URL that has none', () => {
        expect(
            withColorSchemeParam('https://preview.example/app/', 'dark'),
        ).toEqual('https://preview.example/app/#theme=dark');
    });
});
