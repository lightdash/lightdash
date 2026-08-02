import { faviconUrl, safeImageUrl } from './resourceUrls';

describe('faviconUrl', () => {
    it('builds a favicon URL for public hostnames', () => {
        expect(faviconUrl('https://docs.example.com/page')).toBe(
            'https://www.google.com/s2/favicons?domain=docs.example.com&sz=128',
        );
    });

    it('returns null for non-public hostnames', () => {
        expect(faviconUrl('http://localhost:3000')).toBeNull();
        expect(faviconUrl('https://intranet')).toBeNull();
        expect(faviconUrl('https://10.0.0.5/dashboard')).toBeNull();
        expect(faviconUrl('https://wiki.corp.local/page')).toBeNull();
        expect(faviconUrl('https://vault.internal')).toBeNull();
        expect(faviconUrl('https://[::1]/')).toBeNull();
    });

    it('returns null for unparseable URLs', () => {
        expect(faviconUrl('not a url')).toBeNull();
    });
});

describe('safeImageUrl', () => {
    it('passes through https URLs', () => {
        expect(safeImageUrl('https://img.example.com/x.png')).toBe(
            'https://img.example.com/x.png',
        );
    });

    it('rejects non-https schemes and missing values', () => {
        expect(safeImageUrl('http://img.example.com/x.png')).toBeNull();
        expect(safeImageUrl('javascript:alert(1)')).toBeNull();
        expect(safeImageUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
        expect(safeImageUrl(undefined)).toBeNull();
    });
});
