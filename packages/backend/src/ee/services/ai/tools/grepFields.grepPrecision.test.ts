import {
    DimensionType,
    FieldType,
    FilterOperator,
    SupportedDbtAdapter,
    type Explore,
    type ModelRequiredFilterRule,
    type ToolOutputSuccessItem,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getGrepFields } from './grepFields';

type FieldSpec = {
    name: string;
    label?: string;
    description?: string;
    aiHint?: string;
};

const makeExplore = (over: {
    name: string;
    label?: string;
    aiHint?: string | string[];
    fields: FieldSpec[];
    requiredFilters?: ModelRequiredFilterRule[];
}): Explore => ({
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: over.name,
    label: over.label ?? over.name,
    tags: [],
    aiHint: over.aiHint,
    spotlight: { visibility: 'show', categories: [] },
    baseTable: over.name,
    joinedTables: [],
    tables: {
        [over.name]: {
            name: over.name,
            label: over.label ?? over.name,
            database: 'test_db',
            schema: 'public',
            sqlTable: over.name,
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            description: undefined,
            requiredFilters: over.requiredFilters,
            dimensions: Object.fromEntries(
                over.fields.map((f) => [
                    f.name,
                    {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: f.name,
                        label: f.label ?? f.name,
                        table: over.name,
                        tableLabel: over.label ?? over.name,
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

type StringToolOutput = Extract<ToolOutputSuccessItem, { type: 'string' }>;

const noFtsResults = vi.fn(async () => ({
    topMatchingFields: [],
})) as unknown as FindExploresFn;

const execute = async (
    tool: ReturnType<typeof getGrepFields>,
    args: { patterns: string[]; exploreName: string | null },
): Promise<StringToolOutput> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tool.execute!(args, {} as any);
    if (Symbol.asyncIterator in result) {
        throw new Error('Expected a non-streaming result');
    }
    if (
        Array.isArray(result) ||
        result.status !== 'success' ||
        result.type !== 'string'
    ) {
        throw new Error('Expected a successful string result');
    }
    return result;
};

describe('grepFields locality ranking', () => {
    it('shows a name-matching unverified field above verified description-only matches', async () => {
        // 45 verified fields matching only via description + 1 unverified field
        // matching by name. With verified-first-only ranking the name match is
        // pushed below the 40-result display cap and the agent never sees it.
        const junkFields: FieldSpec[] = Array.from({ length: 45 }, (_, i) => ({
            name: `junk_field_${i}`,
            label: `Junk Field ${i}`,
            description: 'Distribution channel adjacent notes.',
        }));
        const unrelatedFields: FieldSpec[] = Array.from(
            { length: 5 },
            (_, i) => ({
                name: `plain_field_${i}`,
                label: `Plain Field ${i}`,
                description: 'Nothing relevant here.',
            }),
        );
        const explore = makeExplore({
            name: 'subscription_events',
            fields: [
                ...junkFields,
                ...unrelatedFields,
                {
                    name: 'channel',
                    label: 'Channel',
                    description: 'Self-serve vs sales-assisted.',
                },
            ],
        });
        const verifiedFieldUsage = new Map(
            junkFields.map((f) => [
                `subscription_events_${f.name}::dimension`,
                5,
            ]),
        );
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores: noFtsResults,
            verifiedFieldUsage,
        });
        const { result } = await execute(tool, {
            patterns: ['channel'],
            exploreName: 'subscription_events',
        });
        expect(result).toContain('subscription_events_channel');
        const channelIdx = result.indexOf('subscription_events_channel');
        const junkIdx = result.indexOf('subscription_events_junk_field_');
        expect(channelIdx).toBeLessThan(junkIdx);
    });
});

describe('grepFields table filters', () => {
    it('shows required and suggested filters distinctly', async () => {
        const explore = makeExplore({
            name: 'data_app_usage',
            fields: [{ name: 'role', label: 'Role' }],
            requiredFilters: [
                {
                    id: 'required-filter',
                    target: { fieldRef: 'timestamp' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [4],
                    required: true,
                },
                {
                    id: 'default-filter',
                    target: { fieldRef: 'role' },
                    operator: FilterOperator.EQUALS,
                    values: ['interactive_viewer'],
                    required: false,
                },
            ],
        });
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores: noFtsResults,
            verifiedFieldUsage: new Map(),
        });

        const { result } = await execute(tool, {
            patterns: ['role'],
            exploreName: 'data_app_usage',
        });

        expect(result).toContain('⚠ table filters:');
        expect(result).toContain(
            'required data_app_usage_timestamp inThePast [4]',
        );
        expect(result).toContain(
            'suggested data_app_usage_role equals ["interactive_viewer"]',
        );
        expect(result).not.toContain('must be applied');
    });
});

describe('grepFields all-fields-match no-signal guard', () => {
    it('treats a pattern matching every field in scope as no signal and falls back to FTS', async () => {
        const explore = makeExplore({
            name: 'subscription_events',
            fields: Array.from({ length: 30 }, (_, i) => ({
                name: `subscription_attr_${i}`,
                label: `Subscription Attr ${i}`,
            })),
        });
        const findExplores = vi.fn(async () => ({
            topMatchingFields: [
                {
                    tableName: 'subscription_events',
                    name: 'subscription_attr_0',
                    label: 'Subscription Attr 0',
                    fieldType: 'dimension',
                    description: undefined,
                    verifiedChartUsage: 0,
                    chartUsage: 0,
                    searchRank: 1,
                },
            ],
        })) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });
        const { result } = await execute(tool, {
            patterns: ['subscription'],
            exploreName: 'subscription_events',
        });
        expect(result).toMatch(/matched all 30 fields/i);
        expect(findExplores).toHaveBeenCalled();
    });
});

describe('grepFields explore-level matches', () => {
    it('surfaces an explore pointer when only the explore hint matches, instead of flooding fields', async () => {
        const explore = makeExplore({
            name: 'learner_reviews',
            label: 'Learner Reviews',
            aiHint: 'Canonical explore for ratings, comments and review volume.',
            fields: [
                { name: 'customer_name', label: 'Customer Name' },
                { name: 'rating', label: 'Rating' },
            ],
        });
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores: noFtsResults,
            verifiedFieldUsage: new Map(),
        });
        const { result } = await execute(tool, {
            patterns: ['comment'],
            exploreName: null,
        });
        // points at the explore…
        expect(result).toContain('learner_reviews');
        // …without dumping fields that don't themselves match
        expect(result).not.toContain('customer_name');
    });
});
