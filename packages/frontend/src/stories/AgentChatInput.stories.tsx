import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    type AgentSuggestion,
    type AiModelOption,
    type AiOrganizationRuntimeSettings,
    type FeatureFlag,
    type LightdashUserWithAbilityRules,
    type PossibleAbilities,
} from '@lightdash/common';
import { Box, Paper, Stack, Text, Title } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { AgentChatInput } from '../ee/features/aiCopilot/components/ChatElements/AgentChatInput';
import { ThreadRetentionNotice } from '../ee/features/aiCopilot/components/ThreadRetentionNotice';
import { store } from '../ee/features/aiCopilot/store';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';
import TrackingProvider from '../providers/Tracking/TrackingProvider';
import { mockUserResponse } from '../testing/__mocks__/api/userResponse.mock';
import AppProviderMock from '../testing/__mocks__/providers/AppProvider.mock';

const projectUuid = '3675b69e-8324-4110-bdca-059031aa8da3';
const agentUuid = 'agent-story';
const threadUuid = 'thread-story';
const latestAssistantMessageUuid = 'assistant-story-latest';

const chips: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Break down high-risk patients by age group',
        tool: 'generateVisualization',
        defaults: {
            explore: 'patients',
            dimensions: ['patients.age_group'],
            metrics: ['patients.count'],
            timeframe: null,
        },
    },
    {
        kind: 'prompt',
        label: 'Compare engagement score across risk tiers',
        tool: 'generateVisualization',
        defaults: {
            explore: 'patients',
            dimensions: ['patients.risk_tier'],
            metrics: ['patients.avg_engagement_score'],
            timeframe: null,
        },
    },
    {
        kind: 'prompt',
        label: 'Show cost per patient by health plan',
        tool: 'runSql',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
];

const models: AiModelOption[] = [
    {
        name: 'claude-fable',
        modelId: 'claude-fable-5',
        displayName: 'Fable 5',
        description: 'Most capable model',
        provider: 'anthropic',
        default: true,
        supportsReasoning: true,
        deprecated: false,
    },
    {
        name: 'claude-haiku',
        modelId: 'claude-haiku-4-5',
        displayName: 'Haiku 4.5',
        description: 'Fastest model',
        provider: 'anthropic',
        default: false,
        supportsReasoning: false,
        deprecated: false,
    },
];

const agents = [
    {
        uuid: agentUuid,
        name: 'Healthcare agent',
        imageUrl: null,
        adminOnly: false,
    },
    {
        uuid: 'agent-story-2',
        name: 'Finance agent',
        imageUrl: null,
        adminOnly: false,
    },
];

const runtimeSettings: AiOrganizationRuntimeSettings = {
    isCopilotEnabled: true,
    isTrial: false,
    aiAgentsVisible: true,
    aiAgentMemoryEnabled: false,
    aiAgentReviewsEnabled: false,
    aiAgentReviewsAvailable: false,
    defaultAiAgentModelConfig: null,
    defaultAiAgentModelOptions: models,
    dataAppCodingAgent: 'claude',
    visibleDataAppModels: [],
    threadRetentionHours: 1,
};

const enabledFlag = (id: FeatureFlags): FeatureFlag => ({ id, enabled: true });

const storyQueryClient = createQueryClient({
    queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
    },
});

[
    FeatureFlags.ExternalSources,
    FeatureFlags.MultiSourceQuery,
    FeatureFlags.ComposeSqlRunner,
    FeatureFlags.AiThreadRetention,
].forEach((flag) => {
    storyQueryClient.setQueryData(['feature-flag', flag], enabledFlag(flag));
});

storyQueryClient.setQueryData(
    ['ai-organization-runtime-settings'],
    runtimeSettings,
);

// The suggestions query key includes the SQL-mode toggle and, for
// post-response mode, the thread/message pair — seed every combination the
// stories can hit so chips survive toggling SQL mode.
[true, false].forEach((sqlMode) => {
    storyQueryClient.setQueryData(
        ['agentSuggestions', projectUuid, agentUuid, sqlMode, null, null],
        { chips },
    );
    storyQueryClient.setQueryData(
        [
            'agentSuggestions',
            projectUuid,
            agentUuid,
            sqlMode,
            threadUuid,
            latestAssistantMessageUuid,
        ],
        { chips },
    );
});

// The default mock user is close to a viewer — grant the abilities gating the
// CSV attach button so the full toolbar is visible.
const abilityRules: LightdashUserWithAbilityRules['abilityRules'] = [
    { action: 'manage', subject: 'ExternalSource' },
    { action: 'manage', subject: 'Explore' },
];

// Seed the user query too: the component's own useUser shares the ['user']
// key with AppProviderMock and would otherwise race it with a real fetch,
// leaving the query in error state and hiding ability-gated controls.
storyQueryClient.setQueryData(['user'], {
    ...mockUserResponse({ abilityRules }),
    ability: new Ability<PossibleAbilities>(abilityRules),
    impersonation: null,
});

const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={storyQueryClient}>
        <AppProviderMock mocks={{ user: { abilityRules } }}>
            <TrackingProvider>
                <Provider store={store}>{children}</Provider>
            </TrackingProvider>
        </AppProviderMock>
    </QueryClientProvider>
);

const Surface = ({ children }: { children: ReactNode }) => (
    <Box p="xl" bg="ldGray.0" mih={480}>
        <Stack maw={860} mx="auto" gap="lg">
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
    <Paper withBorder radius="md" p="md">
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

const noopSubmit = () => undefined;
const noopDeepResearch = async () => undefined;

type StatefulInputProps = Omit<
    Parameters<typeof AgentChatInput>[0],
    'onSubmit' | 'sqlMode' | 'onSqlModeChange'
> & {
    withSqlMode?: boolean;
};

const StatefulInput = ({
    withSqlMode = true,
    ...props
}: StatefulInputProps) => {
    const [sqlMode, setSqlMode] = useState(false);
    const [selectedModelId, setSelectedModelId] = useState(models[0].modelId);
    const [extendedThinking, setExtendedThinking] = useState(false);

    return (
        <AgentChatInput
            onSubmit={noopSubmit}
            sqlMode={withSqlMode ? sqlMode : undefined}
            onSqlModeChange={withSqlMode ? setSqlMode : undefined}
            {...(props.models
                ? {
                      selectedModelId,
                      onModelChange: setSelectedModelId,
                      extendedThinking,
                      onExtendedThinkingChange: setExtendedThinking,
                  }
                : {})}
            {...props}
        />
    );
};

const retentionNotice = <ThreadRetentionNotice agentThreadRetentionHours={1} />;

const threadInputProps = {
    projectUuid,
    agentUuid,
    threadUuid,
    latestAssistantMessageUuid,
    messageCount: 4,
    placeholder: 'Ask agent anything about your data...',
    onStartDeepResearch: noopDeepResearch,
    footerNotice: retentionNotice,
} as const;

const ThreadInputScenario = () => (
    <Surface>
        <Section
            title="Thread input (minimal mode)"
            description="As rendered at the bottom of a thread: follow-up suggestion chips, composer, then the footer row — retention notice left, deep research and SQL toggles right."
        >
            <Providers>
                <StatefulInput {...threadInputProps} />
            </Providers>
        </Section>
    </Surface>
);

const NewThreadScenario = () => (
    <Surface>
        <Section
            title="New thread (card mode)"
            description="Empty-state composer with agent selector, model selector with reasoning toggle, CSV attach, and the suggestion tray below."
        >
            <Providers>
                <StatefulInput
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    messageCount={0}
                    placeholder="Ask agent anything about your data..."
                    onStartDeepResearch={noopDeepResearch}
                    agents={agents}
                    selectedAgent={agents[0]}
                    models={models}
                />
            </Providers>
        </Section>
    </Surface>
);

const FooterRowScenario = () => (
    <Surface>
        <Providers>
            <Section
                title="Notice + deep research + SQL toggle"
                description="The full footer row."
            >
                <StatefulInput {...threadInputProps} />
            </Section>
            <Section
                title="Notice only"
                description="No deep research or SQL mode available — the notice falls back to its own right-aligned row."
            >
                <StatefulInput
                    {...threadInputProps}
                    withSqlMode={false}
                    onStartDeepResearch={undefined}
                />
            </Section>
            <Section
                title="Controls only"
                description="No retention notice configured."
            >
                <StatefulInput {...threadInputProps} footerNotice={undefined} />
            </Section>
            <Section
                title="Disabled with reason"
                description="Disabling hides the whole footer row — toggles and retention notice — leaving only the disabled reason."
            >
                <StatefulInput
                    {...threadInputProps}
                    disabled
                    disabledReason="You don't have permission to write to this thread."
                />
            </Section>
        </Providers>
    </Surface>
);

type PlaygroundArgs = {
    mode: 'thread' | 'new-thread-card';
    disabled: boolean;
    disabledReason: string;
    loading: boolean;
    dense: boolean;
    fullWidth: boolean;
    deepResearch: boolean;
    sqlModeToggle: boolean;
    retentionNotice: boolean;
    revealControlsOnFocus: boolean;
};

const PlaygroundScenario = (args: PlaygroundArgs) => {
    const isThread = args.mode === 'thread';
    return (
        <Surface>
            <Section title="Playground">
                <Providers>
                    <StatefulInput
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        threadUuid={isThread ? threadUuid : undefined}
                        latestAssistantMessageUuid={
                            isThread ? latestAssistantMessageUuid : undefined
                        }
                        messageCount={isThread ? 4 : 0}
                        placeholder="Ask agent anything about your data..."
                        disabled={args.disabled}
                        disabledReason={args.disabledReason}
                        loading={args.loading}
                        dense={args.dense}
                        fullWidth={args.fullWidth}
                        withSqlMode={args.sqlModeToggle}
                        onStartDeepResearch={
                            args.deepResearch ? noopDeepResearch : undefined
                        }
                        footerNotice={
                            args.retentionNotice ? retentionNotice : undefined
                        }
                        revealControlsOnFocus={args.revealControlsOnFocus}
                        {...(isThread
                            ? {}
                            : {
                                  agents,
                                  selectedAgent: agents[0],
                                  models,
                              })}
                    />
                </Providers>
            </Section>
        </Surface>
    );
};

const meta: Meta<typeof ThreadInputScenario> = {
    decorators: [(renderStory) => <MemoryRouter>{renderStory()}</MemoryRouter>],
    component: ThreadInputScenario,
    tags: ['autodocs'],
    title: 'AI Copilot/Agent Chat Input',
};

export default meta;
type Story = StoryObj<typeof ThreadInputScenario>;
type PlaygroundStory = StoryObj<PlaygroundArgs>;

export const ThreadInput: Story = {};

export const NewThreadCard: Story = {
    render: () => <NewThreadScenario />,
};

export const FooterRowVariants: Story = {
    render: () => <FooterRowScenario />,
};

export const Playground: PlaygroundStory = {
    args: {
        mode: 'thread',
        disabled: false,
        disabledReason: "You don't have permission to write to this thread.",
        loading: false,
        dense: false,
        fullWidth: false,
        deepResearch: true,
        sqlModeToggle: true,
        retentionNotice: true,
        revealControlsOnFocus: false,
    },
    argTypes: {
        mode: {
            control: 'select',
            options: ['thread', 'new-thread-card'],
        },
    },
    render: (args) => <PlaygroundScenario {...args} />,
};
