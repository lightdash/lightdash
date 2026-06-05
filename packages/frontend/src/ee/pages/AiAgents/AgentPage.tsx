import { type AiAgent } from '@lightdash/common';
import { Box, Loader } from '@mantine-8/core';
import { useCallback, useState } from 'react';
import {
    Navigate,
    Outlet,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { AgentSelector } from '../../features/aiCopilot/components/AgentSelector';
import { AgentPageHeader } from '../../features/aiCopilot/components/AiAgentPageLayout/AgentPageHeader';
import { AgentSidebar } from '../../features/aiCopilot/components/AiAgentPageLayout/AgentSidebar';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';
import { launcherSession } from '../../features/aiCopilot/components/Launcher/launcherSession';
import { useLauncherDock } from '../../features/aiCopilot/components/Launcher/useLauncherDock';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import {
    useProjectAiAgent as useAiAgent,
    useAiAgentThread,
    useProjectAiAgents,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { store as aiAgentStore } from '../../features/aiCopilot/store';
import { openPanel } from '../../features/aiCopilot/store/aiAgentLauncherSlice';

type NavigateFromAgentChatOptions = {
    threadUuid?: string;
    title?: string | null;
};

const AgentPage = () => {
    const { agentUuid, threadUuid, projectUuid } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const canManageAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const { data: agentsList } = useProjectAiAgents({
        projectUuid: projectUuid!,
        redirectOnUnauthorized: true,
    });

    const [isAgentSidebarCollapsed, setIsAgentSidebarCollapsed] =
        useState(false);

    const { data: agent, isLoading: isLoadingAgent } = useAiAgent(
        projectUuid!,
        agentUuid!,
    );

    const { data: thread } = useAiAgentThread(
        projectUuid!,
        agentUuid,
        threadUuid,
    );

    const { addItem: addDockItem } = useLauncherDock(projectUuid);
    const { track } = useTracking();
    const { user } = useApp();

    const handleMinimize = useCallback(
        (targetUrl?: string, options?: NavigateFromAgentChatOptions) => {
            if (!agent || !projectUuid) return;
            const panelThreadUuid = options?.threadUuid ?? threadUuid;
            track({
                name: EventName.AI_AGENT_CHAT_MINIMIZED,
                properties: {
                    userId: user?.data?.userUuid,
                    organizationId: user?.data?.organizationUuid,
                    projectId: projectUuid,
                    agentUuid: agent.uuid,
                    threadUuid: panelThreadUuid,
                },
            });
            if (panelThreadUuid) {
                const dockTitle =
                    options?.title ||
                    (panelThreadUuid === threadUuid
                        ? thread?.title || thread?.firstMessage?.message
                        : undefined) ||
                    'Conversation';
                addDockItem({
                    threadId: panelThreadUuid,
                    agentUuid: agent.uuid,
                    title: dockTitle,
                });
                aiAgentStore.dispatch(
                    openPanel({
                        threadId: panelThreadUuid,
                        agentUuid: agent.uuid,
                    }),
                );
            } else {
                const chartUuid = searchParams.get('chartUuid');
                const dashboardUuid = searchParams.get('dashboardUuid');
                const pendingContext =
                    chartUuid || dashboardUuid
                        ? {
                              chartUuid: chartUuid ?? undefined,
                              dashboardUuid: dashboardUuid ?? undefined,
                          }
                        : null;
                aiAgentStore.dispatch(
                    openPanel({
                        threadId: null,
                        agentUuid: agent.uuid,
                        pendingContext,
                    }),
                );
            }
            void navigate(
                targetUrl ??
                    launcherSession.consumeLastNonAgentUrl() ??
                    `/projects/${projectUuid}/home`,
                { viewTransition: true },
            );
        },
        [
            addDockItem,
            agent,
            navigate,
            projectUuid,
            searchParams,
            thread,
            threadUuid,
            track,
            user?.data?.organizationUuid,
            user?.data?.userUuid,
        ],
    );

    if (isLoadingAgent) {
        return (
            <Box
                h="100vh"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Loader color="gray" />
            </Box>
        );
    }

    if (!agent) {
        return <Navigate to={`/projects/${projectUuid}/ai-agents`} />;
    }

    return (
        <AiAgentPageLayout
            setIsAgentSidebarCollapsed={setIsAgentSidebarCollapsed}
            isAgentSidebarCollapsed={isAgentSidebarCollapsed}
            Sidebar={
                <AgentSidebar
                    agent={agent}
                    projectUuid={projectUuid!}
                    threadUuid={threadUuid}
                    isAgentSidebarCollapsed={isAgentSidebarCollapsed}
                />
            }
            Header={
                agentsList && agentsList.length > 0 ? (
                    <AgentPageHeader
                        leftSection={
                            <AgentSelector
                                projectUuid={projectUuid!}
                                agents={agentsList}
                                selectedAgent={agent}
                                variant="header"
                            />
                        }
                        onMinimize={() => handleMinimize()}
                        settingsHref={
                            canManageAgents
                                ? `/projects/${projectUuid}/ai-agents/${agent.uuid}/edit`
                                : undefined
                        }
                    />
                ) : undefined
            }
        >
            <Outlet
                context={{
                    agent,
                    agents: agentsList ?? [],
                    navigateFromAgentChat: handleMinimize,
                }}
            />
        </AiAgentPageLayout>
    );
};

export interface AgentContext {
    agent: AiAgent;
    agents: AiAgent[];
    navigateFromAgentChat: (
        targetUrl: string,
        options?: NavigateFromAgentChatOptions,
    ) => void;
}

export default AgentPage;
