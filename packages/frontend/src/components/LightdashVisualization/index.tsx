import { ChartType } from '@lightdash/common';
import { FC, memo } from 'react';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

const LightdashVisualization: FC<{ isDashboard?: boolean }> = memo(
    ({ isDashboard }) => {
        const { chartType } = useVisualizationContext();

        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return <SimpleStatistic />;
            case ChartType.TABLE:
                return <SimpleTable isDashboard={!!isDashboard} />;
            case ChartType.CARTESIAN:
                return <SimpleChart />;
            default:
                return null;
        }
    },
);

export default LightdashVisualization;
