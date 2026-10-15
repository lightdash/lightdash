import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Display } from './MapDisplayConfig';
import { Layout } from './MapLayoutConfig';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'general',
                    label: t('map.tabs.general'),
                    panel: <Layout />,
                },
                {
                    value: 'display',
                    label: t('map.tabs.mapDisplay'),
                    panel: <Display />,
                },
            ]}
        />
    );
});
