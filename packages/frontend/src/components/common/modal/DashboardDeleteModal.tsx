import { hasChartsInDashboard, isChartTile } from '@lightdash/common';
import { List, Stack, Text, type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import {
    useDashboardDeleteMutation,
    useDashboardQuery,
} from '../../../hooks/dashboard/useDashboard';
import CommonModal, { Intent } from './Modal';

interface DashboardDeleteModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

const DashboardDeleteModal: FC<DashboardDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
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
        (tile) => isChartTile(tile) && tile.properties.belongsToDashboard,
    );

    return (
        <CommonModal
            title="Delete dashboard"
            intent={Intent.DELETE}
            confirmButtonProps={{
                onClick: handleConfirm,
                loading: isDeleting,
            }}
            {...modalProps}
        >
            {hasChartsInDashboard(dashboard) ? (
                <Stack>
                    <Text>
                        Are you sure you want to delete the dashboard{' '}
                        <b>"{dashboard.name}"</b>?
                    </Text>
                    <Text>
                        This action will also permanently delete the following
                        charts that were created from within it:
                    </Text>
                    <List size="sm">
                        {chartsInDashboardTiles.map(
                            (tile) =>
                                isChartTile(tile) && (
                                    <List.Item key={tile.uuid}>
                                        <Text>{tile.properties.chartName}</Text>
                                    </List.Item>
                                ),
                        )}
                    </List>
                </Stack>
            ) : (
                <Text>
                    Are you sure you want to delete the dashboard{' '}
                    <b>"{dashboard.name}"</b>?
                </Text>
            )}
        </CommonModal>
    );
};

export default DashboardDeleteModal;
