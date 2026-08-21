import { memo, type FC } from 'react';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { GaugeDisplayConfig } from './GaugeDisplayConfig';
import { GaugeFieldsConfig } from './GaugeFieldsConfig';

export const ConfigTabs: FC = memo(() => (
    <VisualizationConfigTabs
        tabs={[
            { value: 'fields', label: 'Layout', panel: <GaugeFieldsConfig /> },
            {
                value: 'display',
                label: 'Display',
                panel: <GaugeDisplayConfig />,
            },
        ]}
    />
));
