import { type SqlRunnerChartConfig } from '@lightdash/common';
import { LoadingOverlay } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo, type FC } from 'react';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { type ResultsAndColumns } from '../../store/semanticViewerSlice';
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

        // TODO: this could be more robust
        const errorMessage = error?.message.includes('Binder Error')
            ? 'Some specified columns do not exist in the data'
            : error?.message;

        console.error('error', error);
        if (error) {
            return (
                <SuboptimalState
                    title="Error generating chart"
                    description={errorMessage}
                    icon={IconAlertCircle}
                />
            );
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
