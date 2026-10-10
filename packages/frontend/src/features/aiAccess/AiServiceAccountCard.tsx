import { subject } from '@casl/ability';
import {
    assertUnreachable,
    FeatureFlags,
    WarehouseTypes,
    type Project,
    type AthenaCredentials,
    type BigqueryCredentials,
    type DatabricksCredentials,
    type SnowflakeCredentials,
    type AiServiceAccountTestResult,
    type ApiError,
    type AiServiceAccountSlot,
    type AiServiceAccountParent,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineModal from '../../components/common/MantineModal';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { AiServiceAccountDetails } from './AiServiceAccountDetails';
import { AiServiceAccountForm } from './AiServiceAccountForm';
import { AiServiceAccountStatus } from './AiServiceAccountStatus';
import {
    useAiServiceAccount,
    useDeleteAiServiceAccount,
    useOrganizationAgentIdentitySettings,
    useTestAiServiceAccount,
} from './api';
import { AthenaAgentSetup } from './AthenaAgentSetup';
import { BigQueryAgentSetup } from './BigQueryAgentSetup';
import { DatabricksAgentSetup } from './DatabricksAgentSetup';
import { getAiServiceAccountStatus } from './getAiServiceAccountStatus';
import { getSnowflakeAiPrincipal } from './snowflakeAiPrincipal';
import { SnowflakeAiServiceAccountSetup } from './SnowflakeAiServiceAccountSetup';

type AiServiceAccountConnection =
    | AthenaCredentials
    | BigqueryCredentials
    | DatabricksCredentials
    | SnowflakeCredentials;

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
    const parentPrincipal =
        warehouseType === WarehouseTypes.SNOWFLAKE
            ? (getSnowflakeAiPrincipal(parent?.verification ?? null) ??
              parent?.principal ??
              null)
            : (parent?.principal ??
              (parent?.verification?.ok
                  ? parent.verification.principal
                  : null));
    return (
        <MantineModal
            opened={opened}
            title={
                inherit
                    ? "Use the parent's account"
                    : 'Remove AI service account'
            }
            variant={inherit ? 'default' : 'delete'}
            confirmLabel={inherit ? "Use the parent's account" : 'Remove'}
            confirmLoading={loading}
            onClose={onClose}
            onConfirm={onConfirm}
        >
            <Stack gap="sm">
                <Text size="sm">
                    {inherit
                        ? "Remove this preview's own account and use the parent project's account? Agents use it on the next query."
                        : 'Remove this AI service account? Agent queries are refused if your organization requires it.'}
                </Text>
                {inherit && parentPrincipal && (
                    <Text size="sm">{parentPrincipal}</Text>
                )}
            </Stack>
        </MantineModal>
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
            <Alert color="red" role="alert">
                {result.message}
            </Alert>
        )}
        {error && (
            <Alert color="red" role="alert">
                {error.error.message}
            </Alert>
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
    parent,
    testedPrincipal,
    observation,
    warehouseType,
    onReplace,
    onTestSuccess,
}: {
    projectUuid: string;
    slot: AiServiceAccountSlot | null;
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
            <Stack gap="sm">
                <AiServiceAccountDetails
                    slot={slot}
                    parent={parent}
                    testedPrincipal={testedPrincipal}
                    observation={observation}
                    warehouseType={warehouseType}
                />
                <Group gap="xs">
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
                                            onTestSuccess(principal, result);
                                    },
                                },
                            )
                        }
                    >
                        Test
                    </Button>
                    <Button
                        variant="default"
                        disabled={busy}
                        onClick={() => {
                            test.reset();
                            onReplace();
                        }}
                    >
                        {slot ? 'Replace' : "Add this preview's own account"}
                    </Button>
                    {slot && (
                        <>
                            {parent && (
                                <Button
                                    variant="default"
                                    disabled={busy}
                                    onClick={() => setConfirmation('inherit')}
                                >
                                    Use the parent's account
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
            </Stack>
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
            <AiServiceAccountStatus
                status={getAiServiceAccountStatus({
                    rule: { ...rule, warehouseType },
                    slot,
                    parent,
                    credentialsReadable,
                })}
            />
            {slot || parent ? (
                <AiServiceAccountSummary
                    projectUuid={projectUuid}
                    slot={slot}
                    parent={parent}
                    testedPrincipal={testedPrincipal}
                    observation={observation}
                    warehouseType={warehouseType}
                    onTestSuccess={onTestSuccess}
                    onReplace={onEdit}
                />
            ) : (
                <Group>
                    <Button variant="filled" onClick={onEdit}>
                        Add AI service account
                    </Button>
                </Group>
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
    const persistedVerification =
        warehouseType === WarehouseTypes.BIGQUERY
            ? null
            : slot
              ? verification
              : (parent?.verification ?? null);
    const currentTest =
        testedPrincipal?.identityKey === identityKey ? testedPrincipal : null;
    const observation = currentTest?.verification ?? persistedVerification;
    const principal =
        currentTest?.principal ??
        (warehouseType === WarehouseTypes.SNOWFLAKE
            ? getSnowflakeAiPrincipal(observation)
            : warehouseType === WarehouseTypes.DATABRICKS ||
                warehouseType === WarehouseTypes.ATHENA
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
        case WarehouseTypes.ATHENA:
            return (
                <AthenaAgentSetup
                    connection={connection}
                    hasCredentials={hasKey}
                    tested={tested}
                />
            );
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
            return (
                <SnowflakeAiServiceAccountSetup
                    hasKey={hasKey}
                    tested={tested}
                />
            );
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
            <AiServiceAccountSetup
                connection={connection}
                hasKey={!!slot || !!parent}
                tested={principal !== null}
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
        (project.warehouseConnection?.type !== WarehouseTypes.ATHENA &&
            project.warehouseConnection?.type !== WarehouseTypes.BIGQUERY &&
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
                <AiServiceAccountSettings
                    key={project.projectUuid}
                    projectUuid={project.projectUuid}
                    connection={project.warehouseConnection}
                />
            </Stack>
        </SettingsCard>
    );
};
