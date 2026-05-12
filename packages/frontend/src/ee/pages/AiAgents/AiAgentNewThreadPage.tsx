import {
    ActionIcon,
    Center,
    Group,
    Pill,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import { getModelKey } from '../../../components/common/ModelSelector/utils';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import { DefaultAgentButton } from '../../features/aiCopilot/components/DefaultAgentButton/DefaultAgentButton';
import { usePendingPrompt } from '../../features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { PinnedContextCard } from '../../features/aiCopilot/components/PinnedContextCard/PinnedContextCard';
import { SuggestedQuestions } from '../../features/aiCopilot/components/SuggestedQuestions/SuggestedQuestions';
import { useAiAgentSqlModeAvailable } from '../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable';
import { useModelOptions } from '../../features/aiCopilot/hooks/useModelOptions';
import { usePinnedContext } from '../../features/aiCopilot/hooks/usePinnedContext';
import {
    useCreateAgentThreadMutation,
    useVerifiedQuestions,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { setThreadSqlMode } from '../../features/aiCopilot/store/aiAgentThreadModeSlice';
import { useAiAgentStoreDispatch } from '../../features/aiCopilot/store/hooks';
import { type AgentContext } from './AgentPage';

const AiAgentNewThreadPage: FC = () => {
    const { agentUuid, projectUuid } = useParams();
    const [searchParams] = useSearchParams();
    const chartUuid = searchParams.get('chartUuid');
    const dashboardUuid = searchParams.get('dashboardUuid');

    const { contextInput, previewItems } = usePinnedContext({
        projectUuid,
        chartUuid,
        dashboardUuid,
    });

    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    const [sqlMode, setSqlMode] = useState(false);
    const dispatch = useAiAgentStoreDispatch();

    const { mutateAsync: createAgentThread, isLoading: isCreatingThread } =
        useCreateAgentThreadMutation(agentUuid, projectUuid!, {
            // Seed the per-thread slice with the user's choice so subsequent
            // prompts in this thread default to the same state. Navigation
            // still happens (we only override the slice, not the routing).
            onCreated: (thread) =>
                dispatch(
                    setThreadSqlMode({
                        threadUuid: thread.uuid,
                        enabled: sqlModeAvailable && sqlMode,
                    }),
                ),
        });
    const { agent } = useOutletContext<AgentContext>();
    const { data: verifiedQuestions } = useVerifiedQuestions(
        projectUuid,
        agentUuid,
    );
    const { data: modelOptions } = useModelOptions({ projectUuid, agentUuid });

    const [selectedModelKey, setSelectedModelKey] = useState<string | null>(
        null,
    );
    const [extendedThinking, setExtendedThinking] = useState(false);

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
        [modelOptions, setExtendedThinking],
    );

    // Initialize to default model when data loads
    useEffect(() => {
        if (modelOptions && !selectedModelKey) {
            const defaultModel = modelOptions.find((m) => m.default);
            if (defaultModel) {
                handleSelectedModelKeyChange(getModelKey(defaultModel));
            }
        }
    }, [modelOptions, selectedModelKey, handleSelectedModelKeyChange]);

    // Only enable extended thinking toggle when selected model supports reasoning
    const selectedModel = useMemo(
        () => modelOptions?.find((m) => getModelKey(m) === selectedModelKey),
        [modelOptions, selectedModelKey],
    );
    const showExtendedThinking = selectedModel?.supportsReasoning ?? false;

    const { pendingPrompt, setPendingPrompt } = usePendingPrompt();

    const onSubmit = useCallback(
        (prompt: string) => {
            setPendingPrompt('');
            void createAgentThread({
                prompt,
                context: contextInput.length > 0 ? contextInput : undefined,
                optimisticContext:
                    previewItems.length > 0 ? previewItems : undefined,
                enableSqlMode: sqlModeAvailable && sqlMode,
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
        },
        [
            setPendingPrompt,
            createAgentThread,
            contextInput,
            previewItems,
            sqlModeAvailable,
            sqlMode,
            selectedModel,
            showExtendedThinking,
            extendedThinking,
        ],
    );

    return (
        <Center h="100%">
            <Stack
                justify="space-between"
                gap={0}
                pos="relative"
                {...ChatElementsUtils.centeredElementProps}
                h="unset"
            >
                <Stack flex={1} py="xl">
                    <Stack align="center" gap="xxs">
                        <LightdashUserAvatar
                            size="lg"
                            name={agent.name || 'AI'}
                            src={agent.imageUrl}
                        />
                        <Group justify="center" gap={2}>
                            <Title order={4} ta="center">
                                {agent.name}
                            </Title>
                            <DefaultAgentButton
                                projectUuid={projectUuid}
                                agentUuid={agent.uuid}
                            />
                            {agent.instruction && (
                                <Popover withArrow>
                                    <Popover.Target>
                                        <ActionIcon
                                            variant="subtle"
                                            color="ldGray.6"
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                            />
                                        </ActionIcon>
                                    </Popover.Target>
                                    <Popover.Dropdown>
                                        <ScrollArea.Autosize
                                            type="hover"
                                            offsetScrollbars="y"
                                            scrollbars="y"
                                            mah={400}
                                        >
                                            <Text
                                                size="sm"
                                                style={{
                                                    whiteSpace: 'pre-wrap',
                                                }}
                                            >
                                                {agent.instruction}
                                            </Text>
                                        </ScrollArea.Autosize>
                                    </Popover.Dropdown>
                                </Popover>
                            )}
                        </Group>
                        {agent.description && (
                            <Text
                                size="sm"
                                c="ldGray.6"
                                ta="center"
                                maw={600}
                                style={{ whiteSpace: 'pre-wrap' }}
                            >
                                {agent.description}
                            </Text>
                        )}
                        {agent.tags && (
                            <Group gap="xxs">
                                {agent.tags.map((tag, i) => (
                                    <Pill key={i} size="sm">
                                        {tag}
                                    </Pill>
                                ))}
                            </Group>
                        )}
                    </Stack>

                    {verifiedQuestions && (
                        <SuggestedQuestions
                            questions={verifiedQuestions}
                            onQuestionClick={onSubmit}
                            isLoading={isCreatingThread}
                        />
                    )}

                    {previewItems.length > 0 && projectUuid && (
                        <Stack gap="xs">
                            <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                                Pinned context
                            </Text>
                            <Group gap="xs" wrap="wrap">
                                {previewItems.map((item) => (
                                    <PinnedContextCard
                                        key={`${item.type}-${
                                            item.type === 'chart'
                                                ? item.chartUuid
                                                : item.dashboardUuid
                                        }`}
                                        item={item}
                                        projectUuid={projectUuid}
                                    />
                                ))}
                            </Group>
                        </Stack>
                    )}

                    <AgentChatInput
                        onSubmit={onSubmit}
                        loading={isCreatingThread}
                        placeholder={`Ask ${agent.name} anything about your data...`}
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
                        defaultValue={pendingPrompt}
                        onValueChange={setPendingPrompt}
                    />
                </Stack>
            </Stack>
        </Center>
    );
};
export default AiAgentNewThreadPage;
