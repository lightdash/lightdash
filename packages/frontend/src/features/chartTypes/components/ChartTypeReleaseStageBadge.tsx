import { type RegistryChartTypeReleaseStage } from '@lightdash/common';
import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

/** Marks a registry chart type's release stage; stable renders nothing. */
const ChartTypeReleaseStageBadge: FC<{
    stage: RegistryChartTypeReleaseStage;
}> = ({ stage }) => {
    const { t } = useTranslation('chartTypes');
    if (stage === 'stable') return null;
    if (stage === 'beta') {
        return (
            <Badge size="xs" variant="light" color="indigo">
                {t('releaseStage.beta')}
            </Badge>
        );
    }
    return (
        <Badge size="xs" variant="light" color="orange">
            {t('releaseStage.preRelease')}
        </Badge>
    );
};

export default ChartTypeReleaseStageBadge;
