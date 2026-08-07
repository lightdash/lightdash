import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { executeGrepFields } from './grepFields';

type FieldSpec = {
    name: string;
    label?: string;
    description?: string;
    aiHint?: string | string[];
};

const makeExplore = (over: { name: string; fields: FieldSpec[] }): Explore => ({
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: over.name,
    label: over.name,
    tags: [],
    spotlight: { visibility: 'show', categories: [] },
    baseTable: over.name,
    joinedTables: [],
    tables: {
        [over.name]: {
            name: over.name,
            label: over.name,
            database: 'test_db',
            schema: 'public',
            sqlTable: over.name,
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            description: undefined,
            dimensions: Object.fromEntries(
                over.fields.map((f) => [
                    f.name,
                    {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: f.name,
                        label: f.label ?? f.name,
                        table: over.name,
                        tableLabel: over.name,
                        sql: `\${TABLE}.${f.name}`,
                        hidden: false,
                        source: undefined,
                        compiledSql: `${over.name}.${f.name}`,
                        tablesReferences: [over.name],
                        description: f.description,
                        aiHint: f.aiHint,
                    },
                ]),
            ),
            metrics: {},
            lineageGraph: {},
        },
    },
});

const noFts = (async () => ({
    topMatchingFields: [],
})) as unknown as FindExploresFn;

const run = (
    explores: Explore[],
    patterns: string[],
    upgradeBudgetChars: number,
    verifiedFieldUsage = new Map<string, number>(),
) =>
    executeGrepFields(
        { patterns, exploreName: null },
        {
            availableExplores: explores,
            findExplores: noFts,
            verifiedFieldUsage,
            upgradeBudgetChars,
        },
    );

// A hint that exceeds the 160-char preview, with a recognizable caveat at the
// very end — the incident shape: the critical text lives past the cutoff.
const CAVEAT = 'KNOWN ONE-OFF: a bulk onboarding inflated July, never trend it';
const longHint = (filler: string) => `${filler.repeat(60)} ${CAVEAT}`;

describe('grepFields upgrade budget', () => {
    it('renders the top-ranked field hint in full, incident shape', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [
                {
                    name: 'assignment_rate',
                    label: 'Assignment Rate',
                    aiHint: longHint('rate '),
                },
                // Loose matches: pattern hits only their hint text.
                ...Array.from({ length: 5 }, (_, i) => ({
                    name: `other_${i}`,
                    aiHint: `mentions rate here ${'x'.repeat(300)} tail-${i}`,
                })),
            ],
        });
        const verified = new Map([['orders_assignment_rate::dimension', 3]]);
        // Budget covers the name-matching verified field but not all five
        // loose matches too.
        const { result } = await run([explore], ['rate'], 500, verified);
        expect(result).toContain(CAVEAT);
        expect(result).toContain('...(truncated)');
    });

    it('marks truncated tails and appends the getMetadata nudge', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [
                { name: 'status', aiHint: `status ${'long '.repeat(80)}end` },
            ],
        });
        const { result } = await run([explore], ['status'], 0);
        expect(result).toContain('...(truncated)');
        expect(result).toContain('call getMetadata');
    });

    it('emits no marker and no nudge when everything fits the preview', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [{ name: 'status', aiHint: 'short hint' }],
        });
        const { result } = await run([explore], ['status'], 20_000);
        expect(result).not.toContain('...(truncated)');
        expect(result).not.toContain('call getMetadata');
    });

    it('renders an upgraded field in full only at its first occurrence', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [
                {
                    name: 'revenue_total',
                    label: 'Revenue',
                    aiHint: longHint('revenue sales '),
                },
            ],
        });
        // Both patterns match the same field; the full hint (with the caveat)
        // must appear once, the repeat occurrence keeps the preview.
        const { result } = await run([explore], ['revenue', 'sales'], 20_000);
        expect(result.split(CAVEAT).length - 1).toBe(1);
    });

    it('skips a field that does not fit and still upgrades cheaper ones', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [
                {
                    name: 'huge',
                    label: 'huge target',
                    aiHint: `target ${'filler '.repeat(400)} HUGE-TAIL`,
                },
                {
                    name: 'small',
                    label: 'small target',
                    aiHint: `target ${'x'.repeat(200)} SMALL-TAIL`,
                },
            ],
        });
        const { result } = await run([explore], ['target'], 300);
        expect(result).not.toContain('HUGE-TAIL');
        expect(result).toContain('SMALL-TAIL');
    });

    it('spends the budget by rank across patterns, not pattern order', async () => {
        // Pattern 1 (broad) matches many fields via hint text only; pattern 2
        // matches one field by name. With a budget that covers a single
        // upgrade, the name-locality match must win despite coming later.
        const explore = makeExplore({
            name: 'orders',
            fields: [
                ...Array.from({ length: 10 }, (_, i) => ({
                    name: `noise_${i}`,
                    aiHint: `broad ${'y'.repeat(250)} NOISE-TAIL-${i}`,
                })),
                {
                    name: 'exact_match',
                    label: 'Exact Match',
                    aiHint: `broad ${'z'.repeat(250)} EXACT-TAIL`,
                },
            ],
        });
        const { result } = await run([explore], ['broad', 'exact_match'], 200);
        expect(result).toContain('EXACT-TAIL');
        expect(result).not.toContain('NOISE-TAIL-0');
    });
});
