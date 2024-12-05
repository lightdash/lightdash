import { type CatalogField } from '@lightdash/common';
import { Button, Text, Tooltip } from '@mantine/core';
import { type MRT_Row } from 'mantine-react-table';
import { useCallback, useEffect, useState } from 'react';
import {
    createMetricPreviewUnsavedChartVersion,
    getExplorerUrlFromCreateSavedChartVersion,
} from '../../../hooks/useExplorerRoute';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetric } from '../hooks/useMetricsCatalog';

type Props = {
    row: MRT_Row<CatalogField>;
};

export const ExploreMetricButton = ({ row }: Props) => {
    const [shouldFetch, setShouldFetch] = useState(false);
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const { track } = useTracking();

    const metricQuery = useMetric({
        projectUuid,
        tableName: row.original.tableName,
        metricName: row.original.name,
        enabled: shouldFetch,
    });

    useEffect(() => {
        if (!projectUuid || !metricQuery.isSuccess) return;

        const unsavedChartVersion = createMetricPreviewUnsavedChartVersion(
            metricQuery.data,
        );

        const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            unsavedChartVersion,
        );

        const url = new URL(pathname, window.location.origin);
        url.search = new URLSearchParams(search).toString();

        window.open(url.href, '_blank');

        setShouldFetch(false); // Reset the fetch trigger
    }, [metricQuery.data, metricQuery.isSuccess, projectUuid]);

    const handleExploreClick = useCallback(() => {
        track({
            name: EventName.METRICS_CATALOG_EXPLORE_CLICKED,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                metricName: row.original.name,
                tableName: row.original.tableName,
            },
        });

        // Trigger the fetch
        setShouldFetch(true);
    }, [
        organizationUuid,
        projectUuid,
        row.original.name,
        row.original.tableName,
        track,
    ]);

    return (
        <Tooltip
            withinPortal
            variant="xs"
            label="Open this metric in the explorer for detailed insights."
        >
            <Button
                compact
                bg="linear-gradient(180deg, #202B37 0%, #151C24 100%)"
                radius="md"
                onClick={handleExploreClick}
                loading={metricQuery.isFetching}
                py="xxs"
                px={10}
                h={28}
                sx={{
                    border: `1px solid #414E62`,
                    boxShadow: '0px 0px 0px 1px #151C24',
                }}
            >
                <Text fz="sm" fw={500}>
                    Explore
                </Text>
            </Button>
        </Tooltip>
    );
};
