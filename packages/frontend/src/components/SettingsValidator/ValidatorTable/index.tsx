import {
    isChartValidationError,
    isDataAppValidationError,
    isDashboardValidationError,
    isFixableDashboardValidationError,
    isTableValidationError,
    type ValidationErrorChartResponse,
    type ValidationErrorDashboardResponse,
    type ValidationResponse,
    type ValidationSourceType,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Flex,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAppWindow,
    IconLayoutDashboard,
    IconTable,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, useRef, type FC } from 'react';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { useDeleteValidation } from '../../../hooks/validation/useValidation';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableVirtualizer,
} from '../../common/ContentTable';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon, IconBox } from '../../common/ResourceIcon';
import {
    dedupeContentItems,
    getDeletableContentItem,
    type ValidationContentItem,
} from '../utils/deletableContent';
import { getLinkToResource } from '../utils/utils';
import { ErrorMessage } from './ErrorMessage';
import classes from './ValidatorTable.module.css';
import { ValidatorTableTopToolbar } from './ValidatorTableTopToolbar';

const isDeleted = (validationError: ValidationResponse) =>
    (isChartValidationError(validationError) && !validationError.chartUuid) ||
    (isDashboardValidationError(validationError) &&
        !validationError.dashboardUuid) ||
    (isDataAppValidationError(validationError) && !validationError.appUuid);

const Icon = ({ validationError }: { validationError: ValidationResponse }) => {
    if (isChartValidationError(validationError))
        return <ChartIcon chartKind={validationError.chartKind} />;
    if (isDashboardValidationError(validationError))
        return <IconBox icon={IconLayoutDashboard} color="green.8" />;
    if (isDataAppValidationError(validationError))
        return <IconBox icon={IconAppWindow} color="orange.6" />;
    return <IconBox icon={IconTable} color="indigo.6" />;
};

const getErrorName = (validationError: ValidationResponse) => {
    if (
        isChartValidationError(validationError) ||
        isDashboardValidationError(validationError) ||
        isDataAppValidationError(validationError)
    )
        return validationError.name;
    if (isTableValidationError(validationError))
        return validationError.name ?? 'Table';
};

const getViews = (
    validationError:
        | ValidationErrorChartResponse
        | ValidationErrorDashboardResponse,
) => {
    if ('chartViews' in validationError) return validationError.chartViews;
    if ('dashboardViews' in validationError)
        return validationError.dashboardViews;
};

const AnchorToResource: FC<{
    validationError: ValidationResponse;
    projectUuid: string;
    children: React.ReactNode;
}> = ({ validationError, projectUuid, children }) => {
    return (
        <Anchor
            href={getLinkToResource(validationError, projectUuid)}
            target="_blank"
            c="unset"
            className={classes.anchor}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.stopPropagation();
            }}
        >
            {children}
        </Anchor>
    );
};

export type ValidatorTableProps = {
    data: ValidationResponse[];
    projectUuid: string;
    onSelectValidationError: (validationError: ValidationResponse) => void;
    isFetching: boolean;
    isLoading: boolean;
    isError: boolean;
    totalDBRowCount: number;
    fetchNextPage: () => void;
    pinnedValidation?: ValidationResponse | null;
    onUnpin?: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    sourceTypeFilter: ValidationSourceType[];
    setSourceTypeFilter: (types: ValidationSourceType[]) => void;
    showConfigWarnings: boolean;
    setShowConfigWarnings: (show: boolean) => void;
    lastValidatedAt: Date | null;
    flush?: boolean;
    rowSelection: Record<string, boolean>;
    setRowSelection: (selection: Record<string, boolean>) => void;
    onBulkDelete: (items: ValidationContentItem[]) => void;
};

export const ValidatorTable: FC<ValidatorTableProps> = ({
    data,
    projectUuid,
    onSelectValidationError,
    isFetching,
    isLoading,
    isError,
    totalDBRowCount,
    fetchNextPage,
    pinnedValidation,
    onUnpin,
    searchQuery,
    setSearchQuery,
    sourceTypeFilter,
    setSourceTypeFilter,
    showConfigWarnings,
    setShowConfigWarnings,
    lastValidatedAt,
    flush = false,
    rowSelection,
    setRowSelection,
    onBulkDelete,
}) => {
    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );

    const { mutate: deleteValidation } = useDeleteValidation(projectUuid);

    // Combine pinned validation with data for display
    const tableData = useMemo(() => {
        if (pinnedValidation) {
            return [pinnedValidation, ...data];
        }
        return data;
    }, [data, pinnedValidation]);

    const totalFetched = data.length;

    const selectedCount = useMemo(
        () => Object.values(rowSelection).filter(Boolean).length,
        [rowSelection],
    );

    const handleDeleteSelected = useCallback(() => {
        const items = dedupeContentItems(
            tableData.flatMap((validationError) => {
                if (!rowSelection[validationError.validationUuid]) return [];
                const item = getDeletableContentItem(validationError);
                return item ? [item] : [];
            }),
        );
        if (items.length > 0) onBulkDelete(items);
    }, [tableData, rowSelection, onBulkDelete]);

    const handleClearSelection = useCallback(
        () => setRowSelection({}),
        [setRowSelection],
    );

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: totalFetched < totalDBRowCount,
        threshold: 400,
    });

    const columns: ContentTableColumnDef<ValidationResponse>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                enableSorting: false,
                size: 300,
                Cell: ({ row }) => {
                    const validationError = row.original;
                    return (
                        <AnchorToResource
                            validationError={validationError}
                            projectUuid={projectUuid}
                        >
                            <Flex gap="sm" align="flex-start">
                                <Icon validationError={validationError} />
                                <Stack gap={2}>
                                    <Text fz="xs" fw={600}>
                                        {getErrorName(validationError)}
                                    </Text>
                                    {(isChartValidationError(validationError) ||
                                        isDashboardValidationError(
                                            validationError,
                                        )) &&
                                        !isDeleted(validationError) && (
                                            <Text fz={10} c="ldGray.6">
                                                {getViews(validationError)} view
                                                {getViews(validationError) === 1
                                                    ? ''
                                                    : 's'}
                                                {'lastUpdatedBy' in
                                                    validationError &&
                                                validationError.lastUpdatedBy ? (
                                                    <>
                                                        {' • '}
                                                        Last edited by{' '}
                                                        <Text
                                                            span
                                                            fw={500}
                                                            fz={10}
                                                        >
                                                            {
                                                                validationError.lastUpdatedBy
                                                            }
                                                        </Text>
                                                    </>
                                                ) : null}
                                            </Text>
                                        )}
                                </Stack>
                            </Flex>
                        </AnchorToResource>
                    );
                },
            },
            {
                accessorKey: 'error',
                header: 'Error',
                enableSorting: false,
                size: 400,
                Cell: ({ row }) => {
                    const validationError = row.original;
                    return (
                        <AnchorToResource
                            validationError={validationError}
                            projectUuid={projectUuid}
                        >
                            <ErrorMessage validationError={validationError} />
                        </AnchorToResource>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 70,
                Cell: ({ row }) => {
                    const validationError = row.original;
                    const isPinned =
                        pinnedValidation?.validationUuid ===
                        validationError.validationUuid;

                    return (
                        <Flex
                            gap="xs"
                            justify="flex-end"
                            align="center"
                            className={classes.actions}
                        >
                            <Tooltip label="Dismiss Error" position="top">
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="xs"
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        if (isPinned && onUnpin) {
                                            onUnpin();
                                        } else {
                                            deleteValidation(
                                                validationError.validationUuid,
                                            );
                                        }
                                        e.stopPropagation();
                                    }}
                                >
                                    <MantineIcon
                                        icon={IconX}
                                        size="lg"
                                        color="ldGray.6"
                                    />
                                </ActionIcon>
                            </Tooltip>
                            {(isChartValidationError(validationError) ||
                                isFixableDashboardValidationError(
                                    validationError,
                                )) && (
                                <Button
                                    variant="default"
                                    size="compact-xs"
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        onSelectValidationError(
                                            validationError,
                                        );
                                        e.stopPropagation();
                                    }}
                                >
                                    Fix
                                </Button>
                            )}
                        </Flex>
                    );
                },
            },
        ],
        [
            projectUuid,
            pinnedValidation,
            onSelectValidationError,
            onUnpin,
            deleteValidation,
        ],
    );

    const table = useContentTable({
        columns,
        data: tableData,
        enableColumnResizing: false,
        enablePagination: false,
        enableSorting: false,
        enableRowVirtualization: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        enableRowActions: false,
        enableRowSelection: (row) =>
            getDeletableContentItem(row.original) !== null,
        getRowId: (row) => row.validationUuid,
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
            rowSelection,
        },
        onRowSelectionChange: (updater) =>
            setRowSelection(
                typeof updater === 'function' ? updater(rowSelection) : updater,
            ),
        renderTopToolbar: () => (
            <ValidatorTableTopToolbar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sourceTypeFilter={sourceTypeFilter}
                setSourceTypeFilter={setSourceTypeFilter}
                showConfigWarnings={showConfigWarnings}
                setShowConfigWarnings={setShowConfigWarnings}
                totalResults={totalDBRowCount}
                lastValidatedAt={lastValidatedAt}
                isFetching={isFetching || isLoading}
                selectedCount={selectedCount}
                onDeleteSelected={handleDeleteSelected}
                onClearSelection={handleClearSelection}
            />
        ),
        mantinePaperProps: {
            shadow: undefined,
            className: flush ? classes.paperFlush : classes.paper,
        },
        mantineTableHeadRowProps: {
            className: classes.headerRow,
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            className: classes.tableContainer,
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: false,
        },
        mantineTableBodyRowProps: ({ row }) => {
            const isPinned =
                pinnedValidation?.validationUuid ===
                row.original.validationUuid;
            return {
                className: isPinned ? classes.pinnedRow : classes.row,
            };
        },
        mantineTableHeadCellProps: {
            h: '3xl',
            pos: 'relative',
            className: classes.headerCell,
        },
        mantineTableBodyCellProps: {
            className: classes.bodyCell,
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { estimateSize: () => 44, overscan: 10 },
    });

    return <ContentTable table={table} />;
};
