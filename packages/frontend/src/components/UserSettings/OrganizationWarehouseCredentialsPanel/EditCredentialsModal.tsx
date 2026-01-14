import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type OrganizationWarehouseCredentials,
    type UpdateOrganizationWarehouseCredentials,
} from '@lightdash/common';
import { Button, Stack } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useUpdateOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { SnowflakeCredentialsForm } from './SnowflakeCredentialsForm';

const FORM_ID = 'edit-org-credentials-form';

export const EditCredentialsModal: FC<
    Pick<MantineModalProps, 'opened' | 'onClose'> & {
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Edit credentials"
            icon={IconPencil}
            size="lg"
            cancelDisabled={isSaving}
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={isSaving || !isAuthenticated}
                    loading={isSaving}
                >
                    Save
                </Button>
            }
        >
            <form
                id={FORM_ID}
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
                <Stack gap="xs">
                    <SnowflakeCredentialsForm
                        form={form}
                        disabled={isSaving}
                        onAuthenticated={setIsAuthenticated}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
