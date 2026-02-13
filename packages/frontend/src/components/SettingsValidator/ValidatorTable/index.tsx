import {
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    type ValidationErrorChartResponse,
    type ValidationErrorDashboardResponse,
    type ValidationResponse,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Flex,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconLayoutDashboard, IconTable, IconX } from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    type FC,
    type ReactNode,
    type UIEvent,
} from 'react';
import { useDeleteValidation } from '../../../hooks/validation/useValidation';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon, IconBox } from '../../common/ResourceIcon';
import { getLinkToResource } from '../utils/utils';
import { ErrorMessage } from './ErrorMessage';
import classes from './ValidatorTable.module.css';

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
    children: ReactNode;
}> = ({ validationError, projectUuid, children }) => {
    return (
        <Anchor
            href={getLinkToResource(validationError, projectUuid)}
            target="_blank"
            className={classes.anchorUnstyled}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.stopPropagation();
            }}
        >
            {children}
        </Anchor>
    );
};

const ValidatorTableRow = forwardRef<
    HTMLTableRowElement,
    {
        projectUuid: string;
        validationError: ValidationResponse;
        onSelectValidationError: (validationError: ValidationResponse) => void;
        isPinned?: boolean;
        onUnpin?: () => void;
        onDelete: (validationId: number) => void;
        'data-index'?: number;
    }
>(
    (
        {
            projectUuid,
            validationError,
            onSelectValidationError,
            isPinned,
            onUnpin,
            onDelete,
            'data-index': dataIndex,
        },
        ref,
    ) => {
        return (
            <Table.Tr
                ref={ref}
                data-index={dataIndex}
                className={
                    isPinned
                        ? `${classes.pinnedRow} ${classes.pinnedRowFlash}`
                        : undefined
                }
            >
                <Table.Td>
                    <AnchorToResource
                        validationError={validationError}
                        projectUuid={projectUuid}
                    >
                        <Flex gap="sm" align="center">
                            <Icon validationError={validationError} />
                            <Stack gap={2}>
                                <Text fw={600} fz="sm">
                                    {getErrorName(validationError)}
                                </Text>
                                {(isChartValidationError(validationError) ||
                                    isDashboardValidationError(
                                        validationError,
                                    )) &&
                                    !isDeleted(validationError) && (
                                        <Text fz="xs" c="ldGray.6">
                                            {getViews(validationError)} view
                                            {getViews(validationError) === 1
                                                ? ''
                                                : 's'}
                                            {validationError.lastUpdatedBy ? (
                                                <>
                                                    {' • '}
                                                    Last edited by{' '}
                                                    <Text span fw={500} fz="xs">
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
                </Table.Td>
                <Table.Td>
                    <AnchorToResource
                        validationError={validationError}
                        projectUuid={projectUuid}
                    >
                        <ErrorMessage validationError={validationError} />
                    </AnchorToResource>
                </Table.Td>
                <Table.Td>
                    <Flex gap="xs" align="center" justify="flex-end">
                        {isChartValidationError(validationError) && (
                            <Button
                                variant="outline"
                                size="compact-xs"
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    onSelectValidationError(validationError);
                                    e.stopPropagation();
                                }}
                            >
                                Fix
                            </Button>
                        )}
                        <Tooltip label="Dismiss error" position="top">
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    if (isPinned && onUnpin) {
                                        onUnpin();
                                    } else {
                                        onDelete(validationError.validationId);
                                    }
                                    e.stopPropagation();
                                }}
                            >
                                <MantineIcon
                                    icon={IconX}
                                    size="md"
                                    color="ldGray.6"
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Flex>
                </Table.Td>
            </Table.Tr>
        );
    },
);

export const ValidatorTable: FC<{
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
}> = ({
    data,
    projectUuid,
    onSelectValidationError,
    isFetching,
    totalDBRowCount,
    fetchNextPage,
    pinnedValidation,
    onUnpin,
}) => {
    const { mutate: deleteValidation } = useDeleteValidation(projectUuid);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                if (
                    scrollHeight - scrollTop - clientHeight < 400 &&
                    !isFetching &&
                    data.length < totalDBRowCount
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, data.length, totalDBRowCount],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const rowVirtualizer = useVirtualizer({
        count: data.length,
        getScrollElement: () => tableContainerRef.current,
        estimateSize: () => 60,
        overscan: 10,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();
    const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? totalSize - virtualRows[virtualRows.length - 1].end
            : 0;

    return (
        <div
            ref={tableContainerRef}
            className={classes.scrollContainer}
            onScroll={(event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement)
            }
        >
            <Table className={classes.table} highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w="45%">Name</Table.Th>
                        <Table.Th>Error</Table.Th>
                        <Table.Th w={120} />
                    </Table.Tr>
                </Table.Thead>
                {pinnedValidation && onUnpin && (
                    <Table.Tbody>
                        <ValidatorTableRow
                            key={`pinned-${pinnedValidation.validationId}`}
                            projectUuid={projectUuid}
                            validationError={pinnedValidation}
                            onSelectValidationError={onSelectValidationError}
                            isPinned
                            onUnpin={onUnpin}
                            onDelete={deleteValidation}
                        />
                    </Table.Tbody>
                )}
                <Table.Tbody>
                    {paddingTop > 0 && (
                        <Table.Tr>
                            <Table.Td
                                colSpan={3}
                                style={{
                                    height: paddingTop,
                                    padding: 0,
                                    border: 'none',
                                }}
                            />
                        </Table.Tr>
                    )}
                    {virtualRows.map((virtualRow) => {
                        const validationError = data[virtualRow.index];
                        return (
                            <ValidatorTableRow
                                key={validationError.validationId}
                                ref={rowVirtualizer.measureElement}
                                data-index={virtualRow.index}
                                projectUuid={projectUuid}
                                validationError={validationError}
                                onSelectValidationError={
                                    onSelectValidationError
                                }
                                onDelete={deleteValidation}
                            />
                        );
                    })}
                    {paddingBottom > 0 && (
                        <Table.Tr>
                            <Table.Td
                                colSpan={3}
                                style={{
                                    height: paddingBottom,
                                    padding: 0,
                                    border: 'none',
                                }}
                            />
                        </Table.Tr>
                    )}
                </Table.Tbody>
            </Table>
        </div>
    );
};
