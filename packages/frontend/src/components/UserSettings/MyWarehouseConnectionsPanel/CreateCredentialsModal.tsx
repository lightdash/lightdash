import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Button, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useIsDatabricksSsoEnabled } from '../../../hooks/useDatabricks';
import { useUserWarehouseCredentialsCreateMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';
import {
    getDefaultDatabricksAuthenticationType,
    isDatabricksPersonalAccessToken,
} from './utils';
import { WarehouseFormInputs } from './WarehouseFormInputs';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    title?: string;
    description?: React.ReactNode;
    nameValue?: string;
    warehouseType?: WarehouseTypes;
    projectUuid?: string;
    projectName?: string;
    onSuccess?: (data: UserWarehouseCredentials) => void;
};

const getDefaultCredentials = (
    warehouseType: WarehouseTypes,
    isDatabricksSsoEnabled: boolean,
): UpsertUserWarehouseCredentials['credentials'] => {
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
            authenticationType: RedshiftAuthenticationType.PASSWORD,
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
            authenticationType: getDefaultDatabricksAuthenticationType(
                isDatabricksSsoEnabled,
            ),
        },
        [WarehouseTypes.CLICKHOUSE]: {
            type: WarehouseTypes.CLICKHOUSE,
            user: '',
            password: '',
        },
        [WarehouseTypes.ATHENA]: {
            type: WarehouseTypes.ATHENA,
            accessKeyId: '',
            secretAccessKey: '',
        },
        [WarehouseTypes.DUCKDB]: {
            type: WarehouseTypes.DUCKDB,
            token: '',
        },
    };

    return defaultCredentials[warehouseType];
};

const warehouseTypes = Object.values(WarehouseTypes);

const FORM_ID = 'create-credentials-form';

export const CreateCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    title,
    description,
    nameValue,
    warehouseType,
    projectUuid,
    projectName,
    onSuccess,
}) => {
    const { mutateAsync, isLoading: isSaving } =
        useUserWarehouseCredentialsCreateMutation({
            onSuccess,
        });
    const isDatabricksSsoEnabled = useIsDatabricksSsoEnabled();
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: '',
            credentials: getDefaultCredentials(
                warehouseType || WarehouseTypes.POSTGRES,
                isDatabricksSsoEnabled,
            ),
        },
    });

    const isRedshiftBrowserSso =
        form.values.credentials.type === WarehouseTypes.REDSHIFT &&
        'authenticationType' in form.values.credentials &&
        form.values.credentials.authenticationType ===
            RedshiftAuthenticationType.IAM_BROWSER;
    const showSaveButton =
        !isRedshiftBrowserSso &&
        (isDatabricksPersonalAccessToken(form.values.credentials) ||
            ![
                WarehouseTypes.BIGQUERY,
                WarehouseTypes.SNOWFLAKE,
                WarehouseTypes.DATABRICKS,
            ].includes(warehouseType ?? form.values.credentials.type));

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
                            data={warehouseTypes.map((type) => ({
                                value: type,
                                label: getWarehouseLabel(type) || type,
                            }))}
                            value={form.values.credentials.type}
                            onChange={(value) => {
                                const type = warehouseTypes.find(
                                    (warehouse) => warehouse === value,
                                );
                                if (!type) return;
                                form.setFieldValue(
                                    'credentials',
                                    getDefaultCredentials(
                                        type,
                                        isDatabricksSsoEnabled,
                                    ),
                                );
                            }}
                        />
                    )}

                    <WarehouseFormInputs
                        form={form}
                        disabled={isSaving}
                        onClose={onClose}
                        onSuccess={onSuccess}
                        projectUuid={projectUuid}
                        projectName={projectName}
                        databricksCredentialsName={
                            nameValue || form.values.name
                        }
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
