import { type ScimRequestLog } from '@lightdash/common';
import { Text, Tooltip, useMantineTheme } from '@mantine/core';
import { format } from 'date-fns';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../../components/common/ContentTable';
import { useInfiniteScroll } from '../../../../../hooks/useInfiniteScroll';
import { useScimRequestLogs } from '../../hooks/useScimRequestLogs';
import { RequestLogDetailsDrawer } from './RequestLogDetailsDrawer';
import { RequestLogStatusBadges } from './RequestLogStatusBadges';
import { SCIM_ACTION_LABELS } from './scimActionLabels';

const fetchSize = 50;

export const RequestLogTable: FC = () => {
    const theme = useMantineTheme();

    const [drawerOpened, setDrawerOpened] = useState(false);
    const [selectedLog, setSelectedLog] = useState<ScimRequestLog | null>(null);

    const handleRowClick = useCallback((log: ScimRequestLog) => {
        setSelectedLog(log);
        setDrawerOpened(true);
    }, []);

    const handleDrawerClose = useCallback(() => {
        setDrawerOpened(false);
        setSelectedLog(null);
    }, []);

    const { data, fetchNextPage, isError, isFetching, isLoading } =
        useScimRequestLogs({ pageSize: fetchSize });

    const logs = useMemo(
        () => data?.pages.flatMap((page) => page.data || []) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = logs.length;

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: totalFetched < totalDBRowCount,
        threshold: 400,
    });

    const columns: ContentTableColumnDef<ScimRequestLog>[] = useMemo(
        () => [
            {
                accessorKey: 'createdAt',
                header: 'Timestamp',
                enableSorting: false,
                size: 150,
                Cell: ({ row }) => (
                    <Text c="dimmed" size="xs">
                        {format(
                            new Date(row.original.createdAt),
                            'yyyy/MM/dd hh:mm a',
                        )}
                    </Text>
                ),
            },
            {
                accessorKey: 'action',
                header: 'Action',
                enableSorting: false,
                size: 140,
                Cell: ({ row }) => (
                    <Text size="xs">
                        {SCIM_ACTION_LABELS[row.original.action]}
                    </Text>
                ),
            },
            {
                accessorKey: 'url',
                header: 'Request',
                enableSorting: false,
                size: 260,
                Cell: ({ row }) => (
                    <Tooltip
                        label={`${row.original.method} ${row.original.url}`}
                        openDelay={500}
                    >
                        <Text size="xs" truncate maw={240}>
                            <Text span size="xs" fw={600}>
                                {row.original.method}
                            </Text>{' '}
                            {row.original.url.replace(
                                /^\/api\/v1\/scim\/v2/,
                                '',
                            ) || '/'}
                        </Text>
                    </Tooltip>
                ),
            },
            {
                accessorKey: 'targetIdentity',
                header: 'Target',
                enableSorting: false,
                size: 200,
                Cell: ({ row }) =>
                    row.original.targetIdentity ? (
                        <Text size="xs" truncate maw={180}>
                            {row.original.targetIdentity}
                        </Text>
                    ) : (
                        <Text size="xs" c="dimmed">
                            —
                        </Text>
                    ),
            },
            {
                accessorKey: 'affectedRoles',
                header: 'Roles',
                enableSorting: false,
                size: 140,
                Cell: ({ row }) =>
                    row.original.affectedRoles.length > 0 ? (
                        <Text size="xs" truncate maw={120}>
                            {row.original.affectedRoles.join(', ')}
                        </Text>
                    ) : null,
            },
            {
                accessorKey: 'status',
                header: 'Status',
                enableSorting: false,
                size: 130,
                Cell: ({ row }) => (
                    <RequestLogStatusBadges
                        status={row.original.status}
                        scimType={row.original.scimType}
                    />
                ),
            },
            {
                accessorKey: 'tokenDescription',
                header: 'Token',
                enableSorting: false,
                size: 150,
                Cell: ({ row }) =>
                    row.original.tokenDescription ? (
                        <Text size="xs" truncate maw={130}>
                            {row.original.tokenDescription}
                        </Text>
                    ) : (
                        <Text size="xs" c="dimmed">
                            Deleted token
                        </Text>
                    ),
            },
        ],
        [],
    );

    const table = useContentTable({
        columns,
        data: logs,
        enableColumnResizing: false,
        enablePagination: false,
        enableSorting: false,
        enableRowVirtualization: true,
        enableTopToolbar: false,
        enableBottomToolbar: false,
        enableRowActions: false,
        emptyState: {
            entityName: 'SCIM requests',
            title: 'No SCIM requests yet',
            description:
                'Requests from your identity provider will appear here as they arrive.',
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 300px)' },
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleRowClick(row.original),
            style: { cursor: 'pointer' },
        }),
        mantineTableHeadCellProps: {
            h: '3xl',
            pos: 'relative',
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.ldGray[0],
                fontWeight: 600,
                fontSize: theme.fontSizes.xs,
            },
        },
        mantineTableBodyCellProps: {
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                fontSize: theme.fontSizes.xs,
                color: theme.colors.ldGray[7],
            },
        },
        rowVirtualizerProps: { estimateSize: () => 40, overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
        },
    });

    return (
        <>
            <ContentTable table={table} />
            <RequestLogDetailsDrawer
                opened={drawerOpened}
                onClose={handleDrawerClose}
                log={selectedLog}
            />
        </>
    );
};
