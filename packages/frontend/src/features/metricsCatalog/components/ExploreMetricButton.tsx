import { type CatalogField } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { type MRT_Row } from 'mantine-react-table';
import { useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { toggleMetricPeekModal } from '../store/metricsCatalogSlice';

type Props = {
    row: MRT_Row<CatalogField>;
};

export const ExploreMetricButton = ({ row }: Props) => {
    const dispatch = useAppDispatch();
    const history = useHistory();

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const user = useAppSelector((state) => state.metricsCatalog.user);

    const { track } = useTracking();

    const handleExploreClick = useCallback(() => {
        track({
            name: EventName.METRICS_CATALOG_EXPLORE_CLICKED,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                metricName: row.original.name,
                tableName: row.original.tableName,
                userId: user?.userUuid,
            },
        });

        history.push({
            pathname: `/projects/${projectUuid}/metrics/peek/${row.original.tableName}/${row.original.name}`,
            search: history.location.search,
        });

        dispatch(
            toggleMetricPeekModal({
                name: row.original.name,
                tableName: row.original.tableName,
            }),
        );
    }, [
        dispatch,
        history,
        organizationUuid,
        projectUuid,
        row.original.name,
        row.original.tableName,
        track,
        user?.userUuid,
    ]);

    return (
        <Tooltip
            withinPortal
            variant="xs"
            label="Click to view this in the Metrics Explorer"
        >
            <Button
                compact
                bg="linear-gradient(180deg, #202B37 0%, #151C24 100%)"
                radius="md"
                onClick={handleExploreClick}
                py="xxs"
                px={10}
                h={32}
                fz="sm"
                fw={500}
                sx={{
                    border: `1px solid #414E62`,
                    boxShadow: '0px 0px 0px 1px #151C24',
                }}
            >
                Explore
            </Button>
        </Tooltip>
    );
};
