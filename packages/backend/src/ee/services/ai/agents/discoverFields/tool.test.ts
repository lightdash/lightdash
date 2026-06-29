import {
    DimensionType,
    FieldType,
    MetricType,
    type Explore,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import type { UIMessageChunk } from 'ai';
import { runDiscoverFieldsAgent } from './agent';
import type { DiscoverFieldsSelectionV2 } from './schema';
import { getDiscoverFields } from './tool';

jest.mock('@sentry/node', () => ({
    captureException: jest.fn(),
    getActiveSpan: jest.fn(() => undefined),
}));

jest.mock('./agent', () => ({
    runDiscoverFieldsAgent: jest.fn(),
}));

type DiscoverFieldsTool = ReturnType<typeof getDiscoverFields>;

const makeExplore = (): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        baseTable: 'orders',
        joinedTables: [],
        tables: {
            orders: {
                dimensions: {
                    status: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'status',
                        label: 'Status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.status',
                        hidden: false,
                    },
                    hidden_status: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'hidden_status',
                        label: 'Hidden status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.hidden_status',
                        hidden: true,
                    },
                },
                metrics: {
                    count: {
                        fieldType: FieldType.METRIC,
                        type: MetricType.COUNT,
                        name: 'count',
                        label: 'Count',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.id',
                        hidden: false,
                    },
                },
            },
        },
    }) as unknown as Explore;

const makeResolvedSelection = (
    overrides: Partial<
        Extract<DiscoverFieldsSelectionV2, { status: 'resolved' }>
    > = {},
): DiscoverFieldsSelectionV2 => ({
    status: 'resolved',
    exploreName: 'orders',
    dimensionIds: ['orders_status'],
    metricIds: ['orders_count'],
    rationale: null,
    uncertainties: null,
    ...overrides,
});

const makeUiMessageStream = (selection: DiscoverFieldsSelectionV2) => {
    const chunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'message-1' },
        {
            type: 'tool-input-available',
            toolCallId: 'submit-result-call',
            toolName: 'submitResult',
            input: { handoff: selection },
        },
        { type: 'finish' },
    ];

    return new ReadableStream<UIMessageChunk>({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(chunk));
            controller.close();
        },
    });
};

const mockSubagentSelection = (selection: DiscoverFieldsSelectionV2) => {
    jest.mocked(runDiscoverFieldsAgent).mockReturnValue({
        stream: {
            toUIMessageStream: () => makeUiMessageStream(selection),
        },
        flushPersistence: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof runDiscoverFieldsAgent>);
};

const makeTool = ({
    getExplore = jest.fn().mockResolvedValue(makeExplore()),
}: {
    getExplore?: jest.Mock;
} = {}): DiscoverFieldsTool =>
    getDiscoverFields(
        {
            model: {} as never,
            callOptions: {},
            providerOptions: undefined,
            availableExplores: [makeExplore()],
            findFieldsPageSize: 25,
            promptUuid: 'prompt-uuid',
            telemetry: {
                agentSettings: {
                    uuid: 'agent-uuid',
                    name: 'Agent',
                    projectUuid: 'project-uuid',
                } as never,
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                telemetryEnabled: false,
                model: {} as never,
            },
        },
        {
            findExplores: jest.fn(),
            findFields: jest.fn(),
            getExplore,
            listExplores: jest.fn(),
            storeToolCall: jest.fn().mockResolvedValue(undefined),
            storeToolResults: jest.fn().mockResolvedValue(undefined),
            updateProgress: jest.fn().mockResolvedValue(undefined),
        } as never,
    );

const executeTool = async (tool: DiscoverFieldsTool) => {
    const outputs = [];
    const result = tool.execute!(
        { userQuery: 'orders by status', agentInstruction: null },
        { messages: [], toolCallId: 'discover-fields-call' } as never,
    ) as unknown as AsyncIterable<{ metadata: unknown }>;

    for await (const output of result) {
        outputs.push(output);
    }

    return outputs;
};

describe('discoverFields recoverable handoff errors', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does not capture empty resolved selections to Sentry', async () => {
        mockSubagentSelection(
            makeResolvedSelection({ dimensionIds: [], metricIds: [] }),
        );

        const outputs = await executeTool(makeTool());

        expect(outputs.at(-1)?.metadata).toEqual({ status: 'error' });
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('does not capture unknown field selectors to Sentry', async () => {
        mockSubagentSelection(
            makeResolvedSelection({ dimensionIds: ['orders_missing'] }),
        );

        const outputs = await executeTool(makeTool());

        expect(outputs.at(-1)?.metadata).toEqual({ status: 'error' });
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('does not capture wrong field buckets to Sentry', async () => {
        mockSubagentSelection(
            makeResolvedSelection({ dimensionIds: ['orders_count'] }),
        );

        const outputs = await executeTool(makeTool());

        expect(outputs.at(-1)?.metadata).toEqual({ status: 'error' });
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('does not capture hidden field selectors to Sentry', async () => {
        mockSubagentSelection(
            makeResolvedSelection({ dimensionIds: ['orders_hidden_status'] }),
        );

        const outputs = await executeTool(makeTool());

        expect(outputs.at(-1)?.metadata).toEqual({ status: 'error' });
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('still captures infrastructure errors to Sentry', async () => {
        const error = new Error('database unavailable');
        mockSubagentSelection(makeResolvedSelection());

        const outputs = await executeTool(
            makeTool({ getExplore: jest.fn().mockRejectedValue(error) }),
        );

        expect(outputs.at(-1)?.metadata).toEqual({ status: 'error' });
        expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
});
