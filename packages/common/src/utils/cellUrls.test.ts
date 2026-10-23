import { renderTemplatedUrl } from '../templating/template';
import { AUTO_DETECTED_URL_LABEL, getCellUrls, isUrlValue } from './cellUrls';

describe('isUrlValue', () => {
    it.each([
        'https://lightdash.com',
        'http://example.com/path?a=1&b=2#frag',
        'HTTPS://EXAMPLE.COM',
    ])('accepts %s', (value) => {
        expect(isUrlValue(value)).toBe(true);
    });

    it.each([
        null,
        undefined,
        42,
        '',
        'lightdash.com',
        'www.lightdash.com',
        'ftp://example.com',
        'javascript:alert(1)',
        'see https://lightdash.com',
        'https://lightdash.com and more',
        'https://',
        'mailto:hi@example.com',
    ])('rejects %s', (value) => {
        expect(isUrlValue(value)).toBe(false);
    });
});

describe('getCellUrls', () => {
    const fieldUrls = [{ label: 'Docs', url: 'https://docs/${value.raw}' }];

    it('prefers field urls', () => {
        expect(getCellUrls(fieldUrls, 'https://example.com')).toBe(fieldUrls);
    });

    it('falls back to an auto-detected link', () => {
        const urls = getCellUrls(undefined, 'https://example.com/a?b=1');
        expect(urls).toHaveLength(1);
        expect(urls[0].label).toBe(AUTO_DETECTED_URL_LABEL);
        expect(
            renderTemplatedUrl(
                urls[0].url,
                {
                    raw: 'https://example.com/a?b=1',
                    formatted: 'https://example.com/a?b=1',
                },
                {},
            ),
        ).toBe('https://example.com/a?b=1');
    });

    it('returns nothing for non-url values', () => {
        expect(getCellUrls([], 'hello')).toEqual([]);
        expect(getCellUrls(undefined, 3)).toEqual([]);
    });

    it('returns nothing for empty values, even with field urls', () => {
        expect(getCellUrls(fieldUrls, null)).toEqual([]);
        expect(getCellUrls(fieldUrls, undefined)).toEqual([]);
    });
});
