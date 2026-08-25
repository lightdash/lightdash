import { describe, expect, it } from 'vitest';
import { renderContentDiff } from './contentDiff';

// eslint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\[[0-9;]*m/g, '');

describe('renderContentDiff', () => {
    it('returns empty for identical documents (transport fields ignored)', () => {
        const doc = { name: 'A', slug: 'a', metricQuery: { limit: 500 } };
        expect(
            renderContentDiff(
                { ...doc, updatedAt: new Date('2026-01-01') },
                { ...doc, downloadedAt: new Date('2026-02-02') },
                { current: 'instance', incoming: 'git' },
            ),
        ).toBe('');
    });

    it('shows removed instance lines and added git lines with context', () => {
        const current = {
            name: 'A',
            slug: 'a',
            description: 'edited on the instance',
            metricQuery: { limit: 500 },
        };
        const incoming = {
            name: 'A',
            slug: 'a',
            description: 'what git wants',
            metricQuery: { limit: 500 },
        };
        const out = strip(
            renderContentDiff(current, incoming, {
                current: 'project (current)',
                incoming: 'git (this upload)',
            }),
        );
        expect(out).toContain('--- project (current)');
        expect(out).toContain('+++ git (this upload)');
        expect(out).toContain('- description: edited on the instance');
        expect(out).toContain('+ description: what git wants');
        expect(out).toContain('metricQuery:');
    });

    it('truncates very large diffs', () => {
        const current = Object.fromEntries(
            Array.from({ length: 120 }, (_, i) => [`key${i}`, 'old']),
        );
        const incoming = Object.fromEntries(
            Array.from({ length: 120 }, (_, i) => [`key${i}`, 'new']),
        );
        const out = strip(
            renderContentDiff(current, incoming, {
                current: 'instance',
                incoming: 'git',
            }),
        );
        expect(out).toContain('more changed lines');
    });
});
