import { WarehouseTypes } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC } from 'react';
import { UpdateUserCredentials, UpsertUserWarehouseCredentials } from './types';
import { WarehouseFormInputs } from './WarehouseFormInputs';

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

                        <WarehouseFormInputs
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
