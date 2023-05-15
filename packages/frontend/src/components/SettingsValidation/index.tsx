import { clsx, Paper, Table } from '@mantine/core';
import { FC } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useValidation } from '../../hooks/validation/useValidation';

export const SettingsValidation: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data, isSuccess } = useValidation(projectUuid);
    const { classes } = useTableStyles();

    return (
        <>
            {isSuccess && (
                <Paper withBorder sx={{ overflow: 'hidden' }}>
                    <Table
                        className={clsx(classes.root, classes.alignLastTdRight)}
                        highlightOnHover
                    >
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Error Details</th>
                                <th>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.map(
                                ({ name, error, ...validationError }) => (
                                    <tr key={name}>
                                        <td>{name}</td>
                                        <td>{error}</td>
                                        <td>
                                            {validationError.lastUpdatedAt &&
                                            validationError.lastUpdatedBy
                                                ? `${validationError.lastUpdatedAt} by ${validationError.lastUpdatedBy}`
                                                : 'N/A'}
                                        </td>
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </Table>
                </Paper>
            )}
        </>
    );
};
