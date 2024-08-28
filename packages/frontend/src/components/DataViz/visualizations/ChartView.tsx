import {
    type CartesianChartSqlConfig,
    type PieChartSqlConfig,
} from '@lightdash/common';
import { LoadingOverlay } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo } from 'react';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import { type ResultsAndColumns } from '../Results';
import { type ResultsTransformer } from '../transformers/ResultsTransformer';
import { useChart } from '../transformers/useChart';

type ChartViewProps<T extends ResultsTransformer> = {
    // TODO: we probably can remove this prop
    data: ResultsAndColumns;
    config: CartesianChartSqlConfig | PieChartSqlConfig;
    isLoading: boolean;
    transformer: T;
    sql?: string;
    projectUuid?: string;
    limit?: number;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const ChartView = memo(
    <T extends ResultsTransformer>({
        data: _data,
        config,
        sql,
        projectUuid,
        limit,
        isLoading: isLoadingProp,
        transformer,
        style,
    }: ChartViewProps<T>) => {
        const {
            loading: transformLoading,
            error,
            value: spec,
        } = useChart({ config, transformer, sql, projectUuid, limit });

        if (!config.fieldConfig?.x || config.fieldConfig.y.length === 0) {
            return (
                <SuboptimalState
                    title="Incomplete chart configuration"
                    description={
                        !config.fieldConfig?.x
                            ? "You're missing an X axis"
                            : "You're missing a Y axis"
                    }
                    icon={IconAlertCircle}
                />
            );
        }

        const loading = isLoadingProp || transformLoading;

        // TODO: this could be more robust
        const errorMessage = error?.message?.includes('Binder Error')
            ? 'Some specified columns do not exist in the data'
            : error?.message;

        if (error && !loading) {
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
