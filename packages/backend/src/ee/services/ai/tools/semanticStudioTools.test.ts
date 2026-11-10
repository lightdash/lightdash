import {
    toolProposeSemanticLayerChangeOutputSchema,
    toolReadSemanticModelOutputSchema,
} from '@lightdash/common';
import { findNewModelAdvice } from '../../SemanticStudioService/draftLint';
import type { ProposeSemanticLayerChangeFn } from '../types/aiAgentDependencies';
import {
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
) => {
    const tool = getProposeSemanticLayerChange({ proposeSemanticLayerChange });
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        {
            models: [{ name: 'orders', yaml, remove: [], removeModel: false }],
        },
        callOptions,
    );
    return toolProposeSemanticLayerChangeOutputSchema.parse(output);
};

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
            }),
            'label: Orders',
        );
        expect(output.result).toContain('orders: ready');
        expect(output.result).toContain('Nothing is live until');
        expect(output.metadata).toMatchObject({
            status: 'success',
            models: [{ model: 'orders', status: 'ready' }],
            diffs: [{ contentAfter: 'after' }],
            draftChangeUuid: 'draft-1',
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
                    },
                ],
                diffs: [],
                draftChangeUuid: null,
            }),
            '- not a mapping',
        );
        expect(output.result).toContain('orders: failed');
        expect(output.result).toContain('Nothing joined the draft');
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
