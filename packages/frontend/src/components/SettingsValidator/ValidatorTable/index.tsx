import {
    isChartValidationError,
    isDashboardValidationError,
    ValidationErrorChartResponse,
    ValidationErrorDashboardResponse,
    ValidationResponse,
} from '@lightdash/common';
import { Flex, Stack, Table, Text, useMantineTheme } from '@mantine/core';
import { IconLayoutDashboard, IconTable } from '@tabler/icons-react';
import { createRef, FC, RefObject, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
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

const UpdatedBy: FC<
    Required<
        | Pick<ValidationErrorChartResponse, 'lastUpdatedBy'>
        | Pick<ValidationErrorDashboardResponse, 'lastUpdatedBy'>
    >
> = ({ lastUpdatedBy }) => {
    return (
        <Text fz={11} color="gray.6">
            Last edited by{' '}
            <Text span fw={500}>
                {lastUpdatedBy}
            </Text>
        </Text>
    );
};

export const ValidatorTable: FC<{
    data: ValidationResponse[];
    projectUuid: string;
}> = ({ data, projectUuid }) => {
    const { cx, classes } = useTableStyles();
    const { colors } = useMantineTheme();

    const history = useHistory();
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

    const handleOnValidationErrorClick = (
        validationError: ValidationResponse,
    ) => {
        const link = getLinkToResource(validationError, projectUuid);
        if (link) history.push(link);
    };

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
                </tr>
            </thead>
            <tbody>
                {data && data.length
                    ? data.map((validationError) => (
                          <tr
                              key={validationError.validationId}
                              ref={refs[validationError.validationId]}
                              onClick={() =>
                                  handleOnValidationErrorClick(validationError)
                              }
                          >
                              <td>
                                  <Flex gap="sm" align="center">
                                      <Icon validationError={validationError} />

                                      <Stack spacing={4}>
                                          <Text fw={600}>
                                              {validationError.name}
                                          </Text>
                                          {(isChartValidationError(
                                              validationError,
                                          ) ||
                                              isDashboardValidationError(
                                                  validationError,
                                              )) &&
                                          validationError.lastUpdatedBy ? (
                                              <UpdatedBy
                                                  lastUpdatedBy={
                                                      validationError.lastUpdatedBy
                                                  }
                                              />
                                          ) : null}
                                      </Stack>
                                  </Flex>
                              </td>
                              <td>
                                  <ErrorMessage
                                      validationError={validationError}
                                  />
                              </td>
                          </tr>
                      ))
                    : null}
            </tbody>
        </Table>
    );
};
