import { ChartType } from '@lightdash/common';
import { FC, memo } from 'react';
import SimpleChart from '../SimpleChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

interface LightdashVisualizationProps {
    tileUuid?: string;
    isDashboard?: boolean;
    isTitleHidden?: boolean;
    className?: string;
    $padding?: number;
    'data-testid'?: string;
}

const LightdashVisualization: FC<LightdashVisualizationProps> = memo(
    ({
        isDashboard = false,
        isTitleHidden = false,
        tileUuid,
        className,
        ...props
    }) => {
        const { chartType, minimal } = useVisualizationContext();

        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return (
                    <SimpleStatistic
                        minimal={minimal}
                        isDashboard={isDashboard}
                        isTitleHidden={isTitleHidden}
                        className={className}
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.TABLE:
                return (
                    <SimpleTable
                        minimal={minimal}
                        tileUuid={tileUuid}
                        isDashboard={!!isDashboard}
                        className={className}
                        $shouldExpand
                        $padding={props.$padding}
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.CARTESIAN:
                return (
                    <SimpleChart
                        className={className}
                        $shouldExpand
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
