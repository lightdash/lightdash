import { type ScimRequestLog } from '@lightdash/common';
import { Text } from '@mantine/core';
import { format } from 'date-fns';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../../components/common/ContentTable';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { useInfiniteScroll } from '../../../../../hooks/useInfiniteScroll';
import { useScimRequestLogs } from '../../hooks/useScimRequestLogs';
import { RequestLogDetailsDrawer } from './RequestLogDetailsDrawer';
import { RequestLogStatusBadges } from './RequestLogStatusBadges';
import styles from './RequestLogTable.module.css';
import { SCIM_ACTION_LABELS } from './scimActionLabels';

const fetchSize = 50;

export const RequestLogTable: FC = () => {
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
                header: 'Time',
                enableSorting: false,
                size: 170,
                Cell: ({ row }) => (
                    <Text c="dimmed" size="xs">
                        {format(
                            new Date(row.original.createdAt),
                            'MMM d, yyyy · h:mm a',
                        )}
                    </Text>
                ),
            },
            {
                accessorKey: 'action',
                header: 'Action',
                enableSorting: false,
                size: 160,
                Cell: ({ row }) => (
                    <Text size="xs">
                        {SCIM_ACTION_LABELS[row.original.action]}
                    </Text>
                ),
            },
            {
                accessorKey: 'targetIdentity',
                header: 'Identity',
                enableSorting: false,
                size: 240,
                Cell: ({ row }) =>
                    row.original.targetIdentity ? (
                        <TruncatedText fz="xs" maxWidth={220}>
                            {row.original.targetIdentity}
                        </TruncatedText>
                    ) : (
                        <Text size="xs" c="dimmed">
                            —
                        </Text>
                    ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                enableSorting: false,
                size: 150,
                Cell: ({ row }) => (
                    <RequestLogStatusBadges
                        status={row.original.status}
                        scimType={row.original.scimType}
                    />
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
            className: styles.container,
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => handleRowClick(row.original),
        }),
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
