import { type AiAgent, type AiAgentThreadSummary } from '@lightdash/common';
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
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';
import { useAiAgentThreads } from '../../hooks/useProjectAiAgents';
import { SidebarButton } from './SidebarButton';

const INITIAL_MAX_THREADS = 10;
const MAX_THREADS_INCREMENT = 10;

type ThreadNavLinkProps = {
    thread: AiAgentThreadSummary;
    isActive: boolean;
    projectUuid: string;
};

const ThreadNavLink: FC<ThreadNavLinkProps> = ({
    thread,
    isActive,
    projectUuid,
}) => (
    <NavLink
        color="gray"
        component={Link}
        key={thread.uuid}
        to={`/projects/${projectUuid}/ai-agents/${thread.agentUuid}/threads/${thread.uuid}`}
        px="xs"
        py={rem(4)}
        style={(theme) => ({
            borderRadius: theme.radius.sm,
        })}
        label={
            <Text truncate="end" size="sm" c="ldGray.9">
                {thread.title || thread.firstMessage.message}
            </Text>
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
    const { data: threads } = useAiAgentThreads(projectUuid, agent.uuid);
    const [showMaxItems, setShowMaxItems] = useState(INITIAL_MAX_THREADS);

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

            {projectUuid && threads && !isAgentSidebarCollapsed && (
                <Stack gap="xs" style={{ flexGrow: 1, overflowY: 'auto' }}>
                    <Title
                        order={6}
                        c="dimmed"
                        tt="uppercase"
                        size="xs"
                        ml="xs"
                    >
                        Recent
                    </Title>

                    <Stack gap={2}>
                        {threads.length === 0 && (
                            <Paper variant="dotted" p="sm">
                                <Text
                                    truncate="end"
                                    size="sm"
                                    c="ldGray.6"
                                    ta="center"
                                >
                                    No threads yet
                                </Text>
                            </Paper>
                        )}

                        <Box>
                            {threads.slice(0, showMaxItems).map((thread) => (
                                <ThreadNavLink
                                    key={thread.uuid}
                                    thread={thread}
                                    isActive={thread.uuid === threadUuid}
                                    projectUuid={projectUuid}
                                />
                            ))}
                        </Box>
                    </Stack>

                    <Box>
                        {threads.length >= showMaxItems && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                onClick={() =>
                                    setShowMaxItems(
                                        (s) => s + MAX_THREADS_INCREMENT,
                                    )
                                }
                                leftSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                            >
                                View more
                            </Button>
                        )}
                    </Box>
                </Stack>
            )}
            {isTrial && <TrialAlert />}
        </Stack>
    );
};

type AutoModeSidebarProps = {
    projectUuid: string;
    isAgentSidebarCollapsed: boolean;
};

export const AutoModeSidebar: FC<AutoModeSidebarProps> = ({
    projectUuid,
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

            {isTrial && <TrialAlert />}
        </Stack>
    );
};
