import { type CatalogField } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { type ContentTableRow } from '../../../components/common/ContentTable';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useExploreMetric } from '../hooks/useExploreMetric';

type Props = {
    row: ContentTableRow<CatalogField>;
};

export const ExploreMetricButton = ({ row }: Props) => {
    const navigate = useNavigate();
    const location = useLocation();
    const exploreMetric = useExploreMetric();

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const handleExploreClick = useCallback(() => {
        exploreMetric({
            tableName: row.original.tableName,
            metricName: row.original.name,
        });

        void navigate({
            pathname: `/projects/${projectUuid}/metrics/peek/${row.original.tableName}/${row.original.name}`,
            search: location.search,
        });
    }, [
        exploreMetric,
        location.search,
        navigate,
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
