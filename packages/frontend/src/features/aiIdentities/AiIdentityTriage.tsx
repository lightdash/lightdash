import {
    type AiIdentitySort,
    type AiIdentity,
    type AiIdentityAccount,
    type AiIdentityExportFormat,
    type AiIdentityFilter,
    type AiIdentityJob,
} from '@lightdash/common';
import { Button, Menu, Stack, Text, Tooltip } from '@mantine/core';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useMemo, useRef, useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableVirtualizer,
} from '../../components/common/ContentTable';
import MantineModal from '../../components/common/MantineModal';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { useProjects } from '../../hooks/useProjects';
import classes from './AiIdentitiesPage.module.css';
import { AiIdentityDetailDrawer } from './AiIdentityDetailDrawer';
import { AiIdentityProvisioningTriage } from './AiIdentityProvisioningTriage';
import { AiIdentityStatusIcon } from './AiIdentityStatusBadge';
import { AiIdentityTriageSummary } from './AiIdentityTriageSummary';
import { AiIdentityTriageToolbar } from './AiIdentityTriageToolbar';
import { aiIdentityApi } from './api';
import { getAiIdentityListParams } from './params';

type Props = {
    account: AiIdentityAccount;
    job: AiIdentityJob | undefined;
    filter: AiIdentityFilter;
    sort: AiIdentitySort;
    searchInput: string;
    onSearchInput: (value: string) => void;
    onParam: (key: string, value: string | null) => void;
    onMultiParam: (key: string, values: string[]) => void;
    onJob: (
        kind: 'test' | 'export',
        filter: AiIdentityFilter,
        format?: AiIdentityExportFormat,
        roleForTwin?: string | null,
    ) => Promise<void>;
};

dayjs.extend(relativeTime);

const dateLabel = (value: Date | string | null): string =>
    value ? new Date(value).toLocaleString() : 'Never';

const relativeDate = (value: Date | string | null): string =>
    value ? dayjs(value).fromNow() : 'Never';

export const AiIdentityTriage: FC<Props> = ({
    account,
    job,
    filter,
    sort,
    searchInput,
    onSearchInput,
    onParam,
    onMultiParam,
    onJob,
}) => {
    const [selection, setSelection] = useState<Record<string, boolean>>({});
    const [allMatching, setAllMatching] = useState(false);
    const [detailUuid, setDetailUuid] = useState<string | null>(null);
    const [keyUuid, setKeyUuid] = useState<string | null>(null);
    const [rowError, setRowError] = useState<string | null>(null);
    const projectsQuery = useProjects();
    const queryClient = useQueryClient();
    const virtualizerRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );
    const listQuery = useInfiniteQuery({
        queryKey: ['ai-identity-list', filter, sort],
        queryFn: ({ pageParam = 1 }) =>
            aiIdentityApi.list(
                getAiIdentityListParams(filter, sort, pageParam),
            ),
        getNextPageParam: (lastPage) =>
            lastPage.pagination.page < lastPage.pagination.totalPageCount
                ? lastPage.pagination.page + 1
                : undefined,
    });
    const rows = useMemo(
        () => listQuery.data?.pages.flatMap((page) => page.data) ?? [],
        [listQuery.data],
    );
    const result = listQuery.data?.pages[0];
    const selectedUuids = Object.keys(selection).filter(
        (uuid) => selection[uuid],
    );
    const selectedCount = allMatching
        ? (result?.pagination.totalResults ?? 0)
        : selectedUuids.length;
    const effectiveFilter: AiIdentityFilter = allMatching
        ? filter
        : { ...filter, aiIdentityUuids: selectedUuids };
    const clearSelection = () => {
        setSelection({});
        setAllMatching(false);
    };
    const changeParam = (key: string, value: string | null) => {
        clearSelection();
        onParam(key, value);
    };
    const changeMultiParam = (key: string, values: string[]) => {
        clearSelection();
        onMultiParam(key, values);
    };
    const { containerRef, onScroll } = useInfiniteScroll({
        fetchNextPage: listQuery.fetchNextPage,
        isFetching: listQuery.isFetching,
        hasMore: listQuery.hasNextPage ?? false,
        threshold: 400,
    });

    const columns = useMemo<ContentTableColumnDef<AiIdentity>[]>(
        () => [
            {
                id: 'person',
                header: 'Person',
                accessorFn: (row) => `${row.firstName} ${row.lastName}`,
                Cell: ({ row }) => (
                    <Stack gap={0}>
                        <Text fz="sm" fw={500}>
                            {row.original.firstName} {row.original.lastName}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {row.original.email}
                        </Text>
                    </Stack>
                ),
            },
            {
                accessorKey: 'snowflakeLogin',
                header: 'Snowflake login',
                Cell: ({ row }) => row.original.snowflakeLogin ?? '—',
            },
            {
                accessorKey: 'twinName',
                header: 'AI identity',
                Cell: ({ row }) => (
                    <Stack gap={0}>
                        <Text fz="sm" className={classes.identityName}>
                            {row.original.twinName ?? '—'}
                        </Text>
                        {row.original.twinNameOverride && (
                            <Text fz="xs" c="dimmed">
                                override
                            </Text>
                        )}
                    </Stack>
                ),
            },
            {
                accessorKey: 'state',
                header: 'Status',
                size: 90,
                Cell: ({ row }) => (
                    <AiIdentityStatusIcon identity={row.original} />
                ),
            },
            {
                accessorKey: 'checkedAt',
                header: 'Last checked',
                Cell: ({ row }) => (
                    <Tooltip label={dateLabel(row.original.checkedAt)}>
                        <Text fz="sm">
                            {relativeDate(row.original.checkedAt)}
                        </Text>
                    </Tooltip>
                ),
            },
        ],
        [],
    );
    const table = useContentTable({
        columns,
        data: rows,
        getRowId: (row) => row.aiIdentityUuid,
        enablePagination: false,
        enableSorting: false,
        enableRowVirtualization: true,
        enableRowSelection: true,
        enableRowActions: true,
        enableTopToolbar: false,
        enableBottomToolbar: false,
        state: {
            isLoading: listQuery.isLoading,
            showProgressBars: listQuery.isFetching,
            rowSelection: selection,
        },
        onRowSelectionChange: (updater) => {
            setAllMatching(false);
            setSelection(
                typeof updater === 'function' ? updater(selection) : updater,
            );
        },
        renderRowActions: ({ row }) => (
            <Menu withinPortal>
                <Menu.Target>
                    <Button
                        size="xs"
                        variant="subtle"
                        onClick={(event) => event.stopPropagation()}
                    >
                        Actions
                    </Button>
                </Menu.Target>
                <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                    <Menu.Item
                        onClick={() => {
                            setRowError(null);
                            void aiIdentityApi
                                .test(row.original.aiIdentityUuid)
                                .then(() =>
                                    queryClient.invalidateQueries([
                                        'ai-identity-list',
                                    ]),
                                )
                                .catch(() =>
                                    setRowError(
                                        'Could not test this identity.',
                                    ),
                                );
                        }}
                    >
                        Test
                    </Menu.Item>
                    <Menu.Item
                        onClick={() => setKeyUuid(row.original.aiIdentityUuid)}
                    >
                        New key
                    </Menu.Item>
                    <Menu.Item
                        onClick={() =>
                            setDetailUuid(row.original.aiIdentityUuid)
                        }
                    >
                        Override name
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        ),
        mantineTableContainerProps: {
            ref: containerRef,
            onScroll,
            className: classes.tableContainer,
        },
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => setDetailUuid(row.original.aiIdentityUuid),
            className: classes.row,
        }),
        rowVirtualizerInstanceRef: virtualizerRef,
        rowVirtualizerProps: { estimateSize: () => 52, overscan: 10 },
    });

    return (
        <Stack gap="lg">
            <AiIdentityProvisioningTriage
                accountUuid={account.aiIdentityAccountUuid}
                onSetup={() => onParam('tab', 'setup')}
            />
            <AiIdentityTriageSummary
                account={account}
                filter={filter}
                result={result}
                job={job}
                onMultiParam={changeMultiParam}
                onJob={onJob}
            />
            <Text fz="xs" c="dimmed">
                SQL exports use:{' '}
                {account.roleTemplate ?? 'No roles in the script'}
            </Text>
            <AiIdentityTriageToolbar
                filter={filter}
                sort={sort}
                result={result}
                projects={projectsQuery.data}
                searchInput={searchInput}
                onSearchInput={onSearchInput}
                selectedCount={selectedCount}
                allMatching={allMatching}
                effectiveFilter={effectiveFilter}
                onSelectAll={() => setAllMatching(true)}
                onClear={clearSelection}
                onParam={changeParam}
                onMultiParam={changeMultiParam}
                onJob={onJob}
            />
            {listQuery.isError && (
                <Callout variant="danger">
                    Could not load identities.{' '}
                    <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => void listQuery.refetch()}
                    >
                        Retry
                    </Button>
                </Callout>
            )}
            {rowError && <Callout variant="danger">{rowError}</Callout>}
            {result && (
                <Text fz="xs" c="dimmed">
                    Showing {result.pagination.totalResults.toLocaleString()}{' '}
                    matching
                </Text>
            )}
            <ContentTable table={table} />
            <AiIdentityDetailDrawer
                uuid={detailUuid}
                onClose={() => setDetailUuid(null)}
                onShowGroup={(reason) => {
                    changeMultiParam('reason', [reason]);
                    setDetailUuid(null);
                }}
            />
            <MantineModal
                opened={!!keyUuid}
                onClose={() => setKeyUuid(null)}
                title="Create a new key?"
                role="alertdialog"
                description="This identity becomes Pending until the new public key is applied in Snowflake."
                confirmLabel="Create new key"
                onConfirm={() => {
                    if (!keyUuid) return;
                    setRowError(null);
                    void aiIdentityApi
                        .regenerateKey(keyUuid)
                        .then(() =>
                            queryClient.invalidateQueries(['ai-identity-list']),
                        )
                        .catch(() =>
                            setRowError('Could not create a new key.'),
                        );
                    setKeyUuid(null);
                }}
            />
        </Stack>
    );
};
