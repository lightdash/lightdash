import {
    DimensionType,
    FieldType,
    FilterOperator,
    SupportedDbtAdapter,
    type Explore,
    type ModelRequiredFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildExploreIndex,
    buildFieldIndex,
    compileMatcher,
    matchLocality,
    selectCandidateFields,
    summarizeRequiredFilters,
} from './grepFieldsIndex';

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

describe('summarizeRequiredFilters', () => {
    it('distinguishes backend-required filters from suggested filters', () => {
        const explore = makeExplore({
            name: 'data_app_usage',
            fields: [{ name: 'timestamp' }, { name: 'role' }],
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

        expect(summarizeRequiredFilters(explore)).toBe(
            '⚠ table filters: required data_app_usage_timestamp inThePast [4]; suggested data_app_usage_role equals ["interactive_viewer"]',
        );
    });
});

describe('compileMatcher word boundaries for short terms', () => {
    it('does not match a short term (≤3 chars) inside a longer word', () => {
        const matches = compileMatcher('led');
        expect(matches('canceled date of the subscription')).toBe(false);
        expect(matches('rolled up scheduled events')).toBe(false);
    });

    it('matches a short term as a whole token', () => {
        const matches = compileMatcher('led');
        expect(matches('sales led growth motion')).toBe(true);
        // underscores separate tokens in field ids
        expect(matches('events_sales_led_flag')).toBe(true);
    });

    it('keeps substring semantics for longer terms', () => {
        const matches = compileMatcher('interactiv');
        expect(matches('rates interactivity of the course')).toBe(true);
    });

    it('keeps AND semantics across ".*" separators', () => {
        const matches = compileMatcher('order.*status');
        expect(matches('status field of the order table')).toBe(true);
        expect(matches('status field of the invoice table')).toBe(false);
    });
});

describe('buildFieldIndex haystack scope', () => {
    // Explore-level hints must not leak into field haystacks: a pattern that
    // only appears in the explore aiHint would otherwise match EVERY field in
    // the explore, flooding grep results with false positives.
    const explore = makeExplore({
        name: 'learner_reviews',
        label: 'Learner Reviews',
        aiHint: 'Canonical explore for ratings, comments and review volume.',
        fields: [
            {
                name: 'customer_name',
                label: 'Customer Name',
                description: 'Company name of the customer.',
            },
            {
                name: 'comment',
                label: 'Comment',
                description: 'Free-text feedback in the reviewer locale.',
            },
        ],
    });

    it('does not match a field via the explore-level aiHint', () => {
        const index = buildFieldIndex([explore]);
        const matches = compileMatcher('comment');
        const customerName = index.find((e) =>
            e.path.endsWith('customer_name'),
        );
        expect(customerName).toBeDefined();
        expect(matches(customerName!.haystack)).toBe(false);
    });

    it('still matches a field via its own name/label/description/hint', () => {
        const index = buildFieldIndex([explore]);
        const matches = compileMatcher('comment');
        const comment = index.find((e) => e.path.endsWith('_comment'));
        expect(comment).toBeDefined();
        expect(matches(comment!.haystack)).toBe(true);
        // description-only match
        expect(compileMatcher('feedback')(comment!.haystack)).toBe(true);
    });

    it('exposes locality haystacks: name/label vs description vs hint', () => {
        const index = buildFieldIndex([
            makeExplore({
                name: 'orders',
                fields: [
                    {
                        name: 'channel',
                        label: 'Channel',
                        description: 'How the order was placed.',
                        aiHint: 'Prefer this for self-serve cuts.',
                    },
                ],
            }),
        ]);
        const [entry] = index;
        expect(compileMatcher('channel')(entry.nameHaystack)).toBe(true);
        expect(compileMatcher('placed')(entry.nameHaystack)).toBe(false);
        expect(compileMatcher('placed')(entry.descHaystack)).toBe(true);
        expect(compileMatcher('self.serve')(entry.hintHaystack)).toBe(true);
    });
});

describe('buildExploreIndex', () => {
    it('matches explore-level name/label/hint so explore hints stay greppable', () => {
        const index = buildExploreIndex([
            makeExplore({
                name: 'learner_reviews',
                label: 'Learner Reviews',
                aiHint: 'Canonical explore for ratings, comments and review volume.',
                fields: [{ name: 'customer_name' }],
            }),
            makeExplore({
                name: 'orders',
                fields: [{ name: 'status' }],
            }),
        ]);
        const matches = compileMatcher('comment');
        const hits = index.filter((e) => matches(e.haystack));
        expect(hits.map((e) => e.exploreName)).toEqual(['learner_reviews']);
    });
});

describe('matchLocality', () => {
    const [entry] = buildFieldIndex([
        makeExplore({
            name: 'orders',
            fields: [
                {
                    name: 'channel',
                    label: 'Channel',
                    description: 'Current fulfilment status.',
                },
            ],
        }),
    ]);

    it('labels the most-specific slice that fully matches', () => {
        expect(matchLocality(entry, compileMatcher('channel'))).toBe('name');
        expect(matchLocality(entry, compileMatcher('fulfilment'))).toBe(
            'description',
        );
    });

    it('labels a cross-slice match "mixed" instead of a slice it did not fully match', () => {
        // "order" only in the name/id, "status" only in the description: the
        // combined haystack matches but no single slice holds both terms, so the
        // label must not claim name/description/hint — it reports "mixed", which
        // also ranks lowest, keeping the label consistent with the sort order.
        expect(matchLocality(entry, compileMatcher('order status'))).toBe(
            'mixed',
        );
    });
});

describe('selectCandidateFields', () => {
    it('uses token-aware matching for short keywords', () => {
        const index = buildFieldIndex([
            makeExplore({
                name: 'events',
                fields: [
                    { name: 'canceled_date', label: 'Canceled date' },
                    { name: 'sales_led_flag', label: 'Sales-led flag' },
                ],
            }),
        ]);

        expect(
            selectCandidateFields(index, ['led']).map((field) => field.path),
        ).toEqual(['events/events_sales_led_flag']);
    });
});
