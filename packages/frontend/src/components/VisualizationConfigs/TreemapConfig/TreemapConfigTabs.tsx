import { memo, type FC } from 'react';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Display } from './TreemapDisplayConfig';
import { Layout } from './TreemapLayoutConfig';

export const ConfigTabs: FC = memo(() => (
    <VisualizationConfigTabs
        tabs={[
            { value: 'layout', label: 'Layout', panel: <Layout /> },
            { value: 'display', label: 'Display', panel: <Display /> },
        ]}
    />
));
