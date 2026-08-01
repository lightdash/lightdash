import { describe, expect, it } from 'vitest';
import { sanitizeRedirectUrl } from './redirectUrl';

describe('sanitizeRedirectUrl', () => {
    it('keeps root-relative paths', () => {
        expect(sanitizeRedirectUrl('/')).toBe('/');
        expect(sanitizeRedirectUrl('/projects')).toBe('/projects');
        expect(sanitizeRedirectUrl('/projects/abc?tab=charts#top')).toBe(
            '/projects/abc?tab=charts#top',
        );
    });

    it('falls back to / for missing values', () => {
        expect(sanitizeRedirectUrl(undefined)).toBe('/');
        expect(sanitizeRedirectUrl(null)).toBe('/');
        expect(sanitizeRedirectUrl('')).toBe('/');
    });

    it('rejects absolute URLs', () => {
        expect(sanitizeRedirectUrl('https://evil.example.com')).toBe('/');
        expect(sanitizeRedirectUrl('http://evil.example.com/path')).toBe('/');
        expect(sanitizeRedirectUrl('javascript:alert(1)')).toBe('/');
    });

    it('rejects protocol-relative URLs', () => {
        expect(sanitizeRedirectUrl('//evil.example.com')).toBe('/');
        expect(sanitizeRedirectUrl('//evil.example.com/path')).toBe('/');
    });

    it('rejects backslash variants of protocol-relative URLs', () => {
        expect(sanitizeRedirectUrl('/\\evil.example.com')).toBe('/');
        expect(sanitizeRedirectUrl('\\evil.example.com')).toBe('/');
        expect(sanitizeRedirectUrl('\\\\evil.example.com')).toBe('/');
    });

    it('rejects relative paths without a leading slash', () => {
        expect(sanitizeRedirectUrl('projects')).toBe('/');
        expect(sanitizeRedirectUrl('evil.example.com')).toBe('/');
    });
});
