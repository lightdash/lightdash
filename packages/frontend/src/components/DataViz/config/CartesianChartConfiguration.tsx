import { ChartKind, type VizColumn } from '@lightdash/common';
import { Stack, Tabs } from '@mantine/core';
import { barChartConfigSlice } from '../store/barChartSlice';
import { lineChartConfigSlice } from '../store/lineChartSlice';
import { CartesianChartDisplayConfig } from './CartesianChartDisplayConfig';
import { CartesianChartFieldConfiguration } from './CartesianChartFieldConfiguration';
import { CartesianChartSeries } from './CartesianChartSeries';

export const CartesianChartConfig = ({
    selectedChartType,
    columns,
}: {
    selectedChartType: ChartKind;
    columns: VizColumn[];
}) => {
    const actions =
        selectedChartType === ChartKind.LINE
            ? lineChartConfigSlice.actions
            : selectedChartType === ChartKind.VERTICAL_BAR
            ? barChartConfigSlice.actions
            : null;

    if (!actions) {
        return null;
    }

    return (
        <Stack spacing="xs" mb="lg">
            <Tabs color="gray" defaultValue="data" keepMounted>
                <Tabs.List>
                    <Tabs.Tab value="data">Data</Tabs.Tab>
                    <Tabs.Tab value="series">Series</Tabs.Tab>
                    <Tabs.Tab value="display">Display</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="data" pt="xs">
                    <CartesianChartFieldConfiguration
                        actions={actions}
                        columns={columns}
                        selectedChartType={selectedChartType}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="series" pt="xs">
                    <CartesianChartSeries
                        actions={actions}
                        selectedChartType={selectedChartType}
                    />
                </Tabs.Panel>

                <Tabs.Panel value="display" pt="xs">
                    <CartesianChartDisplayConfig
                        actions={actions}
                        selectedChartType={selectedChartType}
                    />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};
