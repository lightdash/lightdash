import { detectMobilePlatform } from './platform';

const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('detectMobilePlatform', () => {
    it('detects iOS', () => {
        expect(detectMobilePlatform(IPHONE, 5)).toBe('ios');
    });

    it('detects Android', () => {
        expect(detectMobilePlatform(ANDROID, 5)).toBe('android');
    });

    it('detects a desktop Mac', () => {
        expect(detectMobilePlatform(MAC, 0)).toBe('desktop');
    });

    it('detects an iPad reporting a desktop Safari user agent', () => {
        expect(detectMobilePlatform(MAC, 5)).toBe('ios');
    });
});
