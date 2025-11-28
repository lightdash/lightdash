import { type CatalogField } from '@lightdash/common';
import { Button, Tooltip } from '@mantine/core';
import { type MRT_Row } from 'mantine-react-table';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { toggleMetricExploreModal } from '../store/metricsCatalogSlice';

type Props = {
    row: MRT_Row<CatalogField>;
};

export const ExploreMetricButton = ({ row }: Props) => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );

    const { track } = useTracking();

    const handleExploreClick = useCallback(() => {
        track({
            name: EventName.METRICS_CATALOG_EXPLORE_CLICKED,
            properties: {
                userId: userUuid,
                organizationId: organizationUuid,
                projectId: projectUuid,
                metricName: row.original.name,
                tableName: row.original.tableName,
            },
        });

        void navigate({
            pathname: `/projects/${projectUuid}/metrics/peek/${row.original.tableName}/${row.original.name}`,
            search: location.search,
        });

        dispatch(
            toggleMetricExploreModal({
                name: row.original.name,
                tableName: row.original.tableName,
            }),
        );
    }, [
        dispatch,
        location,
        navigate,
        organizationUuid,
        projectUuid,
        row.original.name,
        row.original.tableName,
        track,
        userUuid,
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
