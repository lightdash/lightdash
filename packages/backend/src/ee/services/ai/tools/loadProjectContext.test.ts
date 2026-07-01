import type { ProjectContextEntry } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getLoadProjectContext } from './loadProjectContext';

const entries: ProjectContextEntry[] = [
    {
        id: 'arr-def',
        kind: 'context',
        content: 'ARR means annual recurring revenue',
        terms: ['arr', 'revenue'],
        objects: [],
    },
    {
        id: 'sao-def',
        kind: 'context',
        content: 'A sales accepted opportunity',
        terms: ['sao'],
        objects: [],
    },
    {
        id: 'unrelated',
        kind: 'context',
        content: 'onboarding',
        terms: [],
        objects: [],
    },
];

const run = (patterns?: string[]) => {
    const tool = getLoadProjectContext({ getDocument: async () => entries });
    // Tool.execute is (args, options); options is unused here.
    return (
        tool.execute as unknown as (
            a: unknown,
            o: unknown,
        ) => Promise<{
            result: string;
            metadata: { entryIds?: string[] };
        }>
    )({ patterns }, {});
};

describe('loadProjectContext tool', () => {
    it('loads all entries when no patterns are given', async () => {
        const res = await run();
        expect(res.metadata.entryIds).toEqual([
            'arr-def',
            'sao-def',
            'unrelated',
        ]);
    });

    it('loads only matching entries when patterns are given', async () => {
        const res = await run(['revenue']);
        expect(res.metadata.entryIds).toEqual(['arr-def']);
        expect(res.result).toContain('ARR means annual recurring revenue');
        expect(res.result).not.toContain('onboarding');
    });

    it('lists available entries when nothing matches', async () => {
        const res = await run(['nonexistent_xyz']);
        expect(res.metadata.entryIds).toEqual([]);
        expect(res.result).toContain('No context entry matched');
        expect(res.result).toContain('arr-def');
        expect(res.result).toContain('sao-def');
    });
});
