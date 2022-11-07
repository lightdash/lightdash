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
    'data-testid'?: string;
}

const LightdashVisualization: FC<LightdashVisualizationProps> = memo(
    ({ isDashboard, className, $shouldExpand, ...props }) => {
        const { chartType } = useVisualizationContext();

        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return (
                    <SimpleStatistic
                        className={className}
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.TABLE:
                return (
                    <SimpleTable
                        isDashboard={!!isDashboard}
                        $shouldExpand={$shouldExpand}
                        className={className}
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.CARTESIAN:
                return (
                    <SimpleChart
                        className={className}
                        $shouldExpand={$shouldExpand}
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            default:
                return null;
        }
    },
);

export default LightdashVisualization;
