import {
    type AiIdentityProvisioningSettings,
    type UpdateAiIdentityRoleMapping,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { aiIdentityProvisioningApi } from './api';
import { orderMappings } from './provisioning';
import { useProvisioningChange } from './useProvisioning';

type MappingRow = UpdateAiIdentityRoleMapping & { id: string };
export const AiIdentityRoleMappings: FC<{
    settings: AiIdentityProvisioningSettings;
    hint: string | null;
    onDirty: (dirty: boolean) => void;
}> = ({ settings, hint, onDirty }) => {
    const groups = useOrganizationGroups({});
    const change = useProvisioningChange(settings.aiIdentityAccountUuid);
    const [draft, setDraft] = useState<MappingRow[] | null>(null);
    const rows =
        draft ??
        [...settings.mappings]
            .sort((a, b) => a.priority - b.priority)
            .map((row) => ({ ...row, id: row.aiIdentityRoleMappingUuid }));
    const update = (next: MappingRow[]) => {
        setDraft(next);
        onDirty(true);
    };
    const move = (index: number, offset: number) => {
        const next = [...rows];
        [next[index], next[index + offset]] = [
            next[index + offset],
            next[index],
        ];
        update(next);
    };
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>4. Connect groups to AI roles</Title>
                {hint && (
                    <Text fz="sm" c="dimmed">
                        {hint}
                    </Text>
                )}
                <Text fz="sm">
                    Each person gets the AI role of their first matching group.
                    Lightdash never changes these roles.
                </Text>
                {groups.isError && (
                    <Callout variant="danger">Could not load groups.</Callout>
                )}
                {change.error && (
                    <Callout variant="danger">
                        {change.error.error.message}
                    </Callout>
                )}
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Priority</Table.Th>
                            <Table.Th>Lightdash group</Table.Th>
                            <Table.Th>AI role</Table.Th>
                            <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((row, index) => (
                            <Table.Tr key={row.id}>
                                <Table.Td>{index + 1}</Table.Td>
                                <Table.Td>
                                    <Select
                                        aria-label={`Group ${index + 1}`}
                                        searchable
                                        value={row.groupUuid}
                                        disabled={change.isLoading}
                                        data={(groups.data ?? []).map(
                                            (group) => ({
                                                value: group.uuid,
                                                label: group.name,
                                                disabled: rows.some(
                                                    (other) =>
                                                        other.id !== row.id &&
                                                        other.groupUuid ===
                                                            group.uuid,
                                                ),
                                            }),
                                        )}
                                        onChange={(value) =>
                                            update(
                                                rows.map((item) =>
                                                    item.id === row.id
                                                        ? {
                                                              ...item,
                                                              groupUuid:
                                                                  value ?? '',
                                                          }
                                                        : item,
                                                ),
                                            )
                                        }
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <Select
                                        aria-label={`AI role ${index + 1}`}
                                        value={
                                            settings.aiRoles.some(
                                                (role) =>
                                                    role.roleName ===
                                                    row.aiRole,
                                            )
                                                ? row.aiRole
                                                : '__existing__'
                                        }
                                        data={[
                                            ...settings.aiRoles.map(
                                                (role) => role.roleName,
                                            ),
                                            {
                                                value: '__existing__',
                                                label: 'Use an existing role',
                                            },
                                        ]}
                                        disabled={change.isLoading}
                                        onChange={(value) =>
                                            update(
                                                rows.map((item) =>
                                                    item.id === row.id
                                                        ? {
                                                              ...item,
                                                              aiRole:
                                                                  value ===
                                                                  '__existing__'
                                                                      ? ''
                                                                      : (value ??
                                                                        ''),
                                                          }
                                                        : item,
                                                ),
                                            )
                                        }
                                    />
                                    {!settings.aiRoles.some(
                                        (role) => role.roleName === row.aiRole,
                                    ) && (
                                        <TextInput
                                            aria-label={`Existing AI role ${index + 1}`}
                                            placeholder="Existing role name"
                                            value={row.aiRole}
                                            disabled={change.isLoading}
                                            onChange={(event) =>
                                                update(
                                                    rows.map((item) =>
                                                        item.id === row.id
                                                            ? {
                                                                  ...item,
                                                                  aiRole: event
                                                                      .currentTarget
                                                                      .value,
                                                              }
                                                            : item,
                                                    ),
                                                )
                                            }
                                        />
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" wrap="nowrap">
                                        <Tooltip label="Move up">
                                            <ActionIcon
                                                variant="subtle"
                                                aria-label="Move up"
                                                disabled={
                                                    index === 0 ||
                                                    change.isLoading
                                                }
                                                onClick={() => move(index, -1)}
                                            >
                                                <MantineIcon
                                                    icon={IconArrowUp}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Move down">
                                            <ActionIcon
                                                variant="subtle"
                                                aria-label="Move down"
                                                disabled={
                                                    index === rows.length - 1 ||
                                                    change.isLoading
                                                }
                                                onClick={() => move(index, 1)}
                                            >
                                                <MantineIcon
                                                    icon={IconArrowDown}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Remove mapping">
                                            <ActionIcon
                                                variant="subtle"
                                                aria-label="Remove mapping"
                                                disabled={change.isLoading}
                                                onClick={() =>
                                                    update(
                                                        rows.filter(
                                                            (item) =>
                                                                item.id !==
                                                                row.id,
                                                        ),
                                                    )
                                                }
                                            >
                                                <MantineIcon icon={IconTrash} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
                <Group justify="space-between">
                    <Button
                        variant="default"
                        disabled={change.isLoading}
                        onClick={() =>
                            update([
                                ...rows,
                                {
                                    id: crypto.randomUUID(),
                                    groupUuid: '',
                                    aiRole: '',
                                    priority: rows.length,
                                },
                            ])
                        }
                    >
                        Add
                    </Button>
                    <Button
                        variant="default"
                        loading={change.isLoading}
                        disabled={
                            draft === null ||
                            rows.some(
                                (row) => !row.groupUuid || !row.aiRole.trim(),
                            )
                        }
                        onClick={() =>
                            change.mutate(
                                () =>
                                    aiIdentityProvisioningApi.mappings(
                                        settings.aiIdentityAccountUuid,
                                        orderMappings(
                                            rows.map(
                                                ({
                                                    groupUuid,
                                                    aiRole,
                                                    priority,
                                                }) => ({
                                                    groupUuid,
                                                    aiRole,
                                                    priority,
                                                }),
                                            ),
                                        ),
                                    ),
                                {
                                    onSuccess: () => {
                                        setDraft(null);
                                        onDirty(false);
                                    },
                                },
                            )
                        }
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};
