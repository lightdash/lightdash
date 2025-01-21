import {
    type CatalogField,
    type SpotlightTableColumns,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Center,
    Divider,
    Group,
    Popover,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type GroupProps,
} from '@mantine/core';
import {
    IconEye,
    IconEyeOff,
    IconGripVertical,
    IconList,
    IconSearch,
    IconSitemap,
    IconX,
} from '@tabler/icons-react';
import { memo, useCallback, type FC, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { TotalMetricsDot } from '../../../../svgs/metricsCatalog';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { MetricCatalogView } from '../../types';
import CategoriesFilter from './CategoriesFilter';
import SegmentedControlHoverCard from './SegmentedControlHoverCard';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type MRT_TableInstance } from 'mantine-react-table';
import {
    useCreateSpotlightTableConfig,
    useSpotlightTableConfig,
} from '../../hooks/useSpotlightTable';

// TODO: add optimistic update on reorders!!!!!

type MetricsTableTopToolbarProps = GroupProps & {
    search: string | undefined;
    setSearch: (search: string) => void;
    selectedCategories: CatalogField['categories'][number]['tagUuid'][];
    setSelectedCategories: (
        categories: CatalogField['categories'][number]['tagUuid'][],
    ) => void;
    totalResults: number;
    isValidMetricsNodeCount: boolean;
    isValidMetricsEdgeCount: boolean;
    showCategoriesFilter?: boolean;
    isValidMetricsTree: boolean;
    metricCatalogView: MetricCatalogView;
    table: MRT_TableInstance<CatalogField>;
};

const SortableColumn: FC<{
    column: { name: string; uuid: string; visible: boolean };
    onToggleVisibility: () => void;
}> = ({ column, onToggleVisibility }) => {
    const { attributes, listeners, setNodeRef, transform, transition } =
        useSortable({
            id: column.uuid,
        });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <Group
            ref={setNodeRef}
            style={style}
            position="apart"
            m={4}
            my={2}
            px={4}
            py={2}
        >
            <Group spacing={4}>
                <ActionIcon
                    size="xs"
                    color="gray.5"
                    {...attributes}
                    {...listeners}
                >
                    <MantineIcon icon={IconGripVertical} />
                </ActionIcon>
                <Text
                    variant="subtle"
                    size="xs"
                    radius="md"
                    fw={500}
                    color="dark.5"
                >
                    {column.name}
                </Text>
            </Group>
            <ActionIcon
                size="xs"
                color="gray.5"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    onToggleVisibility();
                }}
            >
                <MantineIcon icon={column.visible ? IconEye : IconEyeOff} />
            </ActionIcon>
        </Group>
    );
};

export const MetricsTableTopToolbar: FC<MetricsTableTopToolbarProps> = memo(
    ({
        search,
        setSearch,
        totalResults,
        selectedCategories,
        setSelectedCategories,
        showCategoriesFilter,
        isValidMetricsTree,
        isValidMetricsNodeCount,
        isValidMetricsEdgeCount,
        metricCatalogView,
        table,
        ...props
    }) => {
        const userUuid = useAppSelector(
            (state) => state.metricsCatalog.user?.userUuid,
        );
        const organizationUuid = useAppSelector(
            (state) => state.metricsCatalog.organizationUuid,
        );
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const { track } = useTracking();
        const location = useLocation();
        const navigate = useNavigate();
        const clearSearch = useCallback(() => setSearch(''), [setSearch]);

        const sensors = useSensors(
            useSensor(PointerSensor),
            useSensor(KeyboardSensor, {
                coordinateGetter: sortableKeyboardCoordinates,
            }),
        );

        const { mutate: createSpotlightConfig } =
            useCreateSpotlightTableConfig();
        const { data: spotlightConfig } = useSpotlightTableConfig({
            projectUuid,
        });

        const handleDragEnd = useCallback(
            (event: any) => {
                const { active, over } = event;

                if (active.id !== over.id) {
                    const columns = table.getAllLeafColumns();
                    const oldIndex = columns.findIndex(
                        (col) => col.id === active.id,
                    );
                    const newIndex = columns.findIndex(
                        (col) => col.id === over.id,
                    );

                    // Get current column order or default to column ids if no order is set
                    const currentOrder =
                        table.getState().columnOrder.length > 0
                            ? table.getState().columnOrder
                            : columns.map((col) => col.id);

                    const newColumnOrder = [...currentOrder];
                    const [removed] = newColumnOrder.splice(oldIndex, 1);
                    newColumnOrder.splice(newIndex, 0, removed);

                    table.setColumnOrder(newColumnOrder);

                    const columnConfig = newColumnOrder.map((columnId) => ({
                        column: columnId as SpotlightTableColumns,
                        isVisible: table.getColumn(columnId).getIsVisible(),
                    }));

                    if (projectUuid) {
                        createSpotlightConfig({
                            projectUuid,
                            data: {
                                columnConfig,
                            },
                        });
                    }
                }
            },
            [table, createSpotlightConfig, projectUuid],
        );

        const handleVisibilityChange = useCallback(
            (columnId: string, isVisible: boolean) => {
                const visibleColumns = table.getState().columnVisibility;
                table.setColumnVisibility({
                    ...visibleColumns,
                    [columnId]: isVisible,
                });

                const columnConfig = table
                    .getAllLeafColumns()
                    .map((column) => ({
                        column: column.id as SpotlightTableColumns,
                        isVisible:
                            columnId === column.id
                                ? isVisible
                                : column.getIsVisible(),
                    }));

                if (projectUuid) {
                    createSpotlightConfig({
                        projectUuid,
                        data: {
                            columnConfig,
                        },
                    });
                }
            },
            [table, createSpotlightConfig, projectUuid],
        );

        useEffect(() => {
            if (spotlightConfig) {
                const visibilityConfig = spotlightConfig.columnConfig.reduce(
                    (acc, { column, isVisible }) => ({
                        ...acc,
                        [column]: isVisible,
                    }),
                    {},
                );
                table.setColumnVisibility(visibilityConfig);

                const orderConfig = spotlightConfig.columnConfig.map(
                    ({ column }) => column,
                );
                table.setColumnOrder(orderConfig);
            }
        }, [spotlightConfig, table]);

        return (
            <Group {...props}>
                <Group spacing="xs">
                    {/* Search input */}
                    <TextInput
                        size="xs"
                        radius="md"
                        styles={(theme) => ({
                            input: {
                                height: 32,
                                width: 309,
                                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                textOverflow: 'ellipsis',
                                fontSize: theme.fontSizes.sm,
                                fontWeight: 400,
                                color: search
                                    ? theme.colors.gray[8]
                                    : theme.colors.gray[5],
                                boxShadow: theme.shadows.subtle,
                                border: `1px solid ${theme.colors.gray[3]}`,
                                '&:hover': {
                                    border: `1px solid ${theme.colors.gray[4]}`,
                                },
                                '&:focus': {
                                    border: `1px solid ${theme.colors.blue[5]}`,
                                },
                            },
                        })}
                        type="search"
                        variant="default"
                        placeholder="Search by name or description"
                        value={search ?? ''}
                        icon={
                            <MantineIcon
                                size="md"
                                color="gray.6"
                                icon={IconSearch}
                            />
                        }
                        onChange={(e) => setSearch(e.target.value)}
                        rightSection={
                            search && (
                                <ActionIcon
                                    onClick={clearSearch}
                                    variant="transparent"
                                    size="xs"
                                    color="gray.5"
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            )
                        }
                    />

                    {/* Categories filter */}
                    {showCategoriesFilter && (
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            sx={{
                                alignSelf: 'center',
                                borderColor: '#DEE2E6',
                            }}
                        />
                    )}
                    {showCategoriesFilter && (
                        <CategoriesFilter
                            selectedCategories={selectedCategories}
                            setSelectedCategories={setSelectedCategories}
                        />
                    )}
                </Group>
                <Group spacing="xs">
                    <Badge
                        bg="#F8F9FC"
                        c="#363F72"
                        radius={6}
                        py="sm"
                        px="xs"
                        tt="none"
                        h={32}
                    >
                        <Group spacing={6}>
                            <TotalMetricsDot />
                            <Text fz="sm" fw={500}>
                                {totalResults} metrics
                            </Text>
                        </Group>
                    </Badge>
                    <Popover>
                        <Popover.Target>
                            <ActionIcon
                                variant="transparent"
                                size="xs"
                                color="gray.5"
                            >
                                <MantineIcon icon={IconEye} />
                            </ActionIcon>
                        </Popover.Target>
                        <Popover.Dropdown px={4} py={4}>
                            <Stack spacing={4}>
                                <Stack spacing={0}>
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={table
                                                .getAllLeafColumns()
                                                .map((col) => col.id)}
                                            strategy={
                                                verticalListSortingStrategy
                                            }
                                        >
                                            {table
                                                .getAllLeafColumns()
                                                .map((column) => (
                                                    <SortableColumn
                                                        key={column.id}
                                                        column={{
                                                            name: column
                                                                .columnDef
                                                                .header as string,
                                                            uuid: column.id,
                                                            visible:
                                                                column.getIsVisible(),
                                                        }}
                                                        onToggleVisibility={() => {
                                                            handleVisibilityChange(
                                                                column.id,
                                                                !column.getIsVisible(),
                                                            );
                                                        }}
                                                    />
                                                ))}
                                        </SortableContext>
                                    </DndContext>
                                </Stack>
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>
                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        sx={{
                            alignSelf: 'center',
                            borderColor: '#DEE2E6',
                        }}
                    />
                    <SegmentedControl
                        size="xs"
                        value={metricCatalogView}
                        styles={(theme) => ({
                            root: {
                                borderRadius: theme.radius.md,
                                gap: theme.spacing.two,
                                padding: theme.spacing.xxs,
                            },
                            indicator: {
                                borderRadius: theme.radius.md,
                                border: `1px solid ${theme.colors.gray[2]}`,
                                backgroundColor: 'white',
                                boxShadow: theme.shadows.subtle,
                            },
                        })}
                        data={[
                            {
                                label: (
                                    <Tooltip
                                        withinPortal
                                        variant="xs"
                                        label="List view"
                                        position="bottom-end"
                                    >
                                        <Center>
                                            <MantineIcon
                                                icon={IconList}
                                                size="md"
                                            />
                                        </Center>
                                    </Tooltip>
                                ),
                                value: MetricCatalogView.LIST,
                            },
                            {
                                label: (
                                    <SegmentedControlHoverCard
                                        totalMetricsCount={totalResults}
                                        isValidMetricsNodeCount={
                                            isValidMetricsNodeCount
                                        }
                                        isValidMetricsEdgeCount={
                                            isValidMetricsEdgeCount
                                        }
                                        withinPortal
                                        position="bottom-end"
                                        withArrow
                                    >
                                        <Center
                                            sx={{
                                                cursor: !isValidMetricsTree
                                                    ? 'not-allowed'
                                                    : 'pointer',
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconSitemap}
                                                size="md"
                                                opacity={
                                                    !isValidMetricsTree
                                                        ? 0.5
                                                        : 1
                                                }
                                            />
                                        </Center>
                                    </SegmentedControlHoverCard>
                                ),
                                value: MetricCatalogView.CANVAS,
                            },
                        ]}
                        onChange={(value) => {
                            if (!isValidMetricsTree) {
                                return;
                            }

                            const view = value as MetricCatalogView;

                            switch (view) {
                                case MetricCatalogView.LIST:
                                    void navigate({
                                        pathname: location.pathname.replace(
                                            /\/canvas/,
                                            '',
                                        ),
                                        search: location.search,
                                    });
                                    break;
                                case MetricCatalogView.CANVAS:
                                    track({
                                        name: EventName.METRICS_CATALOG_TREES_CANVAS_MODE_CLICKED,
                                        properties: {
                                            userId: userUuid,
                                            organizationId: organizationUuid,
                                            projectId: projectUuid,
                                        },
                                    });
                                    void navigate({
                                        pathname: `${location.pathname}/canvas`,
                                        search: location.search,
                                    });
                                    break;
                            }
                        }}
                    />
                </Group>
            </Group>
        );
    },
);
