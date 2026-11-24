import {
    describeSemanticLayerProposals,
    toolDraftProjectContextOutputSchema,
    toolProposeSemanticLayerChangeArgsSchema,
    toolProposeSemanticLayerChangeOutputSchema,
    toolReadSemanticModelOutputSchema,
    type StudioChangeSummary,
} from '@lightdash/common';
import type { ProposeSemanticLayerChangeFn } from '../types/aiAgentDependencies';
import {
    getDraftProjectContext,
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
    const changes: StudioChangeSummary[] = [
        {
            name: 'Revenue',
            isCheckedOut: true,
            models: [{ name: 'orders', editedIn: ['by_hand'] }],
        },
    ];
    const list = getListChanges(async () => changes);
    expect(await list.execute?.({}, callOptions)).toMatchObject({
        structuredContent: { changes },
    });
});

it('takes only a path that names a part of a model to remove', () => {
    const parse = (path: string) =>
        toolProposeSemanticLayerChangeArgsSchema.safeParse({
            models: [
                {
                    name: 'orders',
                    yaml: null,
                    remove: [path],
                    removeModel: false,
                },
            ],
            changeName: null,
            note: null,
            options: [],
        });
    [
        'dimensions.amount',
        'dimensions.amount.metrics.revenue',
        'dimensions.amount.additional_dimensions.amount_usd',
        'metrics.average_amount',
        'joins.buyer',
    ].forEach((path) => expect(parse(path).success).toBe(true));
    [
        'revenue',
        'orders.amount',
        'dimensions.amount.revenue',
        'metrics',
    ].forEach((path) => {
        const parsed = parse(path);
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0].message).toContain(
            'dimensions.<name>.metrics.<name>',
        );
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
                        rejection: null,
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
        // The agent ends its turn on this line; the card is the reply.
        expect(output.result).toContain('write nothing more');
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
                    rejection: null,
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
        expect(asked.result).not.toContain('write nothing more');
        const notAsked = await propose(proposeMetric, 'metrics: {}');
        expect(notAsked.result).not.toContain('runMetricQuery');
        expect(notAsked.result).toContain('write nothing more');
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
                        rejection: null,
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

    it('says parts were left out for a result stored before a model joined whole or not at all', () => {
        expect(
            describeSemanticLayerProposals([
                {
                    models: [
                        {
                            model: 'orders',
                            status: 'ready',
                            changes: [
                                { path: 'metrics.total', action: 'removed' },
                            ],
                            refusals: [
                                {
                                    path: 'dimensions.status',
                                    reason: 'name_taken',
                                },
                            ],
                            error: null,
                            rejection: null,
                        },
                    ],
                },
            ]),
        ).toBe('Changed orders in the draft. Some parts were left out.');
    });

    it('tells the agent why a part was refused in a sentence it can act on', async () => {
        const output = await propose(
            async () => ({
                results: [
                    {
                        model: 'orders',
                        status: 'failed',
                        changes: [],
                        refusals: [
                            { path: 'dimensions.status', reason: 'name_taken' },
                        ],
                        error: 'None of this change to orders was added.',
                        rejection: null,
                        notes: [],
                    },
                ],
                diffs: [],
                draftChangeUuid: null,
                startedChange: null,
            }),
            'label: Orders',
        );
        expect(output.result).toContain(
            'refusals: dimensions.status uses a name another field of this model already has.',
        );
        expect(output.result).toContain('Nothing joined the draft.');
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
                        rejection: null,
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
        expect(output.result).not.toContain('write nothing more');
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

describe('getDraftProjectContext', () => {
    const entry = {
        op: 'create' as const,
        id: null,
        kind: 'definition' as const,
        content: '"Active" means ordered in the last 30 days.',
        terms: ['active'],
        objects: [],
    };
    const args = { ...entry, changeName: 'Define active' };

    it('passes the entry and the change name to the draft and says when agents read it', async () => {
        const draftProjectContext = vi.fn(async () => ({
            entryId: 'active',
            op: 'create' as const,
            draftChangeUuid: 'draft-1',
            startedChange: { workspaceUuid: 'workspace-1', name: 'Context' },
        }));
        const tool = getDraftProjectContext({ draftProjectContext });
        const output = toolDraftProjectContextOutputSchema.parse(
            await tool.execute?.(args, callOptions),
        );
        expect(draftProjectContext).toHaveBeenCalledWith(
            entry,
            'Define active',
        );
        expect(output.structuredContent).toEqual({
            entryId: 'active',
            op: 'create',
            draftChangeUuid: 'draft-1',
        });
        expect(output.result).toContain('Added project context entry "active"');
        expect(output.result).toContain('Started draft "Context"');
    });

    it('reports a refusal as an error and drafts nothing', async () => {
        const tool = getDraftProjectContext({
            draftProjectContext: async () => {
                throw new Error('kept in the repository');
            },
        });
        const output = await tool.execute?.(args, callOptions);
        expect(output).toMatchObject({ metadata: { status: 'error' } });
    });
});
