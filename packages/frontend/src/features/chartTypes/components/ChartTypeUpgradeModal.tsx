import {
    getAppDisplayName,
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { Button, Checkbox, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useDataAppVizUpgradeImpact } from '../hooks/useDataAppVizUpgradeImpact';
import { useInstallRegistryChartType } from '../hooks/useInstallRegistryChartType';

type Props = {
    projectUuid: string;
    dataAppViz: DataAppViz;
    /** The registry entry offering the update this modal confirms. */
    registryUpdate: RegistryChartTypeListItem;
    onClose: () => void;
};

/**
 * Confirmation for upgrading an installed chart type: shows the blast radius
 * (how many saved charts consume it, and how many pin a version) and offers
 * a bulk move of every pinned chart onto the new version.
 */
const ChartTypeUpgradeModal: FC<Props> = ({
    projectUuid,
    dataAppViz,
    registryUpdate,
    onClose,
}) => {
    const { t } = useTranslation('chartTypes');
    const { track } = useTracking();
    const upgradeMutation = useInstallRegistryChartType();
    const [upgradeConsumingCharts, setUpgradeConsumingCharts] = useState(false);
    const {
        data: impact,
        isFetching: isLoadingImpact,
        isError: isImpactError,
        refetch: refetchImpact,
    } = useDataAppVizUpgradeImpact(projectUuid, dataAppViz.dataAppVizUuid);

    const pinnedCount = impact?.pinnedChartCount ?? 0;
    const pinnedDescription =
        impact === undefined
            ? null
            : pinnedCount === 0
              ? t('upgrade.nonePinned')
              : pinnedCount === impact.chartCount
                ? t('upgrade.allPinned', { count: pinnedCount })
                : t('upgrade.somePinned', { count: pinnedCount });

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={t('detail.upgradeTo', { version: registryUpdate.version })}
            subtitle={getAppDisplayName(
                dataAppViz.name,
                dataAppViz.dataAppVizUuid,
            )}
            confirmLabel={t('upgrade.confirm')}
            onConfirm={() => {
                track({
                    name: EventName.CHART_TYPE_LIBRARY_INSTALL_CLICKED,
                    properties: {
                        projectUuid,
                        chartSlug: registryUpdate.slug,
                        action: 'upgrade',
                    },
                });
                upgradeMutation.mutate(
                    {
                        projectUuid,
                        chartSlug: registryUpdate.slug,
                        upgradeConsumingCharts,
                    },
                    { onSuccess: onClose },
                );
            }}
            confirmLoading={upgradeMutation.isLoading}
            confirmDisabled={isLoadingImpact || isImpactError || !impact}
            cancelDisabled={upgradeMutation.isLoading}
        >
            <Stack gap="md">
                {registryUpdate.changelog && (
                    <Text fz="sm" c="ldGray.7">
                        {registryUpdate.changelog}
                    </Text>
                )}
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
                ) : impact ? (
                    impact.chartCount === 0 ? (
                        <Text size="sm">{t('upgrade.noCharts')}</Text>
                    ) : (
                        <Stack gap="sm">
                            <Callout
                                variant="info"
                                title={t('upgrade.chartsUsing', {
                                    count: impact.chartCount,
                                })}
                            >
                                {pinnedDescription}
                            </Callout>
                            {pinnedCount > 0 && (
                                <Checkbox
                                    checked={upgradeConsumingCharts}
                                    onChange={(event) =>
                                        setUpgradeConsumingCharts(
                                            event.currentTarget.checked,
                                        )
                                    }
                                    label={t('upgrade.alsoMove', {
                                        count: pinnedCount,
                                        version: registryUpdate.version,
                                    })}
                                    description={t(
                                        'upgrade.alsoMoveDescription',
                                    )}
                                />
                            )}
                        </Stack>
                    )
                ) : null}
            </Stack>
        </MantineModal>
    );
};

export default ChartTypeUpgradeModal;
