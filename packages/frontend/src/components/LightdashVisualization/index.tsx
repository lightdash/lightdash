import { ChartType } from '@lightdash/common';
import { FC, memo } from 'react';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

interface LightdashVisualizationProps {
    isDashboard?: boolean;
    className?: string;
    $shouldExpand?: boolean;
}

const LightdashVisualization: FC<LightdashVisualizationProps> = memo(
    ({ isDashboard, className, $shouldExpand }) => {
        const { chartType } = useVisualizationContext();

        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return <SimpleStatistic className={className} />;
            case ChartType.TABLE:
                return (
                    <SimpleTable
                        isDashboard={!!isDashboard}
                        className={className}
                    />
                );
            case ChartType.CARTESIAN:
                return (
                    <SimpleChart
                        className={className}
                        $shouldExpand={$shouldExpand}
                    />
                );
            default:
                return null;
        }
    },
);

export default LightdashVisualization;
