import { subject } from '@casl/ability';
import {
    assertUnreachable,
    FeatureFlags,
    WarehouseTypes,
    formatDate,
    type Project,
    type BigqueryCredentials,
    type DatabricksCredentials,
    type SnowflakeCredentials,
    type AiServiceAccountTestResult,
    type ApiError,
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
import { AiServiceAccountForm } from './AiServiceAccountForm';
import {
    useAiServiceAccount,
    useDeleteAiServiceAccount,
    useOrganizationAgentIdentitySettings,
    useTestAiServiceAccount,
} from './api';
import { BigQueryAgentSetup } from './BigQueryAgentSetup';
import { DatabricksAgentSetup } from './DatabricksAgentSetup';
import { getSnowflakeAiPrincipal } from './snowflakeAiPrincipal';
import { SnowflakeAiServiceAccountSetup } from './SnowflakeAiServiceAccountSetup';

type AiServiceAccountConnection =
    | BigqueryCredentials
    | DatabricksCredentials
    | SnowflakeCredentials;

const AiServiceAccountParentPrincipal = ({
    parent,
    testedPrincipal,
}: {
    parent: AiServiceAccountParent;
    testedPrincipal: string | null;
}) => {
    return parent.principal !== null ? (
        <Text size="sm" role="status">
            Signs in as {testedPrincipal ?? parent.principal}
        </Text>
    ) : (
        <Text size="sm" role="status">
            The parent project's key could not be read.
        </Text>
    );
};

const VerifiedAiServiceAccountDetails = ({
    slot,
    credentialsReadable,
    parent,
    testedPrincipal,
    observation,
    warehouseType,
}: {
    slot: AiServiceAccountSlot | null;
    credentialsReadable: boolean;
    parent: AiServiceAccountParent | null;
    testedPrincipal: string | null;
    observation: AiServiceAccountTestResult | null;
    warehouseType: WarehouseTypes.SNOWFLAKE | WarehouseTypes.DATABRICKS;
}) => {
    return (
        <Stack gap="xs">
            <Text size="sm">
                {warehouseType === WarehouseTypes.SNOWFLAKE
                    ? 'Snowflake key pair'
                    : 'Databricks service principal · OAuth M2M'}
            </Text>
            {!(slot ? credentialsReadable : parent?.credentialsReadable) ? (
                <Alert color="red" role="alert">
                    {warehouseType === WarehouseTypes.SNOWFLAKE
                        ? slot
                            ? 'The AI service account cannot be read. Use a different key.'
                            : 'The parent AI service account cannot be read. Use a different key.'
                        : slot
                          ? 'The AI service account cannot be read. Replace the credentials.'
                          : 'The parent AI service account cannot be read. Use different credentials.'}
                </Alert>
            ) : testedPrincipal ? (
                <Text size="sm" role="status">
                    Signs in as {testedPrincipal}
                </Text>
            ) : (
                <Text size="sm" c="dimmed">
                    Not checked yet. Run Test to see who it signs in as.
                </Text>
            )}
            {(observation?.ok || slot) && (
                <Text size="xs" c="dimmed">
                    {observation?.ok &&
                        `Last checked ${formatDate(observation.checkedAt)}`}
                    {observation?.ok && slot && ' · '}
                    {slot && `Last updated ${formatDate(slot.updatedAt)}`}
                </Text>
            )}
            {!slot && parent && (
                <Group gap="xs">
                    <Text size="sm" c="dimmed">
                        From parent project
                    </Text>
                    {parent.projectName !== null ? (
                        <Anchor
                            component={Link}
                            to={`/generalSettings/projectManagement/${parent.projectUuid}/agentIdentity`}
                            size="sm"
                        >
                            {parent.projectName}
                        </Anchor>
                    ) : (
                        <Text size="sm" c="dimmed">
                            the parent project
                        </Text>
                    )}
                </Group>
            )}
        </Stack>
    );
};

const AiServiceAccountDetails = ({
    slot,
    credentialsReadable,
    parent,
    testedPrincipal,
    warehouseType,
    observation,
}: {
    slot: AiServiceAccountSlot | null;
    credentialsReadable: boolean;
    parent: AiServiceAccountParent | null;
    testedPrincipal: string | null;
    warehouseType: AiServiceAccountConnection['type'];
    observation: AiServiceAccountTestResult | null;
}) => {
    switch (warehouseType) {
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.DATABRICKS:
            return (
                <VerifiedAiServiceAccountDetails
                    warehouseType={warehouseType}
                    slot={slot}
                    credentialsReadable={credentialsReadable}
                    parent={parent}
                    testedPrincipal={testedPrincipal}
                    observation={observation}
                />
            );
        case WarehouseTypes.BIGQUERY:
            return (
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
                            <AiServiceAccountParentPrincipal
                                parent={parent}
                                testedPrincipal={testedPrincipal}
                            />
                        </>
                    ) : null}
                </Stack>
            );
        default:
            return assertUnreachable(warehouseType, 'Unknown warehouse type');
    }
};

const AiServiceAccountRemoveModal = ({
    opened,
    inherit,
    warehouseType,
    parent,
    loading,
    onClose,
    onConfirm,
}: {
    opened: boolean;
    inherit: boolean;
    warehouseType: AiServiceAccountConnection['type'];
    parent: AiServiceAccountParent | null;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) => {
    const credentialLabel =
        warehouseType === WarehouseTypes.DATABRICKS ? 'credentials' : 'key';
    return (
        <MantineModal
            opened={opened}
            title={
                inherit
                    ? `Use the parent's ${credentialLabel}`
                    : 'Remove AI service account'
            }
            variant={inherit ? 'default' : 'delete'}
            description={
                inherit
                    ? `Remove this project's ${credentialLabel} and use the parent project's ${credentialLabel}${parent?.principal ? ` (${parent.principal})` : ''}? Agent queries use the parent's ${credentialLabel} on the next query.`
                    : 'Remove this AI service account? Agent queries are refused if your organisation requires it.'
            }
            confirmLabel={
                inherit ? `Use the parent's ${credentialLabel}` : 'Remove'
            }
            confirmLoading={loading}
            onClose={onClose}
            onConfirm={onConfirm}
        />
    );
};

const AiServiceAccountTestFeedback = ({
    result,
    error,
    observation,
    warehouseType,
}: {
    result: AiServiceAccountTestResult | null;
    error: ApiError | null;
    observation: AiServiceAccountTestResult | null;
    warehouseType: AiServiceAccountConnection['type'];
}) => (
    <>
        {result && !result.ok && (
            <Text
                size="sm"
                role={
                    warehouseType !== WarehouseTypes.BIGQUERY
                        ? 'alert'
                        : 'status'
                }
            >
                {result.message}
            </Text>
        )}
        {error && (
            <Text size="sm" c="red" role="alert">
                {error.error.message}
            </Text>
        )}
        {warehouseType !== WarehouseTypes.BIGQUERY &&
            observation?.ok &&
            (error || (result && !result.ok)) && (
                <Text size="sm" c="dimmed">
                    The principal above is from the last successful check.
                </Text>
            )}
    </>
);

const AiServiceAccountSummary = ({
    projectUuid,
    slot,
    credentialsReadable,
    parent,
    testedPrincipal,
    observation,
    warehouseType,
    onReplace,
    onTestSuccess,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot | null;
    credentialsReadable: boolean;
    parent: AiServiceAccountParent | null;
    testedPrincipal: string | null;
    observation: AiServiceAccountTestResult | null;
    warehouseType: AiServiceAccountConnection['type'];
    onReplace: () => void;
    onTestSuccess: (
        principal: string,
        verification: AiServiceAccountTestResult | null,
    ) => void;
}) => {
    const remove = useDeleteAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const [confirmation, setConfirmation] = useState<
        'remove' | 'inherit' | null
    >(null);
    const busy = test.isLoading || remove.isLoading;
    return (
        <>
            <Group justify="space-between">
                <AiServiceAccountDetails
                    slot={slot}
                    credentialsReadable={credentialsReadable}
                    parent={parent}
                    testedPrincipal={testedPrincipal}
                    observation={observation}
                    warehouseType={warehouseType}
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
                        {slot
                            ? 'Replace'
                            : warehouseType === WarehouseTypes.BIGQUERY
                              ? 'Use a different key'
                              : warehouseType === WarehouseTypes.SNOWFLAKE
                                ? 'Use a different key'
                                : 'Use a different service principal'}
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
                                        const principal =
                                            warehouseType ===
                                            WarehouseTypes.SNOWFLAKE
                                                ? getSnowflakeAiPrincipal(
                                                      result,
                                                  )
                                                : result.principal;
                                        if (result.ok && principal)
                                            onTestSuccess(
                                                principal,
                                                warehouseType ===
                                                    WarehouseTypes.DATABRICKS ||
                                                warehouseType ===
                                                    WarehouseTypes.SNOWFLAKE
                                                    ? result
                                                    : null,
                                            );
                                    },
                                },
                            )
                        }
                    >
                        Test
                    </Button>
                    {slot && (
                        <>
                            {parent && (
                                <Button
                                    variant="default"
                                    disabled={busy}
                                    onClick={() => setConfirmation('inherit')}
                                >
                                    {warehouseType === WarehouseTypes.DATABRICKS
                                        ? "Use the parent's credentials"
                                        : "Use the parent's key"}
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
            <AiServiceAccountTestFeedback
                result={test.data ?? null}
                error={test.error}
                observation={observation}
                warehouseType={warehouseType}
            />
            <AiServiceAccountRemoveModal
                opened={confirmation !== null}
                warehouseType={warehouseType}
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
    credentialsReadable,
    parent,
    rule,
    testedPrincipal,
    observation,
    warehouseType,
    onTestSuccess,
    onEdit,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot | null;
    credentialsReadable: boolean;
    parent: AiServiceAccountParent | null;
    rule: OrganizationAgentIdentityRule;
    testedPrincipal: string | null;
    observation: AiServiceAccountTestResult | null;
    warehouseType: AiServiceAccountConnection['type'];
    onTestSuccess: (
        principal: string,
        verification: AiServiceAccountTestResult | null,
    ) => void;
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
            {slot &&
                testedPrincipal &&
                warehouseType === WarehouseTypes.BIGQUERY && (
                    <Text size="sm" role="status">
                        Signs in as {testedPrincipal}
                    </Text>
                )}
            {slot || parent ? (
                <AiServiceAccountSummary
                    projectUuid={projectUuid}
                    slot={slot}
                    credentialsReadable={credentialsReadable}
                    parent={parent}
                    testedPrincipal={testedPrincipal}
                    observation={observation}
                    warehouseType={warehouseType}
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

interface TestedAiPrincipal {
    identityKey: string;
    principal: string;
    verification: AiServiceAccountTestResult | null;
}

const getAiPrincipalState = (
    slot: AiServiceAccountSlot | null,
    parent: AiServiceAccountParent | null,
    verification: AiServiceAccountTestResult | null,
    testedPrincipal: TestedAiPrincipal | null,
    warehouseType: AiServiceAccountConnection['type'],
) => {
    const identityKey = slot?.identityUuid ?? parent?.identityUuid ?? null;
    const persistedVerification = slot
        ? verification
        : (parent?.verification ?? null);
    const currentTest =
        testedPrincipal?.identityKey === identityKey ? testedPrincipal : null;
    const observation = currentTest?.verification ?? persistedVerification;
    const principal =
        currentTest?.principal ??
        (warehouseType === WarehouseTypes.SNOWFLAKE
            ? getSnowflakeAiPrincipal(observation)
            : warehouseType === WarehouseTypes.DATABRICKS
              ? observation?.ok
                  ? observation.principal
                  : null
              : null);
    return { identityKey, observation, principal };
};

const AiServiceAccountSetup = ({
    connection,
    hasKey,
    tested,
}: {
    connection: AiServiceAccountConnection;
    hasKey: boolean;
    tested: boolean;
}) => {
    switch (connection.type) {
        case WarehouseTypes.BIGQUERY:
            return (
                <BigQueryAgentSetup
                    connection={connection}
                    hasKey={hasKey}
                    tested={tested}
                />
            );
        case WarehouseTypes.DATABRICKS:
            return (
                <DatabricksAgentSetup
                    connection={connection}
                    hasCredentials={hasKey}
                    tested={tested}
                />
            );
        case WarehouseTypes.SNOWFLAKE:
            return <SnowflakeAiServiceAccountSetup hasKey={hasKey} />;
        default:
            return assertUnreachable(connection, 'Unknown warehouse type');
    }
};

const AiServiceAccountSettingsBody = ({
    projectUuid,
    connection,
    slot,
    credentialsReadable,
    parent,
    rule,
    verification,
}: {
    projectUuid: string;
    connection: AiServiceAccountConnection;
    verification: AiServiceAccountTestResult | null;
    slot: AiServiceAccountSlot | null;
    credentialsReadable: boolean;
    parent: AiServiceAccountParent | null;
    rule: OrganizationAgentIdentityRule;
}) => {
    const [editing, setEditing] = useState(false);
    const [testedPrincipal, setTestedPrincipal] =
        useState<TestedAiPrincipal | null>(null);
    const { identityKey, observation, principal } = getAiPrincipalState(
        slot,
        parent,
        verification,
        testedPrincipal,
        connection.type,
    );
    return (
        <>
            <AiServiceAccountSetup
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
                credentialsReadable={credentialsReadable}
                parent={parent}
                rule={rule}
                testedPrincipal={principal}
                observation={observation}
                warehouseType={connection.type}
                onTestSuccess={(principal, verification) => {
                    if (identityKey)
                        setTestedPrincipal({
                            identityKey,
                            principal,
                            verification,
                        });
                }}
                onEdit={() => setEditing(true)}
            />
            {editing && (
                <AiServiceAccountForm
                    projectUuid={projectUuid}
                    warehouseType={connection.type}
                    onSaved={(savedSlot, principal, verification) =>
                        setTestedPrincipal(
                            principal
                                ? {
                                      identityKey: savedSlot.identityUuid,
                                      principal,
                                      verification: verification ?? null,
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
    connection: AiServiceAccountConnection;
}) => {
    const settings = useOrganizationAgentIdentitySettings();
    const status = useAiServiceAccount(projectUuid);
    const rule = settings.data?.rules.find(
        ({ warehouseType }) => warehouseType === connection.type,
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
            verification={status.data.verification ?? null}
            slot={status.data.results}
            credentialsReadable={status.data.credentialsReadable}
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
        (project.warehouseConnection?.type !== WarehouseTypes.BIGQUERY &&
            project.warehouseConnection?.type !== WarehouseTypes.DATABRICKS &&
            project.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE) ||
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
