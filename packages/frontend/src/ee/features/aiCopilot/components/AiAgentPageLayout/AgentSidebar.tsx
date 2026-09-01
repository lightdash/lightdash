import {
    FeatureFlags,
    type AiAgent,
    type AiAgentProjectThreadSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Group,
    Paper,
    rem,
    Stack,
    Text,
    Title,
    Tooltip,
    NavLink,
} from '@mantine/core';
import {
    IconBrandSlack,
    IconChevronDown,
    IconCirclePlus,
    IconInfoCircle,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { useCanManageAiAgentThread } from '../../hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';
import {
    useDeleteAiAgentThreadMutation,
    useInfiniteAiAgentThreads,
} from '../../hooks/useProjectAiAgents';
import { AgentNamePill } from '../AgentNamePill';
import { AiAgentIcon } from '../AiAgentIcon';
import classes from './agentSidebar.module.css';
import { SidebarButton } from './SidebarButton';

type ThreadNavLinkProps = {
    thread: AiAgentProjectThreadSummary;
    isActive: boolean;
    projectUuid: string;
    showAgentName?: boolean;
    deletionDisabled: boolean;
    onDelete: (thread: AiAgentProjectThreadSummary) => void;
};

const ThreadNavLink: FC<ThreadNavLinkProps> = ({
    thread,
    isActive,
    projectUuid,
    showAgentName = false,
    deletionDisabled,
    onDelete,
}) => {
    const threadTitle = (thread.title || thread.firstMessage.message).trim();
    const hasTitle = threadTitle.length > 0;
    const canManageThread = useCanManageAiAgentThread({
        projectUuid,
        threadUserUuid: thread.user.uuid,
    });
    // Deleting a Slack thread here would not remove it from Slack itself
    const canDelete =
        !deletionDisabled && canManageThread && thread.createdFrom !== 'slack';

    return (
        <NavLink
            color="gray"
            component={Link}
            key={thread.uuid}
            to={`/projects/${projectUuid}/ai-agents/${thread.agentUuid}/threads/${thread.uuid}`}
            px="xs"
            py={rem(4)}
            className={classes.threadNavLink}
            label={
                <Text
                    truncate="end"
                    size="xs"
                    fw={500}
                    c={hasTitle ? 'ldGray.9' : 'dimmed'}
                    fs={hasTitle ? undefined : 'italic'}
                >
                    {hasTitle ? threadTitle : 'Untitled thread'}
                </Text>
            }
            description={
                showAgentName ? (
                    <AgentNamePill
                        name={thread.agentName}
                        imageUrl={thread.agentImageUrl}
                        variant="inline"
                    />
                ) : undefined
            }
            active={isActive}
            rightSection={
                <Group gap={4} wrap="nowrap">
                    {thread.createdFrom === 'slack' && (
                        <Tooltip
                            label={'Threads created in slack are read only'}
                        >
                            <IconBrandSlack size={18} stroke={1} />
                        </Tooltip>
                    )}
                    {canDelete && (
                        <Tooltip label="Delete thread" openDelay={300}>
                            <ActionIcon
                                size="xs"
                                color="ldGray"
                                className={classes.threadDeleteButton}
                                aria-label="Delete thread"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onDelete(thread);
                                }}
                            >
                                <MantineIcon icon={IconX} size={12} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            }
            viewTransition
        />
    );
};

type ThreadListProps = {
    projectUuid: string;
    threadUuid?: string;
    agentUuid?: string;
    showAgentName?: boolean;
};

const ThreadList: FC<ThreadListProps> = ({
    projectUuid,
    threadUuid,
    agentUuid,
    showAgentName = false,
}) => {
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isSuccess } =
        useInfiniteAiAgentThreads(projectUuid, { agentUuid });

    const threads = data?.pages.flatMap((page) => page.data) ?? [];

    const deletionDisabledFlag = useServerFeatureFlag(
        FeatureFlags.AiDisableThreadDeletion,
    );
    const deletionDisabled = deletionDisabledFlag.data?.enabled === true;

    const [threadToDelete, setThreadToDelete] =
        useState<AiAgentProjectThreadSummary | null>(null);
    const { mutateAsync: deleteThread, isLoading: isDeletingThread } =
        useDeleteAiAgentThreadMutation(projectUuid);
    const handleConfirmDelete = async () => {
        if (!threadToDelete) return;
        await deleteThread({
            agentUuid: threadToDelete.agentUuid,
            threadUuid: threadToDelete.uuid,
        });
        setThreadToDelete(null);
    };

    if (!isSuccess) {
        return null;
    }

    return (
        <Stack gap="xs" className={classes.threadList}>
            <Title order={6} c="dimmed" tt="uppercase" size="xs" ml="xs">
                Recent
            </Title>

            <Stack gap={2} className={classes.threadItems}>
                {threads.length === 0 && (
                    <Paper variant="dotted" p="sm">
                        <Text truncate="end" size="sm" c="dimmed" ta="center">
                            No threads yet
                        </Text>
                    </Paper>
                )}

                <Box>
                    {threads.map((thread) => (
                        <ThreadNavLink
                            key={thread.uuid}
                            thread={thread}
                            isActive={thread.uuid === threadUuid}
                            projectUuid={projectUuid}
                            showAgentName={showAgentName}
                            deletionDisabled={deletionDisabled}
                            onDelete={setThreadToDelete}
                        />
                    ))}
                </Box>
            </Stack>

            <Box>
                {hasNextPage && (
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        loading={isFetchingNextPage}
                        onClick={() => fetchNextPage()}
                        leftSection={<MantineIcon icon={IconChevronDown} />}
                    >
                        View more
                    </Button>
                )}
            </Box>

            <MantineModal
                opened={threadToDelete !== null}
                onClose={() => setThreadToDelete(null)}
                title="Delete thread"
                variant="delete"
                resourceType="thread"
                description="The whole conversation and everything derived from it will be permanently deleted. This action cannot be undone."
                onConfirm={handleConfirmDelete}
                confirmLoading={isDeletingThread}
            />
        </Stack>
    );
};

const TrialAlert = () => (
    <Alert
        icon={<AiAgentIcon size={14} />}
        variant="outline"
        color="indigo.6"
        bg="indigo.0"
        fz="xs"
        p="xs"
        title={
            <Text size="xs" fw={500}>
                You're currently using Lightdash AI Agents in free trial mode
            </Text>
        }
    >
        <Button
            size="compact-xs"
            variant="light"
            color="indigo"
            leftSection={<MantineIcon icon={IconInfoCircle} size="sm" />}
            component={Link}
            to="https://docs.lightdash.com/guides/ai-agents"
            target="_blank"
        >
            Learn more
        </Button>
    </Alert>
);

type AgentSidebarProps = {
    agent: AiAgent;
    projectUuid: string;
    threadUuid?: string;
    isAgentSidebarCollapsed: boolean;
};

export const AgentSidebar: FC<AgentSidebarProps> = ({
    agent,
    projectUuid,
    threadUuid,
    isAgentSidebarCollapsed,
}) => {
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const isTrial =
        aiOrganizationSettingsQuery.isSuccess &&
        aiOrganizationSettingsQuery.data.isTrial;

    return (
        <Stack
            gap="sm"
            className={classes.sidebarSurface}
            data-collapsed={isAgentSidebarCollapsed ? 'true' : undefined}
        >
            <Box>
                <SidebarButton
                    leftSection={<MantineIcon icon={IconCirclePlus} />}
                    component={Link}
                    to={`/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`}
                    size="sm"
                    {...(!isAgentSidebarCollapsed && {
                        fullWidth: true,
                        justify: 'flex-start',
                    })}
                >
                    {isAgentSidebarCollapsed ? '' : 'New thread'}
                </SidebarButton>
            </Box>

            {projectUuid && !isAgentSidebarCollapsed && (
                <ThreadList
                    projectUuid={projectUuid}
                    threadUuid={threadUuid}
                    agentUuid={agent.uuid}
                />
            )}
            {isTrial && !isAgentSidebarCollapsed && <TrialAlert />}
        </Stack>
    );
};

type AutoModeSidebarProps = {
    projectUuid: string;
    threadUuid?: string;
    isAgentSidebarCollapsed: boolean;
};

export const AutoModeSidebar: FC<AutoModeSidebarProps> = ({
    projectUuid,
    threadUuid,
    isAgentSidebarCollapsed,
}) => {
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const isTrial =
        aiOrganizationSettingsQuery.isSuccess &&
        aiOrganizationSettingsQuery.data.isTrial;

    return (
        <Stack
            gap="sm"
            className={classes.sidebarSurface}
            data-collapsed={isAgentSidebarCollapsed ? 'true' : undefined}
        >
            <Box>
                <SidebarButton
                    leftSection={<MantineIcon icon={IconCirclePlus} />}
                    component={Link}
                    to={`/projects/${projectUuid}/ai-agents`}
                    size="sm"
                    {...(!isAgentSidebarCollapsed && {
                        fullWidth: true,
                        justify: 'flex-start',
                    })}
                >
                    {isAgentSidebarCollapsed ? '' : 'New thread'}
                </SidebarButton>
            </Box>

            {projectUuid && !isAgentSidebarCollapsed && (
                <ThreadList
                    projectUuid={projectUuid}
                    threadUuid={threadUuid}
                    showAgentName
                />
            )}

            {isTrial && !isAgentSidebarCollapsed && <TrialAlert />}
        </Stack>
    );
};
