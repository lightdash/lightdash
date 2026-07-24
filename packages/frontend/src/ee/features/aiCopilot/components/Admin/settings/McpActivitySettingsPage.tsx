import {
    type McpActivityItem,
    type McpActivityStatsFilters,
} from '@lightdash/common';
import { Box, Drawer, Text } from '@mantine-8/core';
import { useMemo, useState } from 'react';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import { useMcpActivityStats } from '../../../hooks/useMcpActivity';
import { useMcpActivityFilters } from '../../../hooks/useMcpActivityFilters';
import {
    McpActivityDetail,
    McpActivityDetailTitle,
} from '../McpActivityDetail';
import {
    McpActivityOverview,
    McpActivityStatTiles,
} from '../McpActivityOverview';
import overviewClasses from '../McpActivityOverview.module.css';
import McpActivityTable from '../McpActivityTable';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

export const McpActivitySettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();

    const [selectedCall, setSelectedCall] = useState<McpActivityItem | null>(
        null,
    );

    const { selectedProjectUuids, selectedAgentUuids, hasActiveFilters } =
        useMcpActivityFilters();

    // Status is deliberately not part of stats filters: the overview always
    // shows the full success/error split for the current scope
    const statsFilters = useMemo<McpActivityStatsFilters>(
        () => ({
            ...(selectedProjectUuids.length > 0 && {
                projectUuids: selectedProjectUuids,
            }),
            ...(selectedAgentUuids.length > 0 && {
                agentUuids: selectedAgentUuids,
            }),
        }),
        [selectedProjectUuids, selectedAgentUuids],
    );

    const {
        data: stats,
        isError: isStatsError,
        refetch: refetchStats,
    } = useMcpActivityStats(statsFilters);

    return (
        <SettingsPage
            title="MCP activity"
            description="Monitor MCP tool calls and investigate errors across your organization."
            actions={
                <Text fz="xs" c="ldGray.6">
                    Last 90 days
                </Text>
            }
        >
            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <Box className={overviewClasses.layout}>
                <Box className={overviewClasses.strip}>
                    <McpActivityStatTiles
                        stats={stats}
                        isError={isStatsError}
                    />
                </Box>
                <Box className={overviewClasses.columns}>
                    <Box className={overviewClasses.tableArea}>
                        <McpActivityTable
                            onCallSelect={setSelectedCall}
                            selectedCall={selectedCall}
                        />
                    </Box>
                    <aside
                        className={overviewClasses.rail}
                        aria-label="MCP activity overview"
                    >
                        <McpActivityOverview
                            stats={stats}
                            isError={isStatsError}
                            onRetry={() => void refetchStats()}
                            hasActiveFilters={hasActiveFilters}
                            onErrorSelect={setSelectedCall}
                        />
                    </aside>
                </Box>
            </Box>

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
        </SettingsPage>
    );
};
