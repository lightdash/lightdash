import {
    assertUnreachable,
    ChartKind,
    ChartSourceType,
    DashboardTileTypes,
    defaultTileSize,
    type ChartContent,
    type Dashboard,
} from '@lightdash/common';
import {
    Button,
    Flex,
    getDefaultZIndex,
    Group,
    Modal,
    MultiSelect,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartAreaLine } from '@tabler/icons-react';
import React, { forwardRef, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon } from '../../common/ResourceIcon';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onClose: () => void;
};

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    chartKind: ChartKind;
    tooltipLabel?: string;
    disabled?: boolean;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    (
        { label, tooltipLabel, chartKind, disabled, ...others }: ItemProps,
        ref,
    ) => (
        <div ref={ref} {...others}>
            <Stack spacing="one">
                <Tooltip
                    label={tooltipLabel}
                    disabled={!tooltipLabel}
                    position="top-start"
                    withinPortal
                >
                    <Group spacing="xs">
                        <ChartIcon
                            chartKind={chartKind ?? ChartKind.VERTICAL_BAR}
                            color={disabled ? 'gray.5' : undefined}
                        />
                        <Text
                            c={disabled ? 'dimmed' : 'gray.8'}
                            fw={500}
                            fz="xs"
                        >
                            {label}
                        </Text>
                    </Group>
                </Tooltip>
            </Stack>
        </div>
    ),
);

const AddChartTilesModal: FC<Props> = ({ onAddTiles, onClose }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedQueries, isInitialLoading } =
        useChartSummariesV2(projectUuid);

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const form = useForm({
        initialValues: {
            savedChartsUuids: [],
        },
    });

    const currentChartTypes = useMemo(() => {
        const dashboardTileTypes = dashboard?.tiles.map((t) => t.type) ?? [];
        const selectedChartTypes =
            form.values.savedChartsUuids.map<DashboardTileTypes>((uuid) => {
                const chart = savedQueries?.find((c) => c.uuid === uuid);
                const chartSourceType = chart?.source;

                switch (chartSourceType) {
                    case ChartSourceType.DBT_EXPLORE:
                        return DashboardTileTypes.SAVED_CHART;
                    case ChartSourceType.SEMANTIC_LAYER:
                        return DashboardTileTypes.SEMANTIC_VIEWER_CHART;
                    case ChartSourceType.SQL:
                        return DashboardTileTypes.SQL_CHART;
                    case undefined:
                        throw new Error('Chart does not exist');
                    default:
                        return assertUnreachable(
                            chartSourceType,
                            `Unknown chart source type: ${chartSourceType}`,
                        );
                }
            });

        return Array.from(
            new Set([...dashboardTileTypes, ...selectedChartTypes]),
        );
    }, [dashboard?.tiles, form.values.savedChartsUuids, savedQueries]);

    const isChartItemDisabled = useCallback(
        (chart: ChartContent) => {
            const chartSourceType = chart.source;

            if (currentChartTypes.length === 0) {
                return false;
            }

            switch (chartSourceType) {
                case ChartSourceType.DBT_EXPLORE:
                case ChartSourceType.SQL:
                    return currentChartTypes.includes(
                        DashboardTileTypes.SEMANTIC_VIEWER_CHART,
                    );
                case ChartSourceType.SEMANTIC_LAYER:
                    return (
                        currentChartTypes.includes(
                            DashboardTileTypes.SAVED_CHART,
                        ) ||
                        currentChartTypes.includes(DashboardTileTypes.SQL_CHART)
                    );
                default:
                    return assertUnreachable(
                        chartSourceType,
                        `Unknown chart source type: ${chartSourceType}`,
                    );
            }
        },
        [currentChartTypes],
    );

    const allSavedCharts = useMemo(() => {
        const reorderedCharts = savedQueries?.sort((chartA, chartB) =>
            chartA.space.uuid === dashboard?.spaceUuid
                ? -1
                : chartB.space.uuid === dashboard?.spaceUuid
                ? 1
                : 0,
        );

        return (reorderedCharts || []).map((chart) => {
            const { uuid, name, space, chartKind } = chart;
            const isAlreadyAdded = dashboardTiles?.find((tile) => {
                return (
                    (tile.type === DashboardTileTypes.SAVED_CHART &&
                        tile.properties.savedChartUuid === uuid) ||
                    (tile.type === DashboardTileTypes.SQL_CHART &&
                        tile.properties.savedSqlUuid === uuid) ||
                    (tile.type === DashboardTileTypes.SEMANTIC_VIEWER_CHART &&
                        tile.properties.savedSemanticViewerChartUuid === uuid)
                );
            });

            const disabled = isChartItemDisabled(chart);

            return {
                value: uuid,
                label: name,
                group: space.name,
                tooltipLabel: disabled
                    ? 'You cannot mix charts created from different semantic layer connections on a dashboard'
                    : isAlreadyAdded
                    ? 'This chart has already been added to this dashboard'
                    : undefined,
                chartKind,
                disabled,
            };
        });
    }, [
        savedQueries,
        dashboard?.spaceUuid,
        dashboardTiles,
        isChartItemDisabled,
    ]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.map((uuid) => {
                const chart = savedQueries?.find((c) => c.uuid === uuid);
                const sourceType = chart?.source;

                switch (sourceType) {
                    case ChartSourceType.SEMANTIC_LAYER:
                        return {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SEMANTIC_VIEWER_CHART,
                            properties: {
                                savedSemanticViewerChartUuid: uuid,
                                chartName: chart?.name ?? '',
                            },
                            tabUuid: undefined,
                            ...defaultTileSize,
                        };

                    case ChartSourceType.SQL:
                        return {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SQL_CHART,
                            properties: {
                                savedSqlUuid: uuid,
                                chartName: chart?.name ?? '',
                            },
                            tabUuid: undefined,
                            ...defaultTileSize,
                        };

                    case undefined:
                    case ChartSourceType.DBT_EXPLORE:
                        return {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SAVED_CHART,
                            properties: {
                                savedChartUuid: uuid,
                                chartName: chart?.name ?? '',
                            },
                            tabUuid: undefined,
                            ...defaultTileSize,
                        };

                    default:
                        return assertUnreachable(
                            sourceType,
                            `Unknown chart source type: ${sourceType}`,
                        );
                }
            }),
        );
        onClose();
    });

    if (!savedQueries || !dashboardTiles || isInitialLoading) return null;

    return (
        <Modal
            size="lg"
            opened={true}
            onClose={onClose}
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon
                        icon={IconChartAreaLine}
                        size="lg"
                        color="blue.8"
                    />

                    <Title order={4}>Add saved charts</Title>
                </Flex>
            }
            withCloseButton
            closeOnClickOutside={false}
        >
            <Stack spacing="md">
                <form
                    id="add-saved-charts-to-dashboard"
                    onSubmit={handleSubmit}
                >
                    <MultiSelect
                        styles={(theme) => ({
                            separator: {
                                position: 'sticky',
                                top: 0,
                                backgroundColor: 'white',
                                zIndex: getDefaultZIndex('modal'),
                            },
                            separatorLabel: {
                                color: theme.colors.gray[6],
                                fontWeight: 500,
                                backgroundColor: 'white',
                            },
                            item: {
                                paddingTop: 4,
                                paddingBottom: 4,
                            },
                        })}
                        id="saved-charts"
                        label={`Select the charts you want to add to this dashboard`}
                        data={allSavedCharts}
                        disabled={isInitialLoading}
                        defaultValue={[]}
                        placeholder="Search..."
                        required
                        searchable
                        withinPortal
                        itemComponent={SelectItem}
                        {...form.getInputProps('savedChartsUuids')}
                    />
                    <Group spacing="xs" position="right" mt="md">
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
                            }}
                            variant="outline"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                isInitialLoading ||
                                form.values.savedChartsUuids.length === 0
                            }
                        >
                            Add
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default AddChartTilesModal;
