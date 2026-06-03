import { Drawer, Group, Stack, Text } from '@mantine-8/core';
import { useState } from 'react';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminReviewItemsTable, {
    type AiAgentAdminReviewItemPreviewTarget,
} from '../AiAgentAdminReviewItemsTable';
import { ThreadPreviewSidebar } from '../ThreadPreviewSidebar';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

export const AiReviewsSettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();

    const [selectedReviewItem, setSelectedReviewItem] =
        useState<AiAgentAdminReviewItemPreviewTarget | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const handleReviewItemSelect = (
        reviewItem: AiAgentAdminReviewItemPreviewTarget,
    ): void => {
        setSelectedReviewItem(reviewItem);
        setIsSidebarOpen(true);
    };

    const handleCloseSidebar = () => {
        setIsSidebarOpen(false);
        setSelectedReviewItem(null);
    };

    return (
        <Stack mb="lg" gap="md">
            <Stack gap={4}>
                <Group justify="space-between" align="flex-start">
                    <PageBreadcrumbs
                        items={[
                            {
                                title: 'Ask AI',
                                to: '/generalSettings/ai/general',
                            },
                            { title: 'Reviews', active: true },
                        ]}
                    />
                </Group>

                <Text c="dimmed" fz="sm" maw={760}>
                    Answers an agent probably got wrong, grouped by root cause:{' '}
                    <Text span fw={600} fz="inherit">
                        Semantic layer
                    </Text>{' '}
                    findings open a dbt metrics PR, and{' '}
                    <Text span fw={600} fz="inherit">
                        Project context
                    </Text>{' '}
                    findings add a definition to your project context file.
                </Text>
            </Stack>

            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentAdminReviewItemsTable
                selectedReviewItemUuid={selectedReviewItem?.reviewItemUuid}
                onReviewItemSelect={handleReviewItemSelect}
            />

            <Drawer
                opened={isSidebarOpen && !!selectedReviewItem}
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
                {!!selectedReviewItem && (
                    <ThreadPreviewSidebar
                        projectUuid={selectedReviewItem.projectUuid}
                        agentUuid={selectedReviewItem.agentUuid}
                        threadUuid={selectedReviewItem.threadUuid}
                        isOpen={isSidebarOpen}
                        onClose={handleCloseSidebar}
                        showAddToEvalsButton
                    />
                )}
            </Drawer>
        </Stack>
    );
};
