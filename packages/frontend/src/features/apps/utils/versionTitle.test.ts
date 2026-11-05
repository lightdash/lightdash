import { describe, expect, it } from 'vitest';
import { splitVersionPrompt, versionTitle } from './versionTitle';

describe('splitVersionPrompt', () => {
    it('skips filler openers and keeps them out of the rest', () => {
        expect(
            splitVersionPrompt(
                'Nice. Two changes: add a filter. Keep sorting.',
            ),
        ).toEqual({
            headline: 'Two changes: add a filter.',
            rest: 'Keep sorting.',
        });
    });

    it('does not split on abbreviations', () => {
        expect(
            splitVersionPrompt('Show the change (e.g. "+12%") under each KPI.')
                .headline,
        ).toBe('Show the change (e.g. "+12%") under each KPI.');
    });

    it('returns no rest for a one-sentence prompt', () => {
        expect(splitVersionPrompt('Add a region filter to the page')).toEqual({
            headline: 'Add a region filter to the page',
            rest: null,
        });
    });
});

describe('versionTitle', () => {
    it('strips markdown links and falls back to the version number', () => {
        expect(versionTitle('Copy of [Pulse app](/apps/1) please', 2)).toBe(
            'Copy of Pulse app please',
        );
        expect(versionTitle('', 3)).toBe('Version 3');
    });
});
