import {
    getAppDisplayName,
    isOfficialChartType,
    type DataAppViz,
} from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';
import { useDataAppVizDeleteImpact } from '../hooks/useDataAppVizDeleteImpact';

type Props = {
    projectUuid: string;
    dataAppViz: DataAppViz;
    onClose: () => void;
    onDeleted: () => void;
};

const ChartTypeDeleteModal: FC<Props> = ({
    projectUuid,
    dataAppViz,
    onClose,
    onDeleted,
}) => {
    const { t } = useTranslation('chartTypes');
    const { health } = useApp();
    const softDeleteEnabled = health.data?.softDelete.enabled;
    const retentionDays = health.data?.softDelete.retentionDays;

    const { mutateAsync: deleteApp, isLoading: isDeleting } = useDeleteApp();
    const {
        data: impact,
        isFetching: isLoadingImpact,
        isError: isImpactError,
        refetch: refetchImpact,
    } = useDataAppVizDeleteImpact(projectUuid, dataAppViz.dataAppVizUuid);

    // Registry-official chart types are "uninstalled" (they can be
    // reinstalled from the library); the underlying operation is the same
    // app delete either way.
    const isOfficial = isOfficialChartType(dataAppViz);

    const description = softDeleteEnabled
        ? t('delete.softDeleteDescription', { count: retentionDays })
        : t('delete.hardDeleteDescription');

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={
                isOfficial
                    ? t('delete.uninstallTitle')
                    : t('delete.deleteTitle')
            }
            subtitle={getAppDisplayName(
                dataAppViz.name,
                dataAppViz.dataAppVizUuid,
            )}
            confirmLabel={isOfficial ? t('detail.uninstall') : undefined}
            variant="delete"
            resourceType="chart type"
            resourceLabel={getAppDisplayName(
                dataAppViz.name,
                dataAppViz.dataAppVizUuid,
            )}
            description={description}
            onConfirm={async () => {
                await deleteApp({
                    projectUuid,
                    appUuid: dataAppViz.dataAppVizUuid,
                    successTitle: isOfficial
                        ? t('delete.uninstalledToast')
                        : t('delete.deletedToast'),
                });
                onDeleted();
            }}
            confirmLoading={isDeleting}
            confirmDisabled={
                !health.data || isLoadingImpact || isImpactError || !impact
            }
            cancelDisabled={isDeleting}
        >
            {isLoadingImpact ? (
                <Text size="sm" c="dimmed" role="status">
                    {t('upgrade.checkingImpact')}
                </Text>
            ) : isImpactError ? (
                <Callout
                    variant="warning"
                    title={t('upgrade.impactErrorTitle')}
                >
                    <Stack gap="sm" align="flex-start">
                        <Text size="sm">
                            {t('upgrade.impactErrorDescription')}
                        </Text>
                        <Button
                            variant="default"
                            size="xs"
                            onClick={() => void refetchImpact()}
                        >
                            {t('upgrade.tryAgain')}
                        </Button>
                    </Stack>
                </Callout>
            ) : impact?.chartCount === 0 ? (
                <Text size="sm">{t('upgrade.noCharts')}</Text>
            ) : impact ? (
                <Callout
                    variant={softDeleteEnabled ? 'warning' : 'danger'}
                    title={t('delete.chartsAffected', {
                        count: impact.chartCount,
                    })}
                >
                    {softDeleteEnabled
                        ? t('delete.chartsKeptSoft')
                        : t('delete.chartsKeptHard')}
                </Callout>
            ) : null}
        </MantineModal>
    );
};

export default ChartTypeDeleteModal;
