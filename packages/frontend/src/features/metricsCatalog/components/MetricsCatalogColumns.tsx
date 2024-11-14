import { type CatalogField } from '@lightdash/common';
import { Box, Group, Highlight, HoverCard, Text, Tooltip } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type MRT_ColumnDef } from 'mantine-react-table';
import { useMemo, type FC, type SVGProps } from 'react';
import {
    Description,
    Hash,
    Popularity,
    Tag,
} from '../../../svgs/metricsCatalog';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { setCategoryPopoverIsClosing } from '../store/metricsCatalogSlice';
import { CatalogCategory } from './CatalogCategory';
import { MetricChartUsageButton } from './MetricChartUsageButton';
import { MetricsCatalogCategoryForm } from './MetricsCatalogCategoryForm';
import { MetricsCatalogColumnName } from './MetricsCatalogColumnName';

const HeaderCell = ({
    children,
    Icon,
}: {
    children: React.ReactNode;
    Icon: FC<SVGProps<SVGSVGElement>>;
}) => {
    return (
        <Group spacing={6} mr={6} h="100%" noWrap>
            <Icon />
            <Text
                fz="xs"
                fw={600}
                color="dark.3"
                sx={{
                    // Turn off highlight text cursor - useful when resizing columns
                    userSelect: 'none',
                }}
            >
                {children}
            </Text>
        </Group>
    );
};

export const MetricsCatalogColumns: MRT_ColumnDef<CatalogField>[] = [
    {
        accessorKey: 'name',
        header: 'Metric',
        enableSorting: true,
        enableEditing: false,
        Header: ({ column }) => (
            <HeaderCell Icon={Hash}>{column.columnDef.header}</HeaderCell>
        ),
        Cell: ({ row, table }) => (
            <Tooltip
                label={row.original.tableName}
                disabled={!row.original.tableName}
                withinPortal
                position="right"
            >
                <MetricsCatalogColumnName row={row} table={table} />
            </Tooltip>
        ),
    },
    {
        accessorKey: 'description',
        enableSorting: false,
        enableEditing: false,
        size: 300,
        header: 'Description',
        Header: ({ column }) => (
            <HeaderCell Icon={Description}>
                {column.columnDef.header}
            </HeaderCell>
        ),
        Cell: ({ table, row }) => (
            <HoverCard
                withinPortal
                shadow="lg"
                position="right"
                disabled={!row.original.description}
            >
                <HoverCard.Target>
                    <Text lineClamp={2}>
                        <Highlight
                            highlight={table.getState().globalFilter || ''}
                        >
                            {row.original.description ?? ''}
                        </Highlight>
                    </Text>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                    <MarkdownPreview
                        source={row.original.description}
                        style={{
                            fontSize: '12px',
                        }}
                    />
                </HoverCard.Dropdown>
            </HoverCard>
        ),
    },
    {
        accessorKey: 'categories',
        header: 'Category',
        enableSorting: false,
        enableEditing: true,
        size: 200,
        minSize: 180,
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
            <HeaderCell Icon={Tag}>{column.columnDef.header}</HeaderCell>
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
                <Group spacing="two" pos="relative" w="100%" h="100%">
                    {categories.map((category) => (
                        <CatalogCategory
                            key={category.tagUuid}
                            category={category}
                        />
                    ))}
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
            const isCategoryPopoverClosing = useAppSelector(
                (state) => state.metricsCatalog.popovers.category.isClosing,
            );

            const categories = useMemo(
                () => row.original.categories ?? [],
                [row],
            );

            return (
                // This is a hack to make the whole cell clickable and avoid race conditions with click outside events
                <Box
                    pos="absolute"
                    p="md"
                    left={0}
                    top={0}
                    w="100%"
                    h="100%"
                    onClick={() => {
                        if (isCategoryPopoverClosing) {
                            return;
                        }

                        table.setEditingCell(cell);
                    }}
                >
                    <Group spacing="two" pos="relative" w="100%" h="100%">
                        {categories.map((category) => (
                            <CatalogCategory
                                key={category.tagUuid}
                                category={category}
                            />
                        ))}
                    </Group>
                </Box>
            );
        },
    },
    {
        accessorKey: 'chartUsage',
        header: 'Popularity',
        enableSorting: true,
        enableEditing: false,
        size: 100,
        Header: ({ column }) => (
            <HeaderCell Icon={Popularity}>{column.columnDef.header}</HeaderCell>
        ),
        Cell: ({ row }) => <MetricChartUsageButton row={row} />,
    },
];
