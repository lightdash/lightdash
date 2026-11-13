import {
    getItemLabel,
    getUnusedDimensions,
    type ChartConfig,
    type ItemsMap,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';
import { Box, List, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { isEqual } from 'es-toolkit/compat';
import { useMemo, type FC } from 'react';
import {
    getChartColumnLimit,
    getPivotColumnLimitMessage,
    hasOtherPivotGroup,
    isWithinChartColumnLimit,
} from '../../../hooks/usePivotColumnLimitMessage';
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
    const pivotColumnLimitMessage = useMemo(
        () =>
            getPivotColumnLimitMessage({
                totalColumnCount: resultsData?.pivotDetails?.totalColumnCount,
                maxColumnLimit,
                hasOtherGroup: hasOtherPivotGroup(
                    resultsData?.pivotDetails?.valuesColumns,
                ),
            }),
        [resultsData?.pivotDetails, maxColumnLimit],
    );

    // The chart's own Column limit shows fewer groups than the results hold.
    // The user chose what is shown, so the groups the server left out (or
    // added together as "Other") make no difference and need no message.
    const isWithinChartLimit = useMemo(
        () =>
            isWithinChartColumnLimit({
                chartColumnLimit: getChartColumnLimit(chartConfig),
                maxColumnLimit,
                valuesColumns: resultsData?.pivotDetails?.valuesColumns,
            }),
        [chartConfig, maxColumnLimit, resultsData?.pivotDetails?.valuesColumns],
    );

    // The results fold groups past the column limit into "Other" (stacked
    // charts), but the chart as configured now would not: stacking was
    // switched off after the query ran.
    const hasStaleOtherGroup = useMemo(
        () =>
            dirtyPivotConfiguration !== undefined &&
            !dirtyPivotConfiguration.foldOverflowGroups &&
            hasOtherPivotGroup(resultsData?.pivotDetails?.valuesColumns),
        [dirtyPivotConfiguration, resultsData?.pivotDetails?.valuesColumns],
    );

    // The reverse: the chart as configured now would fold the groups past the
    // column limit into "Other", but the results dropped them: stacking was
    // switched on after the query ran. Charts with table calculations are left
    // out because pivot table calculations never fold, so a re-run would not
    // clear the message.
    const isMissingOtherGroup = useMemo(
        () =>
            !!dirtyPivotConfiguration?.foldOverflowGroups &&
            pivotColumnLimitMessage !== null &&
            !hasOtherPivotGroup(resultsData?.pivotDetails?.valuesColumns) &&
            (resultsData?.metricQuery?.tableCalculations ?? []).length === 0,
        [
            dirtyPivotConfiguration,
            pivotColumnLimitMessage,
            resultsData?.pivotDetails?.valuesColumns,
            resultsData?.metricQuery?.tableCalculations,
        ],
    );

    // Determine if configured pivot dimensions are different from the ones used to compute the results
    const shouldShowPivotMismatch = useMemo(() => {
        // Determine pivot used to compute current results
        const resultsPivotDimensions = (
            resultsData?.pivotDetails?.groupByColumns || []
        ).map((c: { reference: string }) => c.reference);
        // If both sides empty/undefined, no warning
        if (
            resultsPivotDimensions.length === 0 &&
            dirtyPivotDimensions.length === 0
        )
            return false;
        // Show when arrays differ
        return !isEqual(dirtyPivotDimensions, resultsPivotDimensions);
    }, [resultsData?.pivotDetails?.groupByColumns, dirtyPivotDimensions]);

    // Determine if query includes dimensions not used in the cartesian chart config
    const unusedDimensionLabels = useMemo(() => {
        const { unusedDimensions } = getUnusedDimensions({
            chartType: chartConfig.type,
            chartConfig: chartConfig.config,
            pivotDimensions: dirtyPivotDimensions,
            queryDimensions: resultsData?.metricQuery?.dimensions ?? [],
        });
        return unusedDimensions.map((fieldId) => {
            const field = resultsData.fields?.[fieldId];
            return field ? getItemLabel(field) : fieldId;
        });
    }, [
        resultsData?.metricQuery?.dimensions,
        resultsData.fields,
        chartConfig?.type,
        chartConfig.config,
        dirtyPivotDimensions,
    ]);

    // Determine how many messages to show
    const messages = useMemo(() => {
        // Only show when not loading/fetching
        if (isLoading || isQueryFetching) return [];

        const _messages: string[] = [];
        if (unusedDimensionLabels.length > 0) {
            _messages.push(
                `Your query includes dimensions that are not used in the chart configuration (x-axis, y-axis, or group by): ${unusedDimensionLabels.map((label) => `"${label}"`).join(', ')}. Remove them from the query to avoid incorrect results.`,
            );
        }
        if (shouldShowPivotMismatch) {
            _messages.push(
                'Please re-run the query to fetch the latest data with correct group by settings.',
            );
        }
        if (isWithinChartLimit) return _messages;
        if (hasStaleOtherGroup) {
            _messages.push(
                'These results add the groups past the column limit together as "Other", which only applies to stacked charts. Re-run the query to update them.',
            );
        } else if (isMissingOtherGroup) {
            _messages.push(
                'These results leave out the groups past the column limit, so totals are too low. Re-run the query to add them together as "Other".',
            );
        } else if (pivotColumnLimitMessage) {
            _messages.push(pivotColumnLimitMessage);
        }
        return _messages;
    }, [
        isLoading,
        isQueryFetching,
        shouldShowPivotMismatch,
        unusedDimensionLabels,
        pivotColumnLimitMessage,
        hasStaleOtherGroup,
        isMissingOtherGroup,
        isWithinChartLimit,
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
            position={'bottom'}
        >
            <Box
                component="span"
                role="img"
                aria-label="Results may be incorrect"
                display="inline-flex"
            >
                <MantineIcon icon={IconAlertCircle} color="yellow" size="lg" />
            </Box>
        </Tooltip>
    );
};

export default VisualizationWarning;
