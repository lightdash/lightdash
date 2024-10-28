import { Group, Stack, Title } from '@mantine/core';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { MetricsTable } from './MetricsTable';

export const MetricsCatalogPanel = () => {
    return (
        <Stack>
            <Group position="apart">
                <Title order={4}>Metrics Catalog</Title>
                <RefreshDbtButton />
            </Group>
            <MetricsTable />
        </Stack>
    );
};
