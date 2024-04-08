import { Accordion, MantineProvider } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import {
    getAccordionConfigTabsStyles,
    themeOverride,
} from '../../mantineTheme';
import { Axes } from '../Axes';
import { Grid } from '../Grid';
import { Layout } from '../Layout';
import { Legend } from '../Legend';
import { Series } from '../Series';

export const ConfigTabs: FC = memo(() => {
    const { itemsMap } = useVisualizationContext();

    const items = useMemo(() => Object.values(itemsMap || {}), [itemsMap]);

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Accordion
                multiple
                radius="none"
                styles={getAccordionConfigTabsStyles}
            >
                <Accordion.Item value="layout">
                    <Accordion.Control>Layout</Accordion.Control>
                    <Accordion.Panel>
                        <Layout items={items} />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="series">
                    <Accordion.Control>Series</Accordion.Control>
                    <Accordion.Panel>
                        <Series items={items} />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="axes">
                    <Accordion.Control>Axes</Accordion.Control>
                    <Accordion.Panel>
                        <Axes itemsMap={itemsMap} />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="legend">
                    <Accordion.Control>Legend</Accordion.Control>
                    <Accordion.Panel>
                        <Legend items={items} />
                    </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="grid">
                    <Accordion.Control>Grid</Accordion.Control>
                    <Accordion.Panel>
                        <Grid />
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </MantineProvider>
    );
});
