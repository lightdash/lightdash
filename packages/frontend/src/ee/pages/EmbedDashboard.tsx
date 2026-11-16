import { type EmbedDashboard as EmbedDashboardType } from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import TileQueryQueueProvider from '../../features/dashboard/tileQueryQueue/TileQueryQueueProvider';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useApp from '../../providers/App/useApp';
import DashboardProvider from '../../providers/Dashboard/DashboardProvider';
import EmbedDashboard from '../features/embed/EmbedDashboard/components/EmbedDashboard';
import { type ChartSaveDestination } from '../features/embed/EmbedDashboard/types';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedDashboardPage: FC<{
    containerStyles?: React.CSSProperties;
    initialDashboard?: EmbedDashboardType;
    isEditMode?: boolean;
    onEditModeChange?: (isEditMode: boolean) => void;
    chartSaveDestinations?: ChartSaveDestination[];
    // Off where the dashboard replaces the agent conversation it would feed
    sharesViewWithAiAgent?: boolean;
    refreshKey?: number;
}> = ({
    containerStyles,
    initialDashboard,
    isEditMode,
    onEditModeChange,
    chartSaveDestinations,
    sharesViewWithAiAgent = true,
    refreshKey,
}) => {
    const projectUuidFromParams = useProjectUuid();
    const { health } = useApp();

    const {
        embedToken,
        languageMap,
        projectUuid: projectUuidFromEmbed,
    } = useEmbed();

    const projectUuid = projectUuidFromEmbed ?? projectUuidFromParams;

    if (!embedToken) {
        return (
            <Box mt="lg">
                <SuboptimalState
                    icon={IconUnlink}
                    title="This embed link is not valid"
                />
            </Box>
        );
    }

    // Unlike app routes, embeds don't wait for health, which holds the tile
    // query cap.
    if (health.isInitialLoading) {
        return null;
    }

    return (
        <DashboardProvider
            embedToken={embedToken}
            projectUuid={projectUuid}
            parameterLabelOverrides={languageMap?.parameters}
            // EmbedDashboard holds the edit mode
            isEditModeExternal
        >
            <TileQueryQueueProvider>
                <EmbedDashboard
                    containerStyles={containerStyles}
                    initialDashboard={initialDashboard}
                    isEditMode={isEditMode}
                    onEditModeChange={onEditModeChange}
                    chartSaveDestinations={chartSaveDestinations}
                    sharesViewWithAiAgent={sharesViewWithAiAgent}
                    refreshKey={refreshKey}
                />
            </TileQueryQueueProvider>
        </DashboardProvider>
    );
};
export default EmbedDashboardPage;
