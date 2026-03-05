import { AiAgent, CatalogType } from '@lightdash/common';
import { CatalogSearchContext } from '../../../../../models/CatalogModel/CatalogModel';
import {
    getServices,
    IntegrationTestContext,
} from '../../../../../vitest.setup.integration';

export const testCases: TestCase[] = [
    {
        prompt: 'What can you do?',
        expectedAnswer: async ({ services, agent, testContext }) => {
            const filteredExplores =
                await services.aiAgentService.getAvailableExplores(
                    testContext.testUser,
                    testContext.testProjectUuid,
                    ['core'],
                );
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
                        pageSize: 30,
                    },
                    filteredExplores,
                });
            const tablesText = tables.map((table) => table.name).join(', ');
            return [
                `It explains it can help the user analyze data`,
                `It can create charts and tables`,
                `It can summarize metrics`,
                `It can show trends over time`,
                `It can find existing dashboards or saved charts`,
                `It can work with information from (some of the following) explores ${tablesText}`,
            ].join('\n');
        },
        expectedToolOutcome:
            'It should have skipped the tool calls because the agent has access to the data models already',
    },
    {
        name: 'should ask for clarification on the correct explore and metric',
        prompt: 'What is our total revenue?',
        expectedAnswer:
            'Asks for clarification to determine the correct explore and metric',
        expectedToolOutcome: [
            `It should have used the findExplores tool to ask for clarification on the correct explore and metric`,
        ].join('\n'),
    },
    {
        name: 'should use the correct explore and metric when question is specific',
        prompt: 'What is our total order revenue in 2024?',
        expectedAnswer: 'Replies with total amount of revenue 1,189.60',
        expectedToolOutcome: [
            `Explore: payments`,
            `Metric: total revenue`,
            `Filter: order date year 2024`,
        ].join('\n'),
    },
    {
        name: 'should use a base table, and add a filter from a joined table',
        // IMPORTANT: This test case is crucial because it tests the ability of the agent to use filters from joined tables (uses payments explore but filters on orders table).
        prompt: 'Revenue in Q3 2024 for the "credit_card" and "coupon" payment methods, displayed as a bar chart.',
        expectedAnswer: [
            `The response included the following information:`,
            `explore: payments`,
            `metrics: total revenue`,
            `breakdown by dimension: payment method, with revenue data for credit_card and coupon in Q3 2024`,
        ].join('\n'),
        expectedToolOutcome: [
            `runQuery tool args should have filters: Order date in Q3 2024 (July-September 2024) and Payment method (credit_card, coupon)`,
            'Should use a date filter (from orders explore) for Q3 2024',
            'Should use filter for filtering the payment method',
            'Default visualization should be a bar chart',
        ].join('\n'),
    },
    {
        // IMPORTANT: This test case is crucial because it tests the ability of the agent to use filters from joined tables (uses payments explore but filters on customers table).
        name: 'should use a field from a base table, but add a filter from another joined table',
        prompt: 'payments from credit cards that were from customers created between 2023-01-01 and 2024-12-31',
        expectedAnswer:
            'Replies with payments from credit cards that were from customers created between 2023 and 2024',
        expectedToolOutcome: [
            `runQuery tool args should have filters: Customer creation date between 2023-01-01 and 2024-12-31 and Payment method (credit_card)`,
            'Should use a date filter (from customers explore) for the date range',
            'Should use filter for filtering the payment method',
            'Default visualization could be a table or a bar chart',
        ].join('\n'),
    },
    {
        name: 'should provide specific limitations for forecasting request',
        prompt: 'Can you forecast the revenue for next quarter?',
        expectedAnswer:
            'I cannot perform statistical forecasting or future values',
    },
    {
        name: 'should provide specific limitations for unsupported custom dimensions',
        prompt: 'Create a table showing each customer, their customer id, and their full name (first name + last name).',
        expectedAnswer:
            'I cannot perform this request exactly as stated because I am unable to create new calculated columns or fields. I can only display existing fields and metrics defined in your data model.',
    },
    {
        name: 'should provide specific limitations for unsupported custom sql request',
        prompt: 'Write a custom SQL query to join customers and orders and calculate lifetime value (sum of all purchases for each customer over time).',
        expectedAnswer:
            'I cannot perform this request because I am unable to create or execute custom SQL queries directly.',
    },
    {
        name: 'should provide specific limitations for conversation history request',
        prompt: 'What did we talk about yesterday?',
        expectedAnswer:
            'I do not have access to previous conversations or memory of past interactions.',
    },
    {
        prompt: 'Show me data from the nonexistent_table explore',
        expectedAnswer:
            'I could not find an explore or table named "nonexistent_table". The available explores are:',
    },
    {
        prompt: 'Show me the fake_metric_that_does_not_exist metric',
        expectedAnswer:
            'I could not find a field or metric named "fake_metric_that_does_not_exist"',
    },
    {
        prompt: 'Show me orders where the order amount is greater than 1000000',
        expectedAnswer: 'Replies with a message that there are no such orders',
        expectedToolOutcome: [
            'Should use filter for filtering the order amount greater than 1000000',
            'Should handle the empty result case',
        ].join('\n'),
    },
    {
        prompt: 'Show me the status field',
        expectedAnswer: [
            `The response asked for clarification or listed multiple matching fields`,
            `It may have found: order status, payment status`,
        ].join('\n'),
    },
    {
        prompt: 'Find any existing charts or dashboards about revenue',
        expectedAnswer: [
            `The response used the findContent tool to search for existing content`,
            `It returned a list of dashboards and/or charts matching the search query`,
            `Each result included the name, description, and a link to view it`,
        ].join('\n'),
        expectedToolOutcome:
            'It should have used the findContent tool with search query related to "revenue"',
    },
    // Custom metrics
    {
        prompt: 'Give me an average amount per payment method for 2024',
        expectedAnswer: [
            `Response contains average amount for each payment method in 2024`,
        ].join('\n'),
        expectedToolOutcome: [
            `The response created a custom metric for average amount`,
            `The custom metric is used as a metric in the query and chart configs`,
        ].join('\n'),
    },
    {
        prompt: 'Give me an average amount per payment method for 2024, sorted ascending, filter out averages less than 5',
        expectedAnswer:
            'Response contains average amount for each payment method in 2024',
        expectedToolOutcome: [
            `The response created a custom metric for average amount`,
            `The custom metric is used as a metric in the query and chart configs`,
            `The custom metric is sorted ascending`,
            `The custom metric is filtered out averages less than 5`,
        ].join('\n'),
    },
    {
        prompt: "what's the total order shipping cost by month in 2024, how does it change MoM?",
        expectedAnswer: [
            `Response contains total order shipping cost by month in 2024 and MoM change`,
        ].join('\n'),
        expectedToolOutcome: [
            `The response created:`,
            `- a custom metric for total order shipping cost`,
            `- a table calculation for MoM change, referencing the above mentioned custom metric`,
            `Both the custom metric and table calculation are used in the chart config`,
            `Date dimension is used for sorting and x-axis`,
        ].join('\n'),
    },
    {
        name: 'should use explicit date filter for time windows instead of limit+sort',
        prompt: 'Show me total order amount by month in 2024, only completed and placed orders',
        expectedAnswer: [
            `Response contains total order amount by month in 2024`,
            `explore: orders`,
            `dimension: order date month`,
            `metric: total order amount`,
            `filter: order date in 2024 and status in (completed, placed)`,
        ].join('\n'),
        expectedToolOutcome: [
            `The response used an explicit date filter for 2024 (e.g. between 2024-01-01 and 2024-12-31, or year equals 2024, or similar)`,
            `The response did NOT rely on limit property combined with sort to approximate the time window`,
            `The response added a dimension filter for status with values ["completed", "placed"]`,
            `Both filters are combined in the filters object (date AND status)`,
        ].join('\n'),
    },
    {
        name: 'should combine explicit date filter with dimension filters and custom metrics',
        prompt: 'Average shipping cost per order by week for standard and express shipping methods in 2024',
        expectedAnswer: [
            `Response contains average shipping cost per order by week in 2024`,
            `explore: orders`,
            `dimension: order date week, shipping method`,
            `custom metric: average shipping cost per order`,
            `filters: order date in 2024 AND shipping method in (standard, express)`,
        ].join('\n'),
        expectedToolOutcome: [
            `The response created a custom metric for average shipping cost per order`,
            `The response used explicit date filter for 2024 (e.g. between 2024-01-01 and 2024-12-31, or year equals 2024, or similar)`,
            `The response added a dimension filter for shipping method with values ["standard", "express"]`,
            `Both filters are combined in the filters object (date AND shipping method)`,
            `The response did NOT use limit+sort to approximate the time window`,
        ].join('\n'),
    },
];

type Context = {
    services: ReturnType<typeof getServices>;
    agent: AiAgent;
    testContext: IntegrationTestContext;
};

export type TestCase = {
    prompt: string;
    expectedAnswer: string | ((context: Context) => Promise<string>);
    name?: string;
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
