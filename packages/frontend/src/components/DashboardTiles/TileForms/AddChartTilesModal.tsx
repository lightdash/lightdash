import {
    ChartSourceType,
    DashboardTileTypes,
    defaultTileSize,
    type ChartKind,
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
import React, { forwardRef, useMemo, type FC } from 'react';
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
    description?: string;
    chartKind: ChartKind;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ label, description, chartKind, ...others }: ItemProps, ref) => (
        <div ref={ref} {...others}>
            <Stack spacing="one">
                <Tooltip
                    label={description}
                    disabled={!description}
                    position="top-start"
                >
                    <Group spacing="xs">
                        <ChartIcon chartKind={chartKind} />
                        <Text c="gray.8" fw={500} fz="xs">
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
    const allSavedCharts = useMemo(() => {
        const reorderedCharts = savedQueries?.sort((chartA, chartB) =>
            chartA.space.uuid === dashboard?.spaceUuid
                ? -1
                : chartB.space.uuid === dashboard?.spaceUuid
                ? 1
                : 0,
        );
        return (reorderedCharts || []).map(
            ({ uuid, name, space, chartKind }) => {
                const alreadyAddedChart = dashboardTiles?.find((tile) => {
                    return (
                        (tile.type === DashboardTileTypes.SAVED_CHART &&
                            tile.properties.savedChartUuid === uuid) ||
                        (tile.type === DashboardTileTypes.SQL_CHART &&
                            tile.properties.savedSqlUuid === uuid)
                    );
                });

                return {
                    value: uuid,
                    label: name,
                    group: space.name,
                    description: alreadyAddedChart
                        ? 'This chart has already been added to this dashboard'
                        : undefined,
                    chartKind,
                };
            },
        );
    }, [savedQueries, dashboard?.spaceUuid, dashboardTiles]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.map((uuid) => {
                const chart = savedQueries?.find((c) => c.uuid === uuid);
                const isSqlChart = chart?.source === ChartSourceType.SQL;
                if (isSqlChart) {
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
                }
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
                        <Button type="submit" disabled={isInitialLoading}>
                            Add
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default AddChartTilesModal;
