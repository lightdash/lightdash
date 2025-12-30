import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateOrganizationWarehouseCredentials,
    type OrganizationWarehouseCredentials,
} from '@lightdash/common';
import { Button, Stack } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useCreateOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { SnowflakeCredentialsForm } from './SnowflakeCredentialsForm';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    title?: string;
    description?: React.ReactNode;
    nameValue?: string;
    onSuccess?: (data: OrganizationWarehouseCredentials) => void;
};

const FORM_ID = 'create-org-credentials-form';

export const CreateCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    title,
    description,
    nameValue,
    onSuccess,
}) => {
    const [isAuthenticated, setIsAuthenticated] = React.useState(false);
    const { mutateAsync, isLoading: isSaving } =
        useCreateOrganizationWarehouseCredentials();
    const form = useForm<CreateOrganizationWarehouseCredentials>({
        initialValues: {
            name: '',
            description: '',
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.SSO,
                account: '',
                database: '',
                warehouse: '',
                schema: '',
                user: '',
                override: false,
                requireUserCredentials: false,
                clientSessionKeepAlive: false,
                queryTag: '',
                accessUrl: '',
                startOfWeek: null,
            },
        },
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={title ?? 'Add new credentials'}
            icon={IconPlus}
            size="lg"
            cancelDisabled={isSaving}
            actions={
                <Button
                    type="submit"
                    form={FORM_ID}
                    disabled={isSaving || !isAuthenticated}
                    loading={isSaving}
                >
                    Save credentials
                </Button>
            }
        >
            <form
                id={FORM_ID}
                onSubmit={form.onSubmit(async (formData) => {
                    const result = await mutateAsync({
                        name: nameValue || formData.name,
                        description: formData.description,
                        credentials: formData.credentials,
                    });
                    onSuccess?.(result);
                    onClose();
                })}
            >
                <Stack gap="xs">
                    {description}

                    <SnowflakeCredentialsForm
                        form={form}
                        disabled={isSaving}
                        showName={!nameValue}
                        onAuthenticated={setIsAuthenticated}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
