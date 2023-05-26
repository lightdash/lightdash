import { ValidationResponse } from '@lightdash/common';
import { Alert, clsx, Flex, Table, Text, useMantineTheme } from '@mantine/core';
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
import { getChartIcon, IconBox } from '../common/ResourceView/ResourceIcon';
import { useScrollAndHighlight } from './hooks/useScrollAndHighlight';

const getLinkToResource = (
    validationError: ValidationResponse,
    projectUuid: string,
) => {
    if (validationError.chartUuid)
        return `/projects/${projectUuid}/saved/${validationError.chartUuid}`;
    if (validationError.dashboardUuid) {
        return `/projects/${projectUuid}/dashboards/${validationError.dashboardUuid}/view`;
    }

    return;
};

const Icon = ({ validationError }: { validationError: ValidationResponse }) => {
    if (validationError.chartUuid)
        return getChartIcon(validationError.chartType);
    if (validationError.dashboardUuid)
        return <IconBox icon={IconLayoutDashboard} color="green.8" />;
    return <IconBox icon={IconTable} color="indigo.6" />;
};

const UpdatedAtAndBy: FC<
    Required<Pick<ValidationResponse, 'lastUpdatedAt' | 'lastUpdatedBy'>>
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
    const { classes } = useTableStyles();
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
            className={clsx(
                classes.root,
                classes.smallHeaderText,
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
                                  {validationError.lastUpdatedAt &&
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
