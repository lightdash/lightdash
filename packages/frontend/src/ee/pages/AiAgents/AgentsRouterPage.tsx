import {
    type AiAgentSummary,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import {
    Avatar,
    Card,
    Center,
    Group,
    SimpleGrid,
    Stack,
    Text,
    Title,
    UnstyledButton,
} from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import { getModelKey } from '../../../components/common/ModelSelector/utils';
import { AgentPageHeader } from '../../features/aiCopilot/components/AiAgentPageLayout/AgentPageHeader';
import { AutoModeSidebar } from '../../features/aiCopilot/components/AiAgentPageLayout/AgentSidebar';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import { usePendingPrompt } from '../../features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentSqlModeAvailable } from '../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable';
import {
    useAiRouterCommit,
    useAiRouterRoute,
} from '../../features/aiCopilot/hooks/useAiRouter';
import { useModelOptions } from '../../features/aiCopilot/hooks/useModelOptions';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';

type Phase =
    | { kind: 'idle' }
    | { kind: 'routing' }
    | { kind: 'picker'; decision: AiRouterRouteResponseResult }
    | { kind: 'creating' };

const AgentsRouterPage = () => {
    const { projectUuid } = useParams();
    const navigate = useNavigate();

    const { data: agents } = useProjectAiAgents({
        projectUuid: projectUuid!,
        redirectOnUnauthorized: true,
    });

    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const placeholderAgentUuid = agents?.[0]?.uuid;
    const { data: modelOptions } = useModelOptions({
        projectUuid,
        agentUuid: placeholderAgentUuid,
    });

    const [selectedModelKey, setSelectedModelKey] = useState<string | null>(
        null,
    );
    const [extendedThinking, setExtendedThinking] = useState(false);
    const [sqlMode, setSqlMode] = useState(false);
    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);

    const handleSelectedModelKeyChange = useCallback(
        (modelKey: string) => {
            setSelectedModelKey(modelKey);
            const model = modelOptions?.find(
                (m) => getModelKey(m) === modelKey,
            );
            if (model && !model.supportsReasoning) {
                setExtendedThinking(false);
            }
        },
        [modelOptions],
    );

    useEffect(() => {
        if (modelOptions && !selectedModelKey) {
            const defaultModel = modelOptions.find((m) => m.default);
            if (defaultModel) {
                handleSelectedModelKeyChange(getModelKey(defaultModel));
            }
        }
    }, [modelOptions, selectedModelKey, handleSelectedModelKeyChange]);

    const selectedModel = modelOptions?.find(
        (m) => getModelKey(m) === selectedModelKey,
    );
    const showExtendedThinking = selectedModel?.supportsReasoning ?? false;

    const { pendingPrompt, setPendingPrompt } = usePendingPrompt();

    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    const [decisionUuid, setDecisionUuid] = useState<string | null>(null);
    const [chosenAgentUuid, setChosenAgentUuid] = useState<string | null>(null);
    const [routedPrompt, setRoutedPrompt] = useState<string>('');
    const [routedToolHints, setRoutedToolHints] = useState<string[]>([]);

    const agentsByUuid = useMemo(() => {
        const m = new Map<string, AiAgentSummary>();
        (agents ?? []).forEach((a) => m.set(a.uuid, a));
        return m;
    }, [agents]);

    const route = useAiRouterRoute();
    const { mutate: commitDecisionMutate } = useAiRouterCommit();
    const { mutateAsync: createThread } = useCreateAgentThreadMutation(
        chosenAgentUuid ?? undefined,
        projectUuid!,
    );

    const startedDecisionRef = useRef<string | null>(null);

    // Once the router (or the user via picker) has chosen an agent and we've
    // re-rendered with that agentUuid, fire the thread creation. The mutation
    // hook is keyed on agentUuid so we have to wait a render before calling it.
    useEffect(() => {
        if (
            phase.kind !== 'creating' ||
            !chosenAgentUuid ||
            !decisionUuid ||
            !routedPrompt
        ) {
            return;
        }
        if (startedDecisionRef.current === decisionUuid) return;
        startedDecisionRef.current = decisionUuid;

        void createThread({
            prompt: routedPrompt,
            toolHints: routedToolHints,
        }).then((thread) => {
            commitDecisionMutate({
                decisionUuid,
                chosenAgentUuid,
                threadUuid: thread.uuid,
            });
        });
    }, [
        phase.kind,
        chosenAgentUuid,
        decisionUuid,
        routedPrompt,
        routedToolHints,
        createThread,
        commitDecisionMutate,
    ]);

    const handleSubmit = useCallback(
        async ({
            message,
            toolHints,
        }: {
            message: string;
            toolHints: string[];
        }) => {
            if (!projectUuid) return;
            setPhase({ kind: 'routing' });
            setRoutedPrompt(message);
            setRoutedToolHints(toolHints);
            setPendingPrompt('');

            try {
                const result = await route.mutateAsync({
                    prompt: message,
                    projectUuid,
                });
                setDecisionUuid(result.decision.decisionUuid);

                if (result.nextAction === 'create_thread') {
                    setChosenAgentUuid(result.decision.suggestedAgentUuid);
                    setPhase({ kind: 'creating' });
                } else {
                    setPhase({ kind: 'picker', decision: result });
                }
            } catch {
                // Router unreachable — fall back to the first accessible
                // agent silently. The draft survives via PendingPromptContext,
                // which the new-thread page reads on mount.
                setPhase({ kind: 'idle' });
                setPendingPrompt(message);
                setRoutedPrompt('');
                setRoutedToolHints([]);
                const fallback = agents?.[0];
                if (fallback && projectUuid) {
                    void navigate(
                        `/projects/${projectUuid}/ai-agents/${fallback.uuid}/threads`,
                    );
                }
            }
        },
        [agents, navigate, projectUuid, route, setPendingPrompt],
    );

    const confirmPick = useCallback((agentUuid: string) => {
        setChosenAgentUuid(agentUuid);
        setPhase({ kind: 'creating' });
    }, []);

    const isLocked = phase.kind !== 'idle';

    const placeholder =
        phase.kind === 'routing'
            ? 'Finding the best agent…'
            : phase.kind === 'creating'
              ? 'Sending…'
              : 'Ask anything about your data...';

    return (
        <AiAgentPageLayout
            isAgentSidebarCollapsed={isSidebarCollapsed}
            setIsAgentSidebarCollapsed={setIsSidebarCollapsed}
            Sidebar={
                <AutoModeSidebar
                    projectUuid={projectUuid!}
                    isAgentSidebarCollapsed={isSidebarCollapsed}
                />
            }
            Header={
                <AgentPageHeader
                    settingsHref={
                        canManageAgents ? '/ai-agents/admin/agents' : undefined
                    }
                />
            }
        >
            <Center h="100%">
                <Stack
                    gap="lg"
                    {...ChatElementsUtils.centeredElementProps}
                    h="unset"
                    py="xl"
                >
                    <Stack align="center" gap="xxs">
                        <Avatar size="lg" color="violet" radius="xl">
                            <MantineIcon
                                icon={IconSparkles}
                                size="xl"
                                color="violet.6"
                            />
                        </Avatar>
                        <Title order={2}>Ask AI</Title>
                        <Text c="dimmed" size="sm" ta="center" maw={520}>
                            Ask anything about your data. We&apos;ll route your
                            question to the right agent — or pin one if
                            you&apos;d like.
                        </Text>
                    </Stack>

                    <AgentChatInput
                        projectUuid={projectUuid}
                        agents={agents ?? []}
                        selectedAgent="auto"
                        placeholder={placeholder}
                        loading={isLocked}
                        onSubmit={handleSubmit}
                        defaultValue={pendingPrompt}
                        onValueChange={setPendingPrompt}
                        models={modelOptions}
                        selectedModelId={selectedModelKey}
                        onModelChange={handleSelectedModelKeyChange}
                        extendedThinking={
                            showExtendedThinking ? extendedThinking : undefined
                        }
                        onExtendedThinkingChange={
                            showExtendedThinking
                                ? setExtendedThinking
                                : undefined
                        }
                        sqlMode={sqlModeAvailable ? sqlMode : undefined}
                        onSqlModeChange={
                            sqlModeAvailable ? setSqlMode : undefined
                        }
                        fullWidth
                    />

                    {phase.kind === 'picker' && (
                        <Stack gap="sm">
                            <Stack align="center" gap={4}>
                                <Title order={5}>Pick the right agent</Title>
                                <Text size="sm" c="dimmed" ta="center">
                                    {phase.decision.decision.reasoning}
                                </Text>
                            </Stack>
                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                {phase.decision.decision.candidates.map((c) => {
                                    const agent = agentsByUuid.get(c.agentUuid);
                                    return (
                                        <UnstyledButton
                                            key={c.agentUuid}
                                            onClick={() =>
                                                confirmPick(c.agentUuid)
                                            }
                                        >
                                            <Card
                                                withBorder
                                                radius="md"
                                                p="sm"
                                                styles={(theme) => ({
                                                    root: {
                                                        borderColor:
                                                            theme.colors
                                                                .ldGray[2],
                                                    },
                                                })}
                                            >
                                                <Group
                                                    gap="sm"
                                                    wrap="nowrap"
                                                    align="flex-start"
                                                >
                                                    <LightdashUserAvatar
                                                        size={32}
                                                        name={c.name}
                                                        src={agent?.imageUrl}
                                                    />
                                                    <Stack
                                                        gap={2}
                                                        miw={0}
                                                        flex={1}
                                                    >
                                                        <Text
                                                            size="sm"
                                                            fw={600}
                                                        >
                                                            {c.name}
                                                        </Text>
                                                        {c.description && (
                                                            <Text
                                                                size="xs"
                                                                c="dimmed"
                                                                truncate="end"
                                                            >
                                                                {c.description}
                                                            </Text>
                                                        )}
                                                    </Stack>
                                                </Group>
                                            </Card>
                                        </UnstyledButton>
                                    );
                                })}
                            </SimpleGrid>
                        </Stack>
                    )}
                </Stack>
            </Center>
        </AiAgentPageLayout>
    );
};

export default AgentsRouterPage;
