import {
    assertUnreachable,
    BigqueryAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
} from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../components/common/MantineModal';
import { BigQueryKeyFileInput } from '../../components/ProjectConnection/WarehouseForms/BigQueryKeyFileInput';
import { useSaveAiServiceAccount, useTestAiServiceAccount } from './api';
import { AthenaAiServiceAccountForm } from './AthenaAiServiceAccountForm';
import { DatabricksAiServiceAccountForm } from './DatabricksAiServiceAccountForm';
import { SnowflakeAiServiceAccountForm } from './SnowflakeAiServiceAccountForm';
import { UserPasswordAiServiceAccountForm } from './UserPasswordAiServiceAccountForm';

interface AiServiceAccountFormProps {
    projectUuid: string;
    onClose: () => void;
    onSaved: (
        slot: AiServiceAccountSlot,
        principal: string | null,
        verification?: AiServiceAccountTestResult | null,
    ) => void;
}

const BigqueryAiServiceAccountForm = ({
    projectUuid,
    onClose,
    onSaved,
}: AiServiceAccountFormProps) => {
    const { t } = useTranslation('aiAccess');
    const [file, setFile] = useState<File | null>(null);
    const [keyfileContents, setKeyfileContents] = useState<Record<
        string,
        string
    > | null>(null);
    const save = useSaveAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const credentials = keyfileContents
        ? {
              type: WarehouseTypes.BIGQUERY as const,
              authenticationType:
                  BigqueryAuthenticationType.PRIVATE_KEY as const,
              keyfileContents,
          }
        : null;
    const busy = save.isLoading || test.isLoading;
    return (
        <MantineModal
            opened
            title={t('serviceAccountForm.title')}
            onClose={busy ? () => {} : onClose}
            confirmLabel={t('actions.save', { ns: 'common' })}
            confirmDisabled={!credentials || busy}
            confirmLoading={save.isLoading}
            onConfirm={() => {
                if (credentials)
                    save.mutate(credentials, {
                        onSuccess: ({ slot: savedSlot }) => {
                            if (savedSlot)
                                onSaved(
                                    savedSlot,
                                    test.data?.ok &&
                                        test.variables?.credentials?.type ===
                                            WarehouseTypes.BIGQUERY &&
                                        test.variables.credentials
                                            .keyfileContents ===
                                            credentials.keyfileContents
                                        ? test.data.principal
                                        : null,
                                );
                            onClose();
                        },
                    });
            }}
            actions={
                <Button
                    variant="default"
                    disabled={!credentials || busy}
                    loading={test.isLoading}
                    onClick={() => {
                        if (credentials) test.mutate({ credentials });
                    }}
                >
                    {t('serviceAccountCard.test')}
                </Button>
            }
        >
            <Stack gap="sm">
                <BigQueryKeyFileInput
                    value={file}
                    onChange={(next) => {
                        setFile(next);
                        test.reset();
                    }}
                    onKeyfileChange={setKeyfileContents}
                    disabled={busy}
                />
                {test.data && (
                    <Text size="sm" role="status">
                        {test.data.ok && test.data.principal
                            ? t('serviceAccountDetails.signsInAs', {
                                  principal: test.data.principal,
                              })
                            : test.data.message}
                    </Text>
                )}
                {test.error && (
                    <Text size="sm" c="red" role="alert">
                        {test.error.error.message}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

interface WarehouseAiServiceAccountFormProps extends AiServiceAccountFormProps {
    warehouseType:
        | WarehouseTypes.CLICKHOUSE
        | WarehouseTypes.POSTGRES
        | WarehouseTypes.REDSHIFT
        | WarehouseTypes.TRINO
        | WarehouseTypes.ATHENA
        | WarehouseTypes.BIGQUERY
        | WarehouseTypes.DATABRICKS
        | WarehouseTypes.SNOWFLAKE;
}

export const AiServiceAccountForm = ({
    warehouseType,
    ...props
}: WarehouseAiServiceAccountFormProps) => {
    const { t } = useTranslation('aiAccess');
    switch (warehouseType) {
        case WarehouseTypes.TRINO:
            return (
                <UserPasswordAiServiceAccountForm
                    {...props}
                    warehouseType={warehouseType}
                    userDescription={t(
                        'serviceAccountForm.userDescription.trino',
                    )}
                />
            );
        case WarehouseTypes.CLICKHOUSE:
            return (
                <UserPasswordAiServiceAccountForm
                    {...props}
                    warehouseType={warehouseType}
                    userDescription={t(
                        'serviceAccountForm.userDescription.clickhouse',
                    )}
                />
            );
        case WarehouseTypes.REDSHIFT:
            return (
                <UserPasswordAiServiceAccountForm
                    {...props}
                    warehouseType={warehouseType}
                    userDescription={t(
                        'serviceAccountForm.userDescription.redshift',
                    )}
                />
            );
        case WarehouseTypes.POSTGRES:
            return (
                <UserPasswordAiServiceAccountForm
                    {...props}
                    warehouseType={warehouseType}
                    userDescription={t(
                        'serviceAccountForm.userDescription.postgres',
                    )}
                />
            );
        case WarehouseTypes.ATHENA:
            return <AthenaAiServiceAccountForm {...props} />;
        case WarehouseTypes.BIGQUERY:
            return <BigqueryAiServiceAccountForm {...props} />;
        case WarehouseTypes.DATABRICKS:
            return <DatabricksAiServiceAccountForm {...props} />;
        case WarehouseTypes.SNOWFLAKE:
            return <SnowflakeAiServiceAccountForm {...props} />;
        default:
            return assertUnreachable(warehouseType, 'Unknown warehouse type');
    }
};
