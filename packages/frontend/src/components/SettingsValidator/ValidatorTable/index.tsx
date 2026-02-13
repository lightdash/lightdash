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
    Box,
    Button,
    Flex,
    Stack,
    Table,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { mergeRefs, useHover } from '@mantine/hooks';
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
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useDeleteValidation } from '../../../hooks/validation/useValidation';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon, IconBox } from '../../common/ResourceIcon';
import { getLinkToResource } from '../utils/utils';
import { ErrorMessage } from './ErrorMessage';
import pinnedStyles from './ValidatorTable.module.css';

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
            sx={{
                color: 'unset',
                ':hover': {
                    color: 'unset',
                    textDecoration: 'none',
                },
            }}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.stopPropagation();
            }}
        >
            {children}
        </Anchor>
    );
};

const TableValidationItem = forwardRef<
    HTMLTableRowElement,
    {
        projectUuid: string;
        validationError: ValidationResponse;
        onSelectValidationError: (validationError: ValidationResponse) => void;
        isPinned?: boolean;
        onUnpin?: () => void;
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
            'data-index': dataIndex,
        },
        ref,
    ) => {
        const theme = useMantineTheme();
        const { mutate: deleteValidation } = useDeleteValidation(projectUuid);
        const highlightRef = useRef<HTMLTableRowElement>(null);

        const { hovered, ref: isHoveredRef } = useHover<HTMLTableRowElement>();

        useEffect(() => {
            if (isPinned && highlightRef.current) {
                highlightRef.current.animate(
                    [
                        {
                            backgroundColor: 'transparent',
                            borderRadius: theme.radius.sm,
                        },
                        {
                            backgroundColor: theme.colors.yellow[1],
                            borderRadius: theme.radius.sm,
                        },
                        {
                            backgroundColor: 'transparent',
                            borderRadius: theme.radius.sm,
                        },
                    ],
                    { duration: 4000, iterations: 2 },
                );
            }
        }, [isPinned, theme.colors.yellow, theme.radius.sm]);

        const showDismiss = isPinned || hovered;

        return (
            <tr
                ref={mergeRefs(ref, isHoveredRef, highlightRef)}
                data-index={dataIndex}
                className={isPinned ? pinnedStyles.pinnedRow : undefined}
            >
                <td>
                    <AnchorToResource
                        validationError={validationError}
                        projectUuid={projectUuid}
                    >
                        <Flex gap="sm" align="center">
                            <Icon validationError={validationError} />

                            <Stack spacing={4}>
                                <Text fw={600}>
                                    {getErrorName(validationError)}
                                </Text>

                                {(isChartValidationError(validationError) ||
                                    isDashboardValidationError(
                                        validationError,
                                    )) &&
                                    !isDeleted(validationError) && (
                                        <Text fz={11} color="ldGray.6">
                                            {getViews(validationError)} view
                                            {getViews(validationError) === 1
                                                ? ''
                                                : 's'}
                                            {validationError.lastUpdatedBy ? (
                                                <>
                                                    {' • '}
                                                    Last edited by{' '}
                                                    <Text span fw={500}>
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
                </td>
                <td>
                    <AnchorToResource
                        validationError={validationError}
                        projectUuid={projectUuid}
                    >
                        <ErrorMessage validationError={validationError} />
                    </AnchorToResource>
                </td>
                <td>
                    <Box w={24}>
                        {(isPinned || hovered) &&
                            isChartValidationError(validationError) && (
                                <Button
                                    variant="outline"
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
                    </Box>
                </td>
                <td>
                    <Tooltip label="Dismiss error" position="top">
                        <Box w={24}>
                            {showDismiss && (
                                <ActionIcon
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        if (isPinned && onUnpin) {
                                            onUnpin();
                                        } else {
                                            deleteValidation(
                                                validationError.validationId,
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
                            )}
                        </Box>
                    </Tooltip>
                </td>
            </tr>
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
    const { cx, classes } = useTableStyles();
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
        estimateSize: () => 65,
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
            style={{
                overflowY: 'auto',
                maxHeight: 'calc(100dvh - 350px)',
            }}
            onScroll={(event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement)
            }
        >
            <Table
                className={cx(
                    classes.root,
                    classes.smallPadding,
                    classes.stickyHeader,
                    classes.noRoundedCorners,
                )}
                fontSize="xs"
                highlightOnHover
            >
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Error</th>
                        <th></th>
                        <th></th>
                    </tr>
                </thead>
                {pinnedValidation && onUnpin && (
                    <tbody>
                        <TableValidationItem
                            projectUuid={projectUuid}
                            validationError={pinnedValidation}
                            onSelectValidationError={onSelectValidationError}
                            isPinned
                            onUnpin={onUnpin}
                        />
                    </tbody>
                )}
                <tbody>
                    {paddingTop > 0 && (
                        <tr>
                            <td
                                colSpan={4}
                                style={{
                                    height: paddingTop,
                                    padding: 0,
                                    border: 'none',
                                }}
                            />
                        </tr>
                    )}
                    {virtualRows.map((virtualRow) => {
                        const validationError = data[virtualRow.index];
                        return (
                            <TableValidationItem
                                key={validationError.validationId}
                                data-index={virtualRow.index}
                                projectUuid={projectUuid}
                                validationError={validationError}
                                onSelectValidationError={
                                    onSelectValidationError
                                }
                            />
                        );
                    })}
                    {paddingBottom > 0 && (
                        <tr>
                            <td
                                colSpan={4}
                                style={{
                                    height: paddingBottom,
                                    padding: 0,
                                    border: 'none',
                                }}
                            />
                        </tr>
                    )}
                </tbody>
            </Table>
        </div>
    );
};
