import {
    ChartKind,
    type AgentSuggestion,
    type AiAgentThread,
    type AiPromptContextItem,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconTerminal2 } from '@tabler/icons-react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { AgentChatDisplay } from '../ee/features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentSuggestionChips } from '../ee/features/aiCopilot/components/ChatElements/AgentSuggestionChips';
import { DotsLoader } from '../ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
import { ReasoningHistoryRow } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/LiveActivityCard';
import { LiveActivityCard } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/LiveActivityCard';
import type { LiveActivityToolGroup } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/LiveActivityCard';
import { ToolCallPaper } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/ToolCallPaper';
import { ToolCallRow } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/ToolCallRow';
import type { ToolCallSummary } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/utils/types';
import { TypingDots } from '../ee/features/aiCopilot/components/ChatElements/TypingDots';
import { PinnedContextCard } from '../ee/features/aiCopilot/components/PinnedContextCard/PinnedContextCard';
import { AGENT_AI_MCP_SERVERS_KEY } from '../ee/features/aiCopilot/hooks/useProjectAiMcpServers';
import { store } from '../ee/features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../ee/features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';
import AppProviderMock from '../testing/__mocks__/providers/AppProvider.mock';

const projectUuid = '3675b69e-8324-4110-bdca-059031aa8da3';

const contextItems: AiPromptContextItem[] = [
    {
        type: 'chart',
        chartUuid: 'chart-weekly-revenue',
        chartSlug: 'weekly-revenue',
        pinnedVersionUuid: null,
        displayName: 'Revenue by week',
        runtimeOverrides: null,
        chartKind: ChartKind.VERTICAL_BAR,
    },
    {
        type: 'dashboard',
        dashboardUuid: 'dashboard-exec-overview',
        dashboardSlug: 'executive-overview',
        pinnedVersionUuid: null,
        displayName: 'Executive overview',
    },
    {
        type: 'thread',
        threadUuid: 'thread-forecast-notes',
        promptUuid: 'prompt-forecast-notes',
        displayName: 'Forecast context thread',
    },
    {
        type: 'file',
        path: 'analytics/revenue_definitions.md',
    },
    {
        type: 'repository',
        fullName: 'lightdash/customer-analytics',
    },
];

const fieldSearchCalls: ToolCallSummary[] = [
    {
        toolCallId: 'find-explores',
        toolName: 'findExplores',
        toolArgs: { searchQuery: 'revenue orders' },
    },
    {
        toolCallId: 'find-fields',
        toolName: 'findFields',
        toolArgs: {
            fieldSearchQueries: [
                { label: 'weekly revenue', fieldTypes: ['metric'] },
            ],
        },
    },
    {
        toolCallId: 'semantic-layer',
        toolName: 'searchSemanticLayer',
        toolArgs: { searchQuery: 'orders revenue', type: 'metric' },
    },
];

const contentCalls: ToolCallSummary[] = [
    {
        toolCallId: 'read-chart',
        toolName: 'readContent',
        toolArgs: { type: 'chart', slug: 'weekly-revenue' },
    },
    {
        toolCallId: 'read-dashboard',
        toolName: 'readContent',
        toolArgs: { type: 'dashboard', slug: 'executive-overview' },
    },
];

const runSqlCall: ToolCallSummary = {
    toolCallId: 'run-sql',
    toolName: 'runSql',
    toolArgs: {
        sql: [
            "select date_trunc('week', ordered_at) as week,",
            '       sum(total_revenue) as revenue',
            'from analytics.orders',
            "where ordered_at >= current_date - interval '90 days'",
            'group by 1',
            'order by 1',
        ].join('\n'),
        limit: 500,
    },
};

const chartCalls: ToolCallSummary[] = [
    {
        toolCallId: 'run-query',
        toolName: 'runQuery',
        toolArgs: { title: 'Weekly revenue, last 90 days' },
        toolOutput: { metadata: { status: 'success' } },
    },
    {
        toolCallId: 'generate-viz',
        toolName: 'generateVisualization',
        toolArgs: { title: 'Weekly revenue, last 90 days' },
        toolOutput: { metadata: { status: 'success' } },
    },
];

const groupedActivity: LiveActivityToolGroup[] = [
    {
        keyId: 'data-model-search',
        toolName: 'findFields',
        calls: fieldSearchCalls,
        display: {
            liveLabel: 'Searching the data model',
            doneLabel: 'Searched the data model',
        },
    },
    {
        keyId: 'content-search',
        toolName: 'readContent',
        calls: contentCalls,
        display: {
            liveLabel: 'Finding relevant content',
            doneLabel: 'Found relevant content',
        },
    },
    {
        keyId: 'chart-build',
        toolName: 'generateVisualization',
        calls: chartCalls,
        display: {
            liveLabel: 'Building a chart',
            doneLabel: 'Built a chart',
        },
    },
];

const suggestions: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Split by customer type',
        tool: 'generateVisualization',
        defaults: {
            explore: 'orders',
            dimensions: ['customers.customer_type'],
            metrics: ['orders.total_revenue'],
            timeframe: 'last 90 days',
        },
    },
    {
        kind: 'prompt',
        label: 'Check raw SQL',
        tool: 'runSql',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: 'last 90 days',
        },
    },
    {
        kind: 'navigate',
        label: 'Open Executive overview',
        url: `/projects/${projectUuid}/dashboards/dashboard-exec-overview`,
    },
];

type ThreadTurn = {
    role: 'user' | 'assistant';
    text: string;
    context?: AiPromptContextItem[];
    activity?: LiveActivityToolGroup[];
    suggestions?: AgentSuggestion[];
    reasoning?: string[];
    status?: 'work' | 'verify' | 'done';
};

type ThreadScenario = {
    title: string;
    subtitle: string;
    badge: string;
    turns: ThreadTurn[];
};

const workContext: AiPromptContextItem[] = [
    {
        type: 'review_finding',
        fingerprint: 'finding-revenue-definition',
        title: 'Revenue metric definition is ambiguous',
        rootCause: 'semantic_layer',
        findingCount: 4,
        evidenceExcerpts: [
            {
                source: 'user_prompt',
                text: 'Is revenue before or after refunds?',
                redacted: false,
            },
            {
                source: 'assistant_answer',
                text: 'The answer used total_revenue without explaining refund handling.',
                redacted: false,
            },
        ],
    },
    {
        type: 'proposed_change',
        fingerprint: 'change-revenue-definition',
        payload: {
            changeKind: 'semantic_layer',
            recommendation: {
                actionType: 'update_semantic_yaml',
                title: 'Clarify total_revenue definition',
                rationale:
                    'Users need to know whether revenue includes refunds and taxes.',
                targetRefs: ['orders.total_revenue'],
            },
        },
    },
    {
        type: 'repository',
        fullName: 'lightdash/jaffle-shop-dbt',
    },
    {
        type: 'file',
        path: 'models/marts/orders.yml',
    },
    {
        type: 'thread',
        threadUuid: 'thread-review-finding',
        promptUuid: 'prompt-finding',
        displayName: 'Review finding: ambiguous revenue metric',
    },
];

const verifyContext: AiPromptContextItem[] = [
    {
        type: 'pull_request',
        prUrl: 'https://github.com/lightdash/jaffle-shop-dbt/pull/42',
        prNumber: 42,
        provider: 'github',
        status: 'open',
        title: 'Clarify total_revenue semantic definition',
    },
    {
        type: 'preview_environment',
        previewProjectUuid: 'preview-project-revenue-definition',
        previewThreadUuid: 'thread-preview-verify',
        status: 'preview_ready',
        projectName: 'Preview: Jaffle shop',
    },
    {
        type: 'dashboard',
        dashboardUuid: 'dashboard-preview-exec-overview',
        dashboardSlug: 'preview-executive-overview',
        pinnedVersionUuid: null,
        displayName: 'Preview Executive overview',
    },
    {
        type: 'chart',
        chartUuid: 'chart-preview-weekly-revenue',
        chartSlug: 'preview-weekly-revenue',
        pinnedVersionUuid: null,
        displayName: 'Preview revenue by week',
        runtimeOverrides: null,
        chartKind: ChartKind.VERTICAL_BAR,
    },
];

const editProjectCalls: ToolCallSummary[] = [
    {
        toolCallId: 'read-content-orders',
        toolName: 'readContent',
        toolArgs: { type: 'chart', slug: 'weekly-revenue' },
    },
    {
        toolCallId: 'impact-revenue',
        toolName: 'analyzeFieldImpact',
        toolArgs: { fieldId: 'orders.total_revenue' },
    },
    {
        toolCallId: 'edit-dbt-project',
        toolName: 'editDbtProject',
        toolArgs: {
            instructions:
                'Clarify total_revenue as gross revenue before refunds.',
        },
    },
];

const workActivity: LiveActivityToolGroup[] = [
    {
        keyId: 'work-read-content',
        toolName: 'readContent',
        calls: [editProjectCalls[0]],
    },
    {
        keyId: 'work-impact',
        toolName: 'analyzeFieldImpact',
        calls: [editProjectCalls[1]],
    },
    {
        keyId: 'work-edit-project',
        toolName: 'editDbtProject',
        calls: [editProjectCalls[2]],
    },
];

const verifyActivity: LiveActivityToolGroup[] = [
    {
        keyId: 'preview-deploy',
        toolName: 'setupPreviewDeploy',
        calls: [
            {
                toolCallId: 'preview-deploy-call',
                toolName: 'setupPreviewDeploy',
                toolArgs: {
                    pullRequestUrl: 'https://github.com/org/repo/pull/42',
                },
            },
        ],
    },
    {
        keyId: 'verify-query',
        toolName: 'generateVisualization',
        calls: chartCalls,
        display: {
            liveLabel: 'Testing generated chart',
            doneLabel: 'Tested generated chart',
        },
    },
];

const workSuggestions: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Open PR',
        tool: 'findContent',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
    {
        kind: 'prompt',
        label: 'Tighten metric copy',
        tool: 'findContent',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
];

const verifySuggestions: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Retest after latest commit',
        tool: 'generateVisualization',
        defaults: {
            explore: 'orders',
            dimensions: ['orders.order_week'],
            metrics: ['orders.total_revenue'],
            timeframe: 'last 90 days',
        },
    },
    {
        kind: 'prompt',
        label: 'Check validation errors',
        tool: 'runSql',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
];

const threadScenarios: Record<string, ThreadScenario> = {
    analysis: {
        title: 'Revenue investigation',
        subtitle: 'Normal chat thread with pinned chart and dashboard context.',
        badge: 'Chat thread',
        turns: [
            {
                role: 'user',
                text: 'What changed in revenue this month? Use the pinned dashboard filters.',
                context: contextItems.slice(0, 3),
            },
            {
                role: 'assistant',
                text: 'Revenue is up 18% month over month. The lift starts in week 42 and is mostly order volume, not larger basket size.',
                reasoning: [
                    'Read the dashboard filters.',
                    'Compared weekly revenue against the prior period.',
                ],
                activity: groupedActivity,
                suggestions,
                status: 'done',
            },
            {
                role: 'user',
                text: 'Can you split that by new vs returning customers?',
            },
            {
                role: 'assistant',
                text: 'Returning customers explain most of the lift. New-customer revenue is flat, while returning-customer revenue is up 24%.',
                activity: [
                    groupedActivity[0],
                    {
                        keyId: 'customer-type-chart',
                        toolName: 'generateVisualization',
                        calls: [
                            {
                                toolCallId: 'customer-type-query',
                                toolName: 'runQuery',
                                toolArgs: {
                                    title: 'Revenue by customer type',
                                },
                            },
                            {
                                toolCallId: 'customer-type-viz',
                                toolName: 'generateVisualization',
                                toolArgs: {
                                    title: 'Revenue by customer type',
                                },
                            },
                        ],
                        display: {
                            liveLabel: 'Building customer split',
                            doneLabel: 'Built customer split',
                        },
                    },
                ],
                suggestions,
                status: 'done',
            },
        ],
    },
    work: {
        title: 'Build the fix',
        subtitle:
            'Remediation work thread: agent edits dbt metadata and opens a PR.',
        badge: 'Work thread',
        turns: [
            {
                role: 'user',
                text: 'Fix the ambiguous revenue metric description from this review finding.',
                context: workContext,
            },
            {
                role: 'assistant',
                text: 'I found the metric definition in orders.yml and updated the description to say it is gross revenue before refunds.',
                reasoning: [
                    'Mapped the finding to orders.total_revenue.',
                    'Checked impacted charts before editing dbt metadata.',
                ],
                activity: workActivity,
                suggestions: workSuggestions,
                status: 'work',
            },
            {
                role: 'user',
                text: 'Also mention that taxes are excluded.',
            },
            {
                role: 'assistant',
                text: 'Updated the PR with the tax exclusion note and kept the existing gross-revenue wording intact.',
                activity: [
                    {
                        keyId: 'continue-pr',
                        toolName: 'editDbtProject',
                        calls: [
                            {
                                toolCallId: 'continue-edit',
                                toolName: 'editDbtProject',
                                toolArgs: {
                                    instructions:
                                        'Amend the open PR with tax exclusion wording.',
                                },
                            },
                        ],
                    },
                ],
                suggestions: workSuggestions,
                status: 'work',
            },
        ],
    },
    verify: {
        title: 'Verify the fix',
        subtitle:
            'Read-only remediation verification thread against preview project.',
        badge: 'Verify thread',
        turns: [
            {
                role: 'user',
                text: 'Test the fix on the preview project and confirm the finding is gone.',
                context: verifyContext,
            },
            {
                role: 'assistant',
                text: 'The preview project built successfully. I regenerated the affected revenue chart and the metric description is now unambiguous.',
                reasoning: [
                    'Built the preview environment from the PR branch.',
                    'Rendered the affected chart using preview metadata.',
                ],
                activity: verifyActivity,
                suggestions: verifySuggestions,
                status: 'verify',
            },
            {
                role: 'user',
                text: 'Check whether any validation warnings remain.',
            },
            {
                role: 'assistant',
                text: 'No validation warnings remain for the affected fields. The fix is ready to mark as resolved.',
                activity: [
                    {
                        keyId: 'validation-check',
                        toolName: 'runSql',
                        calls: [
                            {
                                toolCallId: 'validation-sql',
                                toolName: 'runSql',
                                toolArgs: {
                                    sql: 'select count(*) as warning_count from validation_errors where field_id = orders.total_revenue',
                                },
                            },
                        ],
                    },
                ],
                suggestions: verifySuggestions,
                status: 'done',
            },
        ],
    },
};

const StorySurface = ({ children }: { children: ReactNode }) => (
    <Box p="xl" bg="ldGray.0" mih={640}>
        <Stack maw={1040} mx="auto" gap="lg">
            {children}
        </Stack>
    </Box>
);

const Section = ({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}) => (
    <Paper withBorder radius="md" p="md" bg="white">
        <Stack gap="sm">
            <Box>
                <Title order={5}>{title}</Title>
                {description ? (
                    <Text size="xs" c="dimmed">
                        {description}
                    </Text>
                ) : null}
            </Box>
            {children}
        </Stack>
    </Paper>
);

const storyUser = {
    uuid: 'user-story',
    name: 'Joao Viana',
};

const storyQueryClient = createQueryClient({
    queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
    },
});
storyQueryClient.setQueryData(
    [AGENT_AI_MCP_SERVERS_KEY, projectUuid, 'agent-story'],
    [],
);

const flattenToolCalls = (activity?: LiveActivityToolGroup[]) =>
    activity?.flatMap((group) => group.calls) ?? [];

const makeThread = (scenario: ThreadScenario): AiAgentThread => {
    const createdAt = '2026-06-23T10:00:00.000Z';
    const threadUuid = `thread-${scenario.badge.toLowerCase().replaceAll(' ', '-')}`;
    let assistantIndex = 0;

    return {
        uuid: threadUuid,
        agentUuid: 'agent-story',
        createdAt,
        createdFrom: 'storybook',
        title: scenario.title,
        titleGeneratedAt: createdAt,
        firstMessage: {
            uuid: 'prompt-0',
            message: scenario.turns[0]?.text ?? '',
        },
        user: storyUser,
        compactions: [],
        messages: scenario.turns.map((turn, index) => {
            const promptUuid = `prompt-${index}`;
            const messageCreatedAt = new Date(
                Date.parse(createdAt) + index * 60_000,
            ).toISOString();

            if (turn.role === 'user') {
                return {
                    role: 'user',
                    uuid: promptUuid,
                    threadUuid,
                    message: turn.text,
                    createdAt: messageCreatedAt,
                    user: storyUser,
                    context: turn.context ?? [],
                    steers: [],
                    hidden: false,
                };
            }

            assistantIndex += 1;
            const calls = flattenToolCalls(turn.activity);
            return {
                role: 'assistant',
                status: 'idle',
                uuid: `assistant-${index}`,
                threadUuid,
                message: turn.text,
                errorMessage: null,
                interrupted: false,
                createdAt: messageCreatedAt,
                humanScore: null,
                humanFeedback: null,
                toolCalls: calls.map((call) => ({
                    uuid: `tool-${call.toolCallId}`,
                    promptUuid,
                    toolCallId: call.toolCallId,
                    parentToolCallId: null,
                    createdAt: new Date(messageCreatedAt),
                    toolType: 'built-in',
                    toolName: call.toolName,
                    toolArgs:
                        typeof call.toolArgs === 'object' && call.toolArgs
                            ? call.toolArgs
                            : {},
                })),
                toolResults: calls
                    .filter((call) => call.toolOutput !== undefined)
                    .map((call) => ({
                        uuid: `result-${call.toolCallId}`,
                        promptUuid,
                        toolCallId: call.toolCallId,
                        createdAt: new Date(messageCreatedAt),
                        toolType: 'built-in',
                        toolName: call.toolName,
                        result: JSON.stringify(call.toolOutput),
                        metadata: (call.toolOutput as { metadata?: object })
                            ?.metadata ?? { status: 'success' },
                    })),
                reasoning:
                    turn.reasoning?.map((text, reasoningIndex) => ({
                        uuid: `reasoning-${index}-${reasoningIndex}`,
                        promptUuid,
                        reasoningId: `reasoning-${index}-${reasoningIndex}`,
                        text,
                        createdAt: new Date(messageCreatedAt),
                    })) ?? [],
                savedQueryUuid: null,
                artifacts: null,
                referencedArtifacts: null,
                modelConfig: {
                    modelName: assistantIndex === 1 ? 'gpt-5' : 'gpt-5-mini',
                    modelProvider: 'openai',
                    reasoning: true,
                },
                tokenUsage: null,
            };
        }),
    };
};

const ThreadScenarioView = ({ scenario }: { scenario: ThreadScenario }) => (
    <StorySurface>
        <Paper withBorder radius="md" bg="white" style={{ overflow: 'hidden' }}>
            <Group justify="space-between" p="md" bg="ldGray.0">
                <Box>
                    <Title order={4}>{scenario.title}</Title>
                    <Text size="xs" c="dimmed">
                        {scenario.subtitle}
                    </Text>
                </Box>
                <Badge variant="light" color="blue">
                    {scenario.badge}
                </Badge>
            </Group>
            <QueryClientProvider client={storyQueryClient}>
                <AppProviderMock>
                    <Provider store={store}>
                        <AiAgentThreadStreamAbortControllerContextProvider>
                            <AgentChatDisplay
                                thread={makeThread(scenario)}
                                agentName="Lightdash agent"
                                projectUuid={projectUuid}
                                agentUuid="agent-story"
                                height={720}
                                renderArtifactsInline
                            />
                        </AiAgentThreadStreamAbortControllerContextProvider>
                    </Provider>
                </AppProviderMock>
            </QueryClientProvider>
        </Paper>
    </StorySurface>
);

const ComponentInventory = () => (
    <StorySurface>
        <Section
            title="PinnedContextCard"
            description="Real pinned-context component across content kinds."
        >
            <Group gap="xs" wrap="wrap">
                {contextItems.map((item) => (
                    <PinnedContextCard
                        key={`${item.type}-${JSON.stringify(item)}`}
                        item={item}
                        projectUuid={projectUuid}
                    />
                ))}
            </Group>
        </Section>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Section
                title="LiveActivityCard"
                description="Real grouped tool activity card."
            >
                <LiveActivityCard toolGroups={groupedActivity} isLive />
            </Section>

            <Section
                title="ToolCallRow"
                description="Real row variants for running, done, and error states."
            >
                <Stack gap="xs">
                    <ToolCallRow
                        toolName="findFields"
                        toolCalls={fieldSearchCalls}
                        status="running"
                        display={{
                            liveLabel: 'Searching the data model',
                            doneLabel: 'Searched the data model',
                        }}
                    />
                    <ToolCallRow
                        toolName="readContent"
                        toolCalls={contentCalls}
                        status="done"
                        display={{
                            liveLabel: 'Finding relevant content',
                            doneLabel: 'Found relevant content',
                        }}
                    />
                    <ToolCallRow
                        toolName="runSql"
                        toolCalls={[runSqlCall]}
                        status="error"
                    />
                </Stack>
            </Section>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Section
                title="Streaming states"
                description="Existing loading and reasoning components."
            >
                <Stack gap="sm">
                    <TypingDots label="Querying warehouse" />
                    <DotsLoader />
                    <ReasoningHistoryRow
                        isLive
                        texts={[
                            'Reading the pinned dashboard filters.',
                            'Comparing the saved chart to the current metric definition.',
                        ]}
                    />
                </Stack>
            </Section>

            <Section
                title="Suggestions"
                description="Real suggestion chip row."
            >
                <AgentSuggestionChips
                    chips={suggestions}
                    align="left"
                    showPromptAffordance
                    onChipClick={() => undefined}
                />
            </Section>
        </SimpleGrid>
    </StorySurface>
);

const PinnedContextScenario = () => (
    <StorySurface>
        <Section
            title="Pinned context before a prompt"
            description="What the user sees before sending a context-aware prompt."
        >
            <Group gap="xs" wrap="wrap">
                {contextItems.slice(0, 4).map((item) => (
                    <PinnedContextCard
                        key={`${item.type}-${JSON.stringify(item)}`}
                        item={item}
                        projectUuid={projectUuid}
                    />
                ))}
            </Group>
        </Section>
        <Section title="User prompt">
            <Paper radius="md" withBorder p="sm" bg="ldGray.0">
                <Text size="sm">
                    What changed in revenue this month? Use the pinned dashboard
                    filters.
                </Text>
            </Paper>
        </Section>
        <Section title="Agent activity">
            <LiveActivityCard toolGroups={groupedActivity} isLive={false} />
        </Section>
    </StorySurface>
);

const StreamingScenario = () => (
    <StorySurface>
        <Section title="Streaming answer">
            <Stack gap="sm">
                <ReasoningHistoryRow
                    isLive
                    texts={[
                        'Checking whether the revenue spike is volume or basket size.',
                    ]}
                />
                <LiveActivityCard
                    toolGroups={groupedActivity.slice(0, 2)}
                    isLive
                />
                <Paper withBorder radius="md" p="sm">
                    <Text size="sm">
                        Revenue starts lifting in week 42. I am checking if that
                        is concentrated in repeat customers before I finalize
                        the chart.
                    </Text>
                </Paper>
                <AgentSuggestionChips
                    chips={suggestions}
                    align="left"
                    showPromptAffordance
                    onChipClick={() => undefined}
                />
            </Stack>
        </Section>
    </StorySurface>
);

const ApprovalAndFailureScenario = () => (
    <StorySurface>
        <Section title="SQL approval pending">
            <ToolCallPaper title="About to run SQL" icon={IconTerminal2}>
                <Stack gap="xs" mt="sm">
                    <ToolCallRow
                        toolName="runSql"
                        toolCalls={[runSqlCall]}
                        status="running"
                    />
                    <Text size="xs" c="dimmed">
                        Approval card is hook-backed in app code; this story
                        keeps the real tool row visible without firing API
                        calls.
                    </Text>
                </Stack>
            </ToolCallPaper>
        </Section>
        <Section title="Failed tool row">
            <ToolCallRow
                toolName="runSql"
                toolCalls={[runSqlCall]}
                status="error"
            />
        </Section>
    </StorySurface>
);

const meta: Meta<typeof ComponentInventory> = {
    decorators: [(renderStory) => <MemoryRouter>{renderStory()}</MemoryRouter>],
    component: ComponentInventory,
    tags: ['autodocs'],
    title: 'AI Copilot/Agent Chat Workbench',
};

export default meta;
type Story = StoryObj<typeof ComponentInventory>;

export const Inventory: Story = {};

export const PinnedContext: Story = {
    render: () => <PinnedContextScenario />,
};

export const Streaming: Story = {
    render: () => <StreamingScenario />,
};

export const ApprovalAndFailure: Story = {
    render: () => <ApprovalAndFailureScenario />,
};

export const TwoTurnChatThread: Story = {
    render: () => <ThreadScenarioView scenario={threadScenarios.analysis} />,
};

export const TwoTurnWorkThread: Story = {
    render: () => <ThreadScenarioView scenario={threadScenarios.work} />,
};

export const TwoTurnVerifyThread: Story = {
    render: () => <ThreadScenarioView scenario={threadScenarios.verify} />,
};
