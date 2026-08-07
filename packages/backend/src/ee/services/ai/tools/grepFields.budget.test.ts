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
    verifiedFieldUsage = new Map<string, number>(),
) =>
    executeGrepFields(
        { patterns, exploreName: null },
        {
            availableExplores: explores,
            findExplores: noFts,
            verifiedFieldUsage,
        },
    );

// A hint that exceeds the 160-char preview, with a recognizable caveat at the
// very end — the incident shape: the critical text lives past the cutoff.
const CAVEAT = 'KNOWN ONE-OFF: a bulk onboarding inflated July, never trend it';
const longHint = (filler: string) => `${filler.repeat(60)} ${CAVEAT}`;

// Enough hint-heavy fields to exhaust the tool's fixed upgrade budget, so the
// scarcity cases below exercise the real ceiling rather than an injected one.
const budgetHogs = (term: string, count: number, charsEach: number) =>
    Array.from({ length: count }, (_, i) => ({
        name: `hog_${i}`,
        aiHint: `${term} ${'y'.repeat(charsEach)} HOG-TAIL-${i}`,
    }));

// Fields no test pattern matches, so a grep never matches its whole scope —
// which would be reported as no-signal instead of returning results.
const decoys = Array.from({ length: 5 }, (_, i) => ({
    name: `unrelated_${i}`,
    aiHint: 'nothing to see',
}));

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
                // Loose matches whose hints alone would exhaust the budget.
                ...budgetHogs('rate', 30, 1_000),
                ...decoys,
            ],
        });
        const verified = new Map([['orders_assignment_rate::dimension', 3]]);
        const { result } = await run([explore], ['rate'], verified);
        expect(result).toContain(CAVEAT);
        expect(result).toContain('...(truncated)');
    });

    it('marks truncated tails and appends the getMetadata nudge', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [...budgetHogs('target', 30, 1_000), ...decoys],
        });
        const { result } = await run([explore], ['target']);
        expect(result).toContain('...(truncated)');
        expect(result).toContain('call getMetadata');
    });

    it('emits no marker and no nudge when everything fits the preview', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [{ name: 'status', aiHint: 'short hint' }],
        });
        const { result } = await run([explore], ['status']);
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
        const { result } = await run([explore], ['revenue', 'sales']);
        expect(result.split(CAVEAT).length - 1).toBe(1);
    });

    it('skips a field larger than the whole budget and still upgrades cheaper ones', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [
                {
                    name: 'huge',
                    label: 'huge target',
                    aiHint: `target ${'filler '.repeat(4_000)} HUGE-TAIL`,
                },
                {
                    name: 'small',
                    label: 'small target',
                    aiHint: `target ${'x'.repeat(200)} SMALL-TAIL`,
                },
            ],
        });
        const { result } = await run([explore], ['target']);
        expect(result).not.toContain('HUGE-TAIL');
        expect(result).toContain('SMALL-TAIL');
    });

    it('spends the budget by rank across patterns, not pattern order', async () => {
        // Pattern 1 (broad) matches hint text on enough fields to drain the
        // budget; pattern 2 matches one field by name. The name-locality match
        // must still be upgraded despite its pattern coming second.
        const explore = makeExplore({
            name: 'orders',
            fields: [
                ...budgetHogs('broad', 30, 1_000),
                {
                    name: 'exact_match',
                    label: 'Exact Match',
                    aiHint: `broad ${'z'.repeat(250)} EXACT-TAIL`,
                },
                ...decoys,
            ],
        });
        const { result } = await run([explore], ['broad', 'exact_match']);
        expect(result).toContain('EXACT-TAIL');
        expect(result).toContain('...(truncated)');
    });
});
