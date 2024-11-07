import { type CatalogField } from '@lightdash/common';
import { Group, Highlight, HoverCard, Text } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type MRT_ColumnDef } from 'mantine-react-table';
import { useMemo } from 'react';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { CatalogCategory } from './CatalogCategory';
import { MetricChartUsageButton } from './MetricChartUsageButton';
import { MetricsCatalogCategoryForm } from './MetricsCatalogCategoryForm';

export const MetricsCatalogColumns: MRT_ColumnDef<CatalogField>[] = [
    {
        accessorKey: 'name',
        header: 'Metric Name',
        enableSorting: true,
        Cell: ({ row, table }) => (
            <Highlight highlight={table.getState().globalFilter || ''}>
                {row.original.label}
            </Highlight>
        ),
    },
    {
        accessorKey: 'description',
        header: 'Description',
        enableSorting: false,
        size: 400,
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
        accessorKey: 'directory',
        header: 'Table',
        enableSorting: false,
        size: 150,
        Cell: ({ row }) => <Text fw={500}>{row.original.tableName}</Text>,
    },
    {
        accessorKey: 'categories',
        header: 'Category',
        enableSorting: false,
        size: 150,
        minSize: 180,
        Cell: ({ row }) => {
            const canManageTags = useAppSelector(
                (state) => state.metricsCatalog.abilities.canManageTags,
            );

            const { hovered, ref } = useHover();
            const categories = useMemo(
                () => row.original.categories ?? [],
                [row],
            );

            return (
                <Group spacing="two" ref={ref} pos="relative" w="100%" h="100%">
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
                            hovered={hovered}
                        />
                    )}
                </Group>
            );
        },
    },
    {
        accessorKey: 'chartUsage',
        header: 'Popularity',
        enableSorting: true,
        size: 100,
        Cell: ({ row }) => <MetricChartUsageButton row={row} />,
    },
];
