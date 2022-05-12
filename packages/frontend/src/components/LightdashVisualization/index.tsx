import { ChartType } from 'common';
import React, { FC } from 'react';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

const LightdashVisualization: FC = () => {
    const { chartType } = useVisualizationContext();

    const renderType = () => {
        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return <SimpleStatistic />;
            case ChartType.TABLE:
                return <SimpleTable />;
            case ChartType.CARTESIAN:
                return <SimpleChart />;
            case ChartType.DONUT:
                return <SimpleChart />;
            default:
                return null;
        }
    };
    return <>{renderType()}</>;
};

export default LightdashVisualization;
