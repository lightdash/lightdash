import {
    AiIdentityProvisionerStatus,
    type AiIdentityProvisioningSettings,
    type AiIdentityProvisioningPlan,
    type AiIdentityJob,
    type ApiError,
} from '@lightdash/common';
import { Button, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { aiIdentityProvisioningApi } from './api';
import {
    canRunProvisioning,
    needsProvisioningApproval,
    operationLabels,
} from './provisioning';

export const AiIdentityProvisioningReview: FC<{
    settings: AiIdentityProvisioningSettings;
    hint: string | null;
    mappingsDirty: boolean;
    onJob: (uuid: string) => void;
}> = ({ settings, hint, mappingsDirty, onJob }) => {
    const uuid = settings.aiIdentityAccountUuid;
    const client = useQueryClient();
    const [confirm, setConfirm] = useState(false);
    const ready =
        settings.provisioner?.status === AiIdentityProvisionerStatus.READY;
    const plan = useQuery({
        queryKey: ['ai-identity-provisioning-plan', uuid],
        queryFn: () => aiIdentityProvisioningApi.plan(uuid),
        enabled: ready && !mappingsDirty,
    });
    const run = useMutation<AiIdentityJob, ApiError>({
        mutationFn: () =>
            aiIdentityProvisioningApi.run(uuid, { approveStatements: true }),
        onSuccess: (job) => {
            setConfirm(false);
            onJob(job.jobUuid);
            void client.invalidateQueries(['ai-identity-provisioning', uuid]);
            void client.invalidateQueries([
                'ai-identity-provisioning-plan',
                uuid,
            ]);
        },
    });
    const needsApproval = needsProvisioningApproval(settings);
    const disabled = !canRunProvisioning(settings, {
        mappingsDirty,
        hasPlan: !!plan.data,
        fetchingPlan: plan.isFetching,
        planError: plan.isError,
        running: run.isLoading,
    });
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>5. Review and run</Title>
                {hint && (
                    <Text fz="sm" c="dimmed">
                        {hint}
                    </Text>
                )}
                {needsApproval ? (
                    <Text fz="sm">
                        Review every statement before the first run.
                    </Text>
                ) : (
                    <Text fz="sm">
                        Lightdash runs these when people join, leave or change
                        groups. Every statement is in the request log.
                    </Text>
                )}
                {mappingsDirty && (
                    <Text fz="sm" c="dimmed">
                        Save the group mappings first.
                    </Text>
                )}
                {plan.isError && (
                    <Callout variant="danger">Could not load the plan.</Callout>
                )}
                {run.error && (
                    <Callout variant="danger">
                        {run.error.error.message}
                    </Callout>
                )}
                <Button
                    variant="default"
                    disabled={!ready || mappingsDirty}
                    loading={plan.isFetching}
                    onClick={() => void plan.refetch()}
                >
                    Refresh plan
                </Button>
                {plan.data && !mappingsDirty && (
                    <ProvisioningPlan plan={plan.data} />
                )}
                <Button
                    disabled={disabled}
                    loading={run.isLoading}
                    onClick={() =>
                        needsApproval ? setConfirm(true) : run.mutate()
                    }
                >
                    {needsApproval ? 'Approve and run' : 'Run now'}
                </Button>
                <MantineModal
                    opened={confirm}
                    onClose={() => setConfirm(false)}
                    title="Approve and run?"
                    role="alertdialog"
                    description={`Run ${plan.data?.items.length ?? 0} statements in Snowflake and allow future automatic runs?`}
                    confirmLabel="Approve and run"
                    confirmDisabled={disabled}
                    confirmLoading={run.isLoading}
                    onConfirm={() => run.mutate()}
                >
                    {run.error && (
                        <Callout variant="danger">
                            {run.error.error.message}
                        </Callout>
                    )}
                </MantineModal>
            </Stack>
        </Paper>
    );
};

const ProvisioningPlan: FC<{ plan: AiIdentityProvisioningPlan }> = ({
    plan,
}) => {
    const personName = (person: {
        email: string | null;
        firstName?: string;
        lastName?: string;
    }) =>
        [person.firstName, person.lastName].filter(Boolean).join(' ') ||
        person.email ||
        'Unknown person';
    return (
        <>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Person</Table.Th>
                        <Table.Th>Statements</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {plan.items.map((item) => (
                        <Table.Tr key={`${item.aiIdentityUuid}-${item.sql}`}>
                            <Table.Td>{personName(item)}</Table.Td>
                            <Table.Td>
                                <Text fz="sm">
                                    {operationLabels[item.operation.kind]}
                                </Text>
                                <Text
                                    fz="sm"
                                    ff="monospace"
                                    style={{
                                        whiteSpace: 'pre-wrap',
                                        overflowWrap: 'anywhere',
                                    }}
                                >
                                    {item.sql}
                                </Text>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                    {plan.skipped.map((person) => {
                        const name = personName(person);
                        return (
                            <Table.Tr key={person.email}>
                                <Table.Td>{name}</Table.Td>
                                <Table.Td>
                                    <Text fz="sm">
                                        {person.reason.startsWith(
                                            'no Snowflake login recorded',
                                        )
                                            ? `Not in this run. ${name} has not signed in to Snowflake. Lightdash creates the AI identity after ${person.firstName || name} signs in.`
                                            : `Not in this run. ${name}: ${person.reason}.`}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
            {plan.items.length === 0 && plan.skipped.length === 0 && (
                <Text fz="sm" c="dimmed">
                    No statements to run.
                </Text>
            )}
        </>
    );
};
