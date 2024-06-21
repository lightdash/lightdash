import { assertUnreachable, ChartType } from '@lightdash/common';
import { memo, type FC } from 'react';
import CustomVisualization from '../CustomVisualization';
import FunnelChart from '../FunnelChart';
import SimpleChart from '../SimpleChart';
import SimplePieChart from '../SimplePieChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

interface LightdashVisualizationProps {
    isDashboard?: boolean;
    tileUuid?: string;
    isTitleHidden?: boolean;
    className?: string;
    'data-testid'?: string;
}

const LightdashVisualization: FC<LightdashVisualizationProps> = memo(
    ({
        isDashboard = false,
        tileUuid,
        isTitleHidden = false,
        className,
        ...props
    }) => {
        const { visualizationConfig, minimal } = useVisualizationContext();

        if (!visualizationConfig) {
            return null;
        }

        switch (visualizationConfig.chartType) {
            case ChartType.BIG_NUMBER:
                return (
                    <SimpleStatistic
                        minimal={minimal}
                        isTitleHidden={isTitleHidden}
                        isDashboard={isDashboard}
                        className={className}
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.TABLE:
                return (
                    <SimpleTable
                        tileUuid={tileUuid}
                        minimal={minimal}
                        isDashboard={!!isDashboard}
                        className={className}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.CARTESIAN:
                return (
                    <SimpleChart
                        className={className}
                        isInDashboard={!!isDashboard}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.PIE:
                return (
                    <SimplePieChart
                        className={className}
                        isInDashboard={!!isDashboard}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.FUNNEL:
                return (
                    <FunnelChart
                        className={className}
                        isInDashboard={!!isDashboard}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.CUSTOM:
                return (
                    <CustomVisualization
                        data-testid={props['data-testid']}
                        className={className}
                    />
                );

            default:
                return assertUnreachable(
                    visualizationConfig,
                    `Chart type is not implemented`,
                );
        }
    },
);

export default LightdashVisualization;
