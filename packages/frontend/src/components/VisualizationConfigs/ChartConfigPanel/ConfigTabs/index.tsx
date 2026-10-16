import { memo, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { VisualizationConfigTabs } from '../../common/VisualizationConfigTabs';
import { Axes } from '../Axes';
import { Grid } from '../Grid';
import { Layout } from '../Layout';
import { Legend } from '../Legend';
import { Series } from '../Series';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    const { itemsMap } = useVisualizationContext();

    const items = useMemo(() => Object.values(itemsMap || {}), [itemsMap]);

    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'layout',
                    label: t('configTabs.layout'),
                    panel: <Layout items={items} />,
                },
                {
                    value: 'series',
                    label: t('configTabs.series'),
                    panel: <Series items={items} />,
                },
                {
                    value: 'axes',
                    label: t('configTabs.axes'),
                    panel: <Axes itemsMap={itemsMap} />,
                },
                {
                    value: 'legend',
                    label: t('configTabs.display'),
                    panel: <Legend items={items} />,
                },
                {
                    value: 'grid',
                    label: t('configTabs.margins'),
                    panel: <Grid />,
                },
            ]}
        />
    );
});
