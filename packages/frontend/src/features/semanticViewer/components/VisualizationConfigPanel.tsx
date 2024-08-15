import { ChartKind } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { type FC } from 'react';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { themeOverride } from '../../../components/VisualizationConfigs/mantineTheme';
import { useAppSelector } from '../store/hooks';
import { CartesianChartConfig } from './CartesianChartConfiguration';
import { PieChartConfiguration } from './PieChartConfiguration';
import TableVisConfiguration from './TableVisConfiguration';
import { VisualizationSwitcher } from './VisualizationSwitcher';

export const VisualizationConfigPanel: FC = () => {
    const selectedChartType = useAppSelector(
        (state) => state.semanticViewer.selectedChartType,
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Config>
                <Config.Section>
                    <Config.Heading>Chart type</Config.Heading>
                    <VisualizationSwitcher />
                </Config.Section>
            </Config>

            {selectedChartType === ChartKind.TABLE && <TableVisConfiguration />}
            {selectedChartType === ChartKind.VERTICAL_BAR && (
                <CartesianChartConfig />
            )}
            {selectedChartType === ChartKind.LINE && <CartesianChartConfig />}
            {selectedChartType === ChartKind.PIE && <PieChartConfiguration />}
        </MantineProvider>
    );
};
