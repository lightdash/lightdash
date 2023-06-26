import {
    ChartKind,
    Dashboard,
    DashboardTileTypes,
    defaultTileSize,
    getChartType,
} from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    Modal,
    MultiSelect,
    SelectItem,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartAreaLine } from '@tabler/icons-react';
import { FC, forwardRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import MantineIcon from '../../common/MantineIcon';
import { getChartIcon } from '../../common/ResourceIcon';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onClose: () => void;
};

interface ItemProps extends SelectItem {
    label: string;
    description?: string;
    chartType?: ChartKind | undefined;
}

const MultiSelectItem = forwardRef<HTMLDivElement, ItemProps>(
    (
        {
            label,
            description,
            chartType,
            selected,
            disabled,
            ...others
        }: ItemProps,
        ref,
    ) => {
        return (
            <div ref={ref} {...others}>
                <Stack spacing="two">
                    <Tooltip
                        label={description}
                        disabled={!description}
                        position="top-start"
                    >
                        <Flex align="center" gap="sm">
                            {chartType && (
                                <Box opacity={disabled ? 0.5 : 1}>
                                    {getChartIcon(chartType)}
                                </Box>
                            )}

                            <Text>{label}</Text>
                        </Flex>
                    </Tooltip>
                </Stack>
            </div>
        );
    },
);

const AddChartTilesModal: FC<Props> = ({ onAddTiles, onClose }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid);
    const { dashboardTiles, dashboard } = useDashboardContext();
    const form = useForm({
        initialValues: {
            savedChartsUuids: [],
        },
    });
    const allSavedCharts = useMemo(() => {
        const reorderedCharts = savedCharts?.sort((chartA, chartB) =>
            chartA.spaceUuid === dashboard?.spaceUuid
                ? -1
                : chartB.spaceUuid === dashboard?.spaceUuid
                ? 1
                : 0,
        );
        return (reorderedCharts || []).map(
            ({ uuid, name, spaceName, chartType, chartConfig }) => {
                const alreadyAddedChart = dashboardTiles.find((tile) => {
                    return (
                        tile.type === DashboardTileTypes.SAVED_CHART &&
                        tile.properties.savedChartUuid === uuid
                    );
                });

                return {
                    value: uuid,
                    label: name,
                    group: spaceName,
                    disabled: alreadyAddedChart !== undefined,
                    description: alreadyAddedChart
                        ? 'This chart has already been added to this dashboard'
                        : undefined,
                    ...(chartConfig &&
                        chartType && {
                            chartType: getChartType(chartType, chartConfig),
                        }),
                };
            },
        );
    }, [dashboardTiles, savedCharts, dashboard?.spaceUuid]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.map((uuid) => {
                const savedChart = savedCharts?.find((chart) => {
                    return chart.uuid === uuid;
                });
                return {
                    uuid: uuid4(),
                    properties: {
                        title: savedChart?.name || null,
                        savedChartUuid: uuid,
                    },
                    type: DashboardTileTypes.SAVED_CHART,
                    ...defaultTileSize,
                };
            }),
        );
        onClose();
    });

    const dashboardTitleName = dashboard?.name
        ? `"${dashboard.name}"`
        : 'dashboard';

    if (!savedCharts || !dashboardTiles || isLoading) return null;

    return (
        <Modal
            opened={true}
            size="lg"
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconChartAreaLine}
                        size="lg"
                        color="blue.8"
                    />
                    <Title order={4}>
                        Add saved charts to {dashboardTitleName}
                    </Title>
                </Group>
            }
            centered
            withCloseButton
        >
            <Stack spacing="md">
                <form
                    id="add-saved-charts-to-dashboard"
                    onSubmit={handleSubmit}
                >
                    <MultiSelect
                        id="saved-charts"
                        label={`Select the charts you want to add to this dashboard`}
                        data={allSavedCharts}
                        disabled={isLoading}
                        defaultValue={[]}
                        placeholder="Search..."
                        required
                        withinPortal
                        itemComponent={MultiSelectItem}
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
                        <Button type="submit" disabled={isLoading}>
                            Add
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default AddChartTilesModal;
