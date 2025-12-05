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
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import { DefaultAgentButton } from '../../features/aiCopilot/components/DefaultAgentButton/DefaultAgentButton';
import { SuggestedQuestions } from '../../features/aiCopilot/components/SuggestedQuestions/SuggestedQuestions';
import { useModelOptions } from '../../features/aiCopilot/hooks/useModelOptions';
import {
    useCreateAgentThreadMutation,
    useVerifiedQuestions,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { type AgentContext } from './AgentPage';

const AiAgentNewThreadPage: FC = () => {
    const { agentUuid, projectUuid } = useParams();
    const { mutateAsync: createAgentThread, isLoading: isCreatingThread } =
        useCreateAgentThreadMutation(agentUuid, projectUuid!);
    const { agent } = useOutletContext<AgentContext>();
    const { data: verifiedQuestions } = useVerifiedQuestions(
        projectUuid,
        agentUuid,
    );
    const { data: modelOptions } = useModelOptions({ projectUuid, agentUuid });

    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [extendedThinking, setExtendedThinking] = useState(false);

    const handleSelectedModelIdChange = useCallback(
        (modelId: string) => {
            setSelectedModelId(modelId);
            const selectedModel = modelOptions?.find((m) => m.name === modelId);
            if (selectedModel && !selectedModel.supportsReasoning) {
                setExtendedThinking(false);
            }
        },
        [modelOptions, setExtendedThinking],
    );

    // Initialize to default model when data loads
    useEffect(() => {
        if (modelOptions && !selectedModelId) {
            const defaultModel = modelOptions.find((m) => m.default);
            if (defaultModel) {
                handleSelectedModelIdChange(defaultModel.name);
            }
        }
    }, [modelOptions, selectedModelId, handleSelectedModelIdChange]);

    // Only enable extended thinking toggle when selected model supports reasoning
    const selectedModel = useMemo(
        () => modelOptions?.find((m) => m.name === selectedModelId),
        [modelOptions, selectedModelId],
    );
    const showExtendedThinking = selectedModel?.supportsReasoning ?? false;

    const onSubmit = useCallback(
        (prompt: string) => {
            void createAgentThread({
                prompt,
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
            createAgentThread,
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

                    <AgentChatInput
                        onSubmit={onSubmit}
                        loading={isCreatingThread}
                        placeholder={`Ask ${agent.name} anything about your data...`}
                        models={modelOptions}
                        selectedModelId={selectedModelId}
                        onModelChange={handleSelectedModelIdChange}
                        extendedThinking={
                            showExtendedThinking ? extendedThinking : undefined
                        }
                        onExtendedThinkingChange={
                            showExtendedThinking
                                ? setExtendedThinking
                                : undefined
                        }
                    />
                </Stack>
            </Stack>
        </Center>
    );
};
export default AiAgentNewThreadPage;
