import { describe, expect, it } from 'vitest';
import { filterProjectContext } from './filterProjectContext';
import type { ProjectContextSearchEntry } from './memoryProjectContext';

type ContextEntry = Extract<ProjectContextSearchEntry, { source: 'context' }>;

const entry = (over: Partial<ContextEntry>): ContextEntry => ({
    source: 'context',
    id: 'e',
    slug: 'e-deadbeef',
    kind: 'context',
    content: '',
    terms: [],
    objects: [],
    ...over,
});

const ids = (result: ProjectContextSearchEntry[]): string[] =>
    result.map((e) => (e.source === 'context' ? e.id : e.slug));

const entries: ContextEntry[] = [
    entry({
        id: 'arr-def',
        content: 'ARR means annual recurring revenue in AUD',
        terms: ['arr', 'revenue'],
    }),
    entry({
        id: 'sao-def',
        content: 'A sales accepted opportunity',
        terms: ['sao'],
        objects: [
            {
                type: 'field',
                explore: 'rpt_gtm_mission_control',
                fieldId: 'opportunities_sao_date',
            },
        ],
    }),
    entry({
        id: 'legacy-ref',
        content: 'Legacy project context entry',
        objects: ['legacy_orders'],
    }),
    entry({ id: 'unrelated', content: 'onboarding checklist steps' }),
];

describe('filterProjectContext', () => {
    it('returns all entries when no patterns are given', () => {
        expect(filterProjectContext(entries, [])).toEqual(entries);
    });

    it('matches on content', () => {
        expect(ids(filterProjectContext(entries, ['revenue']))).toEqual([
            'arr-def',
        ]);
    });

    it('matches on terms and objects', () => {
        expect(ids(filterProjectContext(entries, ['mission_control']))).toEqual(
            ['sao-def'],
        );
        expect(ids(filterProjectContext(entries, ['legacy_orders']))).toEqual([
            'legacy-ref',
        ]);
        expect(
            ids(filterProjectContext(entries, ['opportunities_sao_date'])),
        ).toEqual(['sao-def']);
    });

    it('ORs across patterns and ranks multi-pattern hits first', () => {
        // arr-def hits both "arr" and "revenue"; sao-def hits only "sao".
        expect(
            ids(filterProjectContext(entries, ['sao', 'arr|revenue'])),
        ).toEqual(['arr-def', 'sao-def']);
    });

    it('returns [] when nothing matches', () => {
        expect(filterProjectContext(entries, ['nonexistent_xyz'])).toEqual([]);
    });
});
