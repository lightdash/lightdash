import {
    FeatureFlags,
    type AiAgentAdminThreadSummary,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Group,
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
    IconListCheck,
    IconLock,
    IconMessageCircle,
    IconMessageCircleShare,
    IconRobotFace,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLocation, useNavigate } from 'react-router';
import LinkButton from '../../../../../components/common/LinkButton';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import useHealth from '../../../../../hooks/health/useHealth';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../../providers/App/useApp';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';
import AiAgentAdminAgentsTable from './AiAgentAdminAgentsTable';
import AiAgentAdminReviewItemsTable, {
    type AiAgentAdminReviewItemPreviewTarget,
} from './AiAgentAdminReviewItemsTable';
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
    const { data: reviewClassifierFlag, isFetched: hasFetchedReviewFlag } =
        useServerFeatureFlag(FeatureFlags.AiAgentReviewClassifier);
    const isReviewTabEnabled = reviewClassifierFlag?.enabled === true;
    const isReviewTabPath = location.pathname.endsWith('/reviews');
    const activeTab =
        isReviewTabPath && isReviewTabEnabled
            ? 'reviews'
            : location.pathname.endsWith('/agents')
              ? 'agents'
              : 'threads';

    const [selectedThread, setSelectedThread] =
        useState<AiAgentAdminThreadSummary | null>(null);
    const [selectedReviewItem, setSelectedReviewItem] =
        useState<AiAgentAdminReviewItemPreviewTarget | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isAnalyticsEmbedOpen, { toggle: toggleAnalyticsEmbed }] =
        useDisclosure(false);

    const canManageOrganization = user.data?.ability.can(
        'manage',
        'Organization',
    );

    const handleThreadSelect = (thread: AiAgentAdminThreadSummary): void => {
        setSelectedThread(thread);
        setSelectedReviewItem(null);
        setIsSidebarOpen(true);
        if (isAnalyticsEmbedOpen) {
            toggleAnalyticsEmbed();
        }
    };

    const handleReviewItemSelect = (
        reviewItem: AiAgentAdminReviewItemPreviewTarget,
    ): void => {
        setSelectedReviewItem(reviewItem);
        setSelectedThread(null);
        setIsSidebarOpen(true);
        if (isAnalyticsEmbedOpen) {
            toggleAnalyticsEmbed();
        }
    };

    const handleCloseSidebar = () => {
        setIsSidebarOpen(false);
        setSelectedThread(null);
        setSelectedReviewItem(null);
    };

    const isAnalyticsEmbedEnabled =
        health?.ai.analyticsProjectUuid && health?.ai.analyticsDashboardUuid;

    useEffect(() => {
        if (isReviewTabPath && hasFetchedReviewFlag && !isReviewTabEnabled) {
            void navigate('/ai-agents/admin/threads', { replace: true });
        }
    }, [hasFetchedReviewFlag, isReviewTabEnabled, isReviewTabPath, navigate]);

    const tabDescription = useMemo(() => {
        switch (activeTab) {
            case 'agents':
                return 'View and manage AI Agents';
            case 'reviews':
                return 'Review AI Agent findings';
            case 'threads':
            default:
                return 'View and manage AI Agents threads';
        }
    }, [activeTab]);

    const tabs = useMemo(
        () => [
            {
                value: 'threads',
                label: (
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconMessageCircle} />
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
            ...(isReviewTabEnabled
                ? [
                      {
                          value: 'reviews',
                          label: (
                              <Group gap="xs" wrap="nowrap">
                                  <MantineIcon icon={IconListCheck} />
                                  <Text fz="sm">Reviews</Text>
                              </Group>
                          ),
                      },
                  ]
                : []),
        ],
        [isReviewTabEnabled],
    );

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
                                {tabDescription}
                            </Text>
                        </Box>
                        <AiAgentsAdminEnableFeatureToggle
                            enabled={settings?.aiAgentsVisible}
                        />
                    </Group>

                    {settings?.aiAgentsVisible === false && (
                        <Alert
                            icon={<IconInfoCircle />}
                            radius="md"
                            color="orange"
                            variant="light"
                            title="AI features are currently disabled for all users"
                        >
                            <Text c="ldGray.7" size="xs">
                                AI features on the homepage and navbar are
                                turned off. Users cannot interact with AI Agents
                                until you re-enable this feature using the
                                toggle above.
                            </Text>
                        </Alert>
                    )}

                    <Group justify="space-between" my="sm">
                        <SegmentedControl
                            size="xs"
                            radius="md"
                            value={activeTab}
                            onChange={(value) => {
                                if (value !== 'threads') {
                                    handleCloseSidebar();
                                }
                                void navigate(`/ai-agents/admin/${value}`);
                            }}
                            data={tabs}
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

                    {activeTab === 'threads' && (
                        <AiAgentAdminThreadsTable
                            onThreadSelect={handleThreadSelect}
                            selectedThread={selectedThread}
                            setSelectedThread={setSelectedThread}
                        />
                    )}
                    {activeTab === 'agents' && <AiAgentAdminAgentsTable />}
                    {activeTab === 'reviews' && (
                        <AiAgentAdminReviewItemsTable
                            selectedReviewItemUuid={
                                selectedReviewItem?.reviewItemUuid
                            }
                            onReviewItemSelect={handleReviewItemSelect}
                        />
                    )}
                </Panel>

                {isSidebarOpen &&
                    (activeTab === 'threads' || activeTab === 'reviews') && (
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
                                {activeTab === 'threads' &&
                                    !!selectedThread && (
                                        <ThreadPreviewSidebar
                                            projectUuid={
                                                selectedThread.project.uuid
                                            }
                                            agentUuid={
                                                selectedThread.agent.uuid
                                            }
                                            threadUuid={selectedThread.uuid}
                                            isOpen={isSidebarOpen}
                                            onClose={handleCloseSidebar}
                                            showAddToEvalsButton
                                        />
                                    )}
                                {activeTab === 'reviews' &&
                                    !!selectedReviewItem && (
                                        <ThreadPreviewSidebar
                                            projectUuid={
                                                selectedReviewItem.projectUuid
                                            }
                                            agentUuid={
                                                selectedReviewItem.agentUuid
                                            }
                                            threadUuid={
                                                selectedReviewItem.threadUuid
                                            }
                                            isOpen={isSidebarOpen}
                                            onClose={handleCloseSidebar}
                                            showAddToEvalsButton
                                        />
                                    )}
                            </Panel>
                        </>
                    )}
            </PanelGroup>
            <MantineModal
                opened={isAnalyticsEmbedOpen}
                size="xl"
                onClose={toggleAnalyticsEmbed}
                title="AI Agents Insights"
                icon={IconChartDots}
            >
                <AnalyticsEmbedDashboard />
            </MantineModal>
        </Stack>
    );
};
