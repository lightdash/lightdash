import { describe, expect, it } from 'vitest';
import { resolveInternalPath } from './url';

// jsdom serves these tests from http://localhost:3000
const ORIGIN = window.location.origin;

describe('resolveInternalPath', () => {
    it('keeps root-relative paths, preserving query and hash', () => {
        expect(resolveInternalPath('/')).toBe('/');
        expect(resolveInternalPath('/register')).toBe('/register');
        expect(resolveInternalPath('/projects/abc?tab=charts#top')).toBe(
            '/projects/abc?tab=charts#top',
        );
    });

    it('resolves an absolute same-origin URL down to its path', () => {
        expect(resolveInternalPath(`${ORIGIN}/register`)).toBe('/register');
        expect(resolveInternalPath(`${ORIGIN}/projects?tab=charts`)).toBe(
            '/projects?tab=charts',
        );
    });

    it('returns null for other origins, so they stay real anchors', () => {
        expect(
            resolveInternalPath('https://www.lightdash.com/signup'),
        ).toBeNull();
        expect(resolveInternalPath('http://evil.example.com/path')).toBeNull();
    });

    it('returns null for protocol-relative and backslash variants', () => {
        expect(resolveInternalPath('//evil.example.com')).toBeNull();
        expect(resolveInternalPath('//evil.example.com/path')).toBeNull();
        expect(resolveInternalPath('/\\evil.example.com')).toBeNull();
    });

    it('returns null for dangerous schemes', () => {
        expect(resolveInternalPath('javascript:alert(1)')).toBeNull();
        expect(
            resolveInternalPath('data:text/html,<script>alert(1)</script>'),
        ).toBeNull();
    });

    it('returns null rather than throwing on unparseable input', () => {
        expect(resolveInternalPath('')).toBe('/');
        expect(resolveInternalPath('http://')).toBeNull();
    });
});
