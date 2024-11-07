import { Group, Stack, Title } from '@mantine/core';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { useProject } from '../../../hooks/useProject';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import {
    setActiveMetric,
    setOrganizationUuid,
    setProjectUuid,
} from '../store/metricsCatalogSlice';
import { MetricChartUsageModal } from './MetricChartUsageModal';
import { MetricsTable } from './MetricsTable';

export const MetricsCatalogPanel = () => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);

    const dispatch = useAppDispatch();
    const isMetricUsageModalOpen = useAppSelector(
        (state) => state.metricsCatalog.modals.chartUsageModal.isOpen,
    );
    const onCloseMetricUsageModal = () => {
        dispatch(setActiveMetric(undefined));
    };

    useMount(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    });

    useEffect(() => {
        if (!organizationUuid && project?.organizationUuid) {
            dispatch(setOrganizationUuid(project.organizationUuid));
        }
    }, [project, dispatch, organizationUuid]);

    return (
        <Stack>
            <Group position="apart">
                <Title order={4}>Metrics Catalog</Title>
                <RefreshDbtButton />
            </Group>
            <MetricsTable />
            <MetricChartUsageModal
                opened={isMetricUsageModalOpen}
                onClose={onCloseMetricUsageModal}
            />
        </Stack>
    );
};
