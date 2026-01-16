import { ECHARTS_DEFAULT_COLORS, type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Kbd,
    LoadingOverlay,
    Modal,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import LightdashVisualization from '../../../components/LightdashVisualization';
import VisualizationProvider from '../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../components/MetricQueryData/MetricQueryDataProvider';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricVisualization } from '../hooks/useMetricVisualization';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    metrics: CatalogField[];
};

/**
 * V2: MetricExploreModal implementation using echarts via VisualizationProvider
 * This is enabled when the MetricsCatalogEchartsVisualization feature flag is ON
 */
export const MetricExploreModalV2: FC<Props> = ({
    opened,
    onClose,
    metrics,
}) => {
    const { data: organization } = useOrganization();

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const navigate = useNavigate();
    const location = useLocation();

    // Color palette from organization settings
    const colorPalette = useMemo(
        () => organization?.chartColors ?? ECHARTS_DEFAULT_COLORS,
        [organization?.chartColors],
    );

    // Metric navigation logic
    const currentMetricIndex = useMemo(
        () =>
            metrics.findIndex(
                (metric) =>
                    metric.name === metricName &&
                    metric.tableName === tableName,
            ),
        [metrics, metricName, tableName],
    );

    const nextMetricInList = metrics[currentMetricIndex + 1];
    const previousMetricInList = metrics[currentMetricIndex - 1];

    const navigateToMetric = useCallback(
        (metric: CatalogField) => {
            void navigate({
                pathname: `/projects/${projectUuid}/metrics/peek/${metric.tableName}/${metric.name}`,
                search: location.search,
            });
        },
        [navigate, projectUuid, location.search],
    );

    const handleGoToNextMetric = useCallback(() => {
        if (nextMetricInList) navigateToMetric(nextMetricInList);
    }, [navigateToMetric, nextMetricInList]);

    const handleGoToPreviousMetric = useCallback(() => {
        if (previousMetricInList) navigateToMetric(previousMetricInList);
    }, [navigateToMetric, previousMetricInList]);

    const handleClose = useCallback(() => {
        void navigate({
            pathname: `/projects/${projectUuid}/metrics`,
            search: location.search,
        });
        onClose();
    }, [navigate, onClose, projectUuid, location.search]);

    // All data fetching, query execution, and config building in one hook
    const {
        metricField,
        explore,
        metricQuery,
        chartConfig,
        resultsData,
        columnOrder,
        isLoading,
        hasData,
    } = useMetricVisualization({
        projectUuid,
        tableName,
        metricName,
    });

    // Keyboard navigation
    useHotkeys([
        ['ArrowUp', handleGoToPreviousMetric],
        ['ArrowDown', handleGoToNextMetric],
    ]);

    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            scrollAreaComponent={undefined}
            size="auto"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius={12} w="100%">
                <Modal.Header
                    h={52}
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    })}
                >
                    <Group spacing="xs">
                        <Group spacing="xxs">
                            <Tooltip
                                label={
                                    <Text>
                                        Press{' '}
                                        <Kbd
                                            sx={{
                                                background: '#575656',
                                                color: 'white',
                                                borderRadius: '5px',
                                                border: '1px solid #2b2b2a',
                                            }}
                                        >
                                            ↑
                                        </Kbd>{' '}
                                        to move to the previous metric.
                                    </Text>
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    variant="outline"
                                    size="sm"
                                    radius="sm"
                                    sx={(theme) => ({
                                        border: `1px solid ${theme.colors.ldGray[2]}`,
                                    })}
                                    onClick={handleGoToPreviousMetric}
                                    disabled={!previousMetricInList}
                                >
                                    <MantineIcon icon={IconChevronUp} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip
                                label={
                                    <Text>
                                        Press{' '}
                                        <Kbd
                                            sx={{
                                                background: '#575656',
                                                color: 'white',
                                                borderRadius: '5px',
                                                border: '1px solid #2b2b2a',
                                            }}
                                        >
                                            ↓
                                        </Kbd>{' '}
                                        to move to the next metric.
                                    </Text>
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    variant="outline"
                                    size="sm"
                                    radius="sm"
                                    sx={(theme) => ({
                                        border: `1px solid ${theme.colors.ldGray[2]}`,
                                    })}
                                    onClick={handleGoToNextMetric}
                                    disabled={!nextMetricInList}
                                >
                                    <MantineIcon icon={IconChevronDown} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        <Text fw={600} fz="md" color="ldGray.8">
                            {metricField?.label}
                        </Text>
                        <Tooltip
                            label={metricField?.description}
                            disabled={!metricField?.description}
                        >
                            <MantineIcon
                                color="ldGray.5"
                                icon={IconInfoCircle}
                                size={18}
                            />
                        </Tooltip>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <Modal.Body
                    p={0}
                    h="80vh"
                    sx={{ display: 'flex', flex: 1 }}
                    miw={800}
                    mih={600}
                >
                    <Box w="100%" py="xl" px="xxl" pos="relative">
                        <LoadingOverlay visible={isLoading} />
                        {hasData && metricQuery && tableName && explore && (
                            <MetricQueryDataProvider
                                metricQuery={metricQuery}
                                tableName={tableName}
                                explore={explore}
                            >
                                <VisualizationProvider
                                    resultsData={resultsData}
                                    chartConfig={chartConfig}
                                    columnOrder={columnOrder}
                                    initialPivotDimensions={undefined}
                                    colorPalette={colorPalette}
                                    isLoading={isLoading}
                                    onSeriesContextMenu={undefined}
                                    onChartConfigChange={undefined}
                                    pivotTableMaxColumnLimit={60}
                                >
                                    <LightdashVisualization />
                                </VisualizationProvider>
                            </MetricQueryDataProvider>
                        )}
                    </Box>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
