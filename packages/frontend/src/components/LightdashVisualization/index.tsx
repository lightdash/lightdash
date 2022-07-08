import { ChartType } from '@lightdash/common';
import React, { FC } from 'react';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

const LightdashVisualization: FC = () => {
    const { chartType } = useVisualizationContext();

    switch (chartType) {
        case ChartType.BIG_NUMBER:
            return <SimpleStatistic />;
        case ChartType.TABLE:
            return <SimpleTable />;
        case ChartType.CARTESIAN:
            return <SimpleChart />;
        default:
            return null;
    }
};

export default LightdashVisualization;
