import type { ProjectContextEntry } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { filterProjectContext } from './filterProjectContext';

const entry = (over: Partial<ProjectContextEntry>): ProjectContextEntry => ({
    id: 'e',
    kind: 'context',
    content: '',
    terms: [],
    objects: [],
    ...over,
});

const entries: ProjectContextEntry[] = [
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
        expect(
            filterProjectContext(entries, ['revenue']).map((e) => e.id),
        ).toEqual(['arr-def']);
    });

    it('matches on terms and objects', () => {
        expect(
            filterProjectContext(entries, ['mission_control']).map((e) => e.id),
        ).toEqual(['sao-def']);
        expect(
            filterProjectContext(entries, ['legacy_orders']).map((e) => e.id),
        ).toEqual(['legacy-ref']);
        expect(
            filterProjectContext(entries, ['opportunities_sao_date']).map(
                (e) => e.id,
            ),
        ).toEqual(['sao-def']);
    });

    it('ORs across patterns and ranks multi-pattern hits first', () => {
        // arr-def hits both "arr" and "revenue"; sao-def hits only "sao".
        expect(
            filterProjectContext(entries, ['sao', 'arr|revenue']).map(
                (e) => e.id,
            ),
        ).toEqual(['arr-def', 'sao-def']);
    });

    it('returns [] when nothing matches', () => {
        expect(filterProjectContext(entries, ['nonexistent_xyz'])).toEqual([]);
    });
});
