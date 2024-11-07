import { subject } from '@casl/ability';
import { Group, Stack, Title } from '@mantine/core';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { useProject } from '../../../hooks/useProject';
import { useApp } from '../../../providers/AppProvider';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import {
    setAbility,
    setActiveMetric,
    setOrganizationUuid,
    setProjectUuid,
} from '../store/metricsCatalogSlice';
import { MetricChartUsageModal } from './MetricChartUsageModal';
import { MetricsTable } from './MetricsTable';

export const MetricsCatalogPanel = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );

    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { user } = useApp();

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

    useEffect(
        function handleManageTagsAbility() {
            if (user.data) {
                const canManageTags = user.data.ability.can(
                    'manage',
                    subject('Tags', {
                        organizationUuid: user.data.organizationUuid,
                        projectUuid,
                    }),
                );

                dispatch(setAbility({ canManageTags }));
            }
        },
        [user.data, dispatch, projectUuid],
    );

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
