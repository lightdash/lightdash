import {
    type AiAgent,
    type AiAgentProjectThreadSummary,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Paper,
    rem,
    Stack,
    Text,
    Title,
    Tooltip,
    NavLink,
} from '@mantine-8/core';
import {
    IconBrandSlack,
    IconChevronDown,
    IconCirclePlus,
    IconInfoCircle,
    IconSparkles,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';
import { useInfiniteAiAgentThreads } from '../../hooks/useProjectAiAgents';
import { AgentNamePill } from '../AgentNamePill';
import classes from './agentSidebar.module.css';
import { SidebarButton } from './SidebarButton';

type ThreadNavLinkProps = {
    thread: AiAgentProjectThreadSummary;
    isActive: boolean;
    projectUuid: string;
    showAgentName?: boolean;
};

const ThreadNavLink: FC<ThreadNavLinkProps> = ({
    thread,
    isActive,
    projectUuid,
    showAgentName = false,
}) => (
    <NavLink
        color="gray"
        component={Link}
        key={thread.uuid}
        to={`/projects/${projectUuid}/ai-agents/${thread.agentUuid}/threads/${thread.uuid}`}
        px="xs"
        py={rem(4)}
        className={classes.threadNavLink}
        label={
            <Text truncate="end" size="sm" fw={500} c="ldGray.9">
                {thread.title || thread.firstMessage.message}
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
            thread.createdFrom === 'slack' && (
                <Tooltip label={'Threads created in slack are read only'}>
                    <IconBrandSlack size={18} stroke={1} />
                </Tooltip>
            )
        }
        viewTransition
    />
);

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

    if (!isSuccess) {
        return null;
    }

    return (
        <Stack gap="xs" style={{ flexGrow: 1, overflowY: 'auto' }}>
            <Title order={6} c="dimmed" tt="uppercase" size="xs" ml="xs">
                Recent
            </Title>

            <Stack gap={2}>
                {threads.length === 0 && (
                    <Paper variant="dotted" p="sm">
                        <Text truncate="end" size="sm" c="ldGray.6" ta="center">
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
        </Stack>
    );
};

const TrialAlert = () => (
    <Alert
        icon={<MantineIcon icon={IconSparkles} />}
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
        <Stack gap="md" style={{ flexGrow: 1, overflowY: 'auto' }}>
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
            {isTrial && <TrialAlert />}
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
        <Stack gap="md" style={{ flexGrow: 1, overflowY: 'auto' }}>
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

            {isTrial && <TrialAlert />}
        </Stack>
    );
};
