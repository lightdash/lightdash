import {
    isChartValidationError,
    isDashboardValidationError,
    ValidationErrorChartResponse,
    ValidationErrorDashboardResponse,
    ValidationResponse,
} from '@lightdash/common';
import { Alert, Flex, Table, Text, useMantineTheme } from '@mantine/core';
import {
    IconAlertCircle,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { createRef, FC, RefObject, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import MantineIcon from '../common/MantineIcon';
import { getChartIcon, IconBox } from '../common/ResourceIcon';
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

const UpdatedAtAndBy: FC<
    Required<
        | Pick<ValidationErrorChartResponse, 'lastUpdatedAt' | 'lastUpdatedBy'>
        | Pick<
              ValidationErrorDashboardResponse,
              'lastUpdatedAt' | 'lastUpdatedBy'
          >
    >
> = ({ lastUpdatedAt, lastUpdatedBy }) => {
    const timeAgo = useTimeAgo(lastUpdatedAt);

    return (
        <>
            <Text fw={500}>{timeAgo}</Text>
            <Text color="gray.6">by {lastUpdatedBy}</Text>
        </>
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
                    <th>Last edited</th>
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

                                      <Text fw={600}>
                                          {validationError.name}
                                      </Text>
                                  </Flex>
                              </td>
                              <td>
                                  <Alert
                                      icon={
                                          <MantineIcon icon={IconAlertCircle} />
                                      }
                                      pos="unset"
                                      color="red"
                                      fw={500}
                                  >
                                      <Text
                                          fz="xs"
                                          sx={{
                                              wordBreak: 'break-all',
                                          }}
                                      >
                                          {validationError.error}
                                      </Text>
                                  </Alert>
                              </td>
                              <td>
                                  {(isChartValidationError(validationError) ||
                                      isDashboardValidationError(
                                          validationError,
                                      )) &&
                                  validationError.lastUpdatedAt &&
                                  validationError.lastUpdatedBy ? (
                                      <UpdatedAtAndBy
                                          lastUpdatedAt={
                                              validationError.lastUpdatedAt
                                          }
                                          lastUpdatedBy={
                                              validationError.lastUpdatedBy
                                          }
                                      />
                                  ) : (
                                      <Text fw={500}>N/A</Text>
                                  )}
                              </td>
                          </tr>
                      ))
                    : null}
            </tbody>
        </Table>
    );
};
