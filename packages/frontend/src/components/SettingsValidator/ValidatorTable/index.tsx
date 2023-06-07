import {
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ValidationErrorChartResponse,
    ValidationErrorDashboardResponse,
    ValidationResponse,
} from '@lightdash/common';
import {
    Box,
    Flex,
    Stack,
    Table,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { mergeRefs, useHover } from '@mantine/hooks';
import {
    IconCircleX,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { createRef, FC, RefObject, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useDeleteValidation } from '../../../hooks/validation/useValidation';
import { getChartIcon, IconBox } from '../../common/ResourceIcon';
import { ErrorMessage } from './ErrorMessage';
import { useScrollAndHighlight } from './hooks/useScrollAndHighlight';

const getLinkToResource = (
    validationError: ValidationResponse,
    projectUuid: string,
) => {
    if (isChartValidationError(validationError))
        return `/projects/${projectUuid}/saved/${validationError.chartUuid}`;

    if (isDashboardValidationError(validationError))
        return `/projects/${projectUuid}/dashboards/${validationError.dashboardUuid}/view`;

    return;
};

const Icon = ({ validationError }: { validationError: ValidationResponse }) => {
    if (isChartValidationError(validationError))
        return getChartIcon(validationError.chartType);
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

const handleOnValidationErrorClick = (
    projectUuid: string,
    validationError: ValidationResponse,
    history: ReturnType<typeof useHistory>,
) => {
    const link = getLinkToResource(validationError, projectUuid);
    if (link) history.push(link);
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

const TableValidationItem: FC<{
    projectUuid: string;
    validationError: ValidationResponse;
    ref: RefObject<HTMLTableRowElement>;
}> = ({ projectUuid, validationError, ref }) => {
    const { mutate: deleteValidation } = useDeleteValidation(projectUuid);
    const history = useHistory();
    const theme = useMantineTheme();

    const { hovered, ref: isHoveredRef } = useHover<HTMLTableRowElement>();

    return (
        <tr
            ref={mergeRefs(ref, isHoveredRef)}
            onClick={() =>
                handleOnValidationErrorClick(
                    projectUuid,
                    validationError,
                    history,
                )
            }
        >
            <td>
                <Flex gap="sm" align="center">
                    <Icon validationError={validationError} />

                    <Stack spacing={4}>
                        <Text fw={600}>{getErrorName(validationError)}</Text>

                        {(isChartValidationError(validationError) ||
                            isDashboardValidationError(validationError)) && (
                            <Text fz={11} color="gray.6">
                                {getViews(validationError)} view
                                {getViews(validationError) === 1 ? '' : 's'}
                                {' • '}
                                {validationError.lastUpdatedBy ? (
                                    <>
                                        Last edited by{' '}
                                        <Text span fw={500}>
                                            {validationError.lastUpdatedBy}
                                        </Text>
                                    </>
                                ) : null}
                            </Text>
                        )}
                    </Stack>
                </Flex>
            </td>
            <td>
                <ErrorMessage validationError={validationError} />
            </td>
            <td>
                <Tooltip label="Dismiss error" position="top">
                    <Box w={24} h={24}>
                        {hovered && (
                            <IconCircleX
                                color={theme.colors.gray[6]}
                                onClick={(e) => {
                                    deleteValidation(
                                        validationError.validationId,
                                    );
                                    e.stopPropagation();
                                }}
                            />
                        )}
                    </Box>
                </Tooltip>
            </td>
        </tr>
    );
};
export const ValidatorTable: FC<{
    data: ValidationResponse[];
    projectUuid: string;
}> = ({ data, projectUuid }) => {
    const { cx, classes } = useTableStyles();
    const { colors } = useMantineTheme();

    const location = useLocation<{ validationId: number }>();
    const searchParams = new URLSearchParams(location.search);
    const validationId = searchParams.get('validationId');
    const refs = useMemo(
        () =>
            data.reduce((acc, value) => {
                acc[value.validationId.toString()] = createRef();
                return acc;
            }, {} as { [key: string]: RefObject<HTMLTableRowElement> }),
        [data],
    );

    useScrollAndHighlight(refs, validationId, colors);

    return (
        <Table
            className={cx(
                classes.root,
                classes.smallPadding,
                classes.stickyHeader,
            )}
            fontSize="xs"
            highlightOnHover
        >
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Error</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                {data && data.length
                    ? data.map((validationError) => (
                          <TableValidationItem
                              key={validationError.validationId}
                              projectUuid={projectUuid}
                              validationError={validationError}
                              ref={refs[validationError.validationId]}
                          />
                      ))
                    : null}
            </tbody>
        </Table>
    );
};
