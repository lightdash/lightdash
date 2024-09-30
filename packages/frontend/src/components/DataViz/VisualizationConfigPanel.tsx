import { ChartKind, type VizColumn } from '@lightdash/common';
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
    columns: VizColumn[];
}> = ({ selectedChartType, setSelectedChartType, columns }) => {
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
