import {
    assertUnreachable,
    getBigqueryWorkloadIdentityTokenAudience,
    isBigqueryWorkloadIdentityProvider,
    WarehouseTypes,
    type BigqueryWorkloadIdentity,
} from '@lightdash/common';
import { Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { type ChangeEvent, type FC } from 'react';
import Callout from '../../common/Callout';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import InlineErrorState from '../../common/InlineErrorState';
import { useFormContext } from '../formContext';
import { type WorkloadIdentityStatus } from './bigqueryWorkloadIdentityHooks';

const WorkloadIdentityStatusMessage: FC<{ status: WorkloadIdentityStatus }> = ({
    status,
}) => {
    switch (status.kind) {
        case 'loading':
            return <EmptyStateLoader title="Loading instance identity" />;
        case 'available':
            return status.identity.subject === null ? (
                <Callout variant="warning">
                    This instance&apos;s subject is unavailable. Contact your
                    administrator before configuring the provider.
                </Callout>
            ) : null;
        case 'not-enabled':
            return (
                <Callout variant="warning">
                    Workload Identity Federation is unavailable. Identity
                    settings are read-only. Choose another authentication type
                    or ask an administrator to enable it before saving.
                </Callout>
            );
        case 'identity-error':
        case 'flag-error':
            return (
                <InlineErrorState
                    message={
                        status.kind === 'identity-error'
                            ? "Couldn't load the instance identity. Check your connection and project permissions, then retry. Identity settings are read-only."
                            : "Couldn't check Workload Identity Federation availability. Identity settings are read-only."
                    }
                    onRetry={status.onRetry}
                />
            );
        default:
            return assertUnreachable(
                status,
                'Unknown workload identity status',
            );
    }
};

const WorkloadIdentityDetails: FC<{
    identity: BigqueryWorkloadIdentity | null;
    audience: string;
}> = ({ identity, audience }) => {
    const attributeCondition = identity?.subject
        ? `assertion.sub == '${identity.subject}'`
        : '';

    return (
        <>
            <TextInput
                label="Issuer"
                value={identity?.issuer ?? ''}
                placeholder="Unavailable"
                readOnly
                rightSection={
                    identity ? (
                        <CopyActionIcon
                            value={identity.issuer}
                            copyLabel="Copy issuer"
                        />
                    ) : null
                }
            />
            <TextInput
                label="Subject"
                value={identity?.subject ?? ''}
                placeholder="Unavailable"
                readOnly
                rightSection={
                    identity?.subject ? (
                        <CopyActionIcon
                            value={identity.subject}
                            copyLabel="Copy subject"
                        />
                    ) : null
                }
            />
            <TextInput
                label="Audience"
                description="Allow this audience in your provider. It uses the override when set."
                value={audience}
                placeholder="Enter a valid provider resource name or audience override"
                readOnly
                rightSection={
                    audience ? (
                        <CopyActionIcon
                            value={audience}
                            copyLabel="Copy audience"
                        />
                    ) : null
                }
            />
            <TextInput
                label="Attribute condition"
                value={attributeCondition}
                placeholder="Unavailable"
                readOnly
                rightSection={
                    attributeCondition ? (
                        <CopyActionIcon
                            value={attributeCondition}
                            copyLabel="Copy attribute condition"
                        />
                    ) : null
                }
            />
        </>
    );
};

const BigQueryWorkloadIdentityFields: FC<{
    disabled: boolean;
    status: WorkloadIdentityStatus;
}> = ({ disabled, status }) => {
    const form = useFormContext();
    const { warehouse } = form.values;
    if (warehouse.type !== WarehouseTypes.BIGQUERY) {
        throw new Error(
            'BigQuery identity fields require a BigQuery connection',
        );
    }

    const provider = warehouse.workloadIdentityProvider ?? '';
    const audience =
        warehouse.workloadIdentityAudience ||
        isBigqueryWorkloadIdentityProvider(provider)
            ? getBigqueryWorkloadIdentityTokenAudience(warehouse)
            : '';
    const onIdentityInputChange =
        (field: 'workloadIdentityProvider' | 'workloadIdentityAudience') =>
        (event: ChangeEvent<HTMLInputElement>) =>
            form.setFieldValue(
                `warehouse.${field}`,
                event.currentTarget.value.trim() || undefined,
            );

    return (
        <>
            <TextInput
                name="warehouse.workloadIdentityProvider"
                label="Workload identity provider"
                description="The resource name of your Google Cloud workload identity pool provider."
                placeholder="projects/123456/locations/global/workloadIdentityPools/pool-id/providers/provider-id"
                required
                {...form.getInputProps('warehouse.workloadIdentityProvider')}
                value={provider}
                onChange={onIdentityInputChange('workloadIdentityProvider')}
                readOnly={status.kind !== 'available'}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.workloadIdentityAudience"
                label="Audience override"
                description="Optional. Only set this if your provider uses a custom allowed audience."
                {...form.getInputProps('warehouse.workloadIdentityAudience')}
                value={warehouse.workloadIdentityAudience ?? ''}
                onChange={onIdentityInputChange('workloadIdentityAudience')}
                placeholder={audience || 'Use the default audience'}
                readOnly={status.kind !== 'available'}
                disabled={disabled}
            />
            <Paper p="md">
                <Stack gap="sm">
                    <Title order={5}>Provider setup</Title>
                    <Text fz="sm" c="dimmed">
                        Pin this instance&apos;s subject in your provider&apos;s
                        attribute condition. The issuer and audience alone do
                        not restrict access to this instance.
                    </Text>
                    <WorkloadIdentityStatusMessage status={status} />
                    {status.kind !== 'loading' && (
                        <WorkloadIdentityDetails
                            identity={
                                status.kind === 'available'
                                    ? status.identity
                                    : null
                            }
                            audience={audience}
                        />
                    )}
                </Stack>
            </Paper>
        </>
    );
};

export default BigQueryWorkloadIdentityFields;
