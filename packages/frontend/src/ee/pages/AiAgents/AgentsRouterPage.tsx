import {
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
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
    IconSettings,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Link,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import { getModelKey } from '../../../components/common/ModelSelector/utils';
import { useProject } from '../../../hooks/useProject';
import { AutoModeSidebar } from '../../features/aiCopilot/components/AiAgentPageLayout/AgentSidebar';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import {
    mergeAiPromptContextInput,
    mergeAiPromptContextItems,
} from '../../features/aiCopilot/components/ChatElements/contentMentions';
import { getPromptContextItemKey } from '../../features/aiCopilot/components/ChatElements/contentReferenceUtils';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import { usePendingPrompt } from '../../features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { PinnedContextCard } from '../../features/aiCopilot/components/PinnedContextCard/PinnedContextCard';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentRouterFlow } from '../../features/aiCopilot/hooks/useAiAgentRouterFlow';
import { useAiAgentSqlModeAvailable } from '../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable';
import { useModelOptions } from '../../features/aiCopilot/hooks/useModelOptions';
import { usePinnedContext } from '../../features/aiCopilot/hooks/usePinnedContext';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { setThreadSqlMode } from '../../features/aiCopilot/store/aiAgentThreadModeSlice';
import { useAiAgentStoreDispatch } from '../../features/aiCopilot/store/hooks';
import classes from './AgentsRouterPage.module.css';

const AgentsRouterPage = () => {
    const { projectUuid } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const dispatch = useAiAgentStoreDispatch();

    const { data: agents } = useProjectAiAgents({
        projectUuid: projectUuid!,
        redirectOnUnauthorized: true,
    });
    const { data: project } = useProject(projectUuid);

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
    const chartUuid = searchParams.get('chartUuid');
    const dashboardUuid = searchParams.get('dashboardUuid');

    const {
        contextInput,
        previewItems,
        contentMentionItems,
        isReady: isPinnedContextReady,
    } = usePinnedContext({
        projectUuid,
        chartUuidOrSlug: chartUuid,
        dashboardUuidOrSlug: dashboardUuid,
    });

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

    const consumedAutoSubmitKeyRef = useRef<string | undefined>(undefined);

    const { mutateAsync: createThread } = useCreateAgentThreadMutation(
        projectUuid!,
    );

    const createThreadForAgent = useCallback(
        async (args: {
            agentUuid: string;
            context?: AiPromptContextInput;
            message: string;
            optimisticContext?: AiPromptContext;
            toolHints: string[];
        }) => {
            const thread = await createThread({
                agentUuid: args.agentUuid,
                context: args.context,
                enableSqlMode: sqlModeAvailable && sqlMode,
                optimisticContext: args.optimisticContext,
                prompt: args.message,
                toolHints: args.toolHints,
                modelConfig: selectedModel
                    ? {
                          modelName: selectedModel.name,
                          modelProvider: selectedModel.provider,
                          reasoning: showExtendedThinking
                              ? extendedThinking
                              : undefined,
                      }
                    : undefined,
            });
            dispatch(
                setThreadSqlMode({
                    threadUuid: thread.uuid,
                    enabled: sqlModeAvailable && sqlMode,
                }),
            );
            return thread;
        },
        [
            createThread,
            dispatch,
            extendedThinking,
            selectedModel,
            showExtendedThinking,
            sqlMode,
            sqlModeAvailable,
        ],
    );

    const handleRouteError = useCallback(
        ({
            fallbackAgent,
            message,
        }: {
            fallbackAgent?: { uuid: string };
            message: string;
        }) => {
            setPendingPrompt(message);
            if (fallbackAgent && projectUuid) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/${fallbackAgent.uuid}/threads`,
                );
            }
        },
        [navigate, projectUuid, setPendingPrompt],
    );

    const {
        confirmPick,
        handleSubmit: handleRouterSubmit,
        isCreating,
        isLocked,
        isPickingAgent,
        isRouting,
        phase,
        sortedCandidates,
    } = useAiAgentRouterFlow({
        agents: agents ?? [],
        createThreadForAgent,
        onRouteError: handleRouteError,
        projectUuid,
    });

    const handleSubmit = useCallback(
        async ({
            context,
            message,
            optimisticContext,
            toolHints,
        }: {
            context?: AiPromptContextInput;
            message: string;
            optimisticContext?: AiPromptContext;
            toolHints: string[];
        }) => {
            if (!isPinnedContextReady) return;
            setPendingPrompt('');
            const mergedContext = mergeAiPromptContextInput(
                contextInput,
                context,
            );
            const mergedOptimisticContext = mergeAiPromptContextItems(
                previewItems,
                optimisticContext,
            );
            await handleRouterSubmit({
                context: mergedContext,
                message,
                optimisticContext: mergedOptimisticContext,
                toolHints,
            });
        },
        [
            contextInput,
            handleRouterSubmit,
            isPinnedContextReady,
            previewItems,
            setPendingPrompt,
        ],
    );

    const autoSubmitPrompt =
        typeof location.state?.autoSubmitPrompt === 'string'
            ? location.state.autoSubmitPrompt.trim()
            : '';

    useEffect(() => {
        if (
            !autoSubmitPrompt ||
            phase.kind !== 'idle' ||
            !isPinnedContextReady
        ) {
            return;
        }
        if (consumedAutoSubmitKeyRef.current === location.key) return;

        consumedAutoSubmitKeyRef.current = location.key;

        void navigate(
            { pathname: location.pathname, search: location.search },
            { replace: true, state: undefined },
        );
        void handleSubmit({
            message: autoSubmitPrompt,
            toolHints: [],
        });
    }, [
        autoSubmitPrompt,
        handleSubmit,
        location.key,
        location.pathname,
        location.search,
        navigate,
        phase.kind,
        isPinnedContextReady,
    ]);

    const isWorking = isRouting || isCreating;
    const workingLabel = isRouting
        ? 'Finding the right agent…'
        : isCreating
          ? 'Opening the conversation…'
          : null;

    const title = project?.name ? `Ask ${project.name}` : 'Ask this project';
    const placeholder = project?.name
        ? `Ask ${project.name} anything...`
        : 'Ask anything about your data...';
    const settingsHref = projectUuid
        ? `/generalSettings/ai/agents?projects=${projectUuid}`
        : '/generalSettings/ai/agents';

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
        >
            <Box className={classes.routerView}>
                {canManageAgents && (
                    <Button
                        component={Link}
                        to={settingsHref}
                        variant="default"
                        size="xs"
                        leftSection={<MantineIcon icon={IconSettings} />}
                        className={classes.routerSettingsButton}
                    >
                        Settings
                    </Button>
                )}

                <Center h="100%">
                    <Stack
                        gap="lg"
                        {...ChatElementsUtils.centeredElementProps}
                        h="unset"
                        py="xl"
                    >
                        <Stack align="center" gap="xxs">
                            <Title order={2}>{title}</Title>
                        </Stack>

                        {previewItems.length > 0 && (
                            <Stack gap="xxs" w="100%">
                                <Text
                                    size="xs"
                                    fw={600}
                                    c="dimmed"
                                    tt="uppercase"
                                >
                                    Pinned context
                                </Text>
                                <Group gap="xs" wrap="wrap">
                                    {previewItems.map((item) => (
                                        <PinnedContextCard
                                            key={getPromptContextItemKey(item)}
                                            item={item}
                                            projectUuid={projectUuid!}
                                        />
                                    ))}
                                </Group>
                            </Stack>
                        )}

                        <AgentChatInput
                            projectUuid={projectUuid}
                            agents={agents ?? []}
                            selectedAgent="auto"
                            placeholder={placeholder}
                            loading={isLocked}
                            disabled={!isPinnedContextReady}
                            onSubmit={handleSubmit}
                            defaultValue={pendingPrompt}
                            onValueChange={setPendingPrompt}
                            models={modelOptions}
                            selectedModelId={selectedModelKey}
                            onModelChange={handleSelectedModelKeyChange}
                            extendedThinking={
                                showExtendedThinking
                                    ? extendedThinking
                                    : undefined
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
                            clearOnSubmit={false}
                            fullWidth
                            showSuggestions={false}
                            contentMentionPriorityItems={contentMentionItems}
                        />

                        {isWorking && workingLabel && (
                            <Group
                                gap={8}
                                justify="center"
                                className={classes.routingStatus}
                                aria-live="polite"
                            >
                                <span className={classes.routingDots}>
                                    <span />
                                    <span />
                                    <span />
                                </span>
                                <Text size="xs" c="dimmed">
                                    {workingLabel}
                                </Text>
                            </Group>
                        )}

                        {isPickingAgent && phase.kind === 'picker' && (
                            <Stack gap="xs" className={classes.pickerStack}>
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

                                <Box className={classes.pickerScroll}>
                                    {sortedCandidates.map((c) => {
                                        return (
                                            <UnstyledButton
                                                key={c.agentUuid}
                                                onClick={() =>
                                                    confirmPick(c.agentUuid)
                                                }
                                                className={`${classes.candidateButton} ${
                                                    c.isRecommended
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
                                                        src={c.agent?.imageUrl}
                                                    />
                                                    <Stack
                                                        gap={2}
                                                        miw={0}
                                                        flex={1}
                                                    >
                                                        <Group
                                                            gap="xs"
                                                            wrap="nowrap"
                                                        >
                                                            <Text
                                                                size="sm"
                                                                fw={600}
                                                                truncate="end"
                                                            >
                                                                {c.name}
                                                            </Text>
                                                            {c.isRecommended && (
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
                                                                className={
                                                                    classes.candidateDescription
                                                                }
                                                            >
                                                                {c.description}
                                                            </Text>
                                                        )}
                                                    </Stack>
                                                    <MantineIcon
                                                        icon={IconChevronRight}
                                                        size={16}
                                                        className={
                                                            classes.chevron
                                                        }
                                                    />
                                                </Group>
                                            </UnstyledButton>
                                        );
                                    })}
                                </Box>
                            </Stack>
                        )}
                    </Stack>
                </Center>
            </Box>
        </AiAgentPageLayout>
    );
};

export default AgentsRouterPage;
