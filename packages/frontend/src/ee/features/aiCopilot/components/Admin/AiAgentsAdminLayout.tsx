import { type AiAgentAdminThreadSummary } from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Group,
    Modal,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChartDots,
    IconGripVertical,
    IconInfoCircle,
    IconLock,
    IconMessageCircle,
    IconMessageCircleShare,
    IconRobotFace,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLocation, useNavigate } from 'react-router';
import LinkButton from '../../../../../components/common/LinkButton';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import useHealth from '../../../../../hooks/health/useHealth';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import useApp from '../../../../../providers/App/useApp';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';
import AiAgentAdminAgentsTable from './AiAgentAdminAgentsTable';
import AiAgentAdminThreadsTable from './AiAgentAdminThreadsTable';
import { AiAgentsAdminEnableFeatureToggle } from './AiAgentsAdminEnableFeatureToggle';
import styles from './AiAgentsAdminLayout.module.css';
import { AnalyticsEmbedDashboard } from './AnalyticsEmbedDashboard';
import { ThreadPreviewSidebar } from './ThreadPreviewSidebar';

export const AiAgentsAdminLayout = () => {
    const { user } = useApp();
    const { data: health } = useHealth();
    const theme = useMantineTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: settings } = useAiOrganizationSettings();
    const activeTab = location.pathname.endsWith('/agents')
        ? 'agents'
        : 'threads';

    const [selectedThread, setSelectedThread] =
        useState<AiAgentAdminThreadSummary | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isAnalyticsEmbedOpen, { toggle: toggleAnalyticsEmbed }] =
        useDisclosure(false);

    const canManageOrganization = user.data?.ability.can(
        'manage',
        'Organization',
    );

    const handleThreadSelect = (thread: AiAgentAdminThreadSummary): void => {
        setSelectedThread(thread);
        setIsSidebarOpen(true);
        if (isAnalyticsEmbedOpen) {
            toggleAnalyticsEmbed();
        }
    };

    const handleCloseSidebar = () => {
        setIsSidebarOpen(false);
        setSelectedThread(null);
    };

    const isAnalyticsEmbedEnabled =
        health?.ai.analyticsProjectUuid && health?.ai.analyticsDashboardUuid;

    if (!canManageOrganization) {
        return (
            <Box mt="30vh">
                <SuboptimalState
                    title={`You don't have access to this page`}
                    description={
                        <>
                            You must be an organization admin to access this
                            page.
                        </>
                    }
                    icon={IconLock}
                />
            </Box>
        );
    }

    return (
        <Stack h={`calc(100vh - ${NAVBAR_HEIGHT}px)`} style={{ flex: 1 }}>
            <PanelGroup direction="horizontal">
                <Panel
                    id="threads-table"
                    defaultSize={isSidebarOpen ? 70 : 100}
                    minSize={50}
                    className={styles.threadsTable}
                >
                    <Group justify="space-between" my="md">
                        <Box>
                            <Group>
                                <Title order={2}>AI Agents Admin Panel</Title>
                                {activeTab === 'threads' &&
                                    isAnalyticsEmbedEnabled && (
                                        <Button
                                            onClick={toggleAnalyticsEmbed}
                                            variant="filled"
                                            size="compact-sm"
                                            color="indigo"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconChartDots}
                                                />
                                            }
                                        >
                                            Insights
                                        </Button>
                                    )}
                            </Group>
                            <Text c="ldGray.6" size="sm" fw={400}>
                                {activeTab === 'threads'
                                    ? 'View and manage AI Agents threads'
                                    : 'View and manage AI Agents'}
                            </Text>
                        </Box>
                        <AiAgentsAdminEnableFeatureToggle
                            enabled={settings?.aiAgentsVisible}
                        />
                    </Group>

                    {settings?.aiAgentsVisible === false && (
                        <Paper my="md">
                            <Alert
                                icon={<IconInfoCircle />}
                                radius="md"
                                variant="outline"
                                color="orange.6"
                                bg="orange.0"
                                title="AI Features Currently Disabled for All Users"
                            >
                                <Text c="ldGray.7" size="xs">
                                    AI features on the homepage and navbar are
                                    turned off. Users cannot interact with AI
                                    Agents until you re-enable this feature
                                    using the toggle above.
                                </Text>
                            </Alert>
                        </Paper>
                    )}

                    <Group justify="space-between" my="sm">
                        <SegmentedControl
                            size="xs"
                            radius="md"
                            value={activeTab}
                            onChange={(value) => {
                                if (value === 'agents') {
                                    handleCloseSidebar();
                                }
                                void navigate(`/ai-agents/admin/${value}`);
                            }}
                            data={[
                                {
                                    value: 'threads',
                                    label: (
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon
                                                icon={IconMessageCircle}
                                            />
                                            <Text fz="sm">Threads</Text>
                                        </Group>
                                    ),
                                },
                                {
                                    value: 'agents',
                                    label: (
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon icon={IconRobotFace} />
                                            <Text fz="sm">Agents</Text>
                                        </Group>
                                    ),
                                },
                            ]}
                        />
                        {activeTab === 'threads' && (
                            <LinkButton
                                href="/ai-agents"
                                leftIcon={IconMessageCircleShare}
                                variant="default"
                                radius="md"
                            >
                                New Thread
                            </LinkButton>
                        )}
                        {activeTab === 'agents' && (
                            <LinkButton
                                href={`/projects/${activeProjectUuid}/ai-agents/new`}
                                leftIcon={IconRobotFace}
                                variant="default"
                                radius="md"
                            >
                                New Agent
                            </LinkButton>
                        )}
                    </Group>

                    {activeTab === 'threads' ? (
                        <AiAgentAdminThreadsTable
                            onThreadSelect={handleThreadSelect}
                            selectedThread={selectedThread}
                            setSelectedThread={setSelectedThread}
                        />
                    ) : (
                        <AiAgentAdminAgentsTable />
                    )}
                </Panel>

                {isSidebarOpen && activeTab === 'threads' && (
                    <>
                        <PanelResizeHandle
                            className={styles.resizeHandle}
                            style={{
                                width: 2,
                                backgroundColor: theme.colors.ldGray[3],
                                cursor: 'col-resize',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <MantineIcon
                                color="gray"
                                icon={IconGripVertical}
                                size="sm"
                            />
                        </PanelResizeHandle>
                        <Panel
                            id="thread-preview"
                            defaultSize={30}
                            minSize={25}
                            maxSize={50}
                        >
                            {!!selectedThread && (
                                <ThreadPreviewSidebar
                                    projectUuid={selectedThread.project.uuid}
                                    agentUuid={selectedThread.agent.uuid}
                                    threadUuid={selectedThread.uuid}
                                    isOpen={isSidebarOpen}
                                    onClose={handleCloseSidebar}
                                    showAddToEvalsButton
                                    renderArtifactsInline
                                />
                            )}
                        </Panel>
                    </>
                )}
            </PanelGroup>
            <Modal
                opened={isAnalyticsEmbedOpen}
                size="xl"
                onClose={toggleAnalyticsEmbed}
                title={<Text fw={700}>AI Agents Insights</Text>}
                padding="0"
                centered
                styles={{
                    header: {
                        borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                        padding: theme.spacing.md,
                    },
                }}
            >
                <AnalyticsEmbedDashboard />
            </Modal>
        </Stack>
    );
};
