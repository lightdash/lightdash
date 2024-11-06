import { type CatalogField } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { type MRT_Row } from 'mantine-react-table';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTracking } from '../../../providers/TrackingProvider';
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
    const dispatch = useAppDispatch();
    const { track } = useTracking();

    const handleChartUsageClick = () => {
        if (hasChartsUsage) {
            track({
                name: EventName.METRICS_CATALOG_CHART_USAGE_CLICKED,
                properties: {
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
        <Button
            size="xs"
            compact
            color="gray.6"
            variant="default"
            disabled={!hasChartsUsage}
            onClick={handleChartUsageClick}
            leftIcon={
                <MantineIcon
                    display={hasChartsUsage ? 'block' : 'none'}
                    icon={IconChartBar}
                    color="gray.6"
                    size={12}
                    strokeWidth={1.2}
                    fill="gray.2"
                />
            }
            sx={{
                '&[data-disabled]': {
                    backgroundColor: 'transparent',
                    fontWeight: 400,
                },
            }}
            styles={{
                leftIcon: {
                    marginRight: 4,
                },
            }}
        >
            {hasChartsUsage ? `${row.original.chartUsage}` : 'No usage'}
        </Button>
    );
};
