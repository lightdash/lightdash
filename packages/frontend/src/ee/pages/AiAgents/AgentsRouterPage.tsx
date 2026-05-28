import {
    type AiAgentSummary,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Badge,
    Center,
    Group,
    Popover,
    Stack,
    Text,
    Title,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconChevronRight,
    IconInfoCircle,
    IconSparkles,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import classes from './AgentsRouterPage.module.css';

type Phase =
    | { kind: 'idle' }
    | { kind: 'routing' }
    | {
          kind: 'picker';
          decision: AiRouterRouteResponseResult;
          prompt: string;
          toolHints: string[];
      }
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

    const agentsByUuid = useMemo(() => {
        const m = new Map<string, AiAgentSummary>();
        (agents ?? []).forEach((a) => m.set(a.uuid, a));
        return m;
    }, [agents]);

    const route = useAiRouterRoute();
    const { mutate: commitDecisionMutate } = useAiRouterCommit();
    const { mutateAsync: createThread } = useCreateAgentThreadMutation(
        projectUuid!,
    );

    const startThreadForDecision = useCallback(
        async (args: {
            agentUuid: string;
            decisionUuid: string;
            prompt: string;
            toolHints: string[];
        }) => {
            const thread = await createThread({
                agentUuid: args.agentUuid,
                prompt: args.prompt,
                toolHints: args.toolHints,
            });
            // Fire-and-forget telemetry — the user is already navigating away.
            commitDecisionMutate({
                decisionUuid: args.decisionUuid,
                chosenAgentUuid: args.agentUuid,
                threadUuid: thread.uuid,
            });
        },
        [createThread, commitDecisionMutate],
    );

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
            setPendingPrompt('');

            try {
                const result = await route.mutateAsync({
                    prompt: message,
                    projectUuid,
                });

                if (result.nextAction === 'create_thread') {
                    setPhase({ kind: 'creating' });
                    await startThreadForDecision({
                        agentUuid: result.decision.suggestedAgentUuid,
                        decisionUuid: result.decision.decisionUuid,
                        prompt: message,
                        toolHints,
                    });
                } else {
                    setPhase({
                        kind: 'picker',
                        decision: result,
                        prompt: message,
                        toolHints,
                    });
                }
            } catch {
                // Router unreachable — fall back to the first accessible
                // agent silently. The draft survives via PendingPromptContext,
                // which the new-thread page reads on mount.
                setPhase({ kind: 'idle' });
                setPendingPrompt(message);
                const fallback = agents?.[0];
                if (fallback && projectUuid) {
                    void navigate(
                        `/projects/${projectUuid}/ai-agents/${fallback.uuid}/threads`,
                    );
                }
            }
        },
        [
            agents,
            navigate,
            projectUuid,
            route,
            setPendingPrompt,
            startThreadForDecision,
        ],
    );

    const confirmPick = useCallback(
        async (agentUuid: string) => {
            if (phase.kind !== 'picker') return;
            const { decision, prompt, toolHints } = phase;
            setPhase({ kind: 'creating' });
            await startThreadForDecision({
                agentUuid,
                decisionUuid: decision.decision.decisionUuid,
                prompt,
                toolHints,
            });
        },
        [phase, startThreadForDecision],
    );

    const sortedCandidates = useMemo(() => {
        if (phase.kind !== 'picker') return [];
        const { candidates, suggestedAgentUuid } = phase.decision.decision;
        return [...candidates].sort((a, b) => {
            if (a.agentUuid === suggestedAgentUuid) return -1;
            if (b.agentUuid === suggestedAgentUuid) return 1;
            return 0;
        });
    }, [phase]);

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
                        <Stack gap="xs">
                            <div className={classes.pickerHeader}>
                                <Text size="sm" fw={600}>
                                    Which agent should answer?
                                </Text>
                                {phase.decision.decision.reasoning && (
                                    <Popover
                                        width={280}
                                        position="bottom-end"
                                        withArrow
                                        shadow="md"
                                    >
                                        <Popover.Target>
                                            <ActionIcon
                                                size="sm"
                                                variant="subtle"
                                                color="gray"
                                                aria-label="Why these agents?"
                                            >
                                                <MantineIcon
                                                    icon={IconInfoCircle}
                                                    size={14}
                                                />
                                            </ActionIcon>
                                        </Popover.Target>
                                        <Popover.Dropdown>
                                            <Text size="xs" c="dimmed">
                                                {
                                                    phase.decision.decision
                                                        .reasoning
                                                }
                                            </Text>
                                        </Popover.Dropdown>
                                    </Popover>
                                )}
                            </div>

                            {sortedCandidates.map((c) => {
                                const agent = agentsByUuid.get(c.agentUuid);
                                const isRecommended =
                                    c.agentUuid ===
                                    phase.decision.decision.suggestedAgentUuid;
                                return (
                                    <UnstyledButton
                                        key={c.agentUuid}
                                        onClick={() => confirmPick(c.agentUuid)}
                                        className={`${classes.candidateButton} ${
                                            isRecommended
                                                ? classes.recommended
                                                : ''
                                        }`}
                                        aria-label={`Send to ${c.name}`}
                                    >
                                        <Group
                                            gap="sm"
                                            wrap="nowrap"
                                            align="center"
                                        >
                                            <LightdashUserAvatar
                                                size={32}
                                                name={c.name}
                                                src={agent?.imageUrl}
                                            />
                                            <Stack gap={2} miw={0} flex={1}>
                                                <Group gap="xs" wrap="nowrap">
                                                    <Text
                                                        size="sm"
                                                        fw={600}
                                                        truncate="end"
                                                    >
                                                        {c.name}
                                                    </Text>
                                                    {isRecommended && (
                                                        <Badge
                                                            size="xs"
                                                            color="violet"
                                                            variant="light"
                                                            radius="sm"
                                                        >
                                                            Recommended
                                                        </Badge>
                                                    )}
                                                </Group>
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
                                            <MantineIcon
                                                icon={IconChevronRight}
                                                size={16}
                                                className={classes.chevron}
                                            />
                                        </Group>
                                    </UnstyledButton>
                                );
                            })}
                        </Stack>
                    )}
                </Stack>
            </Center>
        </AiAgentPageLayout>
    );
};

export default AgentsRouterPage;
