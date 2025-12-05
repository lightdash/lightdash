import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG,
    SpotlightTableColumns,
    type CatalogField,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
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
import isEqual from 'lodash/isEqual';
import { type MRT_TableInstance } from 'mantine-react-table';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { TotalMetricsDot } from '../../../../svgs/metricsCatalog';
import { EventName } from '../../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateSpotlightTableConfig,
    useResetSpotlightTableConfig,
    useSpotlightTableConfig,
} from '../../hooks/useSpotlightTable';
import {
    convertStateToTableColumnConfig,
    convertTableColumnConfigToState,
    setColumnConfig,
    setColumnOrder,
    setColumnVisibility,
} from '../../store/metricsCatalogSlice';
import { MetricCatalogView } from '../../types';
import CategoriesFilter from './CategoriesFilter';
import SegmentedControlHoverCard from './SegmentedControlHoverCard';

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
    column: { name: string; uuid: string; visible: boolean; frozen: boolean };
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
        <Group ref={setNodeRef} style={style} position="apart" h={28}>
            <Group spacing={4}>
                <Tooltip
                    variant="xs"
                    disabled={!column.frozen}
                    label={`The ${column.name} column is pinned for usability`}
                    position="top"
                >
                    <Box>
                        <ActionIcon
                            size="xs"
                            color="ldGray.5"
                            {...attributes}
                            {...listeners}
                            disabled={column.frozen}
                        >
                            <MantineIcon icon={IconGripVertical} />
                        </ActionIcon>
                    </Box>
                </Tooltip>
                <Text
                    variant="subtle"
                    fz={13}
                    radius="md"
                    fw={500}
                    color="ldDark.5"
                >
                    {column.name}
                </Text>
            </Group>
            <ActionIcon
                size="xs"
                color="ldGray.5"
                sx={{
                    visibility: column.frozen ? 'hidden' : 'visible',
                }}
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
        const canManageSpotlight = useAppSelector(
            (state) => state.metricsCatalog.abilities.canManageSpotlight,
        );
        const columnConfig = useAppSelector(
            (state) => state.metricsCatalog.columnConfig,
        );
        const dispatch = useAppDispatch();
        const { track } = useTracking();
        const location = useLocation();
        const navigate = useNavigate();
        const clearSearch = useCallback(() => setSearch(''), [setSearch]);
        const { data: savedTableConfig } = useSpotlightTableConfig({
            projectUuid,
        });

        const sensors = useSensors(
            useSensor(PointerSensor),
            useSensor(KeyboardSensor, {
                coordinateGetter: sortableKeyboardCoordinates,
            }),
        );

        const {
            mutate: createSpotlightConfig,
            isLoading: isCreatingSpotlightConfig,
        } = useCreateSpotlightTableConfig();

        const { mutate: resetSpotlightConfig } = useResetSpotlightTableConfig();

        const handleDragEnd = useCallback(
            (event: DragEndEvent) => {
                const { active, over } = event;

                if (active.id !== over?.id) {
                    const columns = table.getAllLeafColumns();
                    const oldIndex = columns.findIndex(
                        (col) => col.id === active.id,
                    );
                    const newIndex = columns.findIndex(
                        (col) => col.id === over?.id,
                    );

                    // Prevent reordering if trying to move around the metric column
                    if (
                        active.id === SpotlightTableColumns.METRIC ||
                        over?.id === SpotlightTableColumns.METRIC
                    ) {
                        return;
                    }

                    // Get current column order or default to column ids if no order is set
                    const currentOrder =
                        table.getState().columnOrder.length > 0
                            ? table.getState().columnOrder
                            : columns.map((col) => col.id);

                    const newColumnOrder = [...currentOrder];
                    const [removed] = newColumnOrder.splice(oldIndex, 1);
                    newColumnOrder.splice(newIndex, 0, removed);

                    dispatch(setColumnOrder(newColumnOrder));
                }
            },
            [table, dispatch],
        );

        const handleVisibilityChange = useCallback(
            (columnId: string, isVisible: boolean) => {
                const visibleColumns = table.getState().columnVisibility;

                dispatch(
                    setColumnVisibility({
                        ...visibleColumns,
                        [columnId]: isVisible,
                    }),
                );
            },
            [table, dispatch],
        );

        const handleSave = useCallback(() => {
            // Save for everyone
            if (projectUuid) {
                createSpotlightConfig({
                    projectUuid,
                    data: {
                        columnConfig:
                            convertStateToTableColumnConfig(columnConfig),
                    },
                });
            }
        }, [projectUuid, createSpotlightConfig, columnConfig]);

        const hasConfigChanges = useMemo(() => {
            const referenceConfig =
                savedTableConfig?.columnConfig ??
                DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG;

            const referenceFormatted =
                convertTableColumnConfigToState(referenceConfig);

            const orderChanged = !isEqual(
                columnConfig.columnOrder,
                referenceFormatted.columnOrder,
            );
            const visibilityChanged = !isEqual(
                columnConfig.columnVisibility,
                referenceFormatted.columnVisibility,
            );

            return orderChanged || visibilityChanged;
        }, [savedTableConfig, columnConfig]);

        const isDefaultConfig = useMemo(() => {
            const currentConfig = convertStateToTableColumnConfig(columnConfig);

            return isEqual(
                currentConfig,
                DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG,
            );
        }, [columnConfig]);

        const handleReset = useCallback(() => {
            if (!canManageSpotlight || !projectUuid) {
                dispatch(setColumnConfig(savedTableConfig));
                return;
            }

            if (hasConfigChanges) {
                dispatch(setColumnConfig(savedTableConfig));
            } else {
                resetSpotlightConfig({ projectUuid });
            }
        }, [
            canManageSpotlight,
            dispatch,
            hasConfigChanges,
            projectUuid,
            resetSpotlightConfig,
            savedTableConfig,
        ]);

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
                                    ? theme.colors.ldGray[8]
                                    : theme.colors.ldGray[5],
                                boxShadow: theme.shadows.subtle,
                                border: `1px solid ${theme.colors.ldGray[3]}`,
                                '&:hover': {
                                    border: `1px solid ${theme.colors.ldGray[4]}`,
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
                                color="ldGray.6"
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
                                    color="ldGray.5"
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
                                borderColor: 'ldGray.3',
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
                        bg="ldGray.1"
                        c="ldGray.8"
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
                    <Popover shadow="subtle" withArrow>
                        <Popover.Target>
                            <Tooltip
                                withinPortal
                                variant="xs"
                                multiline
                                maw={150}
                                label="Manage column visibility"
                                position="top"
                            >
                                <ActionIcon
                                    variant="transparent"
                                    size="xs"
                                    color="ldGray.5"
                                >
                                    <MantineIcon icon={IconEye} />
                                </ActionIcon>
                            </Tooltip>
                        </Popover.Target>
                        <Popover.Dropdown p="sm" miw={270}>
                            <Stack spacing="sm">
                                <Stack spacing={2}>
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
                                                            frozen:
                                                                column.id ===
                                                                SpotlightTableColumns.METRIC,
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

                                <Divider color="ldGray.1" />
                                <Group position="apart" mt={4}>
                                    {canManageSpotlight ? (
                                        <>
                                            <Tooltip
                                                position="bottom"
                                                variant="xs"
                                                withinPortal
                                                label={
                                                    hasConfigChanges
                                                        ? 'Discard unsaved changes'
                                                        : 'Reset configuration for everyone'
                                                }
                                            >
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    radius="md"
                                                    h={28}
                                                    onClick={handleReset}
                                                    sx={(theme) => ({
                                                        border: `1px solid ${theme.colors.ldGray[2]}`,
                                                        boxShadow:
                                                            theme.shadows
                                                                .subtle,
                                                    })}
                                                    disabled={
                                                        isDefaultConfig &&
                                                        !hasConfigChanges
                                                    }
                                                >
                                                    {hasConfigChanges
                                                        ? 'Discard'
                                                        : 'Reset'}
                                                </Button>
                                            </Tooltip>

                                            <Button
                                                size="xs"
                                                h={28}
                                                variant="darkPrimary"
                                                onClick={handleSave}
                                                loading={
                                                    isCreatingSpotlightConfig
                                                }
                                            >
                                                Save for everyone
                                            </Button>
                                        </>
                                    ) : (
                                        <Tooltip
                                            position="bottom"
                                            variant="xs"
                                            withinPortal
                                            label={'Discard unsaved changes'}
                                        >
                                            <Button
                                                fullWidth
                                                size="xs"
                                                h={28}
                                                radius="md"
                                                variant="default"
                                                onClick={handleReset}
                                                disabled={!hasConfigChanges}
                                                sx={(theme) => ({
                                                    border: `1px solid ${theme.colors.ldGray[2]}`,
                                                    boxShadow:
                                                        theme.shadows.subtle,
                                                })}
                                            >
                                                Discard
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Group>
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
                                border: `1px solid ${theme.colors.ldGray[2]}`,
                                backgroundColor: theme.colors.background[0],
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
