import {
    AI_DIRECT_TRANSPORT,
    AiAgentMarkerLevel,
    AiPrincipalKind,
    AiTransportKind,
    FeatureFlags,
    assertUnreachable,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Code,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useState, type ReactNode } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { AiMarkerTest } from './AiMarkerTest';
import { AiPolicyEditor } from './AiPolicyEditor';
import { AiPolicySource } from './AiPolicySource';
import { Principals, PrincipalsEmptyState } from './AiPrincipals';
import { AiSetupScriptDrawer } from './AiSetupScriptDrawer';
import {
    SnowflakeIdentityCard,
    SnowflakeMarkerTest,
} from './AiSnowflakeIdentity';
import { AiWarehouseSignals } from './AiWarehouseSignals';
import { useUpsertAiAccessPolicy } from './api';

const toInput = (policy: AiAccessPolicy | null): UpsertAiAccessPolicy => ({
    enabled: true,
    principalKind: policy?.principalKind ?? AiPrincipalKind.SHARED,
    transport: policy?.transport ?? AI_DIRECT_TRANSPORT,
    sharedRef: policy?.sharedRef ?? null,
    twinNameTemplate: policy?.twinNameTemplate ?? null,
    groupMappings:
        policy?.groupMappings.map(({ groupUuid, ref, priority }) => ({
            groupUuid,
            ref,
            priority,
        })) ?? [],
    policySource: policy?.policySource ?? null,
});
const isInvalid = (
    value: UpsertAiAccessPolicy,
    capabilities: AiWarehouseCapabilities,
) => {
    if (
        !capabilities.principals[value.principalKind].available ||
        !capabilities.transports[value.transport.kind].available
    )
        return true;
    if (
        value.policySource &&
        (!value.policySource.label.trim() ||
            (value.policySource.url &&
                !/^https?:\/\//i.test(value.policySource.url)))
    )
        return true;
    if (
        value.transport.kind === AiTransportKind.PROCEDURE &&
        !value.transport.name.trim()
    )
        return true;
    return (
        value.principalKind === AiPrincipalKind.SHARED &&
        !value.sharedRef?.trim()
    );
};
const markerStatement = (level: AiAgentMarkerLevel): string => {
    switch (level) {
        case AiAgentMarkerLevel.VERIFIED_SESSION:
            return 'Snowflake verifies the session once the person has signed in for agent sessions.';
        case AiAgentMarkerLevel.REQUEST_BOUND:
            return "The marker is fixed by the request. Enforcement needs your warehouse's access control plugin or policy to read it.";
        case AiAgentMarkerLevel.IDENTIFY_ONLY:
            return 'The marker identifies agent queries here but cannot restrict them.';
        case AiAgentMarkerLevel.NONE:
            return 'This warehouse cannot mark agent queries.';
        default:
            return assertUnreachable(level, 'Unknown agent marker level');
    }
};
const IdentityStatement = ({
    capabilities,
    policy,
    separate,
    separateEnabled,
}: {
    capabilities: AiWarehouseCapabilities;
    policy: AiAccessPolicy | null;
    separate: boolean;
    separateEnabled: boolean;
}) => {
    const { level } = capabilities.marker;
    if (!separateEnabled)
        return (
            <Stack gap="xs">
                <Text fw={500}>Agents run as the marked person.</Text>
                <Text size="sm">{markerStatement(level)}</Text>
            </Stack>
        );
    if (level === AiAgentMarkerLevel.NONE)
        return (
            <Paper variant="dotted" p="md">
                <Text c="dimmed" size="sm">
                    This warehouse cannot mark agent queries.
                </Text>
            </Paper>
        );
    return (
        <Stack gap="xs">
            <Text fw={500}>
                {separate ? (
                    policy?.principalKind === AiPrincipalKind.SHARED ? (
                        <>
                            Agents run as the separate principal{' '}
                            <Code>{policy.sharedRef}</Code>
                        </>
                    ) : (
                        'Agents run as a per-group or per-person principal saved through the API'
                    )
                ) : level === AiAgentMarkerLevel.IDENTIFY_ONLY ? (
                    'Agents need a separate principal on this warehouse.'
                ) : (
                    'Agents run as the marked person'
                )}
            </Text>
            <Text size="sm">{markerStatement(level)}</Text>
            {level === AiAgentMarkerLevel.IDENTIFY_ONLY && !separate && (
                <Alert color="yellow">
                    Agents currently run as the person with no restriction.
                </Alert>
            )}
        </Stack>
    );
};

const PrincipalForm = ({
    value,
    capabilities,
    set,
    disabled,
    loading,
    onSave,
    onSetup,
}: {
    value: UpsertAiAccessPolicy;
    capabilities: AiWarehouseCapabilities;
    set: (patch: Partial<UpsertAiAccessPolicy>) => void;
    disabled: boolean;
    loading: boolean;
    onSave: () => void;
    onSetup: () => void;
}) => (
    <Stack>
        <AiPolicyEditor value={value} capabilities={capabilities} set={set} />
        {!capabilities.principals.shared.available && (
            <Text size="sm" c="dimmed">
                {capabilities.principals.shared.reason}
            </Text>
        )}
        <Group>
            {capabilities.principals.shared.available && (
                <Button disabled={disabled} loading={loading} onClick={onSave}>
                    Save
                </Button>
            )}
            <Button
                variant="default"
                disabled={!capabilities.principals.shared.available}
                onClick={onSetup}
            >
                Setup script
            </Button>
        </Group>
    </Stack>
);

const IdentityCard = ({
    connectionSelector,
    capabilities,
    policy,
    separate,
    separateEnabled,
    value,
    set,
    disabled,
    loading,
    onSave,
    onSetup,
}: {
    connectionSelector: ReactNode;
    capabilities: AiWarehouseCapabilities;
    policy: AiAccessPolicy | null;
    separate: boolean;
    separateEnabled: boolean;
    value: UpsertAiAccessPolicy;
    set: (patch: Partial<UpsertAiAccessPolicy>) => void;
    disabled: boolean;
    loading: boolean;
    onSave: () => void;
    onSetup: () => void;
}) => (
    <SettingsCard>
        <Stack>
            <Stack gap={4}>
                <Title order={5}>Identity</Title>
                <Text c="dimmed" fz="xs">
                    What agents run as on this warehouse.
                </Text>
            </Stack>
            {connectionSelector}
            <IdentityStatement
                capabilities={capabilities}
                policy={policy}
                separate={separate}
                separateEnabled={separateEnabled}
            />
            {separateEnabled &&
                capabilities.marker.level ===
                    AiAgentMarkerLevel.IDENTIFY_ONLY && (
                    <PrincipalForm
                        value={value}
                        capabilities={capabilities}
                        set={set}
                        disabled={disabled}
                        loading={loading}
                        onSave={onSave}
                        onSetup={onSetup}
                    />
                )}
        </Stack>
    </SettingsCard>
);

export const AiIdentitySettings = ({
    projectUuid,
    connection,
    policy,
    capabilities,
    connectionSelector,
}: {
    projectUuid: string;
    connection: string | null;
    policy: AiAccessPolicy | null;
    capabilities: AiWarehouseCapabilities;
    connectionSelector: ReactNode;
}) => {
    const { data: separateFlag } = useServerFeatureFlag(
        FeatureFlags.AiSeparatePrincipals,
    );
    const separateEnabled = separateFlag?.enabled === true;
    const verified =
        capabilities.marker.level === AiAgentMarkerLevel.VERIFIED_SESSION;
    const needsPrincipal =
        separateEnabled &&
        capabilities.marker.level === AiAgentMarkerLevel.IDENTIFY_ONLY;
    const savedSeparate =
        policy !== null && policy.principalKind !== AiPrincipalKind.PERSON;
    const separate = needsPrincipal && savedSeparate;
    const [value, setValue] = useState(() => ({
        ...toInput(policy),
        sharedRef:
            policy?.principalKind === AiPrincipalKind.SHARED
                ? policy.sharedRef
                : null,
    }));
    const [confirming, setConfirming] = useState(false);
    const [script, setScript] = useState<{ principal: string | null } | null>(
        null,
    );
    const save = useUpsertAiAccessPolicy(projectUuid, connection);
    const set = (patch: Partial<UpsertAiAccessPolicy>) =>
        setValue((previous) => ({ ...previous, ...patch }));
    const input: UpsertAiAccessPolicy = {
        ...value,
        principalKind: AiPrincipalKind.SHARED,
        twinNameTemplate: null,
        groupMappings: [],
    };
    const dirty =
        !policy?.enabled ||
        JSON.stringify(input) !== JSON.stringify(toInput(policy));
    const persist = (next: UpsertAiAccessPolicy) =>
        save.mutate(next, { onSuccess: () => setConfirming(false) });
    const onSave = () => {
        if (
            policy?.principalKind === AiPrincipalKind.GROUP ||
            policy?.principalKind === AiPrincipalKind.TWIN
        )
            setConfirming(true);
        else persist(input);
    };
    return (
        <Stack gap="xl">
            {verified ? (
                <SnowflakeIdentityCard
                    projectUuid={projectUuid}
                    connection={connection}
                    policy={policy}
                    connectionSelector={connectionSelector}
                />
            ) : (
                <IdentityCard
                    connectionSelector={connectionSelector}
                    capabilities={capabilities}
                    policy={policy}
                    separate={separate}
                    separateEnabled={separateEnabled}
                    value={value}
                    set={set}
                    disabled={!dirty || isInvalid(input, capabilities)}
                    loading={save.isLoading}
                    onSave={onSave}
                    onSetup={() => setScript({ principal: null })}
                />
            )}
            <SettingsCard>
                <Stack>
                    <Stack gap={4}>
                        <Title order={5}>In the warehouse</Title>
                        <Text c="dimmed" fz="xs">
                            Read the marker and manage the warehouse rules.
                        </Text>
                    </Stack>
                    <AiWarehouseSignals marker={capabilities.marker} />
                    <AiPolicySource value={value} set={set} />
                </Stack>
            </SettingsCard>
            {capabilities.marker.level !== AiAgentMarkerLevel.NONE && (
                <SettingsCard>
                    <Stack>
                        <Stack gap={4}>
                            <Title order={5}>Test</Title>
                            <Text c="dimmed" fz="xs">
                                Check the marker or the configured principals.
                            </Text>
                        </Stack>
                        {verified ? (
                            <SnowflakeMarkerTest
                                projectUuid={projectUuid}
                                connection={connection}
                                disabled={
                                    !capabilities.principals.person.available
                                }
                            />
                        ) : separate ? (
                            <Principals
                                projectUuid={projectUuid}
                                connection={connection}
                                capabilities={capabilities}
                                onSetup={(principal) =>
                                    setScript({ principal })
                                }
                            />
                        ) : needsPrincipal ? (
                            <PrincipalsEmptyState />
                        ) : (
                            <AiMarkerTest
                                projectUuid={projectUuid}
                                connection={connection}
                                disabled={
                                    !capabilities.principals.person.available
                                }
                            />
                        )}
                    </Stack>
                </SettingsCard>
            )}
            <MantineModal
                opened={confirming}
                onClose={() => setConfirming(false)}
                title="Replace principal setup?"
                role="alertdialog"
                description="Agents will use one warehouse principal. Your per-group or per-person setup is removed."
                confirmLabel="Switch"
                confirmLoading={save.isLoading}
                onConfirm={() => persist(input)}
            />
            {separateEnabled && script && (
                <AiSetupScriptDrawer
                    projectUuid={projectUuid}
                    connection={connection}
                    principal={script.principal}
                    onClose={() => setScript(null)}
                />
            )}
        </Stack>
    );
};
