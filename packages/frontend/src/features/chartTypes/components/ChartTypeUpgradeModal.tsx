import {
    getAppDisplayName,
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { Button, Checkbox, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
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
              ? 'None of them pin a version, so they all switch to the new version right away.'
              : pinnedCount === impact.chartCount
                ? pinnedCount === 1
                    ? 'It is pinned and keeps rendering its pinned version until it is upgraded.'
                    : 'All of them are pinned and keep rendering their pinned version until each chart is upgraded.'
                : `${pinnedCount} of them ${
                      pinnedCount === 1 ? 'is' : 'are'
                  } pinned and ${
                      pinnedCount === 1 ? 'keeps' : 'keep'
                  } rendering their pinned version until each chart is upgraded.`;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`Upgrade to v${registryUpdate.version}`}
            subtitle={getAppDisplayName(
                dataAppViz.name,
                dataAppViz.dataAppVizUuid,
            )}
            confirmLabel="Upgrade"
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
                        Checking saved charts that use this chart type…
                    </Text>
                ) : isImpactError ? (
                    <Callout
                        variant="warning"
                        title="Could not check affected charts"
                    >
                        <Stack gap="sm" align="flex-start">
                            <Text size="sm">
                                Try again to see the impact before continuing.
                            </Text>
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() => void refetchImpact()}
                            >
                                Try again
                            </Button>
                        </Stack>
                    </Callout>
                ) : impact ? (
                    impact.chartCount === 0 ? (
                        <Text size="sm">
                            No saved charts use this chart type.
                        </Text>
                    ) : (
                        <Stack gap="sm">
                            <Callout
                                variant="info"
                                title={`${impact.chartCount} saved chart${
                                    impact.chartCount === 1 ? ' uses' : 's use'
                                } this chart type`}
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
                                    label={`Also move ${
                                        pinnedCount === 1
                                            ? 'the pinned chart'
                                            : `all ${pinnedCount} pinned charts`
                                    } to v${registryUpdate.version}`}
                                    description="Deliberately overrides each chart's pin. Charts without a pin always follow the latest version."
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
