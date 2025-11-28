import { Center, Paper, Stack, Text } from '@mantine/core';
import { IconClockCancel } from '@tabler/icons-react';
import { BackgroundSvg } from '../../../components/common/BackgroundSvg';
import MantineIcon from '../../../components/common/MantineIcon';
import MetricsVisualizationEmptyStateImage from '../../../svgs/metricsCatalog/metrics-visualization-empty-state.svg?react';

export const MetricsVisualizationEmptyState = () => {
    return (
        <Paper
            h="100%"
            w="100%"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <BackgroundSvg
                SvgComponent={MetricsVisualizationEmptyStateImage}
                sx={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Center>
                    <Stack spacing="sm" align="center">
                        <Paper p="xs">
                            <MantineIcon icon={IconClockCancel} />
                        </Paper>
                        <Stack spacing={0} align="center" maw={360}>
                            <Text fw={600} fz="md" c="ldDark.7" ta="center">
                                Data unavailable for selected range
                            </Text>
                            <Text fz="sm" c="ldGray.6" ta="center">
                                We'd love to show you more, but the data isn't
                                available for this range. Try selecting a
                                different range to continue exploring!
                            </Text>
                        </Stack>
                    </Stack>
                </Center>
            </BackgroundSvg>
        </Paper>
    );
};
