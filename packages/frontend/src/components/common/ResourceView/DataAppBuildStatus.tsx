import {
    isAppVersionInProgress,
    type AppVersionStatus,
} from '@lightdash/common';
import { Badge, Loader, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

type DataAppBuildStatusProps = {
    latestVersionNumber: number | null;
    latestVersionStatus: AppVersionStatus | null;
    latestReadyVersionNumber: number | null;
};

const DataAppBuildStatus: FC<DataAppBuildStatusProps> = ({
    latestVersionNumber,
    latestVersionStatus,
    latestReadyVersionNumber,
}) => {
    const { t } = useTranslation('resourceView');
    if (
        latestVersionNumber === null ||
        latestVersionStatus === null ||
        !isAppVersionInProgress(latestVersionStatus)
    ) {
        return null;
    }

    const previewLabel =
        latestReadyVersionNumber === null
            ? t('dataAppBuildStatus.noPreviewYet')
            : t('dataAppBuildStatus.previewVersion', {
                  version: latestReadyVersionNumber,
              });
    const tooltipLabel =
        latestReadyVersionNumber === null
            ? t('dataAppBuildStatus.buildingNoPreviewTooltip', {
                  version: latestVersionNumber,
              })
            : t('dataAppBuildStatus.buildingWithPreviewTooltip', {
                  version: latestVersionNumber,
                  readyVersion: latestReadyVersionNumber,
              });

    return (
        <Tooltip label={tooltipLabel} position="top-start" maw={320}>
            <Badge
                size="sm"
                color="blue"
                px={6}
                leftSection={<Loader size={8} color="blue.6" />}
                aria-label={tooltipLabel}
            >
                {t('dataAppBuildStatus.badge', {
                    version: latestVersionNumber,
                    preview: previewLabel,
                })}
            </Badge>
        </Tooltip>
    );
};

export default DataAppBuildStatus;
