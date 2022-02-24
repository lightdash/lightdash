import { DBChartTypes } from 'common';
import React, { FC } from 'react';
import { LoadingState } from '../ResultsTable/States';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

const LightdashVisualization: FC = () => {
    const { chartType, isLoading } = useVisualizationContext();

    if (isLoading) {
        return <LoadingState />;
    }

    const renderType = () => {
        switch (chartType) {
            case DBChartTypes.BIG_NUMBER:
                return <SimpleStatistic />;
            case DBChartTypes.TABLE:
                return <SimpleTable />;
            case DBChartTypes.COLUMN:
            case DBChartTypes.LINE:
            case DBChartTypes.SCATTER:
            case DBChartTypes.BAR:
                return <SimpleChart />;
            default:
                return null;
        }
    };
    return <>{renderType()}</>;
};

export default LightdashVisualization;
