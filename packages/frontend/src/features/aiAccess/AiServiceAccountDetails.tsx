import {
    assertUnreachable,
    WarehouseTypes,
    type AiServiceAccountParent,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
} from '@lightdash/common';
import { Anchor, Stack, Text } from '@mantine/core';
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

const getMethod = (warehouseType: ServiceAccountWarehouse): string => {
    switch (warehouseType) {
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.POSTGRES:
            return 'User and password';
        case WarehouseTypes.ATHENA:
            return 'Access keys';
        case WarehouseTypes.BIGQUERY:
            return 'Key file';
        case WarehouseTypes.SNOWFLAKE:
            return 'Key pair';
        case WarehouseTypes.DATABRICKS:
            return 'Client ID and secret';
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
    const principal =
        warehouseType === WarehouseTypes.BIGQUERY && !slot && parent
            ? parent.principal !== null
                ? (testedPrincipal ?? parent.principal)
                : null
            : testedPrincipal;
    const dates = [
        observation?.ok
            ? `Tested ${formatAiServiceAccountDate(observation.checkedAt)}.`
            : null,
        slot ? `Added ${formatAiServiceAccountDate(slot.updatedAt)}.` : null,
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <Stack gap="xs">
            {!slot && parent && parent.credentialsReadable !== false && (
                <Text size="sm">
                    Uses the shared agent account from{' '}
                    {parent.projectName !== null ? (
                        <>
                            <Anchor
                                component={Link}
                                to={`/generalSettings/projectManagement/${parent.projectUuid}/agentIdentity`}
                                size="sm"
                            >
                                {parent.projectName}
                            </Anchor>
                            , the parent project
                        </>
                    ) : (
                        'the parent project'
                    )}
                    . Changes there apply here on the next query.
                </Text>
            )}
            {principal ? (
                <Text size="sm" role="status">
                    Signs in as {principal}
                </Text>
            ) : (
                <Text size="sm" c="dimmed">
                    Not tested yet. Select Test to see who it signs in as.
                </Text>
            )}
            <Text size="sm">{getMethod(warehouseType)}</Text>
            {dates && (
                <Text size="xs" c="dimmed">
                    {dates}
                </Text>
            )}
        </Stack>
    );
};
