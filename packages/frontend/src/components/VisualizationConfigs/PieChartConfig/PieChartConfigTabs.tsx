import { memo, type FC } from 'react';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Display } from './PieChartDisplayConfig';
import { Layout } from './PieChartLayoutConfig';
import { Series } from './PieChartSeriesConfig';

export const ConfigTabs: FC = memo(() => (
    <VisualizationConfigTabs
        tabs={[
            { value: 'layout', label: 'Layout', panel: <Layout /> },
            { value: 'series', label: 'Series', panel: <Series /> },
            { value: 'display', label: 'Display', panel: <Display /> },
        ]}
    />
));
