import {
    toolProposeSemanticLayerChangeOutputSchema,
    toolReadSemanticModelOutputSchema,
} from '@lightdash/common';
import {
    findMetricsToRun,
    findNewModelAdvice,
} from '../../SemanticStudioService/draftLint';
import type { ProposeSemanticLayerChangeFn } from '../types/aiAgentDependencies';
import {
    getListChanges,
    getProposeSemanticLayerChange,
    getReadSemanticModel,
} from './semanticStudioTools';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const callOptions = {
    messages: [],
    toolCallId: 'tool-call-1',
    context: {},
};

const propose = async (
    proposeSemanticLayerChange: ProposeSemanticLayerChangeFn,
    yaml: string,
    canRunMetrics = false,
) => {
    const tool = getProposeSemanticLayerChange({
        proposeSemanticLayerChange,
        canRunMetrics,
    });
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        {
            models: [{ name: 'orders', yaml, remove: [], removeModel: false }],
            changeName: null,
            note: 'Counts refunds too.',
            options: ['Leave refunds out'],
        },
        callOptions,
    );
    return toolProposeSemanticLayerChangeOutputSchema.parse(output);
};

it('lists changes with their checkout and touched models', async () => {
    const changes = [
        { name: 'Revenue', isCheckedOut: true, models: ['orders'] },
    ];
    const list = getListChanges(async () => changes);
    expect(await list.execute?.({}, callOptions)).toMatchObject({
        structuredContent: { changes },
    });
});

describe('getProposeSemanticLayerChange', () => {
    it('reports a passing model as ready, with its diff and its place in the draft', async () => {
        const output = await propose(
            async () => ({
                results: [
                    {
                        model: 'orders',
                        status: 'ready',
                        changes: [{ path: 'metrics.total', action: 'added' }],
                        refusals: [],
                        error: null,
                        notes: [],
                    },
                ],
                diffs: [
                    {
                        model: 'orders',
                        contentBefore: 'before',
                        contentAfter: 'after',
                    },
                ],
                draftChangeUuid: 'draft-1',
                startedChange: null,
            }),
            'label: Orders',
        );
        expect(output.result).toContain('orders: ready');
        expect(output.result).toContain('Nothing is published until');
        expect(output.metadata).toMatchObject({
            status: 'success',
            models: [{ model: 'orders', status: 'ready' }],
            diffs: [{ contentAfter: 'after' }],
            draftChangeUuid: 'draft-1',
            note: 'Counts refunds too.',
            options: ['Leave refunds out'],
        });
    });

    it('asks for a changed metric to be run on the draft when the agent can query it', async () => {
        const proposeMetric: ProposeSemanticLayerChangeFn = async () => ({
            results: [
                {
                    model: 'orders',
                    status: 'ready',
                    changes: [{ path: 'metrics.total', action: 'added' }],
                    refusals: [],
                    error: null,
                    notes: [],
                },
            ],
            diffs: [
                {
                    model: 'orders',
                    contentBefore: 'before',
                    contentAfter: 'after',
                },
            ],
            draftChangeUuid: 'draft-1',
            startedChange: null,
        });
        const asked = await propose(proposeMetric, 'metrics: {}', true);
        expect(asked.result).toContain(
            'check: run orders_total once with runMetricQuery',
        );
        expect(asked.metadata).toMatchObject({ needsFollowUp: true });
        const notAsked = await propose(proposeMetric, 'metrics: {}');
        expect(notAsked.result).not.toContain('runMetricQuery');
        expect(notAsked.metadata).toMatchObject({ needsFollowUp: false });
    });

    it('says when the edit started a change and checked it out', async () => {
        const output = await propose(
            async () => ({
                results: [
                    {
                        model: 'orders',
                        status: 'ready',
                        changes: [{ path: 'metrics.total', action: 'added' }],
                        refusals: [],
                        error: null,
                        notes: [],
                    },
                ],
                diffs: [],
                draftChangeUuid: 'draft-1',
                startedChange: { workspaceUuid: 'w-1', name: 'Order totals' },
            }),
            'label: Orders',
        );
        expect(output.result).toContain(
            'Started draft "Order totals" and checked it out.',
        );
        expect(output.metadata).toMatchObject({
            startedChange: { workspaceUuid: 'w-1', name: 'Order totals' },
        });
    });

    it('says nothing joined the draft when no model passed', async () => {
        const output = await propose(
            async () => ({
                results: [
                    {
                        model: 'orders',
                        status: 'failed',
                        changes: [],
                        refusals: [],
                        error: 'bad YAML',
                        notes: [],
                    },
                ],
                diffs: [],
                draftChangeUuid: null,
                startedChange: null,
            }),
            '- not a mapping',
        );
        expect(output.result).toContain('orders: failed');
        expect(output.result).toContain('Nothing joined the draft');
        // Nothing joined the draft, so there is no card for a note or an offer.
        expect(output.metadata).toMatchObject({ note: null, options: [] });
    });

    it('returns an error when the check throws', async () => {
        const output = await propose(async () => {
            throw new Error('warehouse is down');
        }, 'label: Orders');
        expect(output.metadata.status).toBe('error');
    });
});

describe('getReadSemanticModel', () => {
    const read = async (content: string | null, inDraft = false) => {
        const tool = getReadSemanticModel({
            readSemanticModel: async () => ({
                content,
                inDraft,
                modelNames: ['orders', 'customers'],
            }),
        });
        if (!tool.execute) throw new Error('tool has no execute');
        return toolReadSemanticModelOutputSchema.parse(
            await tool.execute({ name: 'orders' }, callOptions),
        );
    };

    it('returns the YAML of a model', async () => {
        expect((await read('label: Orders')).result).toBe('label: Orders');
    });

    it('says when the YAML is a draft', async () => {
        expect((await read('label: Orders', true)).result).toContain(
            'not live yet',
        );
    });

    it('names the models when the name is unknown', async () => {
        expect((await read(null)).result).toContain('orders, customers');
    });
});

describe('findMetricsToRun', () => {
    it('names the metrics a change adds or redefines, and no others', () => {
        expect(
            findMetricsToRun(
                'orders',
                [
                    { path: 'metrics.total', action: 'added' },
                    {
                        path: 'dimensions.amount.metrics.net.sql',
                        action: 'redefined',
                    },
                    { path: 'metrics.net_rate.filters', action: 'removed' },
                    { path: 'metrics.total.label', action: 'patched' },
                    { path: 'metrics.renamed.label', action: 'patched' },
                    { path: 'metrics.gone', action: 'removed' },
                    { path: 'dimensions.status', action: 'added' },
                ],
                null,
            ),
        ).toEqual(['orders_total', 'orders_net', 'orders_net_rate']);
    });

    it('names every metric of a model that is new', () => {
        expect(
            findMetricsToRun(
                'orders',
                [{ path: 'orders', action: 'created' }],
                `type: model
name: orders
sql_from: public.orders
dimensions:
  - name: id
    type: number
    sql: \${TABLE}.id
    metrics:
      order_count:
        type: count_distinct
metrics:
  total:
    type: sum
    sql: \${TABLE}.id
`,
            ),
        ).toEqual(['orders_order_count', 'orders_total']);
    });
});

describe('findNewModelAdvice', () => {
    const base = `type: model
name: orders
sql_from: public.orders
dimensions:
  - name: id
    type: number
    sql: \${TABLE}.id
metrics:
  total:
    type: sum
    sql: \${TABLE}.id
`;

    it('names a missing primary key and metrics without a description', () => {
        expect(findNewModelAdvice('orders', base)).toEqual([
            'no primary_key: set it to the columns that identify one row; it is checked on the warehouse',
            'no description on total: say in one sentence what each measures',
        ]);
    });

    it('has nothing to say about a model that has both', () => {
        expect(
            findNewModelAdvice(
                'orders',
                `${base}    description: Sum of ids\nprimary_key: id\n`,
            ),
        ).toEqual([]);
    });
});
