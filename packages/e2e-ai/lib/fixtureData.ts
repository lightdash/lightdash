// Fixture data from AI_TEST_PLAN.md §3. Names carry the run id so a run's
// fixtures are recognisable and removable.

export type AgentSpec = {
    name: string;
    description: string | null;
    instruction: string;
    enableSelfImprovement: boolean;
    enableContentTools: boolean;
};

// The plan asks for a "short neutral instruction" without giving one.
const NEUTRAL_INSTRUCTION =
    'You help people answer questions about the Jaffle shop data.';

export const f1Agent = (runId: string): AgentSpec => ({
    name: `e2e-ai-${runId}`,
    description: null,
    instruction: NEUTRAL_INSTRUCTION,
    enableSelfImprovement: false,
    enableContentTools: false,
});

export const f2SqlFirstAgent = (runId: string): AgentSpec => ({
    name: `e2e-sql-first-${runId}`,
    description: null,
    instruction:
        'Answer every data question by running SQL with the `runSql` tool. Do not use other query tools.',
    enableSelfImprovement: false,
    enableContentTools: false,
});

export const f3AsksBackAgent = (runId: string): AgentSpec => ({
    name: `e2e-asks-back-${runId}`,
    description: null,
    instruction:
        'End every reply with one short clarifying question ending in a question mark.',
    enableSelfImprovement: false,
    enableContentTools: false,
});

export const f4RevenueAgent = (runId: string): AgentSpec => ({
    name: `e2e-revenue-${runId}`,
    description:
        'Answers questions about payments and revenue: amounts paid, payment methods and revenue trends.',
    instruction:
        'You answer questions about payments and revenue. Use the payments explore for amounts and payment methods.',
    enableSelfImprovement: false,
    enableContentTools: false,
});

export const f4CustomersAgent = (runId: string): AgentSpec => ({
    name: `e2e-customers-${runId}`,
    description:
        'Answers questions about customer profiles: who the customers are, when they signed up and their attributes.',
    instruction:
        'You answer questions about customer profiles. Use the customers explore for customer attributes.',
    enableSelfImprovement: false,
    enableContentTools: false,
});

// T5.3: F1 with content tools on, which generateDataApp needs.
export const f1DataAppAgent = (runId: string): AgentSpec => ({
    name: `e2e-data-app-${runId}`,
    description: null,
    instruction: NEUTRAL_INSTRUCTION,
    enableSelfImprovement: false,
    enableContentTools: true,
});

// T7.1: F1 with self-improvement on, which memory needs.
export const f1MemoryAgent = (runId: string): AgentSpec => ({
    name: `e2e-memory-${runId}`,
    description: null,
    instruction: NEUTRAL_INSTRUCTION,
    enableSelfImprovement: true,
    enableContentTools: false,
});

// T8.4: F1 on its own, so attaching an MCP server leaves F1 as it is.
export const f1McpAgent = (runId: string): AgentSpec => ({
    name: `e2e-mcp-${runId}`,
    description: null,
    instruction: NEUTRAL_INSTRUCTION,
    enableSelfImprovement: false,
    enableContentTools: false,
});

// T3.2: F1 on its own, so its verified charts are the only ones it retrieves.
export const f1RetrievalAgent = (runId: string): AgentSpec => ({
    name: `e2e-retrieval-${runId}`,
    description: null,
    instruction: NEUTRAL_INSTRUCTION,
    enableSelfImprovement: false,
    enableContentTools: false,
});

// F6: the cheapest correct path for each is one warehouse query on a seeded explore.
export const WITNESS_PROMPTS = {
    totalOrders: 'How many orders are there in total?',
    ordersByStatusChart: 'Show a bar chart of the number of orders by status',
    sqlRowCount: 'Using SQL, count the rows in the orders table',
    topCustomer: 'Which customer placed the most orders?',
};

// F7
export const RETURN_POLICY_DOCUMENT = `# Return policy definitions

A return is any order whose status moves to "returned" after it was shipped. Returns are counted on the date the item arrives back at the warehouse, not the order date.

A partial return covers some, but not all, items of an order. Partial returns count as one return for the order and keep the order's original amount minus the refunded items.

Return pending means the customer has asked to return an order but the item has not arrived yet. Return pending orders are excluded from return rate calculations until they arrive.
`;
