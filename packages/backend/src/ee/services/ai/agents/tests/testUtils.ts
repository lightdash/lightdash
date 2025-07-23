import {
    CompiledDimension,
    CompiledMetric,
    DimensionType,
    Explore,
    FieldType,
    MetricType,
    capitalize,
} from '@lightdash/common';
import { CoreAssistantMessage, CoreMessage, CoreToolMessage } from 'ai';
import {
    DbAiAgentToolCall,
    DbAiAgentToolResult,
} from '../../../../database/entities/ai';
import { getOpenaiGptmodel } from '../../models/openai-gpt';
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import {
    StoreToolCallFn,
    StoreToolResultsFn,
} from '../../types/aiAgentDependencies';
import { AiAgentExploreSummary } from '../../types/aiAgentExploreSummary';

export const createMessage = (
    content: string,
    role: Exclude<CoreMessage['role'], 'tool'> = 'user',
) => ({
    role,
    content,
});

export const createToolMessages = (
    data: Array<{
        toolCallId: string;
        toolName: string;
        toolArgs: object;
        result: unknown;
    }>,
) => [
    {
        role: 'assistant' as const,
        content: data.map((tc) => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.toolArgs,
        })),
    } satisfies CoreAssistantMessage,
    {
        role: 'tool' as const,
        content: data.map((tc) => ({
            type: 'tool-result' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            result: tc.result,
        })),
    } satisfies CoreToolMessage,
];

export const createToolMessage = ({
    toolCallId,
    toolName,
    result,
}: {
    toolCallId: string;
    toolName: string;
    result: unknown;
}) => ({
    role: 'tool' as const,
    content: [
        {
            type: 'tool-result' as const,
            toolCallId,
            toolName,
            result,
        },
    ],
});

const createDimension = (
    name: string,
    label: string,
    description: string,
    type: string,
    tableName: string,
): CompiledDimension =>
    ({
        name,
        label,
        description,
        type: type as DimensionType,
        table: tableName,
        tableLabel: capitalize(tableName),
        sql: `\${${tableName}.${name}}`,
        hidden: false,
        compiledSql: `\${${tableName}.${name}}`,
        tablesReferences: [tableName],
        fieldType: FieldType.DIMENSION,
    } satisfies CompiledDimension);

const createMetric = (
    name: string,
    label: string,
    description: string,
    sql: string,
    tableName: string,
): CompiledMetric =>
    ({
        name,
        label,
        description,
        type: MetricType.NUMBER,
        table: tableName,
        tableLabel: capitalize(tableName),
        sql,
        hidden: false,
        compiledSql: sql,
        tablesReferences: [tableName],
        fieldType: FieldType.METRIC,
    } satisfies CompiledMetric);

export const mockExploresSummary = [
    {
        name: 'users',
        label: 'Users',
        description: 'users table',
        baseTable: 'users',
        joinedTables: [],
    },
    {
        name: 'payments',
        label: 'Payments',
        description: 'This table has information about individual payments',
        baseTable: 'payments',
        joinedTables: ['orders', 'customers'],
    },
    {
        name: 'customers',
        label: 'Customers',
        description:
            "# Customers\n\nThis table has basic information about a customer, as well as some derived\nfacts based on a customer's orders\n",
        baseTable: 'customers',
        joinedTables: [],
    },
    {
        name: 'tracks',
        label: 'Tracks',
        description: 'tracks table',
        baseTable: 'tracks',
        joinedTables: [],
    },
    {
        name: 'orders',
        label: 'Orders',
        description:
            'This table has basic information about orders, as well as some derived\nfacts based on payments\n\n# Order Status\n\nOrders can be one of the following statuses:\n\n| status         | description                                                                                                            |\n| -------------- | ---------------------------------------------------------------------------------------------------------------------- |\n| placed         | The order has been placed but has not yet left the warehouse                                                           |\n| shipped        | The order has ben shipped to the customer and is currently in transit                                                  |\n| completed      | The order has been received by the customer                                                                            |\n| return_pending | The customer has indicated that they would like to return the order, but it has not yet been received at the warehouse |\n| returned       | The order has been returned by the customer and received at the warehouse                                              |',
        baseTable: 'orders',
        joinedTables: ['customers'],
    },
    {
        name: 'events',
        label: 'Events',
        description: 'events table',
        baseTable: 'events',
        joinedTables: [],
    },
] satisfies AiAgentExploreSummary[];

const EXPLORE_CONFIGS = {
    customers: {
        dimensions: [
            {
                name: 'customer_id',
                label: 'Customer ID',
                description: 'Unique identifier for customers',
                type: 'string',
            },
            {
                name: 'customer_name',
                label: 'Customer Name',
                description: 'Full name of the customer',
                type: 'string',
            },
            {
                name: 'customer_email',
                label: 'Customer Email',
                description: 'Email address of the customer',
                type: 'string',
            },
        ],
        metrics: [
            {
                name: 'total_revenue',
                label: 'Total Revenue',
                description: 'Total revenue generated by customer',
                sql: 'SUM(${customers.revenue})',
            },
            {
                name: 'order_count',
                label: 'Order Count',
                description: 'Number of orders placed by customer',
                sql: 'COUNT(${customers.orders})',
            },
        ],
    },
    orders: {
        dimensions: [
            {
                name: 'order_id',
                label: 'Order ID',
                description: 'Unique identifier for orders',
                type: 'string',
            },
            {
                name: 'order_date',
                label: 'Order Date',
                description: 'Date when the order was placed',
                type: 'date',
            },
            {
                name: 'status',
                label: 'Order Status',
                description: 'Current status of the order',
                type: 'string',
            },
        ],
        metrics: [
            {
                name: 'total_amount',
                label: 'Total Amount',
                description: 'Total amount of the order',
                sql: 'SUM(${orders.amount})',
            },
            {
                name: 'order_count',
                label: 'Order Count',
                description: 'Count of orders',
                sql: 'COUNT(*)',
            },
        ],
    },
    payments: {
        dimensions: [
            {
                name: 'payment_id',
                label: 'Payment ID',
                description: 'Unique identifier for payments',
                type: 'string',
            },
            {
                name: 'payment_method',
                label: 'Payment Method',
                description: 'Method used for payment',
                type: 'string',
            },
        ],
        metrics: [
            {
                name: 'payment_amount',
                label: 'Payment Amount',
                description: 'Amount of the payment',
                sql: 'SUM(${payments.amount})',
            },
        ],
    },
} as const;

const getFieldNamesFromConfig = (exploreName: string): string[] => {
    const config = EXPLORE_CONFIGS[exploreName as keyof typeof EXPLORE_CONFIGS];
    if (!config) return ['id', 'count'];

    const dimensionNames = config.dimensions.map((d) => d.name);
    const metricNames = config.metrics.map((m) => m.name);
    return [...dimensionNames, ...metricNames];
};

export const createMockExplore = (exploreName: string): Explore => {
    const config = EXPLORE_CONFIGS[exploreName as keyof typeof EXPLORE_CONFIGS];
    const summary = mockExploresSummary.find((e) => e.name === exploreName);

    let tables;

    if (config) {
        const dimensions = Object.fromEntries(
            config.dimensions.map((dim) => [
                dim.name,
                createDimension(
                    dim.name,
                    dim.label,
                    dim.description,
                    dim.type,
                    exploreName,
                ),
            ]),
        );

        const metrics = Object.fromEntries(
            config.metrics.map((metric) => [
                metric.name,
                createMetric(
                    metric.name,
                    metric.label,
                    metric.description,
                    metric.sql,
                    exploreName,
                ),
            ]),
        );

        tables = {
            [exploreName]: {
                name: exploreName,
                label: capitalize(exploreName),
                description: `${capitalize(exploreName)} information table`,
                dimensions,
                metrics,
            },
        };
    } else {
        tables = {
            [exploreName]: {
                name: exploreName,
                label: capitalize(exploreName),
                description: `${exploreName} table`,
                dimensions: {
                    id: createDimension(
                        'id',
                        'ID',
                        `Unique identifier for ${exploreName}`,
                        'string',
                        exploreName,
                    ),
                },
                metrics: {
                    count: createMetric(
                        'count',
                        'Count',
                        `Count of ${exploreName}`,
                        'COUNT(*)',
                        exploreName,
                    ),
                },
            },
        };
    }

    return {
        name: exploreName,
        label: capitalize(exploreName),
        tags: [],
        baseTable: summary?.baseTable || exploreName,
        joinedTables: [],
        targetDatabase: undefined,
        tables,
    } as unknown as Explore;
};

export const createArgs =
    ({ apiKey, modelName }: { apiKey: string; modelName: string }) =>
    ({
        agentSettings,
        messageHistory,
        ...options
    }: Partial<Omit<AiAgentArgs, 'agentSettings'>> & {
        agentSettings?: Partial<AiAgentArgs['agentSettings']>;
    } = {}) => {
        const model = getOpenaiGptmodel({
            apiKey,
            modelName,
        });

        return {
            debugLoggingEnabled: false,
            model,
            agentSettings: {
                uuid: 'agent-uuid',
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                integrations: [],
                tags: null,
                name: 'Test Agent',
                createdAt: new Date(),
                updatedAt: new Date(),
                instruction: null,
                imageUrl: null,
                groupAccess: [],
                ...agentSettings,
            },
            messageHistory: messageHistory ?? [],
            promptUuid: 'prompt-uuid',
            threadUuid: 'thread-uuid',
            maxLimit: 5_000,
            organizationId: 'org-uuid',
            userId: 'user-uuid',
            ...options,
        } satisfies AiAgentArgs;
    };

const getExplores = jest
    .fn()
    .mockImplementation(async () => mockExploresSummary);

const getExplore = jest.fn().mockImplementation(async ({ exploreName }) => {
    const explore = mockExploresSummary.find((e) => e.name === exploreName);
    if (!explore) {
        throw new Error(`Explore '${exploreName}' not found`);
    }
    const data = createMockExplore(exploreName);
    return data;
});

const searchFields = jest.fn().mockImplementation(async ({ exploreName }) => {
    const explore = mockExploresSummary.find((e) => e.name === exploreName);
    if (!explore) {
        throw new Error(`Explore '${exploreName}' not found`);
    }
    const data = getFieldNamesFromConfig(exploreName);
    return data;
});

const runMiniMetricQuery = jest.fn().mockImplementation(async (query) => ({
    rows: [
        {
            customers_customer_id: 'cust_001',
            customers_customer_name: 'John Doe',
            customers_customer_email: 'john.doe@example.com',
            customers_total_revenue: 1500,
            customers_order_count: 3,
        },
        {
            customers_customer_id: 'cust_002',
            customers_customer_name: 'Jane Smith',
            customers_customer_email: 'jane.smith@example.com',
            customers_total_revenue: 2300,
            customers_order_count: 5,
        },
    ],
    fields: {
        customers_customer_id: {
            name: 'customer_id',
            label: 'Customer ID',
            description: 'Unique identifier for customers',
            type: 'string',
            fieldType: 'dimension',
        },
        customers_customer_name: {
            name: 'customer_name',
            label: 'Customer Name',
            description: 'Full name of the customer',
            type: 'string',
            fieldType: 'dimension',
        },
        customers_customer_email: {
            name: 'customer_email',
            label: 'Customer Email',
            description: 'Email address of the customer',
            type: 'string',
            fieldType: 'dimension',
        },
        customers_total_revenue: {
            name: 'total_revenue',
            label: 'Total Revenue',
            description: 'Total revenue generated by customer',
            type: 'number',
            fieldType: 'metric',
        },
        customers_order_count: {
            name: 'order_count',
            label: 'Order Count',
            description: 'Number of orders placed by customer',
            type: 'number',
            fieldType: 'metric',
        },
    },
    cacheMetadata: {},
}));

export const createMockDepsFactory = () => {
    const toolCalls = new Map<string, Parameters<StoreToolCallFn>[0]>();
    const toolResults = new Map<string, Parameters<StoreToolResultsFn>[0][0]>();

    const storeToolCall: StoreToolCallFn = async (data) => {
        toolCalls.set(data.toolCallId, data);
    };

    const storeToolResults: StoreToolResultsFn = async (data) => {
        data.forEach((x) => {
            toolResults.set(x.toolCallId, x);
        });
    };

    return {
        dependencies: {
            getExplores,
            getExplore,
            searchFields,
            runMiniMetricQuery,

            getPrompt: jest.fn().mockImplementation(async () => ({
                promptUuid: 'prompt-uuid',
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                createdAt: new Date(),
                updatedAt: new Date(),
                userUuid: 'user-uuid',
                content: `prompt-content`,
                response: undefined,
            })),

            storeToolCall: jest.fn().mockImplementation(storeToolCall),
            storeToolResults: jest.fn().mockImplementation(storeToolResults),

            // TODO: Update these when needed
            sendFile: jest.fn().mockResolvedValue(undefined),
            updateProgress: jest.fn().mockResolvedValue(undefined),
            updatePrompt: jest.fn().mockResolvedValue(undefined),
            trackEvent: jest.fn(),
        } satisfies AiAgentDependencies,
        internal: {
            toolCalls,
            toolResults,
            getToolCallsAndResults: () => {
                const data = Array.from(toolCalls.values()).map((call) => ({
                    ...call,
                    result: toolResults.get(call.toolCallId)!.result!,
                }));
                return data;
            },
            cleanAllToolCallsAndResults: () => {
                toolCalls.clear();
                toolResults.clear();
            },
        },
    };
};

type Tool = keyof AiAgentDependencies;

export const promptTestUtils = {
    // TODO: Add a way to check arguments so we can use toHaveBeenCalledWith!
    expectCorrectToolUsage: (deps: AiAgentDependencies, tools: Tool[]) => {
        tools.forEach((tool) => {
            expect(deps[tool]).toHaveBeenCalled();
        });
    },

    expectCorrectToolCalls: (
        data: {
            result: string;
            promptUuid: string;
            toolCallId: string;
            toolName: string;
            toolArgs: object;
        }[],
        expected: string[],
    ) => {
        const calls = data.map((d) => d.toolName);
        expect(calls).toEqual(expected);
    },

    expectResponseWithContent: (
        response: string,
        match: string | RegExp | Array<string>,
    ) => {
        const lowerResponse = response.toLowerCase();
        if (Array.isArray(match)) {
            match.forEach((m) => {
                expect(lowerResponse).toMatch(m);
            });
        } else {
            expect(lowerResponse).toMatch(match);
        }
    },
};
