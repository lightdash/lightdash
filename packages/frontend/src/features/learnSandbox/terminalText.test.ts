import { describe, expect, it } from 'vitest';
import { sanitizeTerminalText } from './terminalText';

describe('sanitizeTerminalText', () => {
    it('strips ANSI colour sequences', () => {
        expect(sanitizeTerminalText('[32mok[0m')).toBe('ok');
    });
    it('strips carriage returns', () => {
        expect(sanitizeTerminalText('line one\r\nline two')).toBe(
            'line one\nline two',
        );
    });
    it('keeps newlines and tabs', () => {
        expect(sanitizeTerminalText('a\nb\tc')).toBe('a\nb\tc');
    });
});
