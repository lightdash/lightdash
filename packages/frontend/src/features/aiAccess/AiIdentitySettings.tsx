import {
    AI_DIRECT_TRANSPORT,
    AiAgentMarkerLevel,
    AiPrincipalKind,
    AiTransportKind,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { AiIdentityModeCards } from './AiIdentityModeCards';
import { AiMarkerTest } from './AiMarkerTest';
import { AiPolicyEditor } from './AiPolicyEditor';
import { AiPolicySource } from './AiPolicySource';
import { Principals } from './AiPrincipals';
import { AiSetupScriptDrawer } from './AiSetupScriptDrawer';
import { AiWarehouseSignals } from './AiWarehouseSignals';
import { useUpsertAiAccessPolicy } from './api';
import { hasDuplicateRefs } from './validation';

const toInput = (policy: AiAccessPolicy | null): UpsertAiAccessPolicy => ({
    enabled: true,
    principalKind: policy?.principalKind ?? AiPrincipalKind.GROUP,
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
    switch (value.principalKind) {
        case AiPrincipalKind.GROUP:
            return (
                hasDuplicateRefs(value.groupMappings) ||
                value.groupMappings.some(
                    (row) => !row.groupUuid || !row.ref.trim(),
                ) ||
                new Set(value.groupMappings.map((row) => row.groupUuid))
                    .size !== value.groupMappings.length
            );
        case AiPrincipalKind.SHARED:
            return !value.sharedRef?.trim();
        case AiPrincipalKind.TWIN:
            return !value.twinNameTemplate?.trim();
        case AiPrincipalKind.PERSON:
            return false;
    }
};
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
    const [separate, setSeparate] = useState(
        () =>
            !!policy?.enabled &&
            policy.principalKind !== AiPrincipalKind.PERSON,
    );
    const [value, setValue] = useState(() => toInput(policy));
    const [confirming, setConfirming] = useState(false);
    const [script, setScript] = useState<{ principal: string | null } | null>(
        null,
    );
    const save = useUpsertAiAccessPolicy(projectUuid, connection);
    const set = (patch: Partial<UpsertAiAccessPolicy>) =>
        setValue((previous) => ({ ...previous, ...patch }));
    const input = separate
        ? value
        : {
              ...value,
              enabled: true,
              principalKind: AiPrincipalKind.PERSON,
              transport: AI_DIRECT_TRANSPORT,
              sharedRef: null,
              twinNameTemplate: null,
              groupMappings: [],
          };
    const dirty = policy
        ? !policy.enabled ||
          JSON.stringify(input) !== JSON.stringify(toInput(policy))
        : separate;
    const persist = () =>
        save.mutate(input, { onSuccess: () => setConfirming(false) });
    const onSave = () => {
        if (
            !separate &&
            (policy?.groupMappings.length ||
                policy?.sharedRef ||
                policy?.twinNameTemplate)
        )
            setConfirming(true);
        else persist();
    };
    return (
        <Stack gap="xl">
            <SettingsCard>
                <Stack>
                    <Stack gap={4}>
                        <Title order={5}>Identity</Title>
                        <Text c="dimmed" fz="xs">
                            Choose the warehouse access agents use.
                        </Text>
                    </Stack>
                    {connectionSelector}
                    <AiIdentityModeCards
                        capabilities={capabilities}
                        separate={separate}
                        disabled={save.isLoading}
                        onChange={(next) => {
                            setSeparate(next);
                            if (
                                next &&
                                value.principalKind === AiPrincipalKind.PERSON
                            )
                                set({ principalKind: AiPrincipalKind.GROUP });
                        }}
                    />
                    {separate && (
                        <AiPolicyEditor
                            value={value}
                            capabilities={capabilities}
                            set={set}
                        />
                    )}
                    <Group>
                        <Button
                            disabled={!dirty || isInvalid(input, capabilities)}
                            loading={save.isLoading}
                            onClick={onSave}
                        >
                            Save
                        </Button>
                        {separate && (
                            <Button
                                variant="default"
                                onClick={() => setScript({ principal: null })}
                            >
                                Setup script
                            </Button>
                        )}
                    </Group>
                </Stack>
            </SettingsCard>
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
                opened={confirming}
                onClose={() => setConfirming(false)}
                title="Switch to marked person?"
                role="alertdialog"
                description="Agents will use each person's own credentials. Your separate principal setup is removed."
                confirmLabel="Switch"
                confirmLoading={save.isLoading}
                onConfirm={persist}
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
