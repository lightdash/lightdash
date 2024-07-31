import { type SqlRunnerChartConfig } from '@lightdash/common';
import { Center, LoadingOverlay } from '@mantine/core';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo, type FC } from 'react';
import { type ResultsAndColumns } from '../../hooks/useSqlQueryRun';
import { useSqlChart } from '../../transformers/useSqlChart';

type SqlRunnerChartProps = {
    data: ResultsAndColumns;
    config: SqlRunnerChartConfig;
    isLoading: boolean;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const SqlRunnerChart: FC<SqlRunnerChartProps> = memo(
    ({ data, config, style, isLoading: isLoadingProp }) => {
        const {
            loading: transformLoading,
            error,
            value: spec,
        } = useSqlChart(data.results, data.columns, config);
        const loading = isLoadingProp || transformLoading;

        if (error) {
            return <Center>{error.message}</Center>;
        }

        return (
            <>
                <LoadingOverlay visible={loading || !spec} />
                {spec && (
                    <EChartsReact
                        option={spec}
                        notMerge
                        opts={{
                            renderer: 'svg',
                            width: 'auto',
                            height: 'auto',
                        }}
                        style={style}
                    />
                )}
            </>
        );
    },
);

export default SqlRunnerChart;
