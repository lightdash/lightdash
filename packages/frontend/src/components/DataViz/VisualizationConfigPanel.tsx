import { ChartKind, type SqlColumn } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { type FC } from 'react';
import { CartesianChartConfig } from '../../features/sqlRunner/components/CartesianChartConfiguration';
import { PieChartConfiguration } from '../../features/sqlRunner/components/PieChartConfiguration';
import TableVisConfiguration from '../../features/sqlRunner/components/TableVisConfiguration';
import { Config } from '../VisualizationConfigs/common/Config';
import { themeOverride } from '../VisualizationConfigs/mantineTheme';
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
                <CartesianChartConfig selectedChartType={selectedChartType} />
            )}
            {selectedChartType === ChartKind.LINE && (
                <CartesianChartConfig selectedChartType={selectedChartType} />
            )}
            {selectedChartType === ChartKind.PIE && (
                <PieChartConfiguration sqlColumns={sqlColumns} />
            )}
        </MantineProvider>
    );
};
