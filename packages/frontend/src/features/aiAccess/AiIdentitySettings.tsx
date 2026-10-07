import {
    AI_DIRECT_TRANSPORT,
    AiAgentMarkerLevel,
    AiPrincipalKind,
    AiTransportKind,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { Button, Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { AiMarkerTest } from './AiMarkerTest';
import { AiPolicyEditor } from './AiPolicyEditor';
import { AiPolicySource } from './AiPolicySource';
import { Principals } from './AiPrincipals';
import { AiSetupScriptDrawer } from './AiSetupScriptDrawer';
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
const IdentityStatement = ({
    capabilities,
    policy,
    separate,
}: {
    capabilities: AiWarehouseCapabilities;
    policy: AiAccessPolicy | null;
    separate: boolean;
}) => {
    const { level } = capabilities.marker;
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
                ) : (
                    'Agents run as the marked person'
                )}
            </Text>
            <Text size="sm">
                {level === AiAgentMarkerLevel.VERIFIED_SESSION
                    ? 'Snowflake verifies the session once the person has done the AI sign-in.'
                    : level === AiAgentMarkerLevel.REQUEST_BOUND
                      ? "The marker is fixed by the request. Enforcement needs your warehouse's access control plugin or policy to read it."
                      : level === AiAgentMarkerLevel.IDENTIFY_ONLY
                        ? 'The marker identifies agent queries in query history. It cannot restrict them.'
                        : 'The marker is advisory on this warehouse. Any SQL in the session can change it.'}
            </Text>
            {!capabilities.principals.shared.available &&
                level !== AiAgentMarkerLevel.VERIFIED_SESSION && (
                    <Text size="sm" c="dimmed">
                        {capabilities.principals.shared.reason}
                    </Text>
                )}
        </Stack>
    );
};

const PrincipalDisclosure = ({
    opened,
    onToggle,
}: {
    opened: boolean;
    onToggle: () => void;
}) => (
    <Button
        variant="subtle"
        size="compact-sm"
        style={{ alignSelf: 'flex-start' }}
        aria-expanded={opened}
        onClick={onToggle}
    >
        Need a hard boundary? Use a separate principal
    </Button>
);

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
        <Group>
            <Button disabled={disabled} loading={loading} onClick={onSave}>
                Save
            </Button>
            <Button variant="default" onClick={onSetup}>
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
    canUseSeparate,
    savedSeparate,
    disclosed,
    onToggle,
    value,
    set,
    disabled,
    loading,
    onSave,
    onSetup,
    onSwitch,
}: {
    connectionSelector: ReactNode;
    capabilities: AiWarehouseCapabilities;
    policy: AiAccessPolicy | null;
    separate: boolean;
    canUseSeparate: boolean;
    savedSeparate: boolean;
    disclosed: boolean;
    onToggle: () => void;
    value: UpsertAiAccessPolicy;
    set: (patch: Partial<UpsertAiAccessPolicy>) => void;
    disabled: boolean;
    loading: boolean;
    onSave: () => void;
    onSetup: () => void;
    onSwitch: () => void;
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
            />
            {canUseSeparate && !savedSeparate && (
                <PrincipalDisclosure opened={disclosed} onToggle={onToggle} />
            )}
            {canUseSeparate && (savedSeparate || disclosed) && (
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
            {savedSeparate &&
                capabilities.marker.level !== AiAgentMarkerLevel.NONE && (
                    <Stack gap="xs">
                        {!canUseSeparate && (
                            <Text size="sm" c="dimmed">
                                This connection has a separate principal policy
                                saved through the API.
                            </Text>
                        )}
                        <Button
                            variant="subtle"
                            style={{ alignSelf: 'flex-start' }}
                            loading={loading}
                            onClick={onSwitch}
                        >
                            {canUseSeparate
                                ? 'Switch back to marked person'
                                : 'Switch to marked person'}
                        </Button>
                    </Stack>
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
    const canUseSeparate =
        capabilities.marker.level === AiAgentMarkerLevel.ADVISORY_SESSION &&
        capabilities.principals.shared.available;
    const savedSeparate =
        policy !== null && policy.principalKind !== AiPrincipalKind.PERSON;
    const separate = canUseSeparate && savedSeparate;
    const [disclosed, setDisclosed] = useState(false);
    const [value, setValue] = useState(() => ({
        ...toInput(policy),
        sharedRef:
            policy?.principalKind === AiPrincipalKind.SHARED
                ? policy.sharedRef
                : null,
    }));
    const [confirming, setConfirming] = useState<'person' | 'shared' | null>(
        null,
    );
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
    const personInput: UpsertAiAccessPolicy = {
        ...value,
        enabled: true,
        principalKind: AiPrincipalKind.PERSON,
        transport: AI_DIRECT_TRANSPORT,
        sharedRef: null,
        twinNameTemplate: null,
        groupMappings: [],
    };
    const dirty =
        !policy?.enabled ||
        JSON.stringify(input) !== JSON.stringify(toInput(policy));
    const persist = (next: UpsertAiAccessPolicy) =>
        save.mutate(next, { onSuccess: () => setConfirming(null) });
    const onSave = () => {
        if (
            policy?.principalKind === AiPrincipalKind.GROUP ||
            policy?.principalKind === AiPrincipalKind.TWIN
        )
            setConfirming('shared');
        else persist(input);
    };
    return (
        <Stack gap="xl">
            <IdentityCard
                connectionSelector={connectionSelector}
                capabilities={capabilities}
                policy={policy}
                separate={separate}
                canUseSeparate={canUseSeparate}
                savedSeparate={savedSeparate}
                disclosed={disclosed}
                onToggle={() => setDisclosed((opened) => !opened)}
                value={value}
                set={set}
                disabled={!dirty || isInvalid(input, capabilities)}
                loading={save.isLoading}
                onSave={onSave}
                onSetup={() => setScript({ principal: null })}
                onSwitch={() => setConfirming('person')}
            />
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
                        {separate ? (
                            <Principals
                                projectUuid={projectUuid}
                                connection={connection}
                                capabilities={capabilities}
                                onSetup={(principal) =>
                                    setScript({ principal })
                                }
                            />
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
                opened={confirming !== null}
                onClose={() => setConfirming(null)}
                title={
                    confirming === 'shared'
                        ? 'Replace principal setup?'
                        : 'Switch to marked person?'
                }
                role="alertdialog"
                description={
                    confirming === 'shared'
                        ? 'Agents will use one warehouse principal. Your per-group or per-person setup is removed.'
                        : "Agents will use each person's own credentials. Your separate principal setup is removed."
                }
                confirmLabel="Switch"
                confirmLoading={save.isLoading}
                onConfirm={() =>
                    persist(confirming === 'person' ? personInput : input)
                }
            />
            {script && (
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
