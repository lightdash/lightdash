import {
    hasChartsInDashboard,
    isDashboardChartTileType,
} from '@lightdash/common';
import { List, ScrollArea, type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useDashboardDeleteMutation,
    useDashboardQuery,
} from '../../../hooks/dashboard/useDashboard';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
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
    const { t } = useTranslation('modals');
    const projectUuid = useProjectUuid();
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { data: dashboard, isInitialLoading } = useDashboardQuery({
        uuidOrSlug: uuid,
        projectUuid,
    });
    const { mutateAsync: deleteDashboard, isLoading: isDeleting } =
        useDashboardDeleteMutation(projectUuid);

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
        ? t('dashboardDelete.softDeleteDescription', { count: retentionDays })
        : undefined;

    const chartsWarningTitle = softDeleteEnabled
        ? t('dashboardDelete.chartsWarningSoft')
        : t('dashboardDelete.chartsWarningPermanent');

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('dashboardDelete.title')}
            variant="delete"
            resourceType={t('resourceTypes.dashboard')}
            resourceLabel={dashboard.name}
            description={description}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
            cancelDisabled={isDeleting}
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
