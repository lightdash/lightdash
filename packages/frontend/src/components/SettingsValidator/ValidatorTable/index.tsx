import {
    isChartValidationError,
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
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconLayoutDashboard,
    IconTable,
    IconX,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type UIEvent,
} from 'react';
import { useDeleteValidation } from '../../../hooks/validation/useValidation';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon, IconBox } from '../../common/ResourceIcon';
import { getLinkToResource } from '../utils/utils';
import { ErrorMessage } from './ErrorMessage';
import classes from './ValidatorTable.module.css';
import { ValidatorTableTopToolbar } from './ValidatorTableTopToolbar';

const isDeleted = (validationError: ValidationResponse) =>
    (isChartValidationError(validationError) && !validationError.chartUuid) ||
    (isDashboardValidationError(validationError) &&
        !validationError.dashboardUuid);

const Icon = ({ validationError }: { validationError: ValidationResponse }) => {
    if (isChartValidationError(validationError))
        return <ChartIcon chartKind={validationError.chartKind} />;
    if (isDashboardValidationError(validationError))
        return <IconBox icon={IconLayoutDashboard} color="green.8" />;
    return <IconBox icon={IconTable} color="indigo.6" />;
};

const getErrorName = (validationError: ValidationResponse) => {
    if (
        isChartValidationError(validationError) ||
        isDashboardValidationError(validationError)
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
}) => {
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const { mutate: deleteValidation } = useDeleteValidation(projectUuid);

    // Combine pinned validation with data for display
    const tableData = useMemo(() => {
        if (pinnedValidation) {
            return [pinnedValidation, ...data];
        }
        return data;
    }, [data, pinnedValidation]);

    // Workaround for memoization issue with mantine-react-table
    const [displayData, setDisplayData] = useState<ValidationResponse[]>([]);
    useEffect(() => {
        setDisplayData(tableData);
    }, [tableData]);

    const totalFetched = data.length;

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                if (
                    scrollHeight - scrollTop - clientHeight < 400 &&
                    !isFetching &&
                    totalFetched < totalDBRowCount
                ) {
                    fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, totalFetched, totalDBRowCount],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns: MRT_ColumnDef<ValidationResponse>[] = useMemo(
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
                                                {validationError.lastUpdatedBy ? (
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

    const table = useMantineReactTable({
        columns,
        data: displayData,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: false,
        enableRowVirtualization: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        enableRowActions: false,
        getRowId: (row) => row.validationUuid,
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
            />
        ),
        mantinePaperProps: {
            shadow: undefined,
            className: classes.paper,
        },
        mantineTableHeadRowProps: {
            className: classes.headerRow,
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            className: classes.tableContainer,
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
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
        icons: {
            IconArrowsSort: () => (
                <MantineIcon icon={IconArrowsSort} size="md" color="ldGray.5" />
            ),
            IconSortAscending: () => (
                <MantineIcon icon={IconArrowUp} size="md" color="blue.6" />
            ),
            IconSortDescending: () => (
                <MantineIcon icon={IconArrowDown} size="md" color="blue.6" />
            ),
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
        },
    });

    return <MantineReactTable table={table} />;
};
