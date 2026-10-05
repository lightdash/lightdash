import { ParameterError } from '@lightdash/common';
import {
    normalizeThreadFileText,
    sanitizeThreadFileName,
} from './AiThreadFileService';

describe('normalizeThreadFileText', () => {
    it('strips a UTF-8 BOM and normalizes line endings', () => {
        const bytes = Buffer.concat([
            Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from('a\r\nb\rc\n', 'utf8'),
        ]);
        expect(normalizeThreadFileText(bytes)).toBe('a\nb\nc\n');
    });

    it('keeps multi-byte characters intact', () => {
        expect(
            normalizeThreadFileText(Buffer.from('héllo — 日本', 'utf8')),
        ).toBe('héllo — 日本');
    });

    it('rejects bytes that are not valid UTF-8', () => {
        expect(() =>
            normalizeThreadFileText(Buffer.from([0xff, 0xfe, 0x41])),
        ).toThrow(ParameterError);
    });

    it('rejects text containing NUL bytes', () => {
        expect(() =>
            normalizeThreadFileText(Buffer.from('ab\u0000cd', 'utf8')),
        ).toThrow(ParameterError);
    });
});

describe('sanitizeThreadFileName', () => {
    it('keeps only the base name', () => {
        expect(sanitizeThreadFileName('../../etc/passwd')).toBe('passwd');
        expect(sanitizeThreadFileName('C:\\docs\\notes.md')).toBe('notes.md');
    });

    it('strips control characters and surrounding whitespace', () => {
        expect(sanitizeThreadFileName('  no\u0007tes.md \n')).toBe('notes.md');
    });

    it('rejects empty and dot-only names', () => {
        expect(() => sanitizeThreadFileName('')).toThrow(ParameterError);
        expect(() => sanitizeThreadFileName('..')).toThrow(ParameterError);
        expect(() => sanitizeThreadFileName('dir/')).toThrow(ParameterError);
    });

    it('rejects names longer than the limit', () => {
        expect(() => sanitizeThreadFileName(`${'a'.repeat(256)}.md`)).toThrow(
            ParameterError,
        );
    });
});
