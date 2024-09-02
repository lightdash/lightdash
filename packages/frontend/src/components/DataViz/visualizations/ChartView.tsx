import {
    type PivotChartData,
    type VizCartesianChartConfig,
    type VizPieChartConfig,
} from '@lightdash/common';
import { LoadingOverlay } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import { type ResultsAndColumns } from '../Results';
import { type ResultsRunner } from '../transformers/ResultsRunner';
import { useChart } from '../transformers/useChart';

type ChartViewProps<T extends ResultsRunner> = {
    // TODO: we probably can remove this prop
    data: ResultsAndColumns;
    config?: VizCartesianChartConfig | VizPieChartConfig;
    isLoading: boolean;
    resultsRunner: T;
    sql?: string;
    projectUuid?: string;
    limit?: number;
    onPivot?: (pivotData: PivotChartData | undefined) => void;
    slug?: string;
    uuid?: string;
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
        onPivot,
        slug,
        uuid,
    }: ChartViewProps<T>) => {
        const { data: org } = useOrganization();

        const {
            loading: transformLoading,
            error,
            value: spec,
        } = useChart({
            config,
            resultsRunner,
            sql,
            projectUuid,
            limit,
            orgColors: org?.chartColors,
            onPivot,
            slug,
            uuid,
        });

        if (!config?.fieldConfig?.x || config?.fieldConfig.y.length === 0) {
            return (
                <SuboptimalState
                    title="Incomplete chart configuration"
                    description={
                        !config?.fieldConfig?.x
                            ? "You're missing an X axis"
                            : "You're missing a Y axis"
                    }
                    icon={IconAlertCircle}
                    mt="xl"
                />
            );
        }
        const loading = isLoadingProp || transformLoading;

        if (error && !loading) {
            return (
                <SuboptimalState
                    title="Error generating chart"
                    description={error.message}
                    icon={IconAlertCircle}
                    mt="xl"
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
