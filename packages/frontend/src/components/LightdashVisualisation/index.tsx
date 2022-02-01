import { DBChartTypes, SavedQuery } from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject } from 'react';
import { useQueryResults } from '../../hooks/useQueryResults';
import { LoadingState } from '../ResultsTable/States';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';

interface Props {
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    savedData: SavedQuery | undefined;
}

const LightdashVisualisation: FC<Props> = ({
    savedData,
    chartRef,
    chartType,
}) => {
    const queryResults = useQueryResults();

    if (queryResults && queryResults.isLoading) {
        return <LoadingState />;
    }
    return (
        <>
            {chartType === 'big_number' ? (
                <SimpleStatistic data={queryResults.data} />
            ) : (
                <SimpleChart
                    savedData={savedData}
                    chartRef={chartRef}
                    chartType={chartType}
                />
            )}
        </>
    );
};

export default LightdashVisualisation;
