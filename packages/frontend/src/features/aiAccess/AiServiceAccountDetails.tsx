import {
    assertUnreachable,
    getProjectAgentIdentitySettingsPath,
    WarehouseTypes,
    type AiServiceAccountParent,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
} from '@lightdash/common';
import { Anchor, Stack, Text } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatAiServiceAccountDate } from './formatAiServiceAccountDate';

type ServiceAccountWarehouse =
    | WarehouseTypes.CLICKHOUSE
    | WarehouseTypes.REDSHIFT
    | WarehouseTypes.TRINO
    | WarehouseTypes.POSTGRES
    | WarehouseTypes.ATHENA
    | WarehouseTypes.BIGQUERY
    | WarehouseTypes.SNOWFLAKE
    | WarehouseTypes.DATABRICKS;

const getMethodKey = (warehouseType: ServiceAccountWarehouse): string => {
    switch (warehouseType) {
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.POSTGRES:
            return 'userPassword';
        case WarehouseTypes.ATHENA:
            return 'accessKeys';
        case WarehouseTypes.BIGQUERY:
            return 'keyFile';
        case WarehouseTypes.SNOWFLAKE:
            return 'keyPair';
        case WarehouseTypes.DATABRICKS:
            return 'clientIdSecret';
        default:
            return assertUnreachable(warehouseType, 'Unknown warehouse type');
    }
};

export const AiServiceAccountDetails = ({
    slot,
    parent,
    testedPrincipal,
    observation,
    warehouseType,
}: {
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    testedPrincipal: string | null;
    observation: AiServiceAccountTestResult | null;
    warehouseType: ServiceAccountWarehouse;
}) => {
    const { t } = useTranslation('aiAccess');
    const principal =
        warehouseType === WarehouseTypes.BIGQUERY && !slot && parent
            ? parent.principal !== null
                ? (testedPrincipal ?? parent.principal)
                : null
            : testedPrincipal;
    const dates = [
        observation?.ok
            ? t('serviceAccountDetails.tested', {
                  date: formatAiServiceAccountDate(observation.checkedAt),
              })
            : null,
        slot
            ? t('serviceAccountDetails.added', {
                  date: formatAiServiceAccountDate(slot.updatedAt),
              })
            : null,
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <Stack gap="xs">
            {!slot && parent && parent.credentialsReadable !== false && (
                <Text size="sm">
                    {parent.projectName !== null ? (
                        <Trans
                            t={t}
                            i18nKey="serviceAccountDetails.usesFromProject"
                            values={{ project: parent.projectName }}
                            components={{
                                anchor: (
                                    <Anchor
                                        component={Link}
                                        to={getProjectAgentIdentitySettingsPath(
                                            parent.projectUuid,
                                        )}
                                        size="sm"
                                    />
                                ),
                            }}
                        />
                    ) : (
                        t('serviceAccountDetails.usesFromParent')
                    )}
                </Text>
            )}
            {principal ? (
                <Text size="sm" role="status">
                    {t('serviceAccountDetails.signsInAs', { principal })}
                </Text>
            ) : (
                <Text size="sm" c="dimmed">
                    {t('serviceAccountDetails.notTested')}
                </Text>
            )}
            <Text size="sm">
                {t(
                    `serviceAccountDetails.methods.${getMethodKey(warehouseType)}`,
                )}
            </Text>
            {dates && (
                <Text size="xs" c="dimmed">
                    {dates}
                </Text>
            )}
        </Stack>
    );
};
