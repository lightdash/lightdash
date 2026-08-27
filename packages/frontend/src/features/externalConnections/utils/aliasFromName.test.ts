import { describe, expect, it } from 'vitest';
import { aliasFromName, uniqueAliasFromName } from './aliasFromName';

describe('aliasFromName', () => {
    it('normalizes a connection name', () => {
        expect(aliasFromName('Public Image CDN')).toBe('public_image_cdn');
    });
});

describe('uniqueAliasFromName', () => {
    it('adds a suffix when a normalized alias is already selected', () => {
        expect(
            uniqueAliasFromName('Public image CDN', [
                'public_image_cdn',
                'public_image_cdn_2',
            ]),
        ).toBe('public_image_cdn_3');
    });

    it('keeps aliases within the backend limit', () => {
        const name = 'a'.repeat(80);
        const alias = uniqueAliasFromName(name, ['a'.repeat(64)]);

        expect(alias).toHaveLength(64);
        expect(alias).toEndWith('_2');
    });

    it('uses a valid fallback when the name has no letters or numbers', () => {
        expect(uniqueAliasFromName('---', [])).toBe('connection');
    });
});
