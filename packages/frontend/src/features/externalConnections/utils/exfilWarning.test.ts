import { describe, expect, it } from 'vitest';
import { buildExfilWarning } from './exfilWarning';

describe('buildExfilWarning', () => {
    it('warns about data exfiltration for GET-only connections', () => {
        const message = buildExfilWarning('https://api.example.com', ['GET']);
        expect(message).toBe(
            'Apps linked to this connection can send any data they can query to https://api.example.com.',
        );
        expect(message).not.toContain('write actions');
    });

    it('escalates when POST is allowed', () => {
        const message = buildExfilWarning('https://api.example.com', [
            'GET',
            'POST',
        ]);
        expect(message).toContain('send any data they can query');
        expect(message).toContain(
            'perform write actions on https://api.example.com',
        );
    });

    it('falls back to a generic phrase when origin is empty', () => {
        const message = buildExfilWarning('', ['GET']);
        expect(message).toContain('to this origin.');
    });
});
