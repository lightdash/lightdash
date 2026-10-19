import { subject } from '@casl/ability';
import {
    assertUnreachable,
    supportsAiServiceAccount,
    type WarehouseCredentials,
    FeatureFlags,
    ProjectType,
    getProjectAgentIdentitySettingsPath,
    WarehouseTypes,
    type Project,
    type PostgresCredentials,
    type RedshiftCredentials,
    type TrinoCredentials,
    type ClickhouseCredentials,
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
import { Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
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
import { ClickhouseAgentSetup } from './ClickhouseAgentSetup';
import { DatabricksAgentSetup } from './DatabricksAgentSetup';
import { getAiServiceAccountStatus } from './getAiServiceAccountStatus';
import { PostgresAgentSetup } from './PostgresAgentSetup';
import { RedshiftAgentSetup } from './RedshiftAgentSetup';
import { getSnowflakeAiPrincipal } from './snowflakeAiPrincipal';
import { SnowflakeAiServiceAccountSetup } from './SnowflakeAiServiceAccountSetup';
import { TrinoAgentSetup } from './TrinoAgentSetup';

type AiServiceAccountConnection =
    | ClickhouseCredentials
    | RedshiftCredentials
    | TrinoCredentials
    | PostgresCredentials
    | AthenaCredentials
    | BigqueryCredentials
    | DatabricksCredentials
    | SnowflakeCredentials;

const isAiServiceAccountConnection = (
    connection: WarehouseCredentials,
): connection is AiServiceAccountConnection =>
    supportsAiServiceAccount(connection.type);

const AiServiceAccountRemoveModal = ({
    opened,
    loading,
    onClose,
    onConfirm,
}: {
    opened: boolean;
    loading: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) => (
    <MantineModal
        opened={opened}
        title="Remove shared agent account"
        variant="delete"
        confirmLabel="Remove"
        confirmLoading={loading}
        onClose={onClose}
        onConfirm={onConfirm}
    >
        <Text size="sm">
            Remove this shared agent account? Agent queries are refused if your
            organization requires it.
        </Text>
    </MantineModal>
);

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
                    The account above is from the last successful check.
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
    onReplace: (() => void) | null;
    onTestSuccess: (
        principal: string,
        verification: AiServiceAccountTestResult | null,
    ) => void;
}) => {
    const remove = useDeleteAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const [confirmation, setConfirmation] = useState(false);
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
                    {onReplace !== null && (
                        <>
                            <Button
                                variant="default"
                                disabled={busy}
                                onClick={() => {
                                    test.reset();
                                    onReplace();
                                }}
                            >
                                Replace
                            </Button>
                            <Button
                                variant="subtle"
                                color="red"
                                disabled={busy}
                                onClick={() => setConfirmation(true)}
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
            {onReplace !== null && (
                <AiServiceAccountRemoveModal
                    opened={confirmation}
                    loading={remove.isLoading}
                    onClose={() => {
                        if (!remove.isLoading) setConfirmation(false);
                    }}
                    onConfirm={() =>
                        remove.mutate(undefined, {
                            onSuccess: () => {
                                test.reset();
                                setConfirmation(false);
                            },
                        })
                    }
                />
            )}
        </>
    );
};

const AiServiceAccountSettingsContent = ({
    projectUuid,
    upstreamProjectUuid,
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
    upstreamProjectUuid: string | null;
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
    const status = getAiServiceAccountStatus({
        rule: { ...rule, warehouseType },
        slot,
        parent,
        credentialsReadable,
        isPreview: upstreamProjectUuid !== null,
    });
    const parentLink =
        upstreamProjectUuid !== null ? (
            <Anchor
                component={Link}
                to={getProjectAgentIdentitySettingsPath(upstreamProjectUuid)}
                size="sm"
            >
                the parent project
            </Anchor>
        ) : null;
    const missingRequiredParent =
        upstreamProjectUuid !== null &&
        !slot &&
        !parent &&
        rule.source === 'ai_service_account';
    return (
        <Stack gap="sm">
            <AiServiceAccountStatus
                status={{
                    ...status,
                    alert:
                        missingRequiredParent && status.alert
                            ? {
                                  ...status.alert,
                                  message: (
                                      <>
                                          {status.alert.message} Ask an admin to
                                          add one on {parentLink}.
                                      </>
                                  ),
                              }
                            : status.alert,
                }}
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
                    onReplace={upstreamProjectUuid === null ? onEdit : null}
                />
            ) : upstreamProjectUuid !== null ? (
                !missingRequiredParent && (
                    <Text size="sm">
                        The parent project has no shared agent account. Add one
                        on {parentLink}.
                    </Text>
                )
            ) : (
                <Group>
                    <Button variant="filled" onClick={onEdit}>
                        Add shared agent account
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
            : warehouseType === WarehouseTypes.TRINO ||
                warehouseType === WarehouseTypes.REDSHIFT ||
                warehouseType === WarehouseTypes.CLICKHOUSE ||
                warehouseType === WarehouseTypes.POSTGRES ||
                warehouseType === WarehouseTypes.DATABRICKS ||
                warehouseType === WarehouseTypes.ATHENA
              ? observation?.ok
                  ? observation.principal
                  : null
              : null);
    return { identityKey, observation, principal };
};

const AiServiceAccountSetup = ({
    connection,
}: {
    connection: AiServiceAccountConnection;
}) => {
    switch (connection.type) {
        case WarehouseTypes.TRINO:
            return <TrinoAgentSetup connection={connection} />;
        case WarehouseTypes.CLICKHOUSE:
            return <ClickhouseAgentSetup connection={connection} />;
        case WarehouseTypes.REDSHIFT:
            return <RedshiftAgentSetup connection={connection} />;
        case WarehouseTypes.POSTGRES:
            return <PostgresAgentSetup connection={connection} />;
        case WarehouseTypes.ATHENA:
            return <AthenaAgentSetup connection={connection} />;
        case WarehouseTypes.BIGQUERY:
            return <BigQueryAgentSetup connection={connection} />;
        case WarehouseTypes.DATABRICKS:
            return <DatabricksAgentSetup connection={connection} />;
        case WarehouseTypes.SNOWFLAKE:
            return <SnowflakeAiServiceAccountSetup />;
        default:
            return assertUnreachable(connection, 'Unknown warehouse type');
    }
};

const AiServiceAccountSettingsBody = ({
    projectUuid,
    upstreamProjectUuid,
    connection,
    slot,
    credentialsReadable,
    parent,
    rule,
    verification,
}: {
    projectUuid: string;
    upstreamProjectUuid: string | null;
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
                upstreamProjectUuid={upstreamProjectUuid}
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
            {upstreamProjectUuid === null && !slot && !parent && (
                <AiServiceAccountSetup connection={connection} />
            )}
            {upstreamProjectUuid === null && editing && (
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
    upstreamProjectUuid,
    connection,
}: {
    projectUuid: string;
    upstreamProjectUuid: string | null;
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
                message="Could not load the shared agent account."
                onRetry={() => {
                    void settings.refetch();
                    void status.refetch();
                }}
            />
        );
    return (
        <AiServiceAccountSettingsBody
            projectUuid={projectUuid}
            upstreamProjectUuid={upstreamProjectUuid}
            connection={connection}
            verification={status.data.verification ?? null}
            slot={upstreamProjectUuid === null ? status.data.results : null}
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
        !project.warehouseConnection ||
        !isAiServiceAccountConnection(project.warehouseConnection) ||
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
                    upstreamProjectUuid={
                        project.type === ProjectType.PREVIEW
                            ? (project.upstreamProjectUuid ?? null)
                            : null
                    }
                    connection={project.warehouseConnection}
                />
            </Stack>
        </SettingsCard>
    );
};
