import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { PasswordInput, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';

export const WarehouseFormInputs: FC<{
    disabled: boolean;
    form: UseFormReturnType<UpsertUserWarehouseCredentials>;
}> = ({ form, disabled }) => {
    switch (form.values.credentials.type) {
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return (
                <>
                    <TextInput
                        required
                        size="xs"
                        label="Username/email"
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    <PasswordInput
                        required
                        size="xs"
                        label="Password"
                        disabled={disabled}
                        {...form.getInputProps('credentials.password')}
                    />
                </>
            );
        case WarehouseTypes.BIGQUERY:
            return <>{/* Add key file content input - JSON? */}</>;
        case WarehouseTypes.DATABRICKS:
            return <>{/* Add personal access token input */}</>;
        case WarehouseTypes.ATHENA:
            return <>{/* Add AWS credentials input */}</>;
        default:
            return null;
    }
};
