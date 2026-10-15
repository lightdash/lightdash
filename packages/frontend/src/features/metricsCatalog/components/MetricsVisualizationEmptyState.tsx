import { Center, Paper, Stack, Text } from '@mantine/core';
import { IconClockCancel } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { BackgroundSvg } from '../../../components/common/BackgroundSvg';
import MantineIcon from '../../../components/common/MantineIcon';
import MetricsVisualizationEmptyStateImage from '../../../svgs/metricsCatalog/metrics-visualization-empty-state.svg?react';
import classes from './MetricsVisualizationEmptyState.module.css';

export const MetricsVisualizationEmptyState = () => {
    const { t } = useTranslation('metricsCatalog');
    return (
        <Paper h="100%" w="100%" className={classes.paper}>
            <BackgroundSvg
                SvgComponent={MetricsVisualizationEmptyStateImage}
                className={classes.backgroundSvg}
            >
                <Center>
                    <Stack gap="sm" align="center">
                        <Paper p="xs">
                            <MantineIcon icon={IconClockCancel} />
                        </Paper>
                        <Stack gap={0} align="center" maw={360}>
                            <Text fw={600} fz="md" c="ldDark.7" ta="center">
                                {t('visualizationEmptyState.title')}
                            </Text>
                            <Text fz="sm" c="dimmed" ta="center">
                                {t('visualizationEmptyState.description')}
                            </Text>
                        </Stack>
                    </Stack>
                </Center>
            </BackgroundSvg>
        </Paper>
    );
};
