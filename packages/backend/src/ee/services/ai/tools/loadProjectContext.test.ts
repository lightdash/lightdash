import type { ProjectContextCitableEntry } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import Logger from '../../../../logging/logger';
import { stripMemoryBlocks } from '../utils/memoryBlock';
import { getLoadProjectContext } from './loadProjectContext';
import type { ProjectContextSearchEntry } from './memoryProjectContext';

type ContextEntry = Extract<ProjectContextSearchEntry, { source: 'context' }>;

const entries: ContextEntry[] = [
    {
        source: 'context',
        id: 'arr-def',
        slug: 'arr-def-deadbeef',
        kind: 'context',
        content: 'ARR means annual recurring revenue',
        terms: ['arr', 'revenue'],
        objects: [],
    },
    {
        source: 'context',
        id: 'sao-def',
        slug: 'sao-def-deadbeef',
        kind: 'context',
        content: 'A sales accepted opportunity',
        terms: ['sao'],
        objects: [
            {
                type: 'field',
                explore: 'rpt_gtm_mission_control',
                fieldId: 'opportunities_sao_date',
            },
        ],
    },
    {
        source: 'context',
        id: 'unrelated',
        slug: 'unrelated-deadbeef',
        kind: 'context',
        content: 'onboarding',
        terms: [],
        objects: [],
    },
    {
        source: 'context',
        id: 'legacy-ref',
        slug: 'legacy-ref-deadbeef',
        kind: 'context',
        content: 'Use the legacy orders reference',
        terms: [],
        objects: ['legacy_orders'],
    },
];

const run = (
    patterns?: string[],
    options: {
        entries?: ProjectContextSearchEntry[];
        includeMemories?: boolean;
        onEntriesLoaded?: (
            loaded: ProjectContextSearchEntry[],
        ) => Promise<void>;
    } = {},
) => {
    const tool = getLoadProjectContext({
        getDocument: async () => options.entries ?? entries,
        includeMemories: options.includeMemories,
        onEntriesLoaded: options.onEntriesLoaded,
    });
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
            'arr-def-deadbeef',
            'sao-def-deadbeef',
            'unrelated-deadbeef',
            'legacy-ref-deadbeef',
        ]);
    });

    it('loads only matching entries when patterns are given', async () => {
        const res = await run(['revenue']);
        expect(res.metadata.entryIds).toEqual(['arr-def-deadbeef']);
        expect(res.result).toBe(
            '- id: arr-def-deadbeef; source: context; kind: context; terms: arr, revenue; content: ARR means annual recurring revenue',
        );
    });

    it('renders typed refs with owning explores', async () => {
        const res = await run(['opportunities_sao_date']);
        expect(res.result).toContain(
            'field "opportunities_sao_date" in explore "rpt_gtm_mission_control"',
        );
    });

    it('renders legacy string refs', async () => {
        const res = await run(['legacy_orders']);
        expect(res.result).toContain('refs: legacy_orders');
    });

    it('lists available entries when nothing matches', async () => {
        const res = await run(['nonexistent_xyz']);
        expect(res.metadata.entryIds).toEqual([]);
        expect(res.result).toContain('No context entry matched');
        expect(res.result).toContain('arr-def');
        expect(res.result).toContain('sao-def');
    });

    it('labels memory hits and records only selected entries', async () => {
        const onEntriesLoaded = vi.fn().mockResolvedValue(undefined);
        const memoryEntry: ProjectContextSearchEntry = {
            slug: 'completed-order-revenue',
            content: 'Use completed orders for recognized revenue.',
            terms: ['recognized revenue'],
            objects: [],
            source: 'memory',
            memoryScope: 'user',
            memoryAgeDays: 2,
        };
        const res = await run(['recognized revenue'], {
            entries: [entries[2], memoryEntry],
            includeMemories: true,
            onEntriesLoaded,
        });

        expect(res.result).toContain(
            '<ld-memory id="completed-order-revenue" source="memory" scope="user" age_days="2"',
        );
        expect(onEntriesLoaded).toHaveBeenCalledWith([memoryEntry]);
    });

    it('fences memory metadata in the no-match inventory', async () => {
        const memoryEntry: ProjectContextSearchEntry = {
            slug: 'completed-order-revenue',
            content: 'Use completed orders for recognized revenue.',
            terms: ['recognized revenue'],
            objects: [],
            source: 'memory',
            memoryScope: 'user',
            memoryAgeDays: 2,
        };
        const res = await run(['no-match'], {
            entries: [entries[0], memoryEntry],
            includeMemories: true,
        });

        expect(res.result).toContain('<ld-memory id="completed-order-revenue"');
        expect(stripMemoryBlocks(res.result)).not.toContain(
            'completed-order-revenue',
        );
        expect(stripMemoryBlocks(res.result)).not.toContain(
            'recognized revenue',
        );
    });

    it('returns entries when pull telemetry fails', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        const res = await run(['revenue'], {
            includeMemories: true,
            onEntriesLoaded: vi
                .fn()
                .mockRejectedValue(new Error('telemetry failed')),
        });

        expect(res.result).toContain('ARR means annual recurring revenue');
        expect(res.metadata.entryIds).toEqual(['arr-def-deadbeef']);
        expect(warn).toHaveBeenCalledWith(
            '[ProjectContext] failed to record loaded entries',
            expect.any(Error),
        );
    });
});
