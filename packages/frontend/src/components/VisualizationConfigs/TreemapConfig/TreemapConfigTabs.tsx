import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { Display } from './TreemapDisplayConfig';
import { Layout } from './TreemapLayoutConfig';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'layout',
                    label: t('treemap.tabs.layout'),
                    panel: <Layout />,
                },
                {
                    value: 'display',
                    label: t('treemap.tabs.display'),
                    panel: <Display />,
                },
            ]}
        />
    );
});
