import {
    FeatureFlags,
    hasUnusedDimensions,
    type ChartConfig,
    type ItemsMap,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';
import { Badge, List, Tooltip } from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { useMemo, type FC } from 'react';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';
import MantineIcon from '../../common/MantineIcon';

export type PivotMismatchWarningProps = {
    dirtyPivotConfiguration: PivotConfiguration | undefined;
    chartConfig: ChartConfig;
    resultsData: Pick<
        InfiniteQueryResults,
        | 'isFetchingRows'
        | 'isInitialLoading'
        | 'isFetchingFirstPage'
        | 'pivotDetails'
    > & { metricQuery?: MetricQuery; fields?: ItemsMap };
    isLoading: boolean;
    maxColumnLimit: number | undefined;
};

const VisualizationWarning: FC<PivotMismatchWarningProps> = ({
    dirtyPivotConfiguration,
    chartConfig,
    resultsData,
    isLoading,
    maxColumnLimit,
}) => {
    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const dirtyPivotDimensions = useMemo(
        () =>
            (dirtyPivotConfiguration?.groupByColumns ?? []).map(
                (c: { reference: string }) => c.reference,
            ),
        [dirtyPivotConfiguration],
    );

    const isQueryFetching = Boolean(
        resultsData?.isInitialLoading ||
            resultsData?.isFetchingFirstPage ||
            resultsData?.isFetchingRows,
    );

    // Determine if pivot column limit has been exceeded
    const shouldShowPivotColumnLimit = useMemo(() => {
        return (
            resultsData?.pivotDetails?.totalColumnCount &&
            maxColumnLimit &&
            resultsData.pivotDetails.totalColumnCount > maxColumnLimit
        );
    }, [resultsData?.pivotDetails?.totalColumnCount, maxColumnLimit]);

    // Determine if configured pivot dimensions are different from the ones used to compute the results
    const shouldShowPivotMismatch = useMemo(() => {
        // Determine pivot used to compute current results
        const resultsPivotDimensions = (
            resultsData?.pivotDetails?.groupByColumns || []
        ).map((c: { reference: string }) => c.reference);
        // Only show when using SQL pivot results
        if (!useSqlPivotResults?.enabled) return false;
        // If both sides empty/undefined, no warning
        if (
            resultsPivotDimensions.length === 0 &&
            dirtyPivotDimensions.length === 0
        )
            return false;
        // Show when arrays differ
        return !isEqual(dirtyPivotDimensions, resultsPivotDimensions);
    }, [
        resultsData?.pivotDetails?.groupByColumns,
        useSqlPivotResults,
        dirtyPivotDimensions,
    ]);

    // Determine if query includes dimensions not used in the cartesian chart config
    const shouldShowUnusedDims = useMemo(() => {
        return hasUnusedDimensions({
            chartType: chartConfig.type,
            chartConfig: chartConfig.config,
            pivotDimensions: dirtyPivotDimensions,
            queryDimensions: resultsData?.metricQuery?.dimensions ?? [],
        });
    }, [
        resultsData?.metricQuery?.dimensions,
        chartConfig?.type,
        chartConfig.config,
        dirtyPivotDimensions,
    ]);

    // Determine how many messages to show
    const messages = useMemo(() => {
        // Only show when not loading/fetching
        if (isLoading || isQueryFetching) return [];

        const _messages: string[] = [];
        if (shouldShowUnusedDims) {
            _messages.push(
                'Your query includes dimensions that are not used in the chart configuration (x-axis, y-axis, or group by). Remove them from the query to avoid incorrect results.',
            );
        }
        if (shouldShowPivotMismatch) {
            _messages.push(
                'Please re-run the query to fetch the latest data with correct group by settings.',
            );
        }
        if (shouldShowPivotColumnLimit && maxColumnLimit) {
            _messages.push(
                `This query exceeds the maximum number of columns (${maxColumnLimit}). Showing the first ${maxColumnLimit} columns.`,
            );
        }
        return _messages;
    }, [
        isLoading,
        isQueryFetching,
        shouldShowPivotMismatch,
        shouldShowUnusedDims,
        shouldShowPivotColumnLimit,
        maxColumnLimit,
    ]);

    if (messages.length === 0) return null;

    return (
        <Tooltip
            label={
                messages.length === 1 ? (
                    messages[0]
                ) : (
                    <List size={'xs'} pr={'sm'}>
                        {messages.map((m, i) => (
                            <List.Item key={i}>{m}</List.Item>
                        ))}
                    </List>
                )
            }
            multiline
            position={'bottom'}
        >
            <Badge
                leftSection={<MantineIcon icon={IconAlertCircle} size={'sm'} />}
                color="yellow"
                variant="outline"
                tt="none"
            >
                Results may be incorrect
            </Badge>
        </Tooltip>
    );
};

export default VisualizationWarning;
