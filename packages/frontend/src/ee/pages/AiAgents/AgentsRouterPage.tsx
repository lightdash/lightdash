import { Avatar, Center, Stack, Text, Title } from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { getModelKey } from '../../../components/common/ModelSelector/utils';
import { AgentPageHeader } from '../../features/aiCopilot/components/AiAgentPageLayout/AgentPageHeader';
import { AutoModeSidebar } from '../../features/aiCopilot/components/AiAgentPageLayout/AgentSidebar';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentSqlModeAvailable } from '../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable';
import { useModelOptions } from '../../features/aiCopilot/hooks/useModelOptions';
import { useProjectAiAgents } from '../../features/aiCopilot/hooks/useProjectAiAgents';

const AgentsRouterPage = () => {
    const { projectUuid } = useParams();

    const { data: agents } = useProjectAiAgents({
        projectUuid: projectUuid!,
        redirectOnUnauthorized: true,
    });

    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // The router doesn't have its own agent, so the model lineup is borrowed
    // from the first agent — this is a prototype stand-in until the backend
    // picks the model based on the routed agent.
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
                        placeholder="Ask anything about your data..."
                        onSubmit={() => {
                            // TODO: wire to /route endpoint
                        }}
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
                </Stack>
            </Center>
        </AiAgentPageLayout>
    );
};

export default AgentsRouterPage;
