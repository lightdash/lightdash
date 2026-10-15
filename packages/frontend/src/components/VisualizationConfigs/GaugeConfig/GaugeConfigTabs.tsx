import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { GaugeDisplayConfig } from './GaugeDisplayConfig';
import { GaugeFieldsConfig } from './GaugeFieldsConfig';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'fields',
                    label: t('gauge.tabs.layout'),
                    panel: <GaugeFieldsConfig />,
                },
                {
                    value: 'display',
                    label: t('gauge.tabs.display'),
                    panel: <GaugeDisplayConfig />,
                },
            ]}
        />
    );
});
