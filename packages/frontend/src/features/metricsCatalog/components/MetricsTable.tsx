import { type CatalogFieldWithAnalytics } from '@lightdash/common';
import { Badge, HoverCard, Text } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useMetricsCatalog } from '../hooks/useMetricsCatalog';

const columns: MRT_ColumnDef<CatalogFieldWithAnalytics>[] = [
    {
        accessorKey: 'name',
        header: 'Metric Name',
        Cell: ({ row }) => <Text fw={500}>{row.original.label}</Text>,
    },
    {
        accessorKey: 'description',
        header: 'Description',
        Cell: ({ row }) => (
            <HoverCard withinPortal>
                <HoverCard.Target>
                    <Text lineClamp={2}>{row.original.description}</Text>
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
        header: 'Directory',
        Cell: ({ row }) => <Text fw={500}>{row.original.tableName}</Text>,
    },
    {
        accessorKey: 'usage',
        header: 'Usage',
        Cell: ({ row }) => (
            <Badge fw={500} radius="sm" color="indigo">
                {row.original.analytics?.charts.length} uses
            </Badge>
        ),
    },
];

const fetchSize = 25;

export const MetricsTable = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const { data, isLoading } = useMetricsCatalog({
        projectUuid: projectUuid!,
        pageSize: fetchSize,
    });

    const table = useMantineReactTable({
        columns,
        data: data?.pages.flatMap((page) => page) ?? [],
        enableColumnResizing: true,
        enableRowNumbers: true,
        enableRowVirtualization: true,
        enablePagination: false,
        enableSorting: false,
        enableFilters: false,
        enableGlobalFilter: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: { maxHeight: '600px', minHeight: '600px' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: true,
        },
        enableTopToolbar: false,
        enableBottomToolbar: false,
        state: {
            isLoading,
            density: 'xs',
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
    });

    return <MantineReactTable table={table} />;
};
