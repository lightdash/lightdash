import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Display } from './PieChartDisplayConfig';
import { Layout } from './PieChartLayoutConfig';
import { Series } from './PieChartSeriesConfig';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'layout',
                    label: t('pie.tabs.layout'),
                    panel: <Layout />,
                },
                {
                    value: 'series',
                    label: t('pie.tabs.series'),
                    panel: <Series />,
                },
                {
                    value: 'display',
                    label: t('pie.tabs.display'),
                    panel: <Display />,
                },
            ]}
        />
    );
});
