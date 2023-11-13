import { assertUnreachable, ChartType } from '@lightdash/common';
import { FC, memo } from 'react';
import CustomVisualization from '../CustomVisualization';
import SimpleChart from '../SimpleChart';
import SimplePieChart from '../SimplePieChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import { useVisualizationContext } from './VisualizationProvider';

interface LightdashVisualizationProps {
    tileUuid?: string;
    isDashboard?: boolean;
    isTitleHidden?: boolean;
    className?: string;
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
                        tileUuid={tileUuid}
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
                        tileUuid={tileUuid}
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
