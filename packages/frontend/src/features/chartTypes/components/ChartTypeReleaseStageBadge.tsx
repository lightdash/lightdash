import { type RegistryChartTypeReleaseStage } from '@lightdash/common';
import { Badge } from '@mantine/core';
import { type FC } from 'react';

/** Marks a registry chart type's release stage; stable renders nothing. */
const ChartTypeReleaseStageBadge: FC<{
    stage: RegistryChartTypeReleaseStage;
}> = ({ stage }) => {
    if (stage === 'stable') return null;
    if (stage === 'beta') {
        return (
            <Badge size="xs" variant="light" color="indigo">
                Beta
            </Badge>
        );
    }
    return (
        <Badge size="xs" variant="light" color="orange">
            Pre-release
        </Badge>
    );
};

export default ChartTypeReleaseStageBadge;
