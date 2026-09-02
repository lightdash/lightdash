import { memo, type FC } from 'react';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Display } from './MapDisplayConfig';
import { Layout } from './MapLayoutConfig';

export const ConfigTabs: FC = memo(() => (
    <VisualizationConfigTabs
        tabs={[
            { value: 'general', label: 'General', panel: <Layout /> },
            { value: 'display', label: 'Map display', panel: <Display /> },
        ]}
    />
));
