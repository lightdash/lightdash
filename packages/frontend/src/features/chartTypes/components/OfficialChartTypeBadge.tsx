import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

/** Marks a chart type installed from the official chart registry. */
const OfficialChartTypeBadge: FC = () => {
    const { t } = useTranslation('chartTypes');
    return (
        <Badge size="xs" variant="light" color="violet">
            {t('officialBadge')}
        </Badge>
    );
};

export default OfficialChartTypeBadge;
