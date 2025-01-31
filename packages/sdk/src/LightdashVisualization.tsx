import {
    MantineProvider,
    SimpleStatistic,
    VisualizationProvider,
} from '@lightdash/frontend';
import { FC } from 'react';

const LightdashVisualization: FC = () => {
    // TODO: fetch chart and other required provider props

    return (
        <>
            <MantineProvider>
                <VisualizationProvider
                    chartConfig={{}} // Comes from chart
                    initialPivotDimensions={['']} // Comes from chart
                    columnOrder={['']} // Comes from chart
                    resultsData={{}} // Comes from chartAndResults
                    isLoading={false} // TODO: fetch from resultsData
                    pivotTableMaxColumnLimit={10} // Comes from health
                    colorPalette={['']} // Comes from chart OR org
                >
                    <SimpleStatistic />
                </VisualizationProvider>
            </MantineProvider>
        </>
    );
};

export { LightdashVisualization };
