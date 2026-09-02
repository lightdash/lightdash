import {
    isAppVersionInProgress,
    type AppVersionStatus,
} from '@lightdash/common';
import { Badge, Loader, Tooltip } from '@mantine/core';
import { type FC } from 'react';

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
    if (
        latestVersionNumber === null ||
        latestVersionStatus === null ||
        !isAppVersionInProgress(latestVersionStatus)
    ) {
        return null;
    }

    const previewLabel =
        latestReadyVersionNumber === null
            ? 'No preview yet'
            : `Preview v${latestReadyVersionNumber}`;
    const tooltipLabel =
        latestReadyVersionNumber === null
            ? `Version ${latestVersionNumber} is building. A preview will be available when it is ready.`
            : `Version ${latestVersionNumber} is building. Preview opens the latest ready version, v${latestReadyVersionNumber}.`;

    return (
        <Tooltip label={tooltipLabel} position="top-start" maw={320}>
            <Badge
                size="sm"
                color="blue"
                px={6}
                leftSection={<Loader size={8} color="blue.6" />}
                aria-label={tooltipLabel}
            >
                {`Building v${latestVersionNumber} · ${previewLabel}`}
            </Badge>
        </Tooltip>
    );
};

export default DataAppBuildStatus;
