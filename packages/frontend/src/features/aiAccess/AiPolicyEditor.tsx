import {
    AiPrincipalKind,
    AiProcedureRights,
    AiTransportKind,
    type AiAccessPolicy,
    type AiWarehouseCapabilities,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Paper,
    Radio,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useState } from 'react';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { AiGroupMappingsEditor } from './AiGroupMappingsEditor';
import { AiModeCards } from './AiModeCards';
import { useUpsertAiAccessPolicy } from './api';
import { hasDuplicateRefs } from './validation';
const toInput = (policy: AiAccessPolicy | null): UpsertAiAccessPolicy => ({
    enabled: policy?.enabled ?? true,
    principalKind: policy?.principalKind ?? AiPrincipalKind.GROUP,
    transport: policy?.transport ?? { kind: AiTransportKind.DIRECT },
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
export const AiPolicyEditor = ({
    projectUuid,
    connection,
    policy,
    capabilities,
    onSetup,
}: {
    projectUuid: string;
    connection: string | null;
    policy: AiAccessPolicy | null;
    capabilities: AiWarehouseCapabilities;
    onSetup: () => void;
}) => {
    const [baseline, setBaseline] = useState(() => toInput(policy));
    const [value, setValue] = useState(baseline);
    const [editingSource, setEditingSource] = useState(false);
    const groups = useOrganizationGroups({});
    const save = useUpsertAiAccessPolicy(projectUuid, connection);
    const set = (patch: Partial<UpsertAiAccessPolicy>) =>
        setValue((previous) => ({ ...previous, ...patch }));
    const procedure = capabilities.transports.procedure;
    const invalidMappings =
        hasDuplicateRefs(value.groupMappings) ||
        value.groupMappings.some(
            (row, index) =>
                !row.groupUuid ||
                !row.ref.trim() ||
                value.groupMappings.some(
                    (other, i) =>
                        i !== index && other.groupUuid === row.groupUuid,
                ),
        );
    const invalid =
        !capabilities.principals[value.principalKind].available ||
        !capabilities.transports[value.transport.kind].available ||
        (value.principalKind === AiPrincipalKind.GROUP && invalidMappings) ||
        (value.principalKind === AiPrincipalKind.SHARED &&
            !value.sharedRef?.trim()) ||
        (value.principalKind === AiPrincipalKind.TWIN &&
            !value.twinNameTemplate?.trim()) ||
        (value.transport.kind === AiTransportKind.PROCEDURE &&
            !value.transport.name.trim()) ||
        !!(
            value.policySource?.url &&
            !/^https?:\/\//i.test(value.policySource.url)
        ) ||
        !!(value.policySource && !value.policySource.label.trim());
    const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
    return (
        <Stack>
            <AiModeCards
                capabilities={capabilities}
                value={value.principalKind}
                onChange={(principalKind) => set({ principalKind })}
            />
            <Paper withBorder p="md">
                <Stack gap="sm">
                    <Group justify="space-between">
                        <Title order={5}>Where the rules live</Title>
                        <Button
                            variant="subtle"
                            onClick={() => setEditingSource(!editingSource)}
                        >
                            {editingSource ? 'Done' : 'Edit'}
                        </Button>
                    </Group>
                    {editingSource ? (
                        <>
                            <TextInput
                                label="Policy source label"
                                value={value.policySource?.label ?? ''}
                                onChange={(event) =>
                                    set({
                                        policySource: {
                                            label: event.currentTarget.value,
                                            url:
                                                value.policySource?.url ?? null,
                                        },
                                    })
                                }
                            />
                            <TextInput
                                label="Policy source URL"
                                type="url"
                                value={value.policySource?.url ?? ''}
                                onChange={(event) =>
                                    set({
                                        policySource: {
                                            label:
                                                value.policySource?.label ?? '',
                                            url:
                                                event.currentTarget.value ||
                                                null,
                                        },
                                    })
                                }
                            />
                            <Button
                                variant="subtle"
                                onClick={() => set({ policySource: null })}
                            >
                                Clear source
                            </Button>
                        </>
                    ) : value.policySource ? (
                        value.policySource.url &&
                        /^https?:\/\//i.test(value.policySource.url) ? (
                            <Anchor
                                href={value.policySource.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {value.policySource.label}
                            </Anchor>
                        ) : (
                            <Text>{value.policySource.label}</Text>
                        )
                    ) : (
                        <Text c="dimmed">No policy source set.</Text>
                    )}
                </Stack>
            </Paper>
            {value.principalKind === AiPrincipalKind.GROUP && (
                <AiGroupMappingsEditor
                    groups={(groups.data ?? []).map((group) => ({
                        value: group.uuid,
                        label: group.name,
                    }))}
                    value={value.groupMappings}
                    onChange={(groupMappings) => set({ groupMappings })}
                />
            )}
            {value.principalKind === AiPrincipalKind.SHARED && (
                <TextInput
                    label="Shared principal reference"
                    value={value.sharedRef ?? ''}
                    onChange={(event) =>
                        set({ sharedRef: event.currentTarget.value })
                    }
                />
            )}
            {value.principalKind === AiPrincipalKind.TWIN && (
                <TextInput
                    label="Twin name template"
                    description="Use {email_local_part} for the part before @, or {user_uuid} for the person's unique ID."
                    value={value.twinNameTemplate ?? ''}
                    onChange={(event) =>
                        set({ twinNameTemplate: event.currentTarget.value })
                    }
                />
            )}
            {value.principalKind === AiPrincipalKind.PERSON && (
                <Text size="sm">
                    Each person signs in once so AI can run as them.
                </Text>
            )}
            {procedure && (
                <Stack gap="sm">
                    <Radio.Group
                        label="Transport"
                        value={value.transport.kind}
                        onChange={(kind) =>
                            set({
                                transport:
                                    kind === AiTransportKind.DIRECT
                                        ? { kind: AiTransportKind.DIRECT }
                                        : {
                                              kind: AiTransportKind.PROCEDURE,
                                              name: '',
                                              rights: AiProcedureRights.RESTRICTED_CALLER,
                                          },
                            })
                        }
                    >
                        <Group mt="xs">
                            <Radio
                                value={AiTransportKind.DIRECT}
                                label="Direct"
                                disabled={
                                    !capabilities.transports.direct.available
                                }
                            />
                            <Radio
                                value={AiTransportKind.PROCEDURE}
                                label="Procedure"
                                disabled={!procedure.available}
                            />
                        </Group>
                    </Radio.Group>
                    {!procedure.available && (
                        <Text size="sm" c="dimmed">
                            {procedure.reason}
                        </Text>
                    )}
                    {!capabilities.transports.direct.available && (
                        <Text size="sm" c="dimmed">
                            {capabilities.transports.direct.reason}
                        </Text>
                    )}
                    {value.transport.kind === AiTransportKind.PROCEDURE && (
                        <>
                            <TextInput
                                label="Procedure name"
                                value={value.transport.name}
                                onChange={(event) => {
                                    if (
                                        value.transport.kind ===
                                        AiTransportKind.PROCEDURE
                                    )
                                        set({
                                            transport: {
                                                ...value.transport,
                                                name: event.currentTarget.value,
                                            },
                                        });
                                }}
                            />
                            <Select
                                label="Procedure rights"
                                value={value.transport.rights}
                                data={[
                                    {
                                        value: AiProcedureRights.RESTRICTED_CALLER,
                                        label: 'Restricted caller',
                                    },
                                    {
                                        value: AiProcedureRights.DEFINER,
                                        label: 'Definer',
                                    },
                                ]}
                                onChange={(rights) => {
                                    if (
                                        rights &&
                                        value.transport.kind ===
                                            AiTransportKind.PROCEDURE
                                    )
                                        set({
                                            transport: {
                                                ...value.transport,
                                                rights: rights as AiProcedureRights,
                                            },
                                        });
                                }}
                            />
                        </>
                    )}
                </Stack>
            )}
            <Switch
                label="Enable AI access"
                checked={value.enabled}
                onChange={(event) =>
                    set({ enabled: event.currentTarget.checked })
                }
            />
            <Group>
                <Button
                    disabled={!dirty || invalid}
                    loading={save.isLoading}
                    onClick={() =>
                        save.mutate(value, {
                            onSuccess: (saved) => {
                                const next = toInput(saved);
                                setBaseline(next);
                                setValue(next);
                            },
                        })
                    }
                >
                    Save
                </Button>
                <Button variant="default" onClick={onSetup}>
                    Setup script
                </Button>
            </Group>
        </Stack>
    );
};
