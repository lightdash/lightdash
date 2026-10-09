import { subject } from '@casl/ability';
import {
    FeatureFlags,
    WarehouseTypes,
    formatDate,
    type Project,
    type BigqueryCredentials,
    type AiServiceAccountSlot,
    type AiServiceAccountParent,
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
import { AgentAccessReportPanel } from './AgentAccessReportPanel';
import { AiServiceAccountForm } from './AiServiceAccountForm';
import {
    useAiServiceAccount,
    useDeleteAiServiceAccount,
    useOrganizationAgentIdentitySettings,
    useTestAiServiceAccount,
} from './api';
import { BigQueryAgentSetup } from './BigQueryAgentSetup';
import { useTestAgentAccess } from './useTestAgentAccess';

const AiServiceAccountDetails = ({
    slot,
    parent,
    testedPrincipal,
}: {
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    testedPrincipal: string | null;
}) => (
    <Stack gap="xs">
        {slot ? (
            <>
                <Text size="sm">Service account key file</Text>
                <Text size="xs" c="dimmed">
                    Last updated {formatDate(slot.updatedAt)}
                </Text>
            </>
        ) : parent ? (
            <>
                <Text size="sm">From parent project</Text>
                {parent.projectName !== null ? (
                    <Anchor
                        component={Link}
                        to={`/generalSettings/projectManagement/${parent.projectUuid}/agentIdentity`}
                        size="sm"
                    >
                        {parent.projectName}
                    </Anchor>
                ) : (
                    <Text size="sm">the parent project</Text>
                )}
                {parent.principal !== null ? (
                    <Text size="sm" role="status">
                        Signs in as {testedPrincipal ?? parent.principal}
                    </Text>
                ) : (
                    <Text size="sm" role="status">
                        The parent project's key could not be read.
                    </Text>
                )}
            </>
        ) : null}
    </Stack>
);

const AiServiceAccountRemoveModal = ({
    opened,
    inherit,
    parent,
    loading,
    onClose,
    onConfirm,
}: {
    opened: boolean;
    inherit: boolean;
    parent: AiServiceAccountParent | null;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) => (
    <MantineModal
        opened={opened}
        title={inherit ? "Use the parent's key" : 'Remove AI service account'}
        variant={inherit ? 'default' : 'delete'}
        description={
            inherit
                ? `Remove this project's key and use the parent project's key${parent?.principal ? ` (${parent.principal})` : ''}? Agent queries use the parent's key on the next query.`
                : 'Remove this AI service account? Agent queries are refused if your organisation requires it.'
        }
        confirmLabel={inherit ? "Use the parent's key" : 'Remove'}
        confirmLoading={loading}
        onClose={onClose}
        onConfirm={onConfirm}
    />
);

const AiServiceAccountSummary = ({
    projectUuid,
    slot,
    parent,
    testedPrincipal,
    onReplace,
    onTestSuccess,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    testedPrincipal: string | null;
    onReplace: () => void;
    onTestSuccess: (principal: string) => void;
}) => {
    const remove = useDeleteAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const accessTest = useTestAgentAccess(projectUuid, null);
    const [confirmation, setConfirmation] = useState<
        'remove' | 'inherit' | null
    >(null);
    const testing = test.isLoading || accessTest.isLoading;
    const busy = testing || remove.isLoading;
    return (
        <>
            <Group justify="space-between">
                <AiServiceAccountDetails
                    slot={slot}
                    parent={parent}
                    testedPrincipal={testedPrincipal}
                />
                <Group gap="xs">
                    <Button
                        variant="default"
                        disabled={busy}
                        onClick={() => {
                            test.reset();
                            onReplace();
                        }}
                    >
                        {slot ? 'Replace' : 'Use a different key'}
                    </Button>
                    <Button
                        variant="default"
                        loading={test.isLoading}
                        disabled={remove.isLoading || accessTest.isLoading}
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
                    {slot && (
                        <>
                            <Button
                                variant="default"
                                loading={accessTest.isLoading}
                                disabled={test.isLoading || remove.isLoading}
                                onClick={() =>
                                    accessTest.mutate({
                                        credentials: null,
                                        entryPoint:
                                            'project_agent_identity_page',
                                    })
                                }
                            >
                                Test as agent
                            </Button>
                            {parent && (
                                <Button
                                    variant="default"
                                    disabled={busy}
                                    onClick={() => setConfirmation('inherit')}
                                >
                                    Use the parent's key
                                </Button>
                            )}
                            <Button
                                variant="subtle"
                                color="red"
                                disabled={busy}
                                onClick={() => setConfirmation('remove')}
                            >
                                Remove
                            </Button>
                        </>
                    )}
                </Group>
            </Group>
            {slot && (
                <>
                    {accessTest.isLoading ? (
                        <Text size="sm" role="status">
                            Checking agent access…
                        </Text>
                    ) : (
                        accessTest.data && (
                            <AgentAccessReportPanel report={accessTest.data} />
                        )
                    )}
                    {accessTest.isError && (
                        <Text size="sm" c="red" role="alert">
                            Could not test agent access. Try again.
                        </Text>
                    )}
                </>
            )}
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
            <AiServiceAccountRemoveModal
                opened={confirmation !== null}
                inherit={confirmation === 'inherit'}
                parent={parent}
                loading={remove.isLoading}
                onClose={() => {
                    if (!remove.isLoading) setConfirmation(null);
                }}
                onConfirm={() =>
                    remove.mutate(undefined, {
                        onSuccess: () => {
                            test.reset();
                            accessTest.reset();
                            setConfirmation(null);
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
    parent,
    rule,
    testedPrincipal,
    onTestSuccess,
    onEdit,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    rule: OrganizationAgentIdentityRule;
    testedPrincipal: string | null;
    onTestSuccess: (principal: string) => void;
    onEdit: () => void;
}) => {
    return (
        <Stack gap="sm">
            {!slot && !parent && rule.source === 'ai_service_account' && (
                <Alert color="yellow">
                    AI agents on this connection are refused until an AI service
                    account is added.
                </Alert>
            )}
            {slot && testedPrincipal && (
                <Text size="sm" role="status">
                    Signs in as {testedPrincipal}
                </Text>
            )}
            {slot || parent ? (
                <AiServiceAccountSummary
                    projectUuid={projectUuid}
                    slot={slot}
                    parent={parent}
                    testedPrincipal={testedPrincipal}
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

const AiServiceAccountSettingsBody = ({
    projectUuid,
    connection,
    slot,
    parent,
    rule,
}: {
    projectUuid: string;
    connection: BigqueryCredentials;
    slot: AiServiceAccountSlot | null;
    parent: AiServiceAccountParent | null;
    rule: OrganizationAgentIdentityRule;
}) => {
    const [editing, setEditing] = useState(false);
    const [testedPrincipal, setTestedPrincipal] = useState<{
        identityKey: string;
        principal: string;
    } | null>(null);
    const identityKey = slot?.identityUuid ?? parent?.identityUuid ?? null;
    const principal =
        testedPrincipal?.identityKey === identityKey
            ? (testedPrincipal?.principal ?? null)
            : null;
    return (
        <>
            <BigQueryAgentSetup
                connection={connection}
                hasKey={!!slot || !!parent}
                tested={principal !== null}
            />
            <AiServiceAccountSettingsContent
                key={
                    slot
                        ? `${slot.identityUuid}:${slot.updatedAt}`
                        : (identityKey ?? 'empty')
                }
                projectUuid={projectUuid}
                slot={slot}
                parent={parent}
                rule={rule}
                testedPrincipal={principal}
                onTestSuccess={(principal) => {
                    if (identityKey)
                        setTestedPrincipal({
                            identityKey,
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
                                      identityKey: savedSlot.identityUuid,
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

const AiServiceAccountSettings = ({
    projectUuid,
    connection,
}: {
    projectUuid: string;
    connection: BigqueryCredentials;
}) => {
    const settings = useOrganizationAgentIdentitySettings();
    const status = useAiServiceAccount(projectUuid);
    const rule = settings.data?.rules.find(
        ({ warehouseType }) => warehouseType === WarehouseTypes.BIGQUERY,
    );
    if (settings.isLoading || status.isLoading) return <EmptyStateLoader />;
    if (settings.isError || status.isError || !rule || !status.data)
        return (
            <InlineErrorState
                message="Could not load the AI service account."
                onRetry={() => {
                    void settings.refetch();
                    void status.refetch();
                }}
            />
        );
    return (
        <AiServiceAccountSettingsBody
            projectUuid={projectUuid}
            connection={connection}
            slot={status.data.results}
            parent={status.data.parent}
            rule={rule}
        />
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
                    connection={project.warehouseConnection}
                />
            </Stack>
        </SettingsCard>
    );
};
