import { ChartKind, type ChartContent } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Popover,
    ScrollArea,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconChartBar,
    IconCheck,
    IconPhoto,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { ChartIcon } from '../../components/common/ResourceIcon';
import { useChartSummariesV2 } from '../../hooks/useChartSummariesV2';
import classes from './AppResourcePicker.module.css';

export type SelectedChart = {
    uuid: string;
    name: string;
};

type Props = {
    onImageClick: () => void;
    imageDisabled: boolean;
    selectedCharts: SelectedChart[];
    onChartsChange: (charts: SelectedChart[]) => void;
    disabled: boolean;
};

const ChartPicker: FC<{
    pendingCharts: SelectedChart[];
    onToggle: (chart: SelectedChart) => void;
}> = ({ pendingCharts, onToggle }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

    const {
        data: chartPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useChartSummariesV2(
        {
            projectUuid,
            page: 1,
            pageSize: 25,
            search: debouncedSearch,
        },
        { keepPreviousData: true },
    );

    const allCharts = useMemo(
        () => uniqBy(chartPages?.pages.flatMap((p) => p.data) ?? [], 'uuid'),
        [chartPages?.pages],
    );

    const pendingUuids = useMemo(
        () => new Set(pendingCharts.map((c) => c.uuid)),
        [pendingCharts],
    );

    // Group charts by space
    const groupedCharts = useMemo(() => {
        const groups = new Map<string, ChartContent[]>();
        for (const chart of allCharts) {
            const spaceName = chart.space.name;
            const group = groups.get(spaceName) ?? [];
            group.push(chart);
            groups.set(spaceName, group);
        }
        return groups;
    }, [allCharts]);

    const [listOpened, setListOpened] = useState(false);

    return (
        <Popover
            opened={listOpened}
            onChange={setListOpened}
            position="bottom"
            width="target"
            shadow="sm"
            withinPortal={false}
        >
            <Popover.Target>
                <TextInput
                    size="xs"
                    placeholder="Search..."
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    rightSection={
                        isFetching && !isInitialLoading ? (
                            <Loader size={14} />
                        ) : undefined
                    }
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.currentTarget.value);
                        setListOpened(true);
                    }}
                    onFocus={() => setListOpened(true)}
                />
            </Popover.Target>
            <Popover.Dropdown p={4}>
                <ScrollArea.Autosize mah={350}>
                    {isInitialLoading ? (
                        <Group justify="center" p="sm">
                            <Loader size="sm" />
                        </Group>
                    ) : allCharts.length === 0 ? (
                        <Text size="xs" c="dimmed" ta="center" p="sm">
                            No charts found
                        </Text>
                    ) : (
                        <>
                            {Array.from(groupedCharts.entries()).map(
                                ([spaceName, charts]) => (
                                    <Box key={spaceName} mb={4}>
                                        <Box
                                            className={classes.spaceGroupLabel}
                                        >
                                            <Text size="xs" fw={500} c="dimmed">
                                                {spaceName}
                                            </Text>
                                        </Box>
                                        {charts.map((chart) => {
                                            const isSelected = pendingUuids.has(
                                                chart.uuid,
                                            );
                                            return (
                                                <Box
                                                    key={chart.uuid}
                                                    className={`${classes.chartItem} ${isSelected ? classes.chartItemSelected : ''}`}
                                                    onClick={() =>
                                                        onToggle({
                                                            uuid: chart.uuid,
                                                            name: chart.name,
                                                        })
                                                    }
                                                >
                                                    <ChartIcon
                                                        chartKind={
                                                            chart.chartKind ??
                                                            ChartKind.VERTICAL_BAR
                                                        }
                                                    />
                                                    <Text
                                                        size="xs"
                                                        fw={500}
                                                        truncate
                                                        flex={1}
                                                    >
                                                        {chart.name}
                                                    </Text>
                                                    {isSelected && (
                                                        <MantineIcon
                                                            icon={IconCheck}
                                                            size={14}
                                                            color="var(--mantine-color-violet-6)"
                                                        />
                                                    )}
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                ),
                            )}
                            {hasNextPage && (
                                <Box ta="center" py={4}>
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        onClick={() => void fetchNextPage()}
                                        loading={isFetching}
                                    >
                                        Load more
                                    </Button>
                                </Box>
                            )}
                        </>
                    )}
                </ScrollArea.Autosize>
            </Popover.Dropdown>
        </Popover>
    );
};

const AppResourcePicker: FC<Props> = ({
    onImageClick,
    imageDisabled,
    selectedCharts,
    onChartsChange,
    disabled,
}) => {
    const [opened, setOpened] = useState(false);
    const [showChartPicker, setShowChartPicker] = useState(false);

    // Local pending selection — committed on "Done", discarded on "Cancel"
    const [pendingCharts, setPendingCharts] = useState<SelectedChart[]>([]);

    const toggleChart = useCallback((chart: SelectedChart) => {
        setPendingCharts((prev) => {
            const exists = prev.some((c) => c.uuid === chart.uuid);
            return exists
                ? prev.filter((c) => c.uuid !== chart.uuid)
                : [...prev, chart];
        });
    }, []);

    const handleOpenChartPicker = () => {
        setPendingCharts(selectedCharts);
        setShowChartPicker(true);
    };

    const handleDone = () => {
        onChartsChange(pendingCharts);
        handleClose();
    };

    const handleClose = () => {
        setOpened(false);
        setShowChartPicker(false);
    };

    const handleImageClick = () => {
        onImageClick();
        handleClose();
    };

    return (
        <Popover
            opened={opened}
            onChange={(val) => {
                setOpened(val);
                if (!val) {
                    setShowChartPicker(false);
                }
            }}
            position="top"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                <Tooltip label="Add resources" position="top" disabled={opened}>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => setOpened((o) => !o)}
                        disabled={disabled || opened}
                        className={classes.triggerButton}
                    >
                        <MantineIcon icon={IconPlus} size={16} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown className={classes.popoverDropdown}>
                {!showChartPicker ? (
                    <Box>
                        <Box
                            className={classes.menuItem}
                            onClick={
                                imageDisabled ? undefined : handleImageClick
                            }
                            opacity={imageDisabled ? 0.5 : 1}
                            style={{
                                cursor: imageDisabled
                                    ? 'not-allowed'
                                    : 'pointer',
                            }}
                        >
                            <MantineIcon icon={IconPhoto} size={16} />
                            <Box>
                                <Text size="sm">Add images</Text>
                                <Text size="xs" c="dimmed">
                                    Include images to use as inspiration
                                </Text>
                            </Box>
                        </Box>
                        <Box
                            className={classes.menuItem}
                            onClick={handleOpenChartPicker}
                        >
                            <MantineIcon icon={IconChartBar} size={16} />
                            <Box>
                                <Text size="sm">Add queries</Text>
                                <Text size="xs" c="dimmed">
                                    Include specific queries in the app
                                </Text>
                            </Box>
                        </Box>
                    </Box>
                ) : (
                    <Box className={classes.chartPickerSection}>
                        <Box p="xs" pb={0}>
                            <Text size="sm" fw={500}>
                                Add queries
                            </Text>
                            <Text size="xs" c="dimmed" mb="xs">
                                Selected queries will be passed to the app
                                builder as starting points for the data in your
                                app.
                            </Text>
                        </Box>
                        <Box px="xs" pb="xs">
                            <ChartPicker
                                pendingCharts={pendingCharts}
                                onToggle={toggleChart}
                            />
                        </Box>
                        <Group
                            justify="flex-end"
                            gap="xs"
                            p="xs"
                            className={classes.chartPickerFooter}
                        >
                            <Button
                                variant="subtle"
                                size="xs"
                                color="gray"
                                onClick={handleClose}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="filled"
                                size="xs"
                                color="violet"
                                onClick={handleDone}
                            >
                                Done
                            </Button>
                        </Group>
                    </Box>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

/**
 * Renders removable pills for selected charts.
 * Place this alongside the image preview in the input area.
 */
export const SelectedChartPills: FC<{
    charts: SelectedChart[];
    onRemove: (uuid: string) => void;
}> = ({ charts, onRemove }) => {
    if (charts.length === 0) return null;

    return (
        <Group gap={4} className={classes.selectedCharts}>
            {charts.map((chart) => (
                <Badge
                    key={chart.uuid}
                    variant="light"
                    color="violet"
                    size="sm"
                    rightSection={
                        <ActionIcon
                            size={14}
                            variant="transparent"
                            color="violet"
                            onClick={() => onRemove(chart.uuid)}
                        >
                            <MantineIcon icon={IconX} size={10} />
                        </ActionIcon>
                    }
                >
                    {chart.name}
                </Badge>
            ))}
        </Group>
    );
};

export default AppResourcePicker;
