import { ChartKind, type VizColumn } from '@lightdash/common';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { type FC, useMemo } from 'react';
import { Config } from '../VisualizationConfigs/common/Config';
import { getVizConfigThemeOverride } from '../VisualizationConfigs/mantineTheme';
import { VisualizationSwitcher } from './VisualizationSwitcher';
import { CartesianChartConfig } from './config/CartesianChartConfiguration';
import { PieChartConfiguration } from './config/PieChartConfiguration';
import TableVisConfiguration from './config/TableVisConfiguration';

export const VisualizationConfigPanel: FC<{
    selectedChartType: ChartKind;
    setSelectedChartType: (chartKind: ChartKind) => void;
    columns: VizColumn[];
}> = ({ selectedChartType, setSelectedChartType, columns }) => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Config>
                <Config.Section>
                    <VisualizationSwitcher
                        selectedChartType={selectedChartType}
                        setSelectedChartType={setSelectedChartType}
                    />
                </Config.Section>
            </Config>

            {selectedChartType === ChartKind.TABLE && (
                <TableVisConfiguration columns={columns} />
            )}
            {selectedChartType === ChartKind.VERTICAL_BAR && (
                <CartesianChartConfig
                    selectedChartType={selectedChartType}
                    columns={columns}
                />
            )}
            {selectedChartType === ChartKind.LINE && (
                <CartesianChartConfig
                    selectedChartType={selectedChartType}
                    columns={columns}
                />
            )}
            {selectedChartType === ChartKind.PIE && (
                <PieChartConfiguration columns={columns} />
            )}
        </MantineProvider>
    );
};
