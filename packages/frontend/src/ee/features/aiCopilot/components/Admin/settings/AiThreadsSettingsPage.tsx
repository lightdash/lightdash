import { type AiAgentAdminThreadSummary } from '@lightdash/common';
import { Button, Drawer } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChartDots, IconMessageCircleShare } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LinkButton from '../../../../../../components/common/LinkButton';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../../components/common/MantineModal';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import {
    SettingsPage,
    SettingsPageActions,
} from '../../../../../../components/common/Settings/SettingsPage';
import useHealth from '../../../../../../hooks/health/useHealth';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminThreadsTable from '../AiAgentAdminThreadsTable';
import { AnalyticsEmbedDashboard } from '../AnalyticsEmbedDashboard';
import { ThreadPreviewSidebar } from '../ThreadPreviewSidebar';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

export const AiThreadsSettingsPage = () => {
    const { t } = useTranslation('aiCopilotAdmin');
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
        <SettingsPage
            title={t('settings.threads.title')}
            description={t('settings.threads.description')}
            actions={
                <SettingsPageActions>
                    {isAnalyticsEmbedEnabled && (
                        <Button
                            onClick={toggleAnalyticsEmbed}
                            variant="default"
                            size="xs"
                            leftSection={<MantineIcon icon={IconChartDots} />}
                        >
                            {t('settings.threads.insights')}
                        </Button>
                    )}
                    <LinkButton
                        href="/ai-agents"
                        leftIcon={IconMessageCircleShare}
                        variant="default"
                        radius="md"
                        size="xs"
                    >
                        {t('settings.threads.newThread')}
                    </LinkButton>
                </SettingsPageActions>
            }
        >
            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentAdminThreadsTable
                onThreadSelect={handleThreadSelect}
                selectedThread={selectedThread}
                setSelectedThread={setSelectedThread}
                onThreadDeleted={(threadUuid) => {
                    if (selectedThread?.uuid === threadUuid) {
                        handleCloseSidebar();
                    }
                }}
            />

            <Drawer
                opened={isSidebarOpen && !!selectedThread}
                onClose={handleCloseSidebar}
                position="right"
                size="lg"
                withCloseButton={false}
                padding={0}
                classNames={{
                    inner: drawerClasses.inner,
                    overlay: drawerClasses.overlay,
                }}
                __vars={{
                    '--drawer-top-offset': `${NAVBAR_HEIGHT}px`,
                }}
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
                title={t('settings.threads.insightsModalTitle')}
                icon={IconChartDots}
            >
                <AnalyticsEmbedDashboard />
            </MantineModal>
        </SettingsPage>
    );
};
