import { ChartKind, type SemanticLayerColumn } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { type FC } from 'react';
import { VisualizationSwitcher } from '../../../../components/DataViz/VisualizationSwitcher';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';
import { themeOverride } from '../../../../components/VisualizationConfigs/mantineTheme';
import { CartesianVizConfig } from './CartesianVizConfig';
import { PieChartConfig } from './PieChartConfig';
import TableVisConfiguration from './TableVizConfig';

export const SemanticViewerVizConfig: FC<{
    selectedChartType: ChartKind;
    setSelectedChartType: (chartKind: ChartKind) => void;
    columns: SemanticLayerColumn[];
}> = ({ selectedChartType, setSelectedChartType, columns }) => {
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
                <TableVisConfiguration columns={columns} />
            )}
            {selectedChartType === ChartKind.VERTICAL_BAR && (
                <CartesianVizConfig
                    selectedChartType={selectedChartType}
                    columns={columns}
                />
            )}
            {selectedChartType === ChartKind.LINE && (
                <CartesianVizConfig
                    selectedChartType={selectedChartType}
                    columns={columns}
                />
            )}
            {selectedChartType === ChartKind.PIE && (
                <PieChartConfig columns={columns} />
            )}
        </MantineProvider>
    );
};
