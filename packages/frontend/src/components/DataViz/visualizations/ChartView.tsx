import {
    type VizCartesianChartConfig,
    type VizPieChartConfig,
} from '@lightdash/common';
import { LoadingOverlay } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo } from 'react';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import { type ResultsAndColumns } from '../Results';
import { type ResultsRunner } from '../transformers/ResultsRunner';
import { useChart } from '../transformers/useChart';

type ChartViewProps<T extends ResultsRunner> = {
    // TODO: we probably can remove this prop
    data: ResultsAndColumns;
    config: VizCartesianChartConfig | VizPieChartConfig;
    isLoading: boolean;
    resultsRunner: T;
    sql?: string;
    projectUuid?: string;
    limit?: number;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const ChartView = memo(
    <T extends ResultsRunner>({
        data: _data,
        config,
        sql,
        projectUuid,
        limit,
        isLoading: isLoadingProp,
        resultsRunner,
        style,
    }: ChartViewProps<T>) => {
        const {
            loading: transformLoading,
            error,
            value: spec,
        } = useChart({ config, resultsRunner, sql, projectUuid, limit });

        const loading = isLoadingProp || transformLoading;

        // TODO: this could be more robust
        const errorMessage = error?.message?.includes('Binder Error')
            ? 'Some specified columns do not exist in the data'
            : error?.message;

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

export default ChartView;
