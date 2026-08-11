import {
    assertUnreachable,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Button, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useIsDatabricksSsoEnabled } from '../../../hooks/useDatabricks';
import { useUserWarehouseCredentialsUpdateMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import {
    getDefaultDatabricksAuthenticationType,
    isDatabricksPersonalAccessToken,
} from './utils';
import { WarehouseFormInputs } from './WarehouseFormInputs';

const getCredentialsWithPlaceholders = (
    credentials: UserWarehouseCredentials['credentials'],
    isDatabricksSsoEnabled: boolean,
): UpsertUserWarehouseCredentials['credentials'] => {
    switch (credentials.type) {
        case WarehouseTypes.REDSHIFT:
            return {
                ...credentials,
                password: '',
                accessKeyId: '',
                secretAccessKey: '',
                sessionToken: '',
            };
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return {
                ...credentials,
                password: '',
            };
        case WarehouseTypes.BIGQUERY:
            return {
                ...credentials,
                keyfileContents: {},
            };
        case WarehouseTypes.DATABRICKS:
            // Stored Databricks credentials don't expose their authentication
            // type, so fall back to whatever the instance supports.
            return {
                ...credentials,
                personalAccessToken: '',
                authenticationType: getDefaultDatabricksAuthenticationType(
                    isDatabricksSsoEnabled,
                ),
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                ...credentials,
                password: '',
            };
        case WarehouseTypes.ATHENA:
            return {
                ...credentials,
                accessKeyId: '',
                secretAccessKey: '',
            };
        case WarehouseTypes.DUCKDB:
            return {
                ...credentials,
                token: '',
            };
        default:
            return assertUnreachable(
                credentials,
                'Credential type not supported',
            );
    }
};

const FORM_ID = 'edit-credentials-form';

export const EditCredentialsModal: FC<
    Pick<MantineModalProps, 'opened' | 'onClose'> & {
        userCredentials: UserWarehouseCredentials;
    }
> = ({ opened, onClose, userCredentials }) => {
    const { mutateAsync, isLoading: isSaving } =
        useUserWarehouseCredentialsUpdateMutation(userCredentials.uuid);
    const isDatabricksSsoEnabled = useIsDatabricksSsoEnabled();
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: userCredentials.name,
            credentials: getCredentialsWithPlaceholders(
                userCredentials.credentials,
                isDatabricksSsoEnabled,
            ),
        },
    });

    // SSO-based credentials are only ever set through their OAuth popup. They
    // have no editable secret field, so a generic "Save" would persist the
    // masked placeholder and wipe the working credential.
    const showSaveButton =
        isDatabricksPersonalAccessToken(form.values.credentials) ||
        ![
            WarehouseTypes.BIGQUERY,
            WarehouseTypes.SNOWFLAKE,
            WarehouseTypes.DATABRICKS,
        ].includes(userCredentials.credentials.type);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Edit credentials"
            icon={IconPencil}
            cancelDisabled={isSaving}
            actions={
                showSaveButton ? (
                    <Button
                        type="submit"
                        form={FORM_ID}
                        disabled={isSaving}
                        loading={isSaving}
                    >
                        Save
                    </Button>
                ) : undefined
            }
        >
            <form
                id={FORM_ID}
                onSubmit={form.onSubmit(async (formData) => {
                    await mutateAsync(formData);
                    onClose();
                })}
            >
                <Stack gap="xs">
                    <TextInput
                        required
                        size="xs"
                        label="Name"
                        disabled={isSaving}
                        {...form.getInputProps('name')}
                    />

                    <WarehouseFormInputs
                        onClose={onClose}
                        form={form}
                        disabled={isSaving}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
