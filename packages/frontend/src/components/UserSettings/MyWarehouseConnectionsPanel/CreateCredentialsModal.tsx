import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type Connection,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Button, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useIsDatabricksSsoEnabled } from '../../../hooks/useDatabricks';
import { useUserWarehouseCredentialsCreateMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { useIsSnowflakeSsoEnabled } from '../../../hooks/useSnowflake';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';
import {
    getDefaultDatabricksAuthenticationType,
    getDefaultSnowflakeAuthenticationType,
    isDatabricksPersonalAccessToken,
    isSnowflakeSso,
    validateUserWarehouseCredentials,
} from './utils';
import { WarehouseFormInputs } from './WarehouseFormInputs';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    title?: string;
    description?: React.ReactNode;
    nameValue?: string;
    warehouseType?: WarehouseTypes;
    projectUuid?: string;
    projectName?: string;
    connections?: Connection[];
    onSuccess?: (
        data: UserWarehouseCredentials,
        connectionUuid?: string,
    ) => void;
};

const getDefaultCredentials = (
    warehouseType: WarehouseTypes,
    ssoEnabled: { databricks: boolean; snowflake: boolean },
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
            authenticationType: getDefaultSnowflakeAuthenticationType(
                ssoEnabled.snowflake,
            ),
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
                ssoEnabled.databricks,
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

const ConnectionSelector: FC<{
    connections?: Connection[];
    value?: string;
    disabled: boolean;
    onChange: (connection: Connection) => void;
}> = ({ connections, value, disabled, onChange }) => {
    if (!connections || connections.length <= 1) return null;

    return (
        <Select
            required
            label="Connection"
            size="xs"
            disabled={disabled}
            data={connections.map((connection) => ({
                value: connection.connectionUuid,
                label: connection.name,
            }))}
            value={value}
            onChange={(nextValue) => {
                const connection = connections.find(
                    (item) => item.connectionUuid === nextValue,
                );
                if (connection) onChange(connection);
            }}
        />
    );
};

export const CreateCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    title,
    description,
    nameValue,
    warehouseType,
    projectUuid,
    projectName,
    connections,
    onSuccess,
}) => {
    const [connectionUuid, setConnectionUuid] = React.useState(
        connections?.[0]?.connectionUuid,
    );
    const selectedConnection = connections?.find(
        (connection) => connection.connectionUuid === connectionUuid,
    );
    const effectiveWarehouseType =
        selectedConnection?.warehouseType ?? warehouseType;
    const { mutateAsync, isLoading: isSaving } =
        useUserWarehouseCredentialsCreateMutation();
    const isDatabricksSsoEnabled = useIsDatabricksSsoEnabled();
    const isSnowflakeSsoEnabled = useIsSnowflakeSsoEnabled();
    const ssoEnabled = {
        databricks: isDatabricksSsoEnabled,
        snowflake: isSnowflakeSsoEnabled,
    };
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: '',
            credentials: getDefaultCredentials(
                effectiveWarehouseType || WarehouseTypes.POSTGRES,
                ssoEnabled,
            ),
        },
        validate: validateUserWarehouseCredentials,
    });

    const isRedshiftBrowserSso =
        form.values.credentials.type === WarehouseTypes.REDSHIFT &&
        'authenticationType' in form.values.credentials &&
        form.values.credentials.authenticationType ===
            RedshiftAuthenticationType.IAM_BROWSER;
    const showSaveButton =
        !isRedshiftBrowserSso &&
        !isSnowflakeSso(form.values.credentials) &&
        (isDatabricksPersonalAccessToken(form.values.credentials) ||
            ![WarehouseTypes.BIGQUERY, WarehouseTypes.DATABRICKS].includes(
                warehouseType ?? form.values.credentials.type,
            ));

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
                    const data = await mutateAsync({
                        ...formData,
                        name: nameValue || formData.name,
                    });
                    onSuccess?.(data, connectionUuid);
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

                    <ConnectionSelector
                        connections={connections}
                        value={connectionUuid}
                        disabled={isSaving}
                        onChange={(connection) => {
                            setConnectionUuid(connection.connectionUuid);
                            form.setFieldValue(
                                'credentials',
                                getDefaultCredentials(
                                    connection.warehouseType,
                                    ssoEnabled,
                                ),
                            );
                        }}
                    />

                    {!effectiveWarehouseType && (
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
                                    getDefaultCredentials(type, ssoEnabled),
                                );
                            }}
                        />
                    )}

                    <WarehouseFormInputs
                        form={form}
                        disabled={isSaving}
                        onClose={onClose}
                        onSuccess={(data) => onSuccess?.(data, connectionUuid)}
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
