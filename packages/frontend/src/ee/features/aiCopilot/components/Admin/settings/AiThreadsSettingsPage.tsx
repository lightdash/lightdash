import { type AiAgentAdminThreadSummary } from '@lightdash/common';
import { Button, Drawer, Group, Stack } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconChartDots, IconMessageCircleShare } from '@tabler/icons-react';
import { useState } from 'react';
import LinkButton from '../../../../../../components/common/LinkButton';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../../components/common/MantineModal';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import useHealth from '../../../../../../hooks/health/useHealth';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminThreadsTable from '../AiAgentAdminThreadsTable';
import { AnalyticsEmbedDashboard } from '../AnalyticsEmbedDashboard';
import { ThreadPreviewSidebar } from '../ThreadPreviewSidebar';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';

export const AiThreadsSettingsPage = () => {
    const { data: health } = useHealth();
    const { data: settings } = useAiOrganizationSettings();

    const [selectedThread, setSelectedThread] =
        useState<AiAgentAdminThreadSummary | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isAnalyticsEmbedOpen, { toggle: toggleAnalyticsEmbed }] =
        useDisclosure(false);

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

    return (
        <Stack mb="lg" gap="md">
            <Group justify="space-between" align="flex-start">
                <PageBreadcrumbs
                    items={[
                        { title: 'Ask AI', to: '/generalSettings/ai/general' },
                        { title: 'Threads', active: true },
                    ]}
                />
                <Group gap="xs">
                    {isAnalyticsEmbedEnabled && (
                        <Button
                            onClick={toggleAnalyticsEmbed}
                            variant="default"
                            size="xs"
                            leftSection={<MantineIcon icon={IconChartDots} />}
                        >
                            Insights
                        </Button>
                    )}
                    <LinkButton
                        href="/ai-agents"
                        leftIcon={IconMessageCircleShare}
                        variant="default"
                        radius="md"
                    >
                        New Thread
                    </LinkButton>
                </Group>
            </Group>

            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentAdminThreadsTable
                onThreadSelect={handleThreadSelect}
                selectedThread={selectedThread}
                setSelectedThread={setSelectedThread}
            />

            <Drawer
                opened={isSidebarOpen && !!selectedThread}
                onClose={handleCloseSidebar}
                position="right"
                size="lg"
                withCloseButton={false}
                padding={0}
            >
                {!!selectedThread && (
                    <ThreadPreviewSidebar
                        projectUuid={selectedThread.project.uuid}
                        agentUuid={selectedThread.agent.uuid}
                        threadUuid={selectedThread.uuid}
                        isOpen={isSidebarOpen}
                        onClose={handleCloseSidebar}
                        showAddToEvalsButton
                    />
                )}
            </Drawer>

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
