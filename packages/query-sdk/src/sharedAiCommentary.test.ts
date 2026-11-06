import { describe, expect, it } from 'vitest';
import {
    commentarySelectionKey,
    editedCommentary,
    generatedCommentary,
} from './sharedAiCommentary';

describe('commentarySelectionKey', () => {
    it('joins parts and keeps storage-safe characters', () => {
        expect(commentarySelectionKey('region', 'EMEA', 'period', 2026)).toBe(
            'region:EMEA:period:2026',
        );
    });

    it('replaces unsafe characters', () => {
        expect(commentarySelectionKey('Café & Bar', 'a/b c')).toBe(
            'Caf____Bar:a_b_c',
        );
    });

    it('treats null and undefined as empty parts', () => {
        expect(commentarySelectionKey('a', null, undefined, 'b')).toBe('a:::b');
    });

    it('falls back for an empty selection', () => {
        expect(commentarySelectionKey()).toBe('default');
        expect(commentarySelectionKey('')).toBe('default');
    });

    it('truncates over-long keys with a stable digest', () => {
        const long = 'x'.repeat(500);
        const key = commentarySelectionKey(long);
        expect(key.length).toBeLessThanOrEqual(114); // 128 - 'ai-commentary:'
        expect(key).toBe(commentarySelectionKey(long));
        expect(key).not.toBe(commentarySelectionKey(`${long}y`));
    });

    it('keeps distinct long keys distinct even when prefixes match', () => {
        const base = 'x'.repeat(200);
        expect(commentarySelectionKey(`${base}a`)).not.toBe(
            commentarySelectionKey(`${base}b`),
        );
    });
});

describe('commentary value builders', () => {
    const now = new Date('2026-11-02T10:00:00.000Z');

    it('builds a generated entry with provenance', () => {
        expect(
            generatedCommentary(
                { text: 'Revenue rose 12%.', promptId: 'p-1' },
                'Summarise revenue',
                now,
            ),
        ).toEqual({
            text: 'Revenue rose 12%.',
            prompt: 'Summarise revenue',
            promptId: 'p-1',
            generatedAt: '2026-11-02T10:00:00.000Z',
            edited: false,
        });
    });

    it('defaults promptId to null when the host returns none', () => {
        expect(
            generatedCommentary({ text: 't' }, 'p', now).promptId,
        ).toBeNull();
    });

    it('marks an edit and keeps generation provenance', () => {
        const generated = generatedCommentary(
            { text: 'original', promptId: 'p-1' },
            'prompt',
            now,
        );
        expect(editedCommentary(generated, 'better text', now)).toEqual({
            ...generated,
            text: 'better text',
            edited: true,
        });
    });

    it('creates a hand-written entry when nothing was generated', () => {
        expect(editedCommentary(null, 'manual note', now)).toEqual({
            text: 'manual note',
            prompt: null,
            promptId: null,
            generatedAt: '2026-11-02T10:00:00.000Z',
            edited: true,
        });
    });
});
