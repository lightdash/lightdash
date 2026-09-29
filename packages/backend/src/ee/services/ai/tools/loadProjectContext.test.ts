import {
    toolLoadProjectContextOutputSchema,
    type ProjectContextEntry,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import Logger from '../../../../logging/logger';
import { stripMemoryBlocks } from '../utils/memoryBlock';
import { getLoadProjectContext } from './loadProjectContext';
import type { ProjectContextSearchEntry } from './memoryProjectContext';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

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
        objects: [
            {
                type: 'field',
                explore: 'rpt_gtm_mission_control',
                fieldId: 'opportunities_sao_date',
            },
        ],
    },
    {
        id: 'unrelated',
        kind: 'context',
        content: 'onboarding',
        terms: [],
        objects: [],
    },
    {
        id: 'legacy-ref',
        kind: 'context',
        content: 'Use the legacy orders reference',
        terms: [],
        objects: ['legacy_orders'],
    },
];

const memoryEntry: ProjectContextSearchEntry = {
    id: 'completed-order-revenue',
    kind: 'context',
    content: 'Use completed orders for recognized revenue.',
    terms: ['recognized revenue'],
    objects: [],
    source: 'memory',
    memoryScope: 'user',
    memoryAgeDays: 2,
};

const run = async (
    patterns?: string[],
    options: {
        getDocument?: () => Promise<ProjectContextSearchEntry[]>;
        includeMemories?: boolean;
        onEntriesLoaded?: (
            loaded: ProjectContextSearchEntry[],
        ) => Promise<void>;
    } = {},
) => {
    const tool = getLoadProjectContext({
        getDocument: options.getDocument ?? (async () => entries),
        includeMemories: options.includeMemories,
        onEntriesLoaded: options.onEntriesLoaded,
    });
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        { patterns },
        { toolCallId: 'tool-call', messages: [], context: {} },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('tool output is a stream');
    }
    return output;
};

describe('loadProjectContext tool', () => {
    it('loads all entries when no patterns are given', async () => {
        const res = await run();
        expect(res.metadata).toMatchObject({
            entryIds: ['arr-def', 'sao-def', 'unrelated', 'legacy-ref'],
        });
        expect(res.structuredContent).toMatchObject({
            outcome: 'loaded',
            entries: [
                { id: 'arr-def' },
                { id: 'sao-def' },
                { id: 'unrelated' },
                { id: 'legacy-ref' },
            ],
        });
    });

    it('loads only matching entries when patterns are given', async () => {
        const res = await run(['revenue']);
        expect(res.metadata).toMatchObject({ entryIds: ['arr-def'] });
        expect(res.result).toBe(
            '- id: arr-def; kind: context; terms: arr, revenue; content: ARR means annual recurring revenue',
        );
        expect(res.structuredContent).toEqual({
            outcome: 'loaded',
            entries: [
                {
                    id: 'arr-def',
                    source: 'context',
                    kind: 'context',
                    terms: ['arr', 'revenue'],
                    objects: [],
                    content: 'ARR means annual recurring revenue',
                },
            ],
        });
        expect(toolLoadProjectContextOutputSchema.safeParse(res).success).toBe(
            true,
        );
    });

    it('renders typed refs with owning explores', async () => {
        const res = await run(['opportunities_sao_date']);
        expect(res.result).toContain(
            'field "opportunities_sao_date" in explore "rpt_gtm_mission_control"',
        );
        expect(res.structuredContent).toMatchObject({
            entries: [
                {
                    id: 'sao-def',
                    objects: [
                        {
                            type: 'field',
                            explore: 'rpt_gtm_mission_control',
                            fieldId: 'opportunities_sao_date',
                        },
                    ],
                },
            ],
        });
    });

    it('renders legacy string refs', async () => {
        const res = await run(['legacy_orders']);
        expect(res.result).toContain('refs: legacy_orders');
        expect(res.structuredContent).toMatchObject({
            entries: [{ id: 'legacy-ref', objects: ['legacy_orders'] }],
        });
    });

    it('reports an empty context', async () => {
        const res = await run(undefined, { getDocument: async () => [] });
        expect(res.result).toBe(
            'No project context is configured for this project.',
        );
        expect(res.structuredContent).toEqual({
            outcome: 'loaded',
            entries: [],
        });
        expect(toolLoadProjectContextOutputSchema.safeParse(res).success).toBe(
            true,
        );
    });

    it('lists available entries when nothing matches', async () => {
        const res = await run(['nonexistent_xyz']);
        expect(res.metadata).toMatchObject({ entryIds: [] });
        expect(res.result).toContain('No context entry matched');
        expect(res.result).toContain('4 entries exist');
        expect(res.result).toContain('arr-def');
        expect(res.result).toContain('sao-def');
        expect(res.result).not.toContain('annual recurring revenue');
        expect(res.structuredContent).toEqual({
            outcome: 'no_match',
            totalEntries: 4,
            available: [
                {
                    id: 'arr-def',
                    source: 'context',
                    kind: 'context',
                    terms: ['arr', 'revenue'],
                },
                {
                    id: 'sao-def',
                    source: 'context',
                    kind: 'context',
                    terms: ['sao'],
                },
                {
                    id: 'unrelated',
                    source: 'context',
                    kind: 'context',
                    terms: [],
                },
                {
                    id: 'legacy-ref',
                    source: 'context',
                    kind: 'context',
                    terms: [],
                },
            ],
        });
        expect(toolLoadProjectContextOutputSchema.safeParse(res).success).toBe(
            true,
        );
    });

    it('labels memory hits and records only selected entries', async () => {
        const onEntriesLoaded = vi.fn().mockResolvedValue(undefined);
        const res = await run(['recognized revenue'], {
            getDocument: async () => [
                { ...entries[2], source: 'context' },
                memoryEntry,
            ],
            includeMemories: true,
            onEntriesLoaded,
        });

        expect(res.result).toContain(
            '<ld-memory id="completed-order-revenue" scope="user" age_days="2"',
        );
        expect(onEntriesLoaded).toHaveBeenCalledWith([memoryEntry]);
        expect(res.structuredContent).toEqual({
            outcome: 'loaded',
            entries: [
                {
                    id: 'completed-order-revenue',
                    source: 'memory',
                    scope: 'user',
                    ageDays: 2,
                    objects: [],
                    content: 'Use completed orders for recognized revenue.',
                },
            ],
        });
        expect(toolLoadProjectContextOutputSchema.safeParse(res).success).toBe(
            true,
        );
    });

    it('fences memory metadata in the no-match inventory', async () => {
        const res = await run(['no-match'], {
            getDocument: async () => [
                { ...entries[0], source: 'context' },
                memoryEntry,
            ],
            includeMemories: true,
        });

        expect(res.result).toContain('<ld-memory id="completed-order-revenue"');
        expect(stripMemoryBlocks(res.result)).not.toContain(
            'completed-order-revenue',
        );
        expect(stripMemoryBlocks(res.result)).not.toContain(
            'recognized revenue',
        );
        expect(res.structuredContent).toEqual({
            outcome: 'no_match',
            totalEntries: 2,
            available: [
                {
                    id: 'arr-def',
                    source: 'context',
                    kind: 'context',
                    terms: ['arr', 'revenue'],
                },
                {
                    id: 'completed-order-revenue',
                    source: 'memory',
                    scope: 'user',
                    ageDays: 2,
                    objects: [],
                    terms: ['recognized revenue'],
                },
            ],
        });
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
        expect(res.metadata).toMatchObject({ entryIds: ['arr-def'] });
        expect(warn).toHaveBeenCalledWith(
            '[ProjectContext] failed to record loaded entries',
            expect.any(Error),
        );
    });

    it('returns an error envelope when the document cannot be loaded', async () => {
        vi.spyOn(Logger, 'error').mockImplementation(() => Logger);
        const res = await run(['revenue'], {
            getDocument: async () => {
                throw new Error('context file unreadable');
            },
        });

        expect(res.metadata).toEqual({ status: 'error' });
        expect(res.result).toContain('Error loading project context');
        expect(res.result).toContain('context file unreadable');
        expect(res.structuredContent).toEqual({ error: res.result });
        expect(toolLoadProjectContextOutputSchema.safeParse(res).success).toBe(
            true,
        );
    });
});
