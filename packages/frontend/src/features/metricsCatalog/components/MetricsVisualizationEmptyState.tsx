import { Center, Paper, Stack, Text } from '@mantine/core';
import { IconClockCancel } from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';
import MetricsVisualizationEmptyStateImage from '../../../svgs/metricsCatalog/metrics-visualization-empty-state.svg';

export const MetricsVisualizationEmptyState = () => {
    return (
        <Paper
            p="xl"
            h="100%"
            sx={{
                width: 'fill-available',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundImage: `url(${MetricsVisualizationEmptyStateImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
            <Center>
                <Stack spacing="sm" align="center">
                    <Paper p="xs">
                        <MantineIcon icon={IconClockCancel} />
                    </Paper>
                    <Stack spacing={0} align="center" maw={360}>
                        <Text fw={600} fz="md" c="dark.7" ta="center">
                            Data unavailable for selected range
                        </Text>
                        <Text fz="sm" c="gray.6" ta="center">
                            We'd love to show you more, but the data isn't
                            available for this range. Try selecting a different
                            range to continue exploring!
                        </Text>
                    </Stack>
                </Stack>
            </Center>
        </Paper>
    );
};
