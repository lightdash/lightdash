import {
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    ValidationErrorChartResponse,
    ValidationErrorDashboardResponse,
    ValidationResponse,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Flex,
    Stack,
    Table,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { mergeRefs, useHover } from '@mantine/hooks';
import { IconLayoutDashboard, IconTable, IconX } from '@tabler/icons-react';
import {
    createRef,
    FC,
    forwardRef,
    ReactNode,
    RefObject,
    useMemo,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useDeleteValidation } from '../../../hooks/validation/useValidation';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon, IconBox } from '../../common/ResourceIcon';
import { ErrorMessage } from './ErrorMessage';
import { useScrollAndHighlight } from './hooks/useScrollAndHighlight';

const getLinkToResource = (
    validationError: ValidationResponse,
    projectUuid: string,
) => {
    if (isChartValidationError(validationError) && validationError.chartUuid)
        return `/projects/${projectUuid}/saved/${validationError.chartUuid}`;

    if (
        isDashboardValidationError(validationError) &&
        validationError.dashboardUuid
    )
        return `/projects/${projectUuid}/dashboards/${validationError.dashboardUuid}/view`;

    return;
};

const isDeleted = (validationError: ValidationResponse) =>
    (isChartValidationError(validationError) && !validationError.chartUuid) ||
    (isDashboardValidationError(validationError) &&
        !validationError.dashboardUuid);

const Icon = ({ validationError }: { validationError: ValidationResponse }) => {
    if (isChartValidationError(validationError))
        return <ChartIcon chartType={validationError.chartType} />;
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
            onClick={(e) => {
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
    }
>(({ projectUuid, validationError }, ref) => {
    const { mutate: deleteValidation } = useDeleteValidation(projectUuid);

    const { hovered, ref: isHoveredRef } = useHover<HTMLTableRowElement>();

    return (
        <tr ref={mergeRefs(ref, isHoveredRef)}>
            <td>
                <AnchorToResource
                    validationError={validationError}
                    projectUuid={projectUuid}
                >
                    <Flex gap="sm" align="center">
                        <Icon validationError={validationError} />

                        <Stack spacing={4}>
                            {isDeleted(validationError) ? (
                                <Tooltip
                                    label={`This ${
                                        isChartValidationError(validationError)
                                            ? 'chart'
                                            : 'dashboard'
                                    } has been deleted`}
                                >
                                    <Text fw={600} color={'gray.6'}>
                                        {getErrorName(validationError)}
                                    </Text>
                                </Tooltip>
                            ) : (
                                <Text fw={600}>
                                    {getErrorName(validationError)}
                                </Text>
                            )}

                            {(isChartValidationError(validationError) ||
                                isDashboardValidationError(validationError)) &&
                                !isDeleted(validationError) && (
                                    <Text fz={11} color="gray.6">
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
                <Tooltip label="Dismiss error" position="top">
                    <Box w={24}>
                        {hovered && (
                            <ActionIcon
                                onClick={(e) => {
                                    deleteValidation(
                                        validationError.validationId,
                                    );
                                    e.stopPropagation();
                                }}
                            >
                                <MantineIcon
                                    icon={IconX}
                                    size="lg"
                                    color="gray.6"
                                />
                            </ActionIcon>
                        )}
                    </Box>
                </Tooltip>
            </td>
        </tr>
    );
});

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
