import { FeatureFlags, type DataAppViz } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import ChartTypeUpgradeModal from '../../../features/chartTypes/components/ChartTypeUpgradeModal';
import { useRegistryChartTypes } from '../../../features/chartTypes/hooks/useRegistryChartTypes';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import Callout from '../../common/Callout';

type Props = {
    projectUuid: string;
    dataAppViz: DataAppViz;
};

const DataAppVizLibraryUpgradeNotice: FC<Props> = ({
    projectUuid,
    dataAppViz,
}) => {
    const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
    const canUpgrade = useCanCreateDataApp(projectUuid);
    const registryEnabled =
        useServerFeatureFlag(FeatureFlags.ChartTypeRegistry).data?.enabled ===
        true;
    const { data } = useRegistryChartTypes(projectUuid, registryEnabled);
    const registryUpdate = data?.charts.find(
        (entry) =>
            entry.slug === dataAppViz.registrySlug &&
            entry.installedAppUuid === dataAppViz.dataAppVizUuid &&
            entry.state === 'update_available',
    );

    if (!registryEnabled || !data?.registryEnabled || !registryUpdate) {
        return null;
    }

    return (
        <>
            <Callout
                variant="info"
                title={`Update available: v${registryUpdate.version}`}
            >
                <Stack gap="sm" align="flex-start">
                    {registryUpdate.changelog && (
                        <Text fz="sm">{registryUpdate.changelog}</Text>
                    )}
                    <Text fz="sm">
                        Charts pinned to an earlier version keep rendering it
                        until each chart is upgraded; charts without a pinned
                        version switch to v{registryUpdate.version} right away.
                    </Text>
                    {canUpgrade && (
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => setIsUpgradeOpen(true)}
                        >
                            Upgrade to v{registryUpdate.version}
                        </Button>
                    )}
                </Stack>
            </Callout>
            {isUpgradeOpen && canUpgrade && (
                <ChartTypeUpgradeModal
                    projectUuid={projectUuid}
                    dataAppViz={dataAppViz}
                    registryUpdate={registryUpdate}
                    onClose={() => setIsUpgradeOpen(false)}
                />
            )}
        </>
    );
};

export default DataAppVizLibraryUpgradeNotice;
