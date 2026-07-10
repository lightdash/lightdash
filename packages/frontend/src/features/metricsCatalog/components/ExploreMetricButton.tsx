import { type CatalogField } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { type ContentTableRow } from '../../../components/common/ContentTable';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { createMetricPreviewUnsavedChartVersion } from '../../../hooks/useExplorerRoute';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useExploreMetric } from '../hooks/useExploreMetric';

type Props = {
    row: ContentTableRow<CatalogField>;
};

export const ExploreMetricButton = ({ row }: Props) => {
    const navigate = useNavigate();
    const location = useLocation();
    const exploreMetric = useExploreMetric();
    const { embedToken, onExplore } = useEmbed();

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const handleExploreClick = useCallback(() => {
        exploreMetric({
            tableName: row.original.tableName,
            metricName: row.original.name,
        });

        if (embedToken && onExplore) {
            onExplore({
                chart: createMetricPreviewUnsavedChartVersion({
                    name: row.original.name,
                    table: row.original.tableName,
                }),
            });
            return;
        }

        void navigate({
            pathname: `/projects/${projectUuid}/metrics/peek/${row.original.tableName}/${row.original.name}`,
            search: location.search,
        });
    }, [
        embedToken,
        exploreMetric,
        location.search,
        navigate,
        onExplore,
        projectUuid,
        row.original.name,
        row.original.tableName,
    ]);

    return (
        <Tooltip
            withinPortal
            variant="xs"
            label="Click to view this in the Metrics Explorer"
            openDelay={200}
            maw={250}
            fz="xs"
        >
            <Button
                compact
                variant="darkPrimary"
                onClick={handleExploreClick}
                py="xxs"
                px={10}
                h={32}
                fz="sm"
                fw={500}
            >
                Explore
            </Button>
        </Tooltip>
    );
};
