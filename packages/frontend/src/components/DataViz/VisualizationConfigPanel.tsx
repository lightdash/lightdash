import { ChartKind, type SqlColumn } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { type FC } from 'react';
import { Config } from '../VisualizationConfigs/common/Config';
import { themeOverride } from '../VisualizationConfigs/mantineTheme';
import { CartesianChartConfig } from './config/CartesianChartConfiguration';
import { PieChartConfiguration } from './config/PieChartConfiguration';
import TableVisConfiguration from './config/TableVisConfiguration';
import { VisualizationSwitcher } from './VisualizationSwitcher';

export const VisualizationConfigPanel: FC<{
    selectedChartType: ChartKind;
    setSelectedChartType: (chartKind: ChartKind) => void;
    sqlColumns: SqlColumn[];
}> = ({ selectedChartType, setSelectedChartType, sqlColumns }) => {
    return (
        <MantineProvider inherit theme={themeOverride}>
            <Config>
                <Config.Section>
                    <Config.Heading>Chart type</Config.Heading>
                    <VisualizationSwitcher
                        selectedChartType={selectedChartType}
                        setSelectedChartType={setSelectedChartType}
                    />
                </Config.Section>
            </Config>

            {selectedChartType === ChartKind.TABLE && (
                <TableVisConfiguration sqlColumns={sqlColumns} />
            )}
            {selectedChartType === ChartKind.VERTICAL_BAR && (
                <CartesianChartConfig
                    selectedChartType={selectedChartType}
                    sqlColumns={sqlColumns}
                />
            )}
            {selectedChartType === ChartKind.LINE && (
                <CartesianChartConfig
                    selectedChartType={selectedChartType}
                    sqlColumns={sqlColumns}
                />
            )}
            {selectedChartType === ChartKind.PIE && (
                <PieChartConfiguration sqlColumns={sqlColumns} />
            )}
        </MantineProvider>
    );
};
