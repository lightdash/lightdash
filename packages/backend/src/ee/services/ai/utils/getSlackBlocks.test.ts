import {
    ChartType,
    DimensionType,
    FilterOperator,
    FilterType,
} from '@lightdash/common';
import {
    buildFeedbackContextActions,
    buildSlackTaskUpdate,
    getFollowUpToolBlocks,
    getMarkdownBlocks,
    getModernArtifactCardBlocks,
    getModernPullRequestCardBlocks,
    getProjectSelectionBlocks,
    getSlackToolTitle,
} from './getSlackBlocks';
import { mockOrdersExplore } from './validationExplore.mock';

describe('Slack AI agent blocks', () => {
    it('omits removed follow-up tools from artifact actions', () => {
        const blocks = getFollowUpToolBlocks(
            { promptUuid: 'prompt-1' } as never,
            [
                {
                    chartConfig: {
                        followUpTools: ['propose_change', 'table'],
                    },
                } as never,
            ],
        );

        expect(blocks).toMatchObject([
            { type: 'divider' },
            { type: 'context' },
            {
                type: 'actions',
                elements: [
                    {
                        action_id: 'execute_follow_up_tool.table',
                    },
                ],
            },
        ]);
        expect(JSON.stringify(blocks)).not.toContain('propose_change');
    });

    it('maps known tool names to readable task titles', () => {
        expect(getSlackToolTitle('runSql')).toBe('Reviewing SQL');
        expect(getSlackToolTitle('editDbtProject')).toBe(
            'Opening dbt project PR',
        );
        expect(getSlackToolTitle('github_search_code')).toBe(
            'Github search code',
        );
    });

    it('builds Slack task_update chunks with flat task payloads', () => {
        expect(
            buildSlackTaskUpdate({
                toolName: 'runSql',
                status: 'in_progress',
                details: 'Running SQL...',
            }),
        ).toEqual({
            type: 'task_update',
            id: 'runSql',
            title: 'Reviewing SQL',
            status: 'in_progress',
            details: 'Running SQL...',
        });
    });

    it('uses task output for completed Slack task_update chunks', () => {
        expect(
            buildSlackTaskUpdate({
                toolName: 'runSql',
                taskId: 'call-1',
                status: 'complete',
                output: 'Finished runSql',
            }),
        ).toMatchObject({
            type: 'task_update',
            id: 'call-1',
            status: 'complete',
            output: 'Finished runSql',
        });
    });

    it('omits task details when they repeat the task title', () => {
        expect(
            buildSlackTaskUpdate({
                toolName: 'editDbtProject:Starting sandbox',
                taskId: 'call-1:Starting sandbox',
                status: 'complete',
                output: 'Starting sandbox',
            }),
        ).toEqual({
            type: 'task_update',
            id: 'call-1_Starting_sandbox',
            title: 'Starting sandbox',
            status: 'complete',
        });
    });

    it('builds context-action feedback buttons', () => {
        expect(buildFeedbackContextActions('prompt-1')).toMatchObject([
            {
                block_id: 'prompt_human_score',
                type: 'context_actions',
                elements: [
                    {
                        type: 'feedback_buttons',
                        action_id: 'prompt_human_score.feedback',
                    },
                ],
            },
        ]);
    });

    it('chunks long markdown into Slack markdown blocks', () => {
        const blocks = getMarkdownBlocks('a'.repeat(3001));

        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({
            type: 'markdown',
            text: expect.stringMatching(/^a+$/),
        });
        expect(blocks[1]).toMatchObject({
            type: 'markdown',
            text: expect.stringMatching(/^a+$/),
        });
    });

    it('keeps project picker option values within Slack limits', () => {
        const blocks = getProjectSelectionBlocks(
            Array.from({ length: 20 }, (_, index) => ({
                projectUuid: `00000000-0000-4000-8000-${String(index).padStart(
                    12,
                    '0',
                )}`,
                name: `Very long project name ${index} ${'x'.repeat(200)}`,
            })),
            'C0AD7R21BLG',
        );
        const actions = blocks[1] as {
            type: 'actions';
            elements: Array<{
                type: string;
                options?: Array<{ value: string }>;
            }>;
        };
        const select = actions.elements[0];
        if (actions.type !== 'actions' || select.type !== 'static_select') {
            throw new Error('Expected static_select');
        }

        select.options?.forEach((option) => {
            expect(option.value.length).toBeLessThan(151);
        });
    });

    it('builds modern pull request cards from writeback metadata', () => {
        const blocks = getModernPullRequestCardBlocks([
            {
                uuid: 'result-1',
                promptUuid: 'prompt-1',
                toolCallId: 'call-1',
                toolType: 'built-in',
                toolName: 'editDbtProject',
                result: 'Opened a pull request',
                createdAt: new Date(),
                metadata: {
                    status: 'success',
                    prUrl: 'https://github.com/lightdash/lightdash/pull/123',
                    prAction: 'opened',
                    commitSha: 'abcdef123456',
                    additions: 12,
                    deletions: 3,
                    previewUrl: 'https://preview.example.com',
                },
            },
        ]);

        expect(blocks).toMatchObject([
            {
                type: 'card',
                title: {
                    text: 'Opened pull request #123',
                },
                subtitle: {
                    text: 'lightdash/lightdash',
                },
                body: {
                    text: '+12 -3 · commit `abcdef1`',
                },
                actions: [
                    {
                        text: { text: 'PR' },
                        url: 'https://github.com/lightdash/lightdash/pull/123',
                    },
                    {
                        text: { text: 'Preview' },
                        url: 'https://preview.example.com',
                        style: 'primary',
                    },
                ],
            },
        ]);
    });

    it('builds modern pull request cards for preview deploy setup', () => {
        const blocks = getModernPullRequestCardBlocks([
            {
                uuid: 'result-1',
                promptUuid: 'prompt-1',
                toolCallId: 'call-1',
                toolType: 'built-in',
                toolName: 'setupPreviewDeploy',
                result: 'Opened a pull request',
                createdAt: new Date(),
                metadata: {
                    status: 'success',
                    prUrl: 'https://github.com/lightdash/lightdash/pull/124',
                },
            },
        ]);

        expect(blocks).toMatchObject([
            {
                type: 'card',
                title: {
                    text: 'Opened preview deploy PR #124',
                },
                actions: [
                    {
                        text: { text: 'PR' },
                        url: 'https://github.com/lightdash/lightdash/pull/124',
                    },
                ],
            },
        ]);
    });

    it('uses generateVisualization chart image URLs as card hero images', async () => {
        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [
                {
                    artifactUuid: 'artifact-1',
                    threadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                    artifactType: 'chart',
                    savedQueryUuid: null,
                    savedDashboardUuid: null,
                    createdAt: new Date(),
                    versionNumber: 1,
                    versionUuid: 'version-1',
                    title: 'Orders Over Time',
                    description: null,
                    dashboardConfig: null,
                    versionCreatedAt: new Date(),
                    verifiedByUserUuid: null,
                    verifiedAt: null,
                    chartConfig: {
                        title: 'Orders Over Time',
                        description: 'Orders by month',
                        queryConfig: {
                            exploreName: 'orders',
                            dimensions: ['orders_order_date_month'],
                            metrics: ['orders_unique_order_count'],
                            sorts: [],
                            limit: 500,
                            customMetrics: [],
                            tableCalculations: [],
                            filters: null,
                        },
                        chartConfig: null,
                    },
                },
            ],
            [
                {
                    uuid: 'result-1',
                    promptUuid: 'prompt-1',
                    toolCallId: 'call-1',
                    toolType: 'built-in',
                    toolName: 'generateVisualization',
                    result: 'ok',
                    createdAt: new Date(),
                    metadata: {
                        status: 'success',
                        chartImageUrl: 'https://files.slack.com/chart.png',
                    } as never,
                },
            ],
        );

        expect(blocks).toMatchObject([
            {
                type: 'card',
                hero_image: {
                    image_url: 'https://files.slack.com/chart.png',
                },
                actions: [
                    {
                        text: { text: 'Open image' },
                        url: 'https://files.slack.com/chart.png',
                    },
                    {
                        text: { text: 'Explore in Lightdash' },
                        url: 'https://lightdash.example.com/share/chart',
                    },
                ],
            },
        ]);
    });

    it('omits the hero but keeps the Open image button when the image URL is unreachable', async () => {
        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => false,
            'agent-1',
            [
                {
                    artifactUuid: 'artifact-1',
                    threadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                    artifactType: 'chart',
                    savedQueryUuid: null,
                    savedDashboardUuid: null,
                    createdAt: new Date(),
                    versionNumber: 1,
                    versionUuid: 'version-1',
                    title: 'Orders Over Time',
                    description: null,
                    dashboardConfig: null,
                    versionCreatedAt: new Date(),
                    verifiedByUserUuid: null,
                    verifiedAt: null,
                    chartConfig: {
                        title: 'Orders Over Time',
                        description: 'Orders by month',
                        queryConfig: {
                            exploreName: 'orders',
                            dimensions: ['orders_order_date_month'],
                            metrics: ['orders_unique_order_count'],
                            sorts: [],
                            limit: 500,
                            customMetrics: [],
                            tableCalculations: [],
                            filters: null,
                        },
                        chartConfig: null,
                    },
                },
            ],
            [
                {
                    uuid: 'result-1',
                    promptUuid: 'prompt-1',
                    toolCallId: 'call-1',
                    toolType: 'built-in',
                    toolName: 'generateVisualization',
                    result: 'ok',
                    createdAt: new Date(),
                    metadata: {
                        status: 'success',
                        chartImageUrl:
                            'https://internal.example.com/api/v1/slack/card-image/abc',
                    } as never,
                },
            ],
        );

        expect(blocks).toMatchObject([
            {
                type: 'card',
                actions: [
                    {
                        text: { text: 'Open image' },
                        url: 'https://internal.example.com/api/v1/slack/card-image/abc',
                    },
                    {
                        text: { text: 'Explore in Lightdash' },
                        url: 'https://lightdash.example.com/share/chart',
                    },
                ],
            },
        ]);
        expect(blocks[0]).not.toHaveProperty('hero_image');
    });

    it('uses the latest visualization attempt image when a single artifact was retried', async () => {
        const artifact = {
            artifactUuid: 'artifact-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
            artifactType: 'chart' as const,
            savedQueryUuid: null,
            savedDashboardUuid: null,
            createdAt: new Date(),
            versionNumber: 3,
            versionUuid: 'version-3',
            title: 'Orders Over Time',
            description: null,
            dashboardConfig: null,
            versionCreatedAt: new Date(),
            verifiedByUserUuid: null,
            verifiedAt: null,
            chartConfig: {
                title: 'Orders Over Time',
                description: 'Orders by month',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_month'],
                    metrics: ['orders_unique_order_count'],
                    sorts: [],
                    limit: 500,
                    customMetrics: [],
                    tableCalculations: [],
                    filters: null,
                },
                chartConfig: null,
            },
        };

        const attempt = (callId: string, url: string) => ({
            uuid: `result-${callId}`,
            promptUuid: 'prompt-1',
            toolCallId: callId,
            toolType: 'built-in' as const,
            toolName: 'generateVisualization' as const,
            result: 'ok',
            createdAt: new Date(),
            metadata: {
                status: 'success',
                chartImageUrl: url,
            } as never,
        });

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [artifact],
            [
                attempt(
                    'call-1',
                    'https://files.slack.com/chart-attempt-1.png',
                ),
                attempt(
                    'call-2',
                    'https://files.slack.com/chart-attempt-2.png',
                ),
                attempt(
                    'call-3',
                    'https://files.slack.com/chart-attempt-3.png',
                ),
            ],
        );

        expect(blocks).toMatchObject([
            {
                type: 'card',
                hero_image: {
                    image_url: 'https://files.slack.com/chart-attempt-3.png',
                },
            },
        ]);
    });

    const statusFilter = (status: string) => ({
        type: 'and' as const,
        dimensions: [
            {
                fieldId: 'orders_status',
                operator: FilterOperator.EQUALS as const,
                values: [status],
                fieldType: DimensionType.STRING as const,
                fieldFilterType: FilterType.STRING as const,
            },
        ],
        metrics: null,
        tableCalculations: null,
    });

    it('renders one turn with multiple chart versions as a carousel', async () => {
        const chartVersion = (
            versionUuid: string,
            title: string,
            status: string,
        ) => ({
            artifactUuid: 'artifact-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
            artifactType: 'chart' as const,
            savedQueryUuid: null,
            savedDashboardUuid: null,
            createdAt: new Date(),
            versionNumber: Number(versionUuid.split('-')[1]),
            versionUuid,
            title,
            description: null,
            dashboardConfig: null,
            versionCreatedAt: new Date(),
            verifiedByUserUuid: null,
            verifiedAt: null,
            chartConfig: {
                title,
                description: title,
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_month'],
                    metrics: ['orders_unique_order_count'],
                    sorts: [],
                    limit: 500,
                    customMetrics: [],
                    tableCalculations: [],
                    filters: statusFilter(status),
                },
                chartConfig: null,
            },
        });

        const attempt = (callId: string, url: string) => ({
            uuid: `result-${callId}`,
            promptUuid: 'prompt-1',
            toolCallId: callId,
            toolType: 'built-in' as const,
            toolName: 'generateVisualization' as const,
            result: 'ok',
            createdAt: new Date(),
            metadata: { status: 'success', chartImageUrl: url } as never,
        });

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [
                chartVersion('version-1', 'Placed orders by month', 'placed'),
                chartVersion('version-2', 'Shipped orders by month', 'shipped'),
                chartVersion(
                    'version-3',
                    'Completed orders by month',
                    'completed',
                ),
            ],
            [
                attempt('call-1', 'https://files.slack.com/placed.png'),
                attempt('call-2', 'https://files.slack.com/shipped.png'),
                attempt('call-3', 'https://files.slack.com/completed.png'),
            ],
        );

        expect(blocks).toMatchObject([
            {
                type: 'carousel',
                elements: [
                    {
                        type: 'card',
                        title: { text: 'Placed orders by month' },
                        hero_image: {
                            image_url: 'https://files.slack.com/placed.png',
                        },
                    },
                    {
                        type: 'card',
                        title: { text: 'Shipped orders by month' },
                        hero_image: {
                            image_url: 'https://files.slack.com/shipped.png',
                        },
                    },
                    {
                        type: 'card',
                        title: { text: 'Completed orders by month' },
                        hero_image: {
                            image_url: 'https://files.slack.com/completed.png',
                        },
                    },
                ],
            },
        ]);
    });

    it('collapses retried versions of the same chart into a single card', async () => {
        const retryVersion = (versionUuid: string) => ({
            artifactUuid: 'artifact-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
            artifactType: 'chart' as const,
            savedQueryUuid: null,
            savedDashboardUuid: null,
            createdAt: new Date(),
            versionNumber: Number(versionUuid.split('-')[1]),
            versionUuid,
            title: 'Placed vs completed orders',
            description: null,
            dashboardConfig: null,
            versionCreatedAt: new Date(),
            verifiedByUserUuid: null,
            verifiedAt: null,
            chartConfig: {
                title: 'Placed vs completed orders',
                description: 'Placed vs completed orders',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_month'],
                    metrics: ['orders_unique_order_count'],
                    sorts: [],
                    limit: 500,
                    customMetrics: [],
                    tableCalculations: [],
                    filters: statusFilter('completed'),
                },
                chartConfig: null,
            },
        });

        const attempt = (callId: string, url: string) => ({
            uuid: `result-${callId}`,
            promptUuid: 'prompt-1',
            toolCallId: callId,
            toolType: 'built-in' as const,
            toolName: 'generateVisualization' as const,
            result: 'ok',
            createdAt: new Date(),
            metadata: { status: 'success', chartImageUrl: url } as never,
        });

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [
                retryVersion('version-1'),
                retryVersion('version-2'),
                retryVersion('version-3'),
            ],
            [
                attempt('call-1', 'https://files.slack.com/attempt-1.png'),
                attempt('call-2', 'https://files.slack.com/attempt-2.png'),
                attempt('call-3', 'https://files.slack.com/attempt-3.png'),
            ],
        );

        expect(blocks).toMatchObject([
            {
                type: 'card',
                title: { text: 'Placed vs completed orders' },
                hero_image: {
                    image_url: 'https://files.slack.com/attempt-3.png',
                },
            },
        ]);
        expect(blocks).toHaveLength(1);
    });

    it('collapses a retry that changed the query but kept the title', async () => {
        const retryVersion = (versionUuid: string, grain: string) => ({
            artifactUuid: 'artifact-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
            artifactType: 'chart' as const,
            savedQueryUuid: null,
            savedDashboardUuid: null,
            createdAt: new Date(),
            versionNumber: Number(versionUuid.split('-')[1]),
            versionUuid,
            title: 'Unique order count over time by status',
            description: null,
            dashboardConfig: null,
            versionCreatedAt: new Date(),
            verifiedByUserUuid: null,
            verifiedAt: null,
            chartConfig: {
                title: 'Unique order count over time by status',
                description: 'Unique order count over time by status',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [`orders_order_date_${grain}`],
                    metrics: ['orders_unique_order_count'],
                    sorts: [],
                    limit: 500,
                    customMetrics: [],
                    tableCalculations: [],
                    filters: statusFilter('completed'),
                },
                chartConfig: null,
            },
        });

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [
                retryVersion('version-1', 'day'),
                retryVersion('version-2', 'month'),
            ],
            [],
        );

        expect(blocks).toHaveLength(1);
        expect(blocks).toMatchObject([{ type: 'card' }]);
    });

    it('keeps distinct charts with different titles as separate cards', async () => {
        const chartVersion = (
            versionUuid: string,
            title: string,
            status: string,
        ) => ({
            artifactUuid: 'artifact-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
            artifactType: 'chart' as const,
            savedQueryUuid: null,
            savedDashboardUuid: null,
            createdAt: new Date(),
            versionNumber: Number(versionUuid.split('-')[1]),
            versionUuid,
            title,
            description: null,
            dashboardConfig: null,
            versionCreatedAt: new Date(),
            verifiedByUserUuid: null,
            verifiedAt: null,
            chartConfig: {
                title,
                description: title,
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_month'],
                    metrics: ['orders_unique_order_count'],
                    sorts: [],
                    limit: 500,
                    customMetrics: [],
                    tableCalculations: [],
                    filters: statusFilter(status),
                },
                chartConfig: null,
            },
        });

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [
                chartVersion('version-1', 'Placed orders', 'placed'),
                chartVersion('version-2', 'Completed orders', 'completed'),
            ],
            [],
        );

        expect(blocks).toMatchObject([
            {
                type: 'carousel',
                elements: [{ type: 'card' }, { type: 'card' }],
            },
        ]);
    });

    it('keeps a line and a bar of the same query as separate cards', async () => {
        const vizChartConfig = (
            defaultVizType: 'line' | 'bar',
            lineType: 'line' | null,
        ) => ({
            groupBy: null,
            lineType,
            stackBars: null,
            xAxisType: 'time' as const,
            xAxisLabel: 'Order month',
            yAxisLabel: 'Unique order count',
            yAxisMetrics: ['orders_unique_order_count'],
            defaultVizType,
            xAxisDimension: 'orders_order_date_month',
            funnelDataInput: null,
            secondaryYAxisLabel: null,
            secondaryYAxisMetric: null,
        });

        const chartVersion = (
            versionUuid: string,
            defaultVizType: 'line' | 'bar',
            lineType: 'line' | null,
        ) => ({
            artifactUuid: 'artifact-1',
            threadUuid: 'thread-1',
            promptUuid: 'prompt-1',
            artifactType: 'chart' as const,
            savedQueryUuid: null,
            savedDashboardUuid: null,
            createdAt: new Date(),
            versionNumber: Number(versionUuid.split('-')[1]),
            versionUuid,
            title: 'Unique Order Count Over Time',
            description: null,
            dashboardConfig: null,
            versionCreatedAt: new Date(),
            verifiedByUserUuid: null,
            verifiedAt: null,
            chartConfig: {
                title: 'Unique Order Count Over Time',
                description: 'Unique Order Count Over Time',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_month'],
                    metrics: ['orders_unique_order_count'],
                    sorts: [],
                    limit: 500,
                    customMetrics: [],
                    tableCalculations: [],
                    filters: null,
                },
                chartConfig: vizChartConfig(
                    defaultVizType,
                    defaultVizType === 'line' ? 'line' : null,
                ),
            },
        });

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => 'https://lightdash.example.com/share/chart',
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [
                chartVersion('version-1', 'line', 'line'),
                chartVersion('version-2', 'bar', null),
            ],
            [],
        );

        expect(blocks).toMatchObject([
            {
                type: 'carousel',
                elements: [{ type: 'card' }, { type: 'card' }],
            },
        ]);
    });

    it('opens the Explore link with the generated chart type instead of table', async () => {
        const capturedShareParams: string[] = [];
        const createShareUrl = async (path: string, params: string) => {
            capturedShareParams.push(params);
            return 'https://lightdash.example.com/share/chart';
        };

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            createShareUrl,
            async () => mockOrdersExplore,
            async () => true,
            'agent-1',
            [
                {
                    artifactUuid: 'artifact-1',
                    threadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                    artifactType: 'chart',
                    savedQueryUuid: null,
                    savedDashboardUuid: null,
                    createdAt: new Date(),
                    versionNumber: 1,
                    versionUuid: 'version-1',
                    title: 'Order count over time',
                    description: null,
                    dashboardConfig: null,
                    versionCreatedAt: new Date(),
                    verifiedByUserUuid: null,
                    verifiedAt: null,
                    chartConfig: {
                        title: 'Order count over time',
                        description: 'Order count by order date',
                        queryConfig: {
                            exploreName: 'test_explore',
                            dimensions: ['orders_order_date'],
                            metrics: ['orders_order_count'],
                            sorts: [],
                            limit: 500,
                            customMetrics: [],
                            tableCalculations: [],
                            filters: null,
                        },
                        chartConfig: {
                            groupBy: ['orders_product_category'],
                            lineType: 'line',
                            stackBars: null,
                            xAxisType: 'time',
                            xAxisLabel: 'Order date',
                            yAxisLabel: 'Order count',
                            yAxisMetrics: ['orders_order_count'],
                            defaultVizType: 'line',
                            xAxisDimension: 'orders_order_date',
                            funnelDataInput: null,
                            secondaryYAxisLabel: null,
                            secondaryYAxisMetric: null,
                        },
                    },
                },
            ],
            [],
        );

        expect(blocks).toHaveLength(1);
        expect(capturedShareParams).toHaveLength(1);

        const searchParams = new URLSearchParams(capturedShareParams[0]);
        const exploreState = JSON.parse(
            searchParams.get('create_saved_chart_version')!,
        );

        expect(exploreState.chartConfig.type).toBe(ChartType.CARTESIAN);
        expect(exploreState.pivotConfig).toEqual({
            columns: ['orders_product_category'],
        });
    });

    it('falls back to a table explore link when the chart config cannot be converted', async () => {
        const capturedShareParams: string[] = [];
        const createShareUrl = async (path: string, params: string) => {
            capturedShareParams.push(params);
            return 'https://lightdash.example.com/share/chart';
        };

        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            createShareUrl,
            // Broken explore: chart config conversion throws, table fallback kicks in
            async () => ({}) as never,
            async () => true,
            'agent-1',
            [
                {
                    artifactUuid: 'artifact-1',
                    threadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                    artifactType: 'chart',
                    savedQueryUuid: null,
                    savedDashboardUuid: null,
                    createdAt: new Date(),
                    versionNumber: 1,
                    versionUuid: 'version-1',
                    title: 'Order count over time',
                    description: null,
                    dashboardConfig: null,
                    versionCreatedAt: new Date(),
                    verifiedByUserUuid: null,
                    verifiedAt: null,
                    chartConfig: {
                        title: 'Order count over time',
                        description: 'Order count by order date',
                        queryConfig: {
                            exploreName: 'orders',
                            dimensions: ['orders_order_date'],
                            metrics: ['orders_order_count'],
                            sorts: [],
                            limit: 500,
                            customMetrics: [],
                            tableCalculations: [],
                            filters: null,
                        },
                        chartConfig: null,
                    },
                },
            ],
            [],
        );

        expect(blocks).toHaveLength(1);
        const searchParams = new URLSearchParams(capturedShareParams[0]);
        const exploreState = JSON.parse(
            searchParams.get('create_saved_chart_version')!,
        );

        expect(exploreState.chartConfig.type).toBe(ChartType.TABLE);
        expect(exploreState.pivotConfig).toBeUndefined();
    });

    it('links the bare explore when share URL creation fails, keeping the URL short for Slack', async () => {
        const blocks = await getModernArtifactCardBlocks(
            {
                promptUuid: 'prompt-1',
                projectUuid: 'project-1',
                threadUuid: 'thread-1',
            } as never,
            'https://lightdash.example.com',
            500,
            async () => {
                throw new Error('share service unavailable');
            },
            async () => mockOrdersExplore,
            async () => true,
            'agent-1',
            [
                {
                    artifactUuid: 'artifact-1',
                    threadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                    artifactType: 'chart',
                    savedQueryUuid: null,
                    savedDashboardUuid: null,
                    createdAt: new Date(),
                    versionNumber: 1,
                    versionUuid: 'version-1',
                    title: 'Order count over time',
                    description: null,
                    dashboardConfig: null,
                    versionCreatedAt: new Date(),
                    verifiedByUserUuid: null,
                    verifiedAt: null,
                    chartConfig: {
                        title: 'Order count over time',
                        description: 'Order count by order date',
                        queryConfig: {
                            exploreName: 'test_explore',
                            dimensions: ['orders_order_date'],
                            metrics: ['orders_order_count'],
                            sorts: [],
                            limit: 500,
                            customMetrics: [],
                            tableCalculations: [],
                            filters: null,
                        },
                        chartConfig: null,
                    },
                },
            ],
            [],
        );

        expect(blocks).toMatchObject([
            {
                type: 'card',
                actions: [
                    {
                        text: { text: 'Explore in Lightdash' },
                        url: 'https://lightdash.example.com/projects/project-1/tables/test_explore',
                    },
                ],
            },
        ]);
    });
});
