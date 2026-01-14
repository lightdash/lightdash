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
import {
    createRef,
    forwardRef,
    useMemo,
    type FC,
    type ReactNode,
    type RefObject,
} from 'react';
import { useLocation } from 'react-router';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useDeleteValidation } from '../../../hooks/validation/useValidation';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon, IconBox } from '../../common/ResourceIcon';
import { getLinkToResource } from '../utils/utils';
import { ErrorMessage } from './ErrorMessage';
import { useScrollAndHighlight } from './hooks/useScrollAndHighlight';

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
    }
>(({ projectUuid, validationError, onSelectValidationError }, ref) => {
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
                            <Text fw={600}>
                                {getErrorName(validationError)}
                            </Text>

                            {(isChartValidationError(validationError) ||
                                isDashboardValidationError(validationError)) &&
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
                    {hovered && isChartValidationError(validationError) && (
                        <Button
                            variant="outline"
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
                </Box>
            </td>
            <td>
                <Tooltip label="Dismiss error" position="top">
                    <Box w={24}>
                        {hovered && (
                            <ActionIcon
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    deleteValidation(
                                        validationError.validationId,
                                    );
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
});

export const ValidatorTable: FC<{
    data: ValidationResponse[];
    projectUuid: string;
    onSelectValidationError: (validationError: ValidationResponse) => void;
}> = ({ data, projectUuid, onSelectValidationError }) => {
    const { cx, classes } = useTableStyles();
    const { colors } = useMantineTheme();

    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const validationId = searchParams.get('validationId');
    const refs = useMemo(
        () =>
            data.reduce((acc, value) => {
                acc[value.validationId.toString()] =
                    createRef<HTMLTableRowElement | null>();
                return acc;
            }, {} as { [key: string]: RefObject<HTMLTableRowElement | null> }),
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
                              onSelectValidationError={onSelectValidationError}
                          />
                      ))
                    : null}
            </tbody>
        </Table>
    );
};
