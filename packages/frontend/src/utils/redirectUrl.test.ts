import { describe, expect, it } from 'vitest';
import { isRootRelativePath, sanitizeRedirectUrl } from './redirectUrl';

describe('isRootRelativePath', () => {
    it('accepts root-relative paths', () => {
        expect(isRootRelativePath('/')).toBe(true);
        expect(isRootRelativePath('/projects')).toBe(true);
        expect(isRootRelativePath('/projects/abc?tab=charts#top')).toBe(true);
    });

    it('rejects missing values', () => {
        expect(isRootRelativePath(undefined)).toBe(false);
        expect(isRootRelativePath(null)).toBe(false);
        expect(isRootRelativePath('')).toBe(false);
    });

    it('rejects absolute URLs, including same-origin ones', () => {
        expect(isRootRelativePath('https://evil.example.com')).toBe(false);
        expect(isRootRelativePath('http://evil.example.com/path')).toBe(false);
        expect(isRootRelativePath('http://localhost:3000/projects')).toBe(
            false,
        );
    });

    it('rejects protocol-relative URLs and backslash variants', () => {
        expect(isRootRelativePath('//evil.example.com')).toBe(false);
        expect(isRootRelativePath('//evil.example.com/path')).toBe(false);
        expect(isRootRelativePath('/\\evil.example.com')).toBe(false);
        expect(isRootRelativePath('\\evil.example.com')).toBe(false);
        expect(isRootRelativePath('\\\\evil.example.com')).toBe(false);
    });

    it('rejects dangerous schemes', () => {
        expect(isRootRelativePath('javascript:alert(1)')).toBe(false);
        expect(
            isRootRelativePath('data:text/html,<script>alert(1)</script>'),
        ).toBe(false);
        expect(isRootRelativePath('vbscript:msgbox(1)')).toBe(false);
    });

    it('rejects relative paths without a leading slash', () => {
        expect(isRootRelativePath('projects')).toBe(false);
        expect(isRootRelativePath('evil.example.com')).toBe(false);
    });
});

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
        expect(
            sanitizeRedirectUrl('data:text/html,<script>alert(1)</script>'),
        ).toBe('/');
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
