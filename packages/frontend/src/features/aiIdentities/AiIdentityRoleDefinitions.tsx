import {
    type AiIdentityProvisioningSettings,
    type UpdateAiIdentityAiRoleDefinition,
} from '@lightdash/common';
import {
    Button,
    Group,
    MultiSelect,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import { useTables } from '../sqlRunner/hooks/useTables';
import { aiIdentityProvisioningApi } from './api';
import { useProvisioningChange } from './useProvisioning';

type RoleRow = UpdateAiIdentityAiRoleDefinition & { id: string };

export const AiIdentityRoleDefinitions: FC<{
    settings: AiIdentityProvisioningSettings;
}> = ({ settings }) => {
    const [draft, setDraft] = useState<RoleRow[] | null>(null);
    const rows =
        draft ??
        settings.aiRoles.map(
            ({ aiIdentityAiRoleUuid, roleName, warehouse, schemas }) => ({
                id: aiIdentityAiRoleUuid,
                roleName,
                warehouse,
                schemas,
            }),
        );
    const change = useProvisioningChange(settings.aiIdentityAccountUuid);
    const catalog = useTables({ projectUuid: settings.catalogProjectUuid });
    const schemas = Object.entries(catalog.data ?? {}).flatMap(
        ([database, entries]) =>
            Object.keys(entries).map((schema) => `${database}.${schema}`),
    );
    const update = (index: number, value: RoleRow) =>
        setDraft(
            rows.map((row, rowIndex) => (rowIndex === index ? value : row)),
        );
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>1. Define AI roles</Title>
                <Text fz="sm">
                    Pick schemas without personal data. Leave schemas empty for
                    an existing role that your team has already created.
                </Text>
                {catalog.isError && (
                    <Callout variant="danger">
                        Could not load the project catalog.
                    </Callout>
                )}
                {change.error && (
                    <Callout variant="danger">
                        {change.error.error.message}
                    </Callout>
                )}
                {rows.map((row, index) => (
                    <Paper key={row.id} withBorder p="sm">
                        <Stack gap="xs">
                            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                <TextInput
                                    label="AI role name"
                                    value={row.roleName}
                                    onChange={(event) =>
                                        update(index, {
                                            ...row,
                                            roleName: event.currentTarget.value,
                                        })
                                    }
                                />
                                <TextInput
                                    label="Warehouse"
                                    value={row.warehouse}
                                    onChange={(event) =>
                                        update(index, {
                                            ...row,
                                            warehouse:
                                                event.currentTarget.value,
                                        })
                                    }
                                />
                            </SimpleGrid>
                            <MultiSelect
                                label="Allowed schemas"
                                data={schemas}
                                value={row.schemas}
                                searchable
                                onChange={(value) =>
                                    update(index, { ...row, schemas: value })
                                }
                            />
                            <Group justify="flex-end">
                                <Button
                                    variant="subtle"
                                    color="red"
                                    onClick={() =>
                                        setDraft(
                                            rows.filter(
                                                (_, rowIndex) =>
                                                    rowIndex !== index,
                                            ),
                                        )
                                    }
                                >
                                    Remove
                                </Button>
                            </Group>
                        </Stack>
                    </Paper>
                ))}
                <Group justify="space-between">
                    <Button
                        variant="default"
                        onClick={() =>
                            setDraft([
                                ...rows,
                                {
                                    id: crypto.randomUUID(),
                                    roleName: '',
                                    warehouse: settings.defaultWarehouse,
                                    schemas: [],
                                },
                            ])
                        }
                    >
                        Add AI role
                    </Button>
                    <Button
                        disabled={
                            draft === null ||
                            rows.some(
                                (row) =>
                                    !row.roleName.trim() ||
                                    (row.schemas.length > 0 &&
                                        !row.warehouse.trim()),
                            )
                        }
                        loading={change.isLoading}
                        onClick={() =>
                            change.mutate(
                                () =>
                                    aiIdentityProvisioningApi.aiRoles(
                                        settings.aiIdentityAccountUuid,
                                        rows.map(
                                            ({
                                                roleName,
                                                warehouse,
                                                schemas,
                                            }) => ({
                                                roleName,
                                                warehouse,
                                                schemas,
                                            }),
                                        ),
                                    ),
                                { onSuccess: () => setDraft(null) },
                            )
                        }
                    >
                        Save AI roles
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};
