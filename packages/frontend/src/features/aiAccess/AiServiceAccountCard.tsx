import { subject } from '@casl/ability';
import {
    FeatureFlags,
    WarehouseTypes,
    formatDate,
    type Project,
    type AiServiceAccountSlot,
    type OrganizationAgentIdentityRule,
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
    onTestSuccess,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot;
    onReplace: () => void;
    onTestSuccess: (principal: string) => void;
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
                        onClick={() =>
                            test.mutate(
                                { credentials: null },
                                {
                                    onSuccess: (result) => {
                                        if (result.ok && result.principal)
                                            onTestSuccess(result.principal);
                                    },
                                },
                            )
                        }
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
            {test.data && !test.data.ok && (
                <Text size="sm" role="status">
                    {test.data.message}
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

const AiServiceAccountSettingsContent = ({
    projectUuid,
    slot,
    rule,
    testedPrincipal,
    onTestSuccess,
    onEdit,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot | null;
    rule: OrganizationAgentIdentityRule;
    testedPrincipal: string | null;
    onTestSuccess: (principal: string) => void;
    onEdit: () => void;
}) => {
    return (
        <Stack gap="sm">
            <Text size="sm">
                {agentIdentitySentence(identityWarehouseNames.bigquery)}{' '}
                {inlineIdentityLabel(rule.source)}.
            </Text>
            <Text size="sm">
                {rule.source === 'ai_service_account' &&
                    'Required by your organisation. '}
                <Anchor
                    component={Link}
                    to="/generalSettings/warehouseCredentials"
                    size="sm"
                >
                    Organisation settings
                </Anchor>
            </Text>
            {rule.source === 'marked_person' && (
                <Text size="sm" c="dimmed">
                    Agents use the same credentials as the user. No AI service
                    account key is needed.
                </Text>
            )}
            {!slot && rule.source === 'ai_service_account' && (
                <Alert color="yellow">
                    AI agents on this connection are refused until an AI service
                    account is added.
                </Alert>
            )}
            {testedPrincipal && (
                <Text size="sm" role="status">
                    Signs in as {testedPrincipal}
                </Text>
            )}
            {slot ? (
                <AiServiceAccountSlotSummary
                    projectUuid={projectUuid}
                    slot={slot}
                    onTestSuccess={onTestSuccess}
                    onReplace={onEdit}
                />
            ) : (
                <Paper variant="dotted" p="sm">
                    <Button variant="subtle" onClick={onEdit}>
                        Add an AI service account
                    </Button>
                </Paper>
            )}
        </Stack>
    );
};

const AiServiceAccountSettings = ({ projectUuid }: { projectUuid: string }) => {
    const [editing, setEditing] = useState(false);
    const [testedPrincipal, setTestedPrincipal] = useState<{
        identityUuid: string;
        principal: string;
    } | null>(null);
    const settings = useOrganizationAgentIdentitySettings();
    const slot = useAiServiceAccount(projectUuid);
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
        <>
            <AiServiceAccountSettingsContent
                key={
                    slot.data
                        ? `${slot.data.identityUuid}:${slot.data.updatedAt}`
                        : 'empty'
                }
                projectUuid={projectUuid}
                slot={slot.data ?? null}
                rule={rule}
                testedPrincipal={
                    testedPrincipal?.identityUuid === slot.data?.identityUuid
                        ? (testedPrincipal?.principal ?? null)
                        : null
                }
                onTestSuccess={(principal) => {
                    if (slot.data)
                        setTestedPrincipal({
                            identityUuid: slot.data.identityUuid,
                            principal,
                        });
                }}
                onEdit={() => setEditing(true)}
            />
            {editing && (
                <AiServiceAccountForm
                    projectUuid={projectUuid}
                    onSaved={(savedSlot, principal) =>
                        setTestedPrincipal(
                            principal
                                ? {
                                      identityUuid: savedSlot.identityUuid,
                                      principal,
                                  }
                                : null,
                        )
                    }
                    onClose={() => setEditing(false)}
                />
            )}
        </>
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
