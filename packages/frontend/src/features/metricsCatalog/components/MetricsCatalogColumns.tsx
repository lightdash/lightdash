import { SpotlightTableColumns, type CatalogField } from '@lightdash/common';
import { Box, Button, Flex, Group, Text } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { type MRT_ColumnDef } from 'mantine-react-table';
import { useMemo } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    createMetricPreviewUnsavedChartVersion,
    getExplorerUrlFromCreateSavedChartVersion,
} from '../../../hooks/useExplorerRoute';
import {
    Description,
    Hash,
    Popularity,
    Table,
    TableFilled,
    Tag,
} from '../../../svgs/metricsCatalog';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { setCategoryPopoverIsClosing } from '../store/metricsCatalogSlice';
import { CatalogCategory } from './CatalogCategory';
import { ExploreMetricButton } from './ExploreMetricButton';
import { MetricCatalogColumnHeaderCell } from './MetricCatalogColumnHeaderCell';
import { MetricChartUsageButton } from './MetricChartUsageButton';
import { MetricsCatalogCategoryForm } from './MetricsCatalogCategoryForm';
import { MetricsCatalogColumnDescription } from './MetricsCatalogColumnDescription';
import { MetricsCatalogColumnName } from './MetricsCatalogColumnName';

export const MetricsCatalogColumns: MRT_ColumnDef<CatalogField>[] = [
    {
        accessorKey: SpotlightTableColumns.METRIC,
        header: 'Metric',
        enableSorting: true,
        enableEditing: false,
        size: 350,
        Header: ({ column }) => (
            <MetricCatalogColumnHeaderCell Icon={Hash}>
                {column.columnDef.header}
            </MetricCatalogColumnHeaderCell>
        ),
        Cell: ({ row, table }) => {
            const canManageExplore = useAppSelector(
                (state) => state.metricsCatalog.abilities.canManageExplore,
            );

            return (
                <Flex
                    justify="space-between"
                    align="center"
                    w="100%"
                    pos="relative"
                >
                    <MetricsCatalogColumnName row={row} table={table} />
                    {canManageExplore && (
                        <Box
                            pos="absolute"
                            right={0}
                            className="explore-button-container"
                        >
                            <ExploreMetricButton row={row} />
                        </Box>
                    )}
                </Flex>
            );
        },
    },
    {
        accessorKey: SpotlightTableColumns.TABLE,
        header: 'Table',
        enableSorting: false,
        enableEditing: false,
        size: 150,
        Header: ({ column }) => (
            <MetricCatalogColumnHeaderCell Icon={Table} tooltipLabel="Table">
                {column.columnDef.header}
            </MetricCatalogColumnHeaderCell>
        ),
        Cell: ({ row, renderedCellValue }) => {
            const projectUuid = useAppSelector(
                (state) => state.metricsCatalog.projectUuid,
            );

            const savedChartVersion = createMetricPreviewUnsavedChartVersion({
                name: row.original.name,
                table: row.original.tableName,
            });

            const exploreUrl = getExplorerUrlFromCreateSavedChartVersion(
                projectUuid,
                savedChartVersion,
            );

            const url = new URL(exploreUrl.pathname, window.location.origin);
            url.search = exploreUrl.search;

            return (
                <Button
                    component="a"
                    href={url.toString()}
                    target="_blank"
                    size="xs"
                    compact
                    color="ldGray.6"
                    variant="subtle"
                    leftIcon={<TableFilled />}
                    fz="sm"
                    c="ldDark.4"
                    fw={500}
                    sx={{
                        '&[data-disabled]': {
                            backgroundColor: 'transparent',
                            fontWeight: 400,
                        },
                    }}
                    styles={(theme) => ({
                        leftIcon: {
                            marginRight: theme.spacing.xxs,
                        },
                    })}
                >
                    {renderedCellValue}
                </Button>
            );
        },
    },
    {
        accessorKey: SpotlightTableColumns.DESCRIPTION,
        enableSorting: false,
        enableEditing: false,
        size: 400,
        minSize: 200,
        header: 'Description',
        Header: ({ column }) => (
            <MetricCatalogColumnHeaderCell
                Icon={Description}
                tooltipLabel="Defined in the metric's .yml file"
            >
                {column.columnDef.header}
            </MetricCatalogColumnHeaderCell>
        ),
        Cell: ({ row, table }) => {
            return <MetricsCatalogColumnDescription row={row} table={table} />;
        },
    },
    {
        accessorKey: SpotlightTableColumns.CATEGORIES,
        header: 'Category',
        enableSorting: false,
        enableEditing: true,
        size: 270,
        minSize: 150,
        mantineTableBodyCellProps: () => {
            return {
                pos: 'relative',
                sx: {
                    padding: 0,
                    '&:hover': {
                        outline: 'none',
                    },
                },
            };
        },
        Header: ({ column }) => (
            <MetricCatalogColumnHeaderCell
                Icon={Tag}
                tooltipLabel="Categories help you organize your metrics and KPIs. Click on the cell to add or edit a category, if you have the required permissions."
            >
                {column.columnDef.header}
            </MetricCatalogColumnHeaderCell>
        ),
        Edit: ({ table, row, cell }) => {
            const dispatch = useAppDispatch();
            const canManageTags = useAppSelector(
                (state) => state.metricsCatalog.abilities.canManageTags,
            );

            const categories = useMemo(
                () => row.original.categories ?? [],
                [row],
            );

            return (
                <Group
                    pos="absolute"
                    w="100%"
                    h="100%"
                    left={0}
                    top={0}
                    sx={{
                        cursor: canManageTags ? 'pointer' : 'default',
                    }}
                >
                    <Group mx="md" spacing="xxs">
                        {categories.map((category) => (
                            <CatalogCategory
                                key={category.tagUuid}
                                category={category}
                            />
                        ))}
                    </Group>
                    {canManageTags && (
                        <MetricsCatalogCategoryForm
                            catalogSearchUuid={row.original.catalogSearchUuid}
                            metricCategories={categories}
                            opened={
                                table.getState().editingCell?.id === cell.id
                            }
                            onClose={() => {
                                dispatch(setCategoryPopoverIsClosing(true));
                                table.setEditingCell(null);

                                // Resetting the state to avoid race conditions with the category cell click
                                setTimeout(() => {
                                    dispatch(
                                        setCategoryPopoverIsClosing(false),
                                    );
                                }, 100);
                            }}
                        />
                    )}
                </Group>
            );
        },
        Cell: ({ row, table, cell }) => {
            const { hovered, ref } = useHover();
            const isCategoryPopoverClosing = useAppSelector(
                (state) => state.metricsCatalog.popovers.category.isClosing,
            );
            const isDescriptionPopoverClosing = useAppSelector(
                (state) => state.metricsCatalog.popovers.description.isClosing,
            );
            const canManageTags = useAppSelector(
                (state) => state.metricsCatalog.abilities.canManageTags,
            );

            const categories = useMemo(
                () => row.original.categories ?? [],
                [row],
            );

            return (
                <Flex
                    ref={ref}
                    pos="absolute"
                    py={6}
                    px="md"
                    left={0}
                    top={0}
                    w="100%"
                    h="100%"
                    onClick={() => {
                        // Prevent the cell from being clicked if the category or description popover is closing
                        if (
                            isCategoryPopoverClosing ||
                            isDescriptionPopoverClosing
                        ) {
                            return;
                        }

                        table.setEditingCell(cell);
                    }}
                    sx={{
                        cursor: canManageTags ? 'pointer' : 'default',
                    }}
                >
                    {categories.length === 0 && hovered && canManageTags ? (
                        <Group spacing={2}>
                            <MantineIcon
                                color="ldGray.4"
                                icon={IconPlus}
                                size={12}
                            />
                            <Text span fz="sm" color="ldGray.4">
                                Click to add
                            </Text>
                        </Group>
                    ) : (
                        <Group
                            spacing="xxs"
                            pos="relative"
                            w="100%"
                            h="100%"
                            sx={{
                                rowGap: 'unset',
                            }}
                        >
                            {categories.map((category) => (
                                <CatalogCategory
                                    key={category.tagUuid}
                                    category={category}
                                />
                            ))}
                        </Group>
                    )}
                </Flex>
            );
        },
    },
    {
        accessorKey: SpotlightTableColumns.CHART_USAGE,
        header: 'Popularity',
        enableSorting: true,
        enableEditing: false,
        size: 150,
        minSize: 100,
        mantineTableBodyCellProps: () => {
            return {
                sx: {
                    justifyContent: 'center',
                },
            };
        },
        Header: ({ column }) => (
            <MetricCatalogColumnHeaderCell
                Icon={Popularity}
                tooltipLabel="Shows how many charts use this metric"
            >
                {column.columnDef.header}
            </MetricCatalogColumnHeaderCell>
        ),
        Cell: ({ row }) => <MetricChartUsageButton row={row} />,
    },
];
