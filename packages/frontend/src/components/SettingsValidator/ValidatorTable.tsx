import { ValidationResponse } from '@lightdash/common';
import { Alert, clsx, Flex, Table, Text } from '@mantine/core';
import {
    IconAlertCircle,
    IconChartBar,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import MantineIcon from '../common/MantineIcon';
import { IconBox } from '../common/ResourceView/ResourceIcon';

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
        return <IconBox icon={IconChartBar} color="blue.8" />;
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
    const history = useHistory();
    const { classes } = useTableStyles();

    const handleOnValidationErrorClick = (
        validationError: ValidationResponse,
    ) => {
        if (!validationError.chartUuid && !validationError.dashboardUuid)
            return null;

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
                    ? data.map((validationError, index) => (
                          <tr
                              key={index}
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
