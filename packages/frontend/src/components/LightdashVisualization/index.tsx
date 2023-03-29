import { ChartType } from '@lightdash/common';
import { Box } from '@mantine/core';
import { FC, memo } from 'react';
import { pivotQueryResults } from '../../hooks/pivotTable/pivotQueryResults';
import {
    METRIC_QUERY_2DIM_2METRIC,
    RESULT_ROWS_2DIM_2METRIC,
} from '../../hooks/pivotTable/pivotQueryResults.mock';
import PivotTable from '../../pages/PivotingPOC/PivotTable';
import { useExplorerContext } from '../../providers/ExplorerProvider';
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
        const {
            chartType,
            minimal,
            tableConfig,
            resultsData,
            pivotDimensions,
        } = useVisualizationContext();
        const metricQuery = useExplorerContext(
            (c) => c.state.unsavedChartVersion.metricQuery,
        );

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
                if (pivotDimensions && tableConfig.metricsAsRows) {
                    // TODO: move this somewhere else
                    const data = pivotQueryResults({
                        pivotConfig: {
                            pivotDimensions: pivotDimensions,
                            metricsAsRows: true,
                        },
                        metricQuery: metricQuery,
                        rows: resultsData?.rows || [],
                    });

                    return (
                        <Box
                            w="100%"
                            h="100%"
                            p="xs"
                            sx={{ overflowX: 'scroll' }}
                        >
                            <PivotTable w="100%" data={data} />
                        </Box>
                    );
                } else {
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
                }
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
