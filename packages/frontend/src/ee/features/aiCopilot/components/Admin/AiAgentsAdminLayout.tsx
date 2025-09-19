import { type AiAgentAdminThreadSummary } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconGripVertical, IconLock, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import LinkButton from '../../../../../components/common/LinkButton';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../../../../providers/App/useApp';
import AiAgentAdminThreadsTable from './AiAgentAdminThreadsTable';
import styles from './AiAgentsAdminLayout.module.css';
import { AnalyticsEmbedDashboard } from './AnalyticsEmbedDashboard';
import { ThreadPreviewSidebar } from './ThreadPreviewSidebar';

export const AiAgentsAdminLayout = () => {
    const { user } = useApp();
    const theme = useMantineTheme();
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
                    <Group justify="space-between" my="lg">
                        <Box>
                            <Group>
                                <Title order={2}>AI Agents Admin Panel</Title>
                                <Group justify="space-between" my="lg">
                                    <Button
                                        onClick={toggleAnalyticsEmbed}
                                        variant="filled"
                                        size="compact-sm"
                                        color="indigo"
                                    >
                                        View Insights
                                    </Button>
                                </Group>
                            </Group>
                            <Text c="gray.6" size="sm" fw={400}>
                                View and manage AI Agents threads
                            </Text>
                        </Box>
                        <LinkButton
                            href="/ai-agents"
                            leftIcon={IconPlus}
                            variant="filled"
                        >
                            New Thread
                        </LinkButton>
                    </Group>

                    <AiAgentAdminThreadsTable
                        onThreadSelect={handleThreadSelect}
                        selectedThread={selectedThread}
                        setSelectedThread={setSelectedThread}
                    />
                </Panel>

                {isSidebarOpen && (
                    <>
                        <PanelResizeHandle
                            className={styles.resizeHandle}
                            style={{
                                width: 2,
                                backgroundColor: theme.colors.gray[3],
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
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: theme.spacing.md,
                    },
                }}
            >
                <AnalyticsEmbedDashboard />
            </Modal>
        </Stack>
    );
};
