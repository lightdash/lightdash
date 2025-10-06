import { Stack, TextInput, Textarea } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { SnowflakeOAuthInput } from './SnowflakeOAuthInput';

type Props = {
    form: UseFormReturnType<any>;
    disabled: boolean;
    showName?: boolean;
    onAuthenticated?: (isAuthenticated: boolean) => void;
};

export const SnowflakeCredentialsForm: FC<Props> = ({
    form,
    disabled,
    showName = true,
    onAuthenticated,
}) => {
    return (
        <Stack spacing="xs">
            {showName && (
                <TextInput
                    required
                    size="xs"
                    label="Name"
                    disabled={disabled}
                    {...form.getInputProps('name')}
                />
            )}

            <Textarea
                size="xs"
                label="Description"
                placeholder="Optional description"
                disabled={disabled}
                {...form.getInputProps('description')}
            />

            <TextInput
                required
                size="xs"
                label="Account"
                placeholder="your-account"
                description="This is the Snowflake account identifier"
                disabled={disabled}
                {...form.getInputProps('credentials.account')}
            />

            <TextInput
                required
                size="xs"
                label="Database"
                placeholder="your-database"
                description="This is the database name"
                disabled={disabled}
                {...form.getInputProps('credentials.database')}
            />

            <TextInput
                required
                size="xs"
                label="Warehouse"
                placeholder="your-warehouse"
                description="This is the warehouse name"
                disabled={disabled}
                {...form.getInputProps('credentials.warehouse')}
            />

            <TextInput
                required
                size="xs"
                label="Schema"
                placeholder="your-schema"
                description="This is the schema name"
                disabled={disabled}
                {...form.getInputProps('credentials.schema')}
            />

            <SnowflakeOAuthInput onAuthenticated={onAuthenticated} />
        </Stack>
    );
};
