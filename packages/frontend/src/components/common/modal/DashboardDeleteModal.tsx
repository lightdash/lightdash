import {
    hasChartsInDashboard,
    isDashboardChartTileType,
} from '@lightdash/common';
import { List, ScrollArea, type ModalProps } from '@mantine-8/core';
import { type FC } from 'react';
import {
    useDashboardDeleteMutation,
    useDashboardQuery,
} from '../../../hooks/dashboard/useDashboard';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import MantineModal from '../MantineModal';

interface DashboardDeleteModalProps extends Pick<
    ModalProps,
    'opened' | 'onClose'
> {
    uuid: string;
    onConfirm?: () => void;
}

const DashboardDeleteModal: FC<DashboardDeleteModalProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
}) => {
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { data: dashboard, isInitialLoading } = useDashboardQuery(uuid);
    const { mutateAsync: deleteDashboard, isLoading: isDeleting } =
        useDashboardDeleteMutation();

    if (isInitialLoading || !dashboard) {
        return null;
    }

    const handleConfirm = async () => {
        await deleteDashboard(uuid);
        onConfirm?.();
    };

    const chartsInDashboardTiles = dashboard.tiles.filter(
        (tile) =>
            isDashboardChartTileType(tile) &&
            tile.properties.belongsToDashboard,
    );

    const description = softDeleteEnabled
        ? `This dashboard will be moved to Recently deleted and permanently removed after ${retentionDays} days.`
        : undefined;

    const chartsWarningTitle = softDeleteEnabled
        ? 'The following charts created within this dashboard will also be deleted. They can be restored from Recently deleted.'
        : 'This action will also permanently delete the following charts that were created from within it:';

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete dashboard"
            variant="delete"
            resourceType="dashboard"
            resourceLabel={dashboard.name}
            description={description}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
        >
            {hasChartsInDashboard(dashboard) && (
                <Callout
                    variant={softDeleteEnabled ? 'warning' : 'danger'}
                    title={chartsWarningTitle}
                >
                    <ScrollArea.Autosize mah="300px" scrollbars="y">
                        <List pr={'md'}>
                            {chartsInDashboardTiles.map(
                                (tile) =>
                                    isDashboardChartTileType(tile) && (
                                        <List.Item key={tile.uuid} fz="xs">
                                            {tile.properties.chartName}
                                        </List.Item>
                                    ),
                            )}
                        </List>
                    </ScrollArea.Autosize>
                </Callout>
            )}
        </MantineModal>
    );
};

export default DashboardDeleteModal;
