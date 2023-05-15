import { ValidationResponse } from '@lightdash/common';
import { Flex, Paper, Table, Text } from '@mantine/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import { useValidation } from '../../hooks/validation/useValidation';
import { IconBox } from '../common/ResourceView/ResourceIcon';

const UpdatedAtAndBy: FC<
    Required<Pick<ValidationResponse, 'lastUpdatedAt' | 'lastUpdatedBy'>>
> = ({ lastUpdatedAt, lastUpdatedBy }) => {
    const timeAgo = useTimeAgo(lastUpdatedAt);

    return (
        <>
            <Text fw={500}>{timeAgo}</Text>
            by <Text fw={500}>{lastUpdatedBy}</Text>
        </>
    );
};

export const SettingsValidation: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data, isSuccess } = useValidation(projectUuid);
    const { classes } = useTableStyles();

    const Icon = ({
        validationError,
    }: {
        validationError: ValidationResponse;
    }) => {
        if (validationError.chartUuid)
            return <IconBox icon={IconChartBar} color="blue.8" />;
        if (validationError.dashboardUuid)
            return <IconBox icon={IconLayoutDashboard} color="green.8" />;
        return <IconBox icon={IconTable} color="indigo.6" />;
    };

    return (
        <>
            {isSuccess && (
                <Paper withBorder sx={{ overflow: 'hidden' }}>
                    <Table className={classes.root} highlightOnHover>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Error Details</th>
                                <th>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.map((validationError) => (
                                <tr key={validationError.name}>
                                    <td>
                                        <Flex gap="sm">
                                            <Icon
                                                validationError={
                                                    validationError
                                                }
                                            />

                                            <Text fw={500}>
                                                {validationError.name}
                                            </Text>
                                        </Flex>
                                    </td>
                                    <td>{validationError.error}</td>
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
                                            'N/A'
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Paper>
            )}
        </>
    );
};
