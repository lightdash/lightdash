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
import Callout from '../Callout';
import MantineModal from '../MantineModal';

interface DashboardDeleteModalProps
    extends Pick<ModalProps, 'opened' | 'onClose'> {
    uuid: string;
    onConfirm?: () => void;
}

const DashboardDeleteModal: FC<DashboardDeleteModalProps> = ({
    opened,
    onClose,
    uuid,
    onConfirm,
}) => {
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

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete dashboard"
            variant="delete"
            resourceType="dashboard"
            resourceLabel={dashboard.name}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
        >
            {hasChartsInDashboard(dashboard) && (
                <Callout
                    variant="danger"
                    title="This action will also permanently delete the following charts that were created from within it:"
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
