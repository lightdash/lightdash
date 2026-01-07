import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Button, Select, Stack, TextInput } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import React, { type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import { useUserWarehouseCredentialsCreateMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';
import { WarehouseFormInputs } from './WarehouseFormInputs';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    title?: string;
    description?: React.ReactNode;
    nameValue?: string;
    warehouseType?: WarehouseTypes;
    onSuccess?: (data: UserWarehouseCredentials) => void;
};

const defaultCredentials: Record<
    WarehouseTypes,
    UpsertUserWarehouseCredentials['credentials']
> = {
    [WarehouseTypes.POSTGRES]: {
        type: WarehouseTypes.POSTGRES,
        user: '',
        password: '',
    },
    [WarehouseTypes.REDSHIFT]: {
        type: WarehouseTypes.REDSHIFT,
        user: '',
        password: '',
    },
    [WarehouseTypes.SNOWFLAKE]: {
        type: WarehouseTypes.SNOWFLAKE,
        user: '',
        password: '',
    },
    [WarehouseTypes.TRINO]: {
        type: WarehouseTypes.TRINO,
        user: '',
        password: '',
    },
    [WarehouseTypes.BIGQUERY]: {
        type: WarehouseTypes.BIGQUERY,
        keyfileContents: {},
    },
    [WarehouseTypes.DATABRICKS]: {
        type: WarehouseTypes.DATABRICKS,
        personalAccessToken: '',
    },
    [WarehouseTypes.CLICKHOUSE]: {
        type: WarehouseTypes.CLICKHOUSE,
        user: '',
        password: '',
    },
};

const FORM_ID = 'create-credentials-form';

export const CreateCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    title,
    description,
    nameValue,
    warehouseType,
    onSuccess,
}) => {
    const health = useHealth();
    const isDatabricksEnabled = health.data?.auth.databricks.enabled ?? false;
    const { mutateAsync, isLoading: isSaving } =
        useUserWarehouseCredentialsCreateMutation({
            onSuccess,
        });
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: '',
            credentials:
                defaultCredentials[warehouseType || WarehouseTypes.POSTGRES],
        },
    });

    const showSaveButton = ![
        WarehouseTypes.BIGQUERY,
        WarehouseTypes.SNOWFLAKE,
        WarehouseTypes.DATABRICKS,
    ].includes(warehouseType ?? form.values.credentials.type);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={title ?? 'Add new credentials'}
            icon={IconPlus}
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
            cancelDisabled={isSaving}
        >
            <form
                id={FORM_ID}
                onSubmit={form.onSubmit(async (formData) => {
                    await mutateAsync({
                        ...formData,
                        name: nameValue || formData.name,
                    });
                    onClose();
                })}
            >
                <Stack gap="xs">
                    {description}

                    {!nameValue && (
                        <TextInput
                            required
                            size="xs"
                            label="Name"
                            disabled={isSaving}
                            {...form.getInputProps('name')}
                        />
                    )}

                    {!warehouseType && (
                        <Select
                            required
                            label="Warehouse"
                            size="xs"
                            disabled={isSaving}
                            data={Object.values(WarehouseTypes).map((type) => {
                                const isDisabled =
                                    type === WarehouseTypes.DATABRICKS &&
                                    !isDatabricksEnabled;
                                return {
                                    value: type,
                                    label: getWarehouseLabel(type) || type,
                                    disabled: isDisabled,
                                };
                            })}
                            {...form.getInputProps('credentials.type')}
                        />
                    )}

                    <WarehouseFormInputs
                        form={form}
                        disabled={isSaving}
                        onClose={onClose}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
