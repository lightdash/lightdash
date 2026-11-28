import { toolCreateContentOutputSchema } from '@lightdash/common';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getCreateContent } from './createContent';

const fromNode = {
    from: 'node' as const,
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

const fromJson = {
    from: 'json' as const,
    dashboardSlug: 'sales',
    name: 'Amount by status',
    description: null,
    pipeline: {
        terminalNodeId: 'raw',
        nodes: [{ nodeId: 'raw', sourceType: 'sql', sql: 'select 1' }],
    },
    chart: {},
};

// Like the content service: JSON SQL needs an approval step, then it saves.
const makeTool = (
    sqlChartSaving: Parameters<typeof getCreateContent>[0]['sqlChartSaving'],
) => {
    const save = vi.fn();
    const createContent = vi.fn<CreateContentFn>(async (args) => {
        if (args.type === 'composer_chart' && args.content.from === 'json') {
            if (!args.approveSql) throw new Error('SQL mode is off');
            await args.approveSql({
                sql: 'select 1',
                chartName: args.content.name,
                sqlChanged: true,
            });
        }
        save(args);
        return {
            type: 'composer_chart',
            uuid: 'composer-chart-uuid',
            href: '/projects/p/dashboards/sales-uuid/view#dashboard-link',
            content: {
                slug: 'amount-by-status',
                name: 'Amount by status',
            } as never,
        };
    });
    const tool = getCreateContent({
        createContent,
        siteUrl: 'https://example.lightdash.com',
        sqlChartSaving,
    });
    const create = (content: unknown) =>
        tool.execute!({ type: 'composer_chart', content } as never, {
            messages: [],
            toolCallId: 'call',
            context: {},
        }) as unknown as Promise<{
            metadata: { status: string; slug?: string };
        }>;
    return { create, save };
};

describe('createContent composer_chart', () => {
    it('saves a query node and links the saved chart', async () => {
        const { create, save } = makeTool({ mode: 'disabled' });

        const output = await create(fromNode);

        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ content: fromNode }),
        );
        expect(output.metadata).toMatchObject({
            status: 'success',
            slug: 'amount-by-status',
        });
    });

    it('saves JSON with warehouse SQL once an MCP client approves its own call', async () => {
        const { create, save } = makeTool({ mode: 'client_approved' });

        const output = await create(fromJson);

        expect(save).toHaveBeenCalled();
        expect(output.metadata.status).toBe('success');
    });

    it('passes a space chart through, with spaceSlug left out as a cached MCP tool list sends it', async () => {
        const { create, save } = makeTool({ mode: 'client_approved' });
        const toSpace = {
            ...fromNode,
            dashboardSlug: null,
            spaceSlug: 'jaffle',
        };
        const { spaceSlug: _, ...withoutSpace } = toSpace;

        const outputs = [
            await create(toSpace),
            await create({
                ...fromJson,
                dashboardSlug: null,
                spaceSlug: 'jaffle',
            }),
            await create(withoutSpace),
        ];

        for (const output of outputs) {
            expect(
                toolCreateContentOutputSchema.safeParse(output).success,
            ).toBe(true);
        }

        expect(save.mock.calls.map(([args]) => args.content)).toEqual([
            expect.objectContaining({
                dashboardSlug: null,
                spaceSlug: 'jaffle',
            }),
            expect.objectContaining({
                dashboardSlug: null,
                spaceSlug: 'jaffle',
            }),
            expect.not.objectContaining({ spaceSlug: expect.anything() }),
        ]);
    });

    it('refuses content that mixes a node with a pipeline, saving nothing', async () => {
        const { create, save } = makeTool({ mode: 'client_approved' });

        const output = await create({
            ...fromNode,
            pipeline: fromJson.pipeline,
        });

        expect(output.metadata.status).toBe('error');
        expect(save).not.toHaveBeenCalled();
    });
});
