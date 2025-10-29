import {
    AiAgent,
    AVAILABLE_VISUALIZATION_TYPES,
    CatalogType,
    isDateItem,
} from '@lightdash/common';
import { CatalogSearchContext } from '../../../../../models/CatalogModel/CatalogModel';
import {
    getServices,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';

export const testCases: TestCase[] = [
    {
        name: 'should be able to tell the user what data models are available to explore with their agent',
        prompt: 'What data models are available?',
        expectedAnswer: async ({ services, agent }) => {
            const { data: tables } =
                await services.catalogService.searchCatalog({
                    projectUuid: agent.projectUuid!,
                    catalogSearch: {
                        type: CatalogType.Table,
                    },
                    userAttributes: {},
                    context: CatalogSearchContext.AI_AGENT,
                    paginateArgs: {
                        page: 1,
                        pageSize: 100,
                    },
                });
            const tablesText = tables.map((table) => table.name).join(', ');
            return `You can explore data models such as ${tablesText}`;
        },
        expectedToolOutcome:
            'It should have skipped the tool calls because the agent has access to the data models already',
    },
    {
        name: 'should be able to get total revenue',
        prompt: 'What is the total revenue?',
        expectedAnswer: '3,053.87',
        expectedToolOutcome:
            'It should have used the findFields tool and then generated a table to get the total amount of revenue 3,053.87',
    },
    {
        name: 'should generate a time-series chart',
        prompt: 'Generate a time-series chart of revenue over time monthly',
        expectedAnswer:
            "I've generated a chart of revenue over time (monthly) using 'Total revenue' metric from the Payments explore. The x-axis represents month and the y-axis represents revenue of that month.",
        expectedToolOutcome:
            'It should have used the appropriated tools to find information about revenue over time. It must have used the time series tool to generate the chart',
        expectedArgsValidation: [
            {
                toolName: 'generateTimeSeriesVizConfig',
                expectedArgs: {
                    vizConfig: {
                        limit: 1000,
                        sorts: [
                            {
                                fieldId: 'orders_order_date_month',
                                descending: false,
                            },
                        ],
                        lineType: 'line',
                        yMetrics: ['payments_total_revenue'],
                        xAxisLabel: 'Order date month',
                        xDimension: 'orders_order_date_month',
                        yAxisLabel: 'Total revenue',
                        exploreName: 'payments',
                        breakdownByDimension: null,
                    },
                },
            },
        ],
    },
    {
        name: 'should retrieve relevant context for a time-based query',
        prompt: 'Show me revenue by month from the orders data',
        contextRelevancy: {
            context: async ({ services, agent, testContext }) => {
                const ordersExplore = await services.projectService.getExplore(
                    testContext.testUserSessionAccount,
                    agent.projectUuid!,
                    'orders',
                );
                const exploreDateFields: string[] = Object.values(
                    ordersExplore.tables.orders.dimensions,
                ).reduce((acc: string[], field) => {
                    if (isDateItem(field)) {
                        acc.push(
                            `Field: ${field.name}, Label: ${field.label}, Description: ${field.description}`,
                        );
                    }
                    return acc;
                }, []);
                return [...exploreDateFields, 'Explore: orders'];
            },
        },
    },
    {
        name: 'should answer "How many orders were there in 2024?" and generate a one line result',
        prompt: 'How many orders were there in 2024?',
        expectedAnswer: 'There were 53 orders in 2024',
    },
    {
        name: 'gives an intro explanation of what the agent can do',
        prompt: 'What can you do?',
        expectedAnswer: async ({ services, agent }) => {
            const availableExplores =
                await services.catalogService.searchCatalog({
                    projectUuid: agent.projectUuid!,
                    catalogSearch: {
                        type: CatalogType.Table,
                    },
                    userAttributes: {},
                    context: CatalogSearchContext.AI_AGENT,
                });
            const availableExploresText = availableExplores.data
                .map((explore) => explore.name)
                .join(', ');
            return `I can help you analyze your data with the following explores: ${availableExploresText}
          I can give you a summary of the data in each explore, breakdown by categories, show trends over time, and generate charts and tables.
          Chart types available are bar charts, time series charts, and tables.
          `;
        },
    },
    // Limitation response quality tests
    {
        name: 'should provide specific limitations for forecasting request',
        prompt: 'Can you forecast the revenue for next quarter?',
        expectedAnswer:
            'I cannot perform statistical forecasting or predictive modeling. I can only work with historical data visualization and aggregation using the explores available this project',
    },
    {
        name: 'should provide specific limitations for unsupported calculated metric request',
        prompt: 'Create a table showing each customer, their total spending on orders, total shipping fees paid, total taxes paid, and the sum of all these costs combined.',
        expectedAnswer:
            'I cannot perform this request exactly as stated because I am unable to create new calculated columns or metrics that combine multiple fields directly in the table output. I can only display existing fields and metrics defined in your data model.',
    },
    {
        name: 'should provide specific limitations for unsupported calculated field request',
        prompt: 'Create a table showing each customer, their customer id, and their full name (first name + last name).',
        expectedAnswer:
            'I cannot perform this request exactly as stated because I am unable to create new calculated columns or fields. I can only display existing fields and metrics defined in your data model.',
    },
    {
        name: 'should provide specific limitations for unsupported custom sql request',
        prompt: 'Write a custom SQL query to join customers and orders and calculate lifetime value (sum of all purchases for each customer over time).',
        expectedAnswer:
            'I cannot perform this request because I am unable to create or execute custom SQL queries directly. I can only use the existing explores, fields, and metrics defined in your data model.',
    },
    {
        name: 'should provide specific limitations for unsupported visualization request',
        prompt: 'Create a scatter chart of total order amount versus region',
        expectedAnswer: `I can only create ${AVAILABLE_VISUALIZATION_TYPES.join(
            ', ',
        )}. I cannot create scatter plots or other advanced visualization types`,
    },
    {
        name: 'should provide specific limitations for conversation history request',
        prompt: 'What did we talk about yesterday?',
        expectedAnswer:
            'I do not have access to previous conversations or memory of past interactions. Each session is stateless, so I can only reference messages from our current conversation.',
    },
];

type Context = {
    services: ReturnType<typeof getServices>;
    agent: AiAgent;
    testContext: IntegrationTestContext;
};

export type TestCase = {
    name: string;
    prompt: string;
    expectedAnswer?: string | ((context: Context) => Promise<string>);
    expectedToolOutcome?: string;
    expectedArgsValidation?: Array<{
        toolName: string;
        expectedArgs: Record<string, unknown>;
    }>;
    contextRelevancy?: {
        context: string[] | ((context: Context) => Promise<string[]>);
        threshold?: number;
    };
};
