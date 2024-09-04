import { ChartKind, type SemanticLayerField } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { type FC } from 'react';
import { VisualizationSwitcher } from '../../../../components/DataViz/VisualizationSwitcher';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';
import { themeOverride } from '../../../../components/VisualizationConfigs/mantineTheme';
import TableVisConfiguration from './TableVizConfig';

export const SemanticViewerVizConfig: FC<{
    selectedChartType: ChartKind;
    setSelectedChartType: (chartKind: ChartKind) => void;
    fields: SemanticLayerField[];
}> = ({ selectedChartType, setSelectedChartType, fields }) => {
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
                <TableVisConfiguration fields={fields} />
            )}
            {/* {selectedChartType === ChartKind.VERTICAL_BAR && (
                // <CartesianChartConfig
                //     selectedChartType={selectedChartType}
                //     sqlColumns={sqlColumns}
                // />
            )}
            {selectedChartType === ChartKind.LINE && (
                // <CartesianChartConfig
                //     selectedChartType={selectedChartType}
                //     sqlColumns={sqlColumns}
                // />
            )}
            {selectedChartType === ChartKind.PIE && (
                // <PieChartConfiguration sqlColumns={sqlColumns} />
            )} */}
        </MantineProvider>
    );
};
