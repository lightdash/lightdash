import { ChartKind, type ChartContent } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    CloseButton,
    Group,
    Image,
    Loader,
    Popover,
    ScrollArea,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch, IconX } from '@tabler/icons-react';
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
    chartKind?: ChartKind;
};

/**
 * Button that triggers the file input for image upload.
 */
export const ImageButton: FC<{
    onClick: () => void;
    disabled: boolean;
}> = ({ onClick, disabled }) => (
    <Button
        variant="default"
        size="xs"
        leftSection={<MantineIcon icon={IconPlus} size={14} />}
        onClick={onClick}
        disabled={disabled}
        className={classes.resourceButton}
    >
        Images
    </Button>
);

/**
 * Button + popover that shows the chart list directly.
 * Selecting a chart removes it from the list and adds it to the parent.
 */
export const QueryButton: FC<{
    selectedCharts: SelectedChart[];
    onSelect: (chart: SelectedChart) => void;
    disabled: boolean;
}> = ({ selectedCharts, onSelect, disabled }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [opened, setOpened] = useState(false);
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
        { keepPreviousData: true, enabled: opened },
    );

    const allCharts = useMemo(
        () => uniqBy(chartPages?.pages.flatMap((p) => p.data) ?? [], 'uuid'),
        [chartPages?.pages],
    );

    const selectedUuids = useMemo(
        () => new Set(selectedCharts.map((c) => c.uuid)),
        [selectedCharts],
    );

    // Filter out already-selected charts
    const availableCharts = useMemo(
        () => allCharts.filter((c) => !selectedUuids.has(c.uuid)),
        [allCharts, selectedUuids],
    );

    // Group available charts by space
    const groupedCharts = useMemo(() => {
        const groups = new Map<string, ChartContent[]>();
        for (const chart of availableCharts) {
            const spaceName = chart.space.name;
            const group = groups.get(spaceName) ?? [];
            group.push(chart);
            groups.set(spaceName, group);
        }
        return groups;
    }, [availableCharts]);

    const handleSelect = useCallback(
        (chart: ChartContent) => {
            onSelect({
                uuid: chart.uuid,
                name: chart.name,
                chartKind: chart.chartKind ?? ChartKind.VERTICAL_BAR,
            });
        },
        [onSelect],
    );

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="top-start"
            offset={8}
            shadow="md"
            trapFocus
        >
            <Popover.Target>
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    onClick={() => setOpened((o) => !o)}
                    disabled={disabled}
                    className={classes.resourceButton}
                >
                    Queries
                </Button>
            </Popover.Target>
            <Popover.Dropdown className={classes.queryDropdown}>
                <Box p="xs" pb={0}>
                    <Text size="sm" fw={500}>
                        Add queries
                    </Text>
                    <Text size="xs" c="dimmed" mb="xs">
                        Select queries to include in the app
                    </Text>
                </Box>
                <Box px="xs" pb="xs">
                    <TextInput
                        size="xs"
                        placeholder="Search..."
                        leftSection={
                            <MantineIcon icon={IconSearch} size={14} />
                        }
                        rightSection={
                            isFetching && !isInitialLoading ? (
                                <Loader size={14} />
                            ) : undefined
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    />
                </Box>
                <ScrollArea.Autosize mah={350} px="xs" pb="xs">
                    {isInitialLoading ? (
                        <Group justify="center" p="sm">
                            <Loader size="sm" />
                        </Group>
                    ) : availableCharts.length === 0 ? (
                        <Text size="xs" c="dimmed" ta="center" p="sm">
                            {allCharts.length > 0
                                ? 'All matching charts selected'
                                : 'No charts found'}
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
                                        {charts.map((chart) => (
                                            <Box
                                                key={chart.uuid}
                                                className={classes.chartItem}
                                                onClick={() =>
                                                    handleSelect(chart)
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
                                            </Box>
                                        ))}
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

/**
 * Renders selected images as rounded thumbnails with remove buttons.
 */
export const SelectedImageSection: FC<{
    images: Array<{ previewUrl: string }>;
    onRemove: (previewUrl: string) => void;
}> = ({ images, onRemove }) => {
    if (images.length === 0) return null;

    return (
        <Group gap="xs">
            {images.map((img) => (
                <Box key={img.previewUrl} className={classes.imageItem}>
                    <Image
                        src={img.previewUrl}
                        className={classes.imageThumb}
                        alt="Attached"
                    />
                    <CloseButton
                        size="xs"
                        className={classes.imageRemove}
                        onClick={() => onRemove(img.previewUrl)}
                    />
                </Box>
            ))}
        </Group>
    );
};

/**
 * Renders selected queries as a list using the same visual as the picker.
 */
export const SelectedQuerySection: FC<{
    charts: SelectedChart[];
    onRemove: (uuid: string) => void;
}> = ({ charts, onRemove }) => {
    if (charts.length === 0) return null;

    return (
        <Box className={classes.selectedQueryList}>
            {charts.map((chart) => (
                <Box key={chart.uuid} className={classes.selectedQueryItem}>
                    <ChartIcon
                        chartKind={chart.chartKind ?? ChartKind.VERTICAL_BAR}
                    />
                    <Text size="xs" fw={500} truncate flex={1}>
                        {chart.name}
                    </Text>
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => onRemove(chart.uuid)}
                    >
                        <MantineIcon icon={IconX} size={12} />
                    </ActionIcon>
                </Box>
            ))}
        </Box>
    );
};
