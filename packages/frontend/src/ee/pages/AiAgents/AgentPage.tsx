import { type AiAgent } from '@lightdash/common';
import { Box, Group, Loader, Stack, Text, TextInput } from '@mantine-8/core';
import { IconShare2 } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import {
    Navigate,
    Outlet,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import { ShareLinkButton } from '../../../components/common/ShareLinkButton';
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
    useCreateAgentThreadShareMutation,
    useProjectAiAgents,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { store as aiAgentStore } from '../../features/aiCopilot/store';
import { openPanel } from '../../features/aiCopilot/store/aiAgentLauncherSlice';
import styles from './AgentPage.module.css';

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
    const { mutateAsync: createThreadShare, isLoading: isCreatingShare } =
        useCreateAgentThreadShareMutation();
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);

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

    const closeShareModal = useCallback(() => {
        setIsShareModalOpen(false);
        setShareUrl(null);
    }, []);

    const handleShare = useCallback(async () => {
        if (!projectUuid || !agentUuid || !threadUuid) return;
        setIsShareModalOpen(true);
        setShareUrl(null);
        try {
            const share = await createThreadShare({
                projectUuid,
                agentUuid,
                threadUuid,
            });
            setShareUrl(share.shareUrl);
        } catch {
            closeShareModal();
        }
    }, [
        agentUuid,
        closeShareModal,
        createThreadShare,
        projectUuid,
        threadUuid,
    ]);

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
                        onShare={
                            thread?.createdFrom === 'web_app'
                                ? handleShare
                                : undefined
                        }
                        isSharing={isCreatingShare}
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
            <MantineModal
                opened={isShareModalOpen}
                onClose={closeShareModal}
                title="Share thread"
                icon={IconShare2}
                size={560}
                cancelLabel={false}
            >
                <Stack gap="md">
                    <Stack gap="xs">
                        <Text size="sm">
                            Anyone with the link and access to this AI agent can
                            open this conversation as their own copy.
                        </Text>
                        <Text size="sm" c="dimmed">
                            New messages you send later won't be included.
                        </Text>
                    </Stack>

                    <Group
                        wrap="nowrap"
                        gap="sm"
                        p="sm"
                        className={styles.shareCopyBar}
                    >
                        <TextInput
                            value={
                                isCreatingShare
                                    ? 'Creating link...'
                                    : (shareUrl ?? '')
                            }
                            readOnly
                            variant="unstyled"
                            className={styles.shareLinkInput}
                        />
                        {shareUrl && !isCreatingShare ? (
                            <ShareLinkButton url={shareUrl} />
                        ) : null}
                    </Group>
                </Stack>
            </MantineModal>
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
