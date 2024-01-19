import { WarehouseTypes } from '@lightdash/common';
import { PasswordInput, TextInput } from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { FC } from 'react';
import { CreateUserCredentials, UpdateUserCredentials } from './types';

export const WarehouseFormInputs: FC<{
    form:
        | UseFormReturnType<Pick<UpdateUserCredentials, 'name' | 'credentials'>>
        | UseFormReturnType<
              Pick<CreateUserCredentials, 'name'> & {
                  credentials: CreateUserCredentials['credentials'] | undefined;
              }
          >;
    userCredentialsType: WarehouseTypes;
}> = ({ form, userCredentialsType }) => {
    switch (userCredentialsType) {
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
                        {...form.getInputProps('credentials.username')}
                    />
                    <PasswordInput
                        required
                        size="xs"
                        label="Password"
                        {...form.getInputProps('credentials.password')}
                    />
                </>
            );
        case WarehouseTypes.BIGQUERY:
            return <>{/* Add key file content input - JSON? */}</>;
        case WarehouseTypes.DATABRICKS:
            return <>{/* Add personal access token input */}</>;
        default:
            return null;
    }
};
