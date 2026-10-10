import { Button, Checkbox, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import {
    useAgentWarehouseConfirmation,
    useConfirmAgentWarehouse,
    useDeleteAgentWarehouseConfirmation,
} from './api';

export const AgentWarehouseConfirmationCard = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    const status = useAgentWarehouseConfirmation(projectUuid);
    const confirm = useConfirmAgentWarehouse(projectUuid);
    const remove = useDeleteAgentWarehouseConfirmation(projectUuid);
    const people = useOrganizationUsers();
    const [accepted, setAccepted] = useState(false);
    const saving = confirm.isLoading || remove.isLoading;
    if (status.isError)
        return (
            <InlineErrorState
                message="Could not load warehouse confirmation."
                onRetry={() => void status.refetch()}
            />
        );
    if (!status.data) return <EmptyStateLoader />;
    const { confirmation, confirmed } = status.data;
    const person = people.data?.find(
        (member) => member.userUuid === confirmation?.confirmedByUserUuid,
    );
    const confirmedBy = person
        ? [person.firstName, person.lastName].filter(Boolean).join(' ') ||
          person.email
        : (confirmation?.confirmedByUserUuid ?? 'a former member');
    return (
        <SettingsCard>
            <Stack gap="md">
                <Title order={5}>Raw SQL for agents</Title>
                <Text size="sm">
                    {confirmed && confirmation
                        ? `Confirmed by ${confirmedBy} on ${new Date(confirmation.confirmedAt).toLocaleString()}`
                        : confirmation
                          ? 'Expired: the connection changed since confirmation.'
                          : 'Not confirmed'}
                </Text>
                <Text size="sm" c="dimmed">
                    Raw SQL also needs to be allowed by the agent's role and the
                    organization limits.
                </Text>
                {!confirmed && (
                    <Checkbox
                        label="The warehouse limits what the agent's identity can read"
                        checked={accepted}
                        disabled={saving}
                        onChange={(event) =>
                            setAccepted(event.currentTarget.checked)
                        }
                    />
                )}
                <Group gap="sm">
                    {!confirmed && (
                        <Button
                            disabled={!accepted || saving}
                            loading={confirm.isLoading}
                            onClick={() =>
                                confirm.mutate(undefined, {
                                    onSuccess: () => setAccepted(false),
                                })
                            }
                        >
                            Confirm
                        </Button>
                    )}
                    {confirmation && (
                        <Button
                            variant="default"
                            disabled={saving}
                            loading={remove.isLoading}
                            onClick={() =>
                                remove.mutate(undefined, {
                                    onSuccess: () => setAccepted(false),
                                })
                            }
                        >
                            Remove confirmation
                        </Button>
                    )}
                </Group>
            </Stack>
        </SettingsCard>
    );
};
