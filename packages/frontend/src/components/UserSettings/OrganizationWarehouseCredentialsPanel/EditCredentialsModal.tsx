import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type OrganizationWarehouseCredentials,
    type UpdateOrganizationWarehouseCredentials,
} from '@lightdash/common';
import { Button, Group, Modal, Title, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { type FC } from 'react';
import { useUpdateOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import { SnowflakeCredentialsForm } from './SnowflakeCredentialsForm';

export const EditCredentialsModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
        organizationCredentials: OrganizationWarehouseCredentials;
    }
> = ({ opened, onClose, organizationCredentials }) => {
    const [isAuthenticated, setIsAuthenticated] = React.useState(false);
    const { mutateAsync, isLoading: isSaving } =
        useUpdateOrganizationWarehouseCredentials();

    const snowflakeCredentials =
        organizationCredentials.credentials.type === WarehouseTypes.SNOWFLAKE
            ? organizationCredentials.credentials
            : undefined;
    const form = useForm<UpdateOrganizationWarehouseCredentials>({
        initialValues: {
            name: organizationCredentials.name,
            description: organizationCredentials.description || '',
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.SSO,
                account: snowflakeCredentials?.account || '',
                database: snowflakeCredentials?.database || '',
                warehouse: snowflakeCredentials?.warehouse || '',
                schema: snowflakeCredentials?.schema || '',
                user: '', // This is required by snowflake CreateWarehouseCredentials type, but it is not used for SSO
                override: snowflakeCredentials?.override || false,
                requireUserCredentials:
                    snowflakeCredentials?.requireUserCredentials || false,
                clientSessionKeepAlive:
                    snowflakeCredentials?.clientSessionKeepAlive || false,
                queryTag: snowflakeCredentials?.queryTag || '',
                accessUrl: snowflakeCredentials?.accessUrl || '',
                startOfWeek: snowflakeCredentials?.startOfWeek ?? null,
            },
        },
    });

    return (
        <Modal
            size="lg"
            title={<Title order={4}>Edit credentials</Title>}
            opened={opened}
            onClose={onClose}
        >
            <form
                onSubmit={form.onSubmit(async (formData) => {
                    await mutateAsync({
                        uuid: organizationCredentials.organizationWarehouseCredentialsUuid,
                        data: {
                            name: formData.name,
                            description: formData.description,
                            credentials: formData.credentials,
                        },
                    });
                    onClose();
                })}
            >
                <SnowflakeCredentialsForm
                    form={form}
                    disabled={isSaving}
                    onAuthenticated={setIsAuthenticated}
                />

                <Group position="right" spacing="xs" mt="sm">
                    <Button
                        size="xs"
                        variant="outline"
                        color="dark"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>

                    <Button
                        size="xs"
                        type="submit"
                        disabled={isSaving || !isAuthenticated}
                        loading={isSaving}
                    >
                        Save
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
