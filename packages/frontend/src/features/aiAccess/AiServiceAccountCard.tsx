import { subject } from '@casl/ability';
import {
    FeatureFlags,
    WarehouseTypes,
    formatDate,
    type Project,
    type AiServiceAccountSlot,
} from '@lightdash/common';
import {
    Alert,
    Anchor,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineModal from '../../components/common/MantineModal';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { AiServiceAccountForm } from './AiServiceAccountForm';
import {
    useAiServiceAccount,
    useDeleteAiServiceAccount,
    useOrganizationAgentIdentitySettings,
    useTestAiServiceAccount,
} from './api';
import {
    agentIdentitySentence,
    identityWarehouseNames,
    inlineIdentityLabel,
} from './identityLabels';

const AiServiceAccountSlotSummary = ({
    projectUuid,
    slot,
    onReplace,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot;
    onReplace: () => void;
}) => {
    const remove = useDeleteAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const [removing, setRemoving] = useState(false);
    return (
        <>
            <Group justify="space-between">
                <Stack gap="xs">
                    <Text size="sm">Service account key file</Text>
                    <Text size="xs" c="dimmed">
                        Last updated {formatDate(slot.updatedAt)}
                    </Text>
                </Stack>
                <Group gap="xs">
                    <Button
                        variant="default"
                        disabled={test.isLoading || remove.isLoading}
                        onClick={() => {
                            test.reset();
                            onReplace();
                        }}
                    >
                        Replace
                    </Button>
                    <Button
                        variant="default"
                        loading={test.isLoading}
                        disabled={remove.isLoading}
                        onClick={() => test.mutate({ credentials: null })}
                    >
                        Test
                    </Button>
                    <Button
                        variant="subtle"
                        color="red"
                        disabled={test.isLoading || remove.isLoading}
                        onClick={() => setRemoving(true)}
                    >
                        Remove
                    </Button>
                </Group>
            </Group>
            {test.data && (
                <Text size="sm" role="status">
                    {test.data.ok && test.data.principal
                        ? `Connected as ${test.data.principal}`
                        : test.data.message}
                </Text>
            )}
            {test.error && (
                <Text size="sm" c="red" role="alert">
                    {test.error.error.message}
                </Text>
            )}
            <MantineModal
                opened={removing}
                title="Remove AI service account"
                variant="delete"
                description="Remove this AI service account? Agent queries are refused if your organisation requires it."
                confirmLabel="Remove"
                confirmLoading={remove.isLoading}
                onClose={() => {
                    if (!remove.isLoading) setRemoving(false);
                }}
                onConfirm={() =>
                    remove.mutate(undefined, {
                        onSuccess: () => {
                            test.reset();
                            setRemoving(false);
                        },
                    })
                }
            />
        </>
    );
};

const AiServiceAccountSettings = ({ projectUuid }: { projectUuid: string }) => {
    const settings = useOrganizationAgentIdentitySettings();
    const slot = useAiServiceAccount(projectUuid);
    const [editing, setEditing] = useState(false);
    const rule = settings.data?.rules.find(
        ({ warehouseType }) => warehouseType === WarehouseTypes.BIGQUERY,
    );

    if (settings.isLoading || slot.isLoading) return <EmptyStateLoader />;
    if (settings.isError || slot.isError || !rule)
        return (
            <InlineErrorState
                message="Could not load the AI service account."
                onRetry={() => {
                    void settings.refetch();
                    void slot.refetch();
                }}
            />
        );

    return (
        <Stack gap="sm">
            <Text size="sm">
                {agentIdentitySentence(identityWarehouseNames.bigquery)}{' '}
                {inlineIdentityLabel(rule.source)}.
            </Text>
            {rule.required && (
                <Text size="sm">Required by your organisation.</Text>
            )}
            <Anchor
                component={Link}
                to="/generalSettings/warehouseCredentials"
                size="sm"
            >
                Organisation settings
            </Anchor>
            {!slot.data &&
                rule.source === 'ai_service_account' &&
                (rule.required ? (
                    <Alert color="yellow">
                        AI agents on this connection are refused until an AI
                        service account is added.
                    </Alert>
                ) : (
                    <Text size="sm" c="dimmed">
                        AI agents use the same credentials as the user until an
                        AI service account is added.
                    </Text>
                ))}
            {slot.data ? (
                <AiServiceAccountSlotSummary
                    projectUuid={projectUuid}
                    slot={slot.data}
                    onReplace={() => setEditing(true)}
                />
            ) : (
                <Paper variant="dotted" p="sm">
                    <Button variant="subtle" onClick={() => setEditing(true)}>
                        Add an AI service account
                    </Button>
                </Paper>
            )}
            {editing && (
                <AiServiceAccountForm
                    projectUuid={projectUuid}
                    onClose={() => setEditing(false)}
                />
            )}
        </Stack>
    );
};

export const AiServiceAccountCard = ({ project }: { project: Project }) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const ability = useAbilityContext();
    if (
        !project.projectUuid ||
        project.warehouseConnection?.type !== WarehouseTypes.BIGQUERY ||
        !flag?.enabled ||
        !ability.can(
            'manage',
            subject('Project', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        )
    )
        return null;
    return (
        <SettingsCard mt="md">
            <Stack gap="sm">
                <Title order={5}>AI service account</Title>
                <AiServiceAccountSettings
                    key={project.projectUuid}
                    projectUuid={project.projectUuid}
                />
            </Stack>
        </SettingsCard>
    );
};
