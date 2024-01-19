import { WarehouseTypes } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    ModalProps,
    PasswordInput,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm, UseFormReturnType } from '@mantine/form';
import { FC } from 'react';
import { UpdateUserCredentials, UpsertUserWarehouseCredentials } from './types';

const getCredentials = (credentials: UpsertUserWarehouseCredentials) => {
    switch (credentials.type) {
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return {
                type: credentials.type,
                user: credentials.user,
                password: '',
            };
        case WarehouseTypes.BIGQUERY:
            return {
                type: credentials.type,
                keyFileContents: credentials.keyfileContents,
            };
        case WarehouseTypes.DATABRICKS:
            return {
                type: credentials.type,
                personalAccessToken: credentials.personalAccessToken,
            };
        default:
            return {};
    }
};

const FormInputs: FC<{
    form: UseFormReturnType<
        Pick<UpdateUserCredentials, 'name' | 'credentials'>
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
                        {...form.getInputProps('username')}
                    />
                    <PasswordInput
                        required
                        size="xs"
                        label="Password"
                        {...form.getInputProps('password')}
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

export const EditCredentialsModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
        userCredentials: UpdateUserCredentials;
    }
> = ({ opened, onClose, userCredentials }) => {
    const form = useForm<Pick<UpdateUserCredentials, 'name' | 'credentials'>>({
        initialValues: {
            name: userCredentials.name,
            credentials: getCredentials(
                userCredentials.credentials,
            ) as UpdateUserCredentials['credentials'],
        },
    });

    return (
        <Modal
            title={<Title order={4}>Edit credentials</Title>}
            opened={opened}
            onClose={onClose}
        >
            <Stack>
                <Stack spacing="xs">
                    <form
                        onSubmit={
                            () => {
                                form.onSubmit(() => {});
                            }
                            // TODO: Edit credentials to database
                        }
                    >
                        <TextInput
                            required
                            size="xs"
                            label="Name"
                            {...form.getInputProps('name')}
                        />

                        <FormInputs
                            form={form}
                            userCredentialsType={
                                userCredentials.credentials.type
                            }
                        />

                        <Group position="right" spacing="xs" mt="sm">
                            <Button
                                size="xs"
                                variant="outline"
                                color="dark"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>

                            <Button size="xs" type="submit">
                                Save
                            </Button>
                        </Group>
                    </form>
                </Stack>
            </Stack>
        </Modal>
    );
};
