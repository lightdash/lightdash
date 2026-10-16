import { ChartKind, type VizColumn } from '@lightdash/common';
import { Stack, Tabs } from '@mantine/core';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('dataViz');
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
        <Stack gap="xs" mb="lg">
            <Tabs defaultValue="data" keepMounted>
                <Tabs.List>
                    <Tabs.Tab value="data">{t('cartesian.tabs.data')}</Tabs.Tab>
                    <Tabs.Tab value="series">
                        {t('cartesian.tabs.series')}
                    </Tabs.Tab>
                    <Tabs.Tab value="display">
                        {t('cartesian.tabs.display')}
                    </Tabs.Tab>
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
