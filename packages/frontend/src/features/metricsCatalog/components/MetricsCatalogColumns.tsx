import { type CatalogField } from '@lightdash/common';
import { Highlight, HoverCard, Text } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type MRT_ColumnDef } from 'mantine-react-table';
import { MetricChartUsageButton } from './MetricChartUsageButton';

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
        accessorKey: 'chartUsage',
        header: 'Popularity',
        enableSorting: true,
        size: 100,
        Cell: ({ row }) => <MetricChartUsageButton row={row} />,
    },
];
