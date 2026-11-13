import {
    Paper,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import InlineErrorState from '../../common/InlineErrorState';
import classes from './AnalyticsOverview.module.css';
import {
    analyticsFieldId,
    formatAnalyticsNumber,
    type AnalyticsSummarySpec,
} from './analyticsOverviewConfig';
import { type AnalyticsOverviewQueryResult } from './useAnalyticsOverviewQuery';

const AnalyticsTabSummary = ({
    result,
    summary,
}: {
    result: AnalyticsOverviewQueryResult;
    summary: AnalyticsSummarySpec;
}) => {
    if (result.isError) {
        return (
            <InlineErrorState
                message="Unable to load overview"
                onRetry={() => void result.refetch()}
            />
        );
    }
    return (
        <SimpleGrid
            cols={{ base: 1, xs: 2, lg: summary.metrics.length }}
            spacing="md"
        >
            {summary.metrics.map(({ title, metric, compact }) => {
                const raw =
                    result.data?.[0]?.[analyticsFieldId(summary.query, metric)];
                const value =
                    raw === null || raw === undefined ? null : Number(raw);
                return (
                    <Paper
                        key={metric}
                        p="md"
                        component="section"
                        aria-label={title}
                    >
                        <Stack gap="md">
                            <Text fw={500} mih="3em">
                                {title}
                            </Text>
                            {result.isLoading ? (
                                <Skeleton h={80} />
                            ) : (
                                <Tooltip
                                    label={
                                        value === null
                                            ? 'No recorded activity'
                                            : formatAnalyticsNumber(value)
                                    }
                                >
                                    <Text className={classes.summaryValue}>
                                        {value === null
                                            ? '—'
                                            : compact
                                              ? new Intl.NumberFormat(
                                                    undefined,
                                                    {
                                                        notation: 'compact',
                                                        maximumFractionDigits: 2,
                                                    },
                                                ).format(value)
                                              : formatAnalyticsNumber(value)}
                                    </Text>
                                </Tooltip>
                            )}
                        </Stack>
                    </Paper>
                );
            })}
        </SimpleGrid>
    );
};

export default AnalyticsTabSummary;
