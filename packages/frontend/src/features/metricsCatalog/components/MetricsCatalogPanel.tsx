import { Group, Stack, Title } from '@mantine/core';
import { useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { setActiveMetric, setProjectUuid } from '../store/metricsCatalogSlice';
import { MetricChartsUsageModal } from './MetricChartsUsageModal';
import { MetricsTable } from './MetricsTable';

export const MetricsCatalogPanel = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const params = useParams<{ projectUuid: string }>();

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

    return (
        <Stack>
            <Group position="apart">
                <Title order={4}>Metrics Catalog</Title>
                <RefreshDbtButton />
            </Group>
            <MetricsTable />
            <MetricChartsUsageModal
                opened={isMetricUsageModalOpen}
                onClose={onCloseMetricUsageModal}
            />
        </Stack>
    );
};
