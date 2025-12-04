import { type CatalogField } from '@lightdash/common';
import { Button, Text, Tooltip } from '@mantine/core';
import { type MRT_Row } from 'mantine-react-table';
import useTracking from '../../../providers/Tracking/useTracking';
import { BarChart } from '../../../svgs/metricsCatalog';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { setActiveMetric } from '../store/metricsCatalogSlice';

export const MetricChartUsageButton = ({
    row,
}: {
    row: MRT_Row<CatalogField>;
}) => {
    const hasChartsUsage = row.original.chartUsage ?? 0 > 0;
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );
    const dispatch = useAppDispatch();
    const { track } = useTracking();

    const handleChartUsageClick = () => {
        if (hasChartsUsage) {
            track({
                name: EventName.METRICS_CATALOG_CHART_USAGE_CLICKED,
                properties: {
                    userId: userUuid,
                    metricName: row.original.name,
                    chartCount: row.original.chartUsage ?? 0,
                    tableName: row.original.tableName,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                },
            });
            dispatch(setActiveMetric(row.original));
        }
    };

    return (
        <Tooltip
            withinPortal
            variant="xs"
            disabled={!hasChartsUsage}
            openDelay={200}
            maw={250}
            fz="xs"
            label={
                <Text>
                    Used by {row.original.chartUsage} charts.
                    <br />
                    Click to view the full list.
                </Text>
            }
        >
            <Button
                size="xs"
                compact
                variant="subtle"
                disabled={!hasChartsUsage}
                onClick={handleChartUsageClick}
                leftIcon={<BarChart />}
                opacity={hasChartsUsage ? 1 : 0.8}
                fz="sm"
                c="ldGray.7"
                fw={500}
                sx={{
                    '&[data-disabled]': {
                        backgroundColor: 'transparent',
                        fontWeight: 400,
                        color: `var(--mantine-color-ldDark-7)`,
                    },
                }}
                styles={(theme) => ({
                    leftIcon: {
                        marginRight: theme.spacing.xxs,
                    },
                })}
            >
                {row.original.chartUsage}
            </Button>
        </Tooltip>
    );
};
