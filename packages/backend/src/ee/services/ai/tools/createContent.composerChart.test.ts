import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getCreateContent } from './createContent';
import { approveClientSql } from './sqlApprovals';

const fromNode = {
    dashboardSlug: 'sales',
    name: 'Amount by status',
    description: null,
    nodeId: 'shaped',
    sessionId: null,
    vizConfig: {
        type: 'table' as const,
        x: null,
        y: null,
        groupBy: null,
        stack: null,
        horizontal: null,
        y2: null,
        labels: null,
    },
};

const createWith = async (
    sqlChartSaving: Parameters<typeof getCreateContent>[0]['sqlChartSaving'],
) => {
    const createContent = vi.fn<CreateContentFn>(async () => ({
        type: 'composer_chart',
        uuid: 'composer-chart-uuid',
        href: '/projects/p/dashboards/sales-uuid/view#dashboard-link',
        content: {
            slug: 'amount-by-status',
            name: 'Amount by status',
        } as never,
    }));
    const tool = getCreateContent({
        createContent,
        siteUrl: 'https://example.lightdash.com',
        sqlChartSaving,
    });
    const output = await tool.execute!(
        { type: 'composer_chart', content: fromNode },
        { messages: [], toolCallId: 'call', context: {} },
    );
    return { output, args: createContent.mock.calls[0]?.[0] };
};

describe('createContent composer_chart', () => {
    it('passes a query node through and links the saved chart', async () => {
        const { output, args } = await createWith({ mode: 'disabled' });

        expect(args).toMatchObject({
            type: 'composer_chart',
            content: fromNode,
        });
        expect(output).toMatchObject({
            metadata: { status: 'success', slug: 'amount-by-status' },
        });
    });

    it('hands no approval step without SQL mode, so SQL in JSON is refused', async () => {
        const { args } = await createWith({ mode: 'disabled' });

        expect(args).toMatchObject({ approveSql: null });
    });

    it('lets an MCP client approve its own call', async () => {
        const { args } = await createWith({ mode: 'client_approved' });

        expect(args).toMatchObject({ approveSql: approveClientSql });
    });
});
