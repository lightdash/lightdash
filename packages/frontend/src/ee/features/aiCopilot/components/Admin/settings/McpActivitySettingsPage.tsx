import { type McpActivityItem } from '@lightdash/common';
import { Drawer, Group, Stack, Text } from '@mantine-8/core';
import { useState } from 'react';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import {
    McpActivityDetail,
    McpActivityDetailTitle,
} from '../McpActivityDetail';
import McpActivityTable from '../McpActivityTable';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

export const McpActivitySettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();

    const [selectedCall, setSelectedCall] = useState<McpActivityItem | null>(
        null,
    );

    return (
        <Stack mb="lg" gap="md">
            <Group justify="space-between" align="flex-start">
                <PageBreadcrumbs
                    items={[
                        { title: 'Ask AI', to: '/generalSettings/ai/general' },
                        { title: 'MCP', active: true },
                    ]}
                />
                <Text fz="xs" c="ldGray.6">
                    Showing the last 90 days of MCP tool calls
                </Text>
            </Group>

            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <McpActivityTable
                onCallSelect={setSelectedCall}
                selectedCall={selectedCall}
            />

            <Drawer
                opened={!!selectedCall}
                onClose={() => setSelectedCall(null)}
                position="right"
                size="lg"
                title={
                    selectedCall && (
                        <McpActivityDetailTitle toolCall={selectedCall} />
                    )
                }
                classNames={{
                    inner: drawerClasses.inner,
                    overlay: drawerClasses.overlay,
                }}
                __vars={{
                    '--drawer-top-offset': `${NAVBAR_HEIGHT}px`,
                }}
            >
                {selectedCall && <McpActivityDetail toolCall={selectedCall} />}
            </Drawer>
        </Stack>
    );
};
