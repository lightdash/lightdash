import {
    buildFeedbackContextActions,
    buildSlackTaskUpdate,
    getMarkdownBlocks,
    getModernArtifactCardBlocks,
    getModernPullRequestCardBlocks,
    getProjectSelectionBlocks,
    getSlackToolTitle,
} from './getSlackBlocks';

describe('Slack AI agent blocks', () => {
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
});
