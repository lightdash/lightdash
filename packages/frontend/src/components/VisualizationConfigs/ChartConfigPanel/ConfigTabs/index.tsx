import { memo, useMemo, type FC } from 'react';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { VisualizationConfigTabs } from '../../common/VisualizationConfigTabs';
import { Axes } from '../Axes';
import { Grid } from '../Grid';
import { Layout } from '../Layout';
import { Legend } from '../Legend';
import { Series } from '../Series';

export const ConfigTabs: FC = memo(() => {
    const { itemsMap } = useVisualizationContext();

    const items = useMemo(() => Object.values(itemsMap || {}), [itemsMap]);

    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'layout',
                    label: 'Layout',
                    panel: <Layout items={items} />,
                },
                {
                    value: 'series',
                    label: 'Series',
                    panel: <Series items={items} />,
                },
                {
                    value: 'axes',
                    label: 'Axes',
                    panel: <Axes itemsMap={itemsMap} />,
                },
                {
                    value: 'legend',
                    label: 'Display',
                    panel: <Legend items={items} />,
                },
                { value: 'grid', label: 'Margins', panel: <Grid /> },
            ]}
        />
    );
});
