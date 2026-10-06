import {
    type AiIdentityProvisioningSettings,
    type AiIdentityAiRoleDefinition,
} from '@lightdash/common';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import { isValidSchemaSelection } from '../../components/common/SchemaRuleInput/schemaRule';
import { useTables } from '../sqlRunner/hooks/useTables';
import { AiIdentityRoleEditor } from './AiIdentityRoleEditor';
import { aiIdentityProvisioningApi } from './api';
import { beyondOwnAccessMessages } from './beyondOwnAccessWarnings';
import { useProvisioningChange } from './useProvisioning';

type RoleRow = Pick<
    AiIdentityAiRoleDefinition,
    'roleName' | 'warehouse' | 'schemaRule'
> & { id: string };

export const AiIdentityRoleDefinitions: FC<{
    settings: AiIdentityProvisioningSettings;
}> = ({ settings }) => {
    const [draft, setDraft] = useState<RoleRow[] | null>(null);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);
    const rows =
        draft ??
        settings.aiRoles.map(
            ({ aiIdentityAiRoleUuid, roleName, warehouse, schemaRule }) => ({
                id: aiIdentityAiRoleUuid,
                roleName,
                warehouse,
                schemaRule,
            }),
        );
    const change = useProvisioningChange(settings.aiIdentityAccountUuid);
    const catalog = useTables({ projectUuid: settings.catalogProjectUuid });
    const schemas = useMemo(
        () =>
            Object.entries(catalog.data ?? {}).flatMap(([database, entries]) =>
                Object.keys(entries).map((schema) => `${database}.${schema}`),
            ),
        [catalog.data],
    );
    const update = (index: number, value: RoleRow) =>
        setDraft(
            rows.map((row, rowIndex) => (rowIndex === index ? value : row)),
        );
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>1. AI roles</Title>
                <Text fz="sm">
                    Set a database for each AI role. Exclude schemas that
                    contain personal data.
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
                            <AiIdentityRoleEditor
                                roleName={row.roleName}
                                warehouse={row.warehouse}
                                schemaRule={row.schemaRule}
                                schemas={schemas}
                                catalogLoaded={
                                    catalog.data !== undefined &&
                                    !catalog.isError
                                }
                                onChange={(value) => {
                                    setSavedMessage(null);
                                    update(index, { ...row, ...value });
                                }}
                            />
                            {beyondOwnAccessMessages(
                                settings.beyondOwnAccessWarnings.filter(
                                    (warning) =>
                                        warning.roleName.toUpperCase() ===
                                        row.roleName.toUpperCase(),
                                ),
                            ).map((message) => (
                                <Callout key={message} variant="warning">
                                    {message}
                                </Callout>
                            ))}
                            <Group justify="flex-end">
                                <Button
                                    variant="subtle"
                                    color="red"
                                    onClick={() => {
                                        setSavedMessage(null);
                                        setDraft(
                                            rows.filter(
                                                (_, rowIndex) =>
                                                    rowIndex !== index,
                                            ),
                                        );
                                    }}
                                >
                                    Remove
                                </Button>
                            </Group>
                        </Stack>
                    </Paper>
                ))}
                {savedMessage && (
                    <Callout variant="success" hideIcon>
                        <Text span fw={700}>
                            Saved.
                        </Text>{' '}
                        {savedMessage}
                    </Callout>
                )}
                <Group justify="space-between">
                    <Button
                        variant="default"
                        onClick={() => {
                            setSavedMessage(null);
                            setDraft([
                                ...rows,
                                {
                                    id: crypto.randomUUID(),
                                    roleName: '',
                                    warehouse: settings.defaultWarehouse,
                                    schemaRule: {
                                        database:
                                            schemas[0]?.split('.')[0] ?? '',
                                        excludePatterns: [],
                                    },
                                },
                            ]);
                        }}
                    >
                        Add AI role
                    </Button>
                    <Button
                        disabled={
                            draft === null ||
                            rows.some(
                                (row) =>
                                    !row.roleName.trim() ||
                                    !isValidSchemaSelection({
                                        database: row.schemaRule.database,
                                        patterns:
                                            row.schemaRule.excludePatterns,
                                    }) ||
                                    !row.warehouse.trim(),
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
                                                schemaRule,
                                            }) => ({
                                                roleName,
                                                warehouse,
                                                schemas: [],
                                                schemaRule,
                                            }),
                                        ),
                                    ),
                                {
                                    onSuccess: (saved) => {
                                        const matches =
                                            saved.aiRoleExpansions.flatMap(
                                                (expansion) => {
                                                    if (
                                                        !expansion.catalogLoaded
                                                    )
                                                        return [];
                                                    const previous =
                                                        settings.aiRoles.find(
                                                            (role) =>
                                                                role.roleName ===
                                                                expansion.roleName,
                                                        );
                                                    return expansion.excludedByPattern.filter(
                                                        ({ pattern }) =>
                                                            !previous?.schemaRule.excludePatterns.some(
                                                                (entry) =>
                                                                    entry.toUpperCase() ===
                                                                    pattern.toUpperCase(),
                                                            ),
                                                    );
                                                },
                                            );
                                        const counts = matches.map(
                                            ({ pattern, count }) =>
                                                `${count} ${count === 1 ? 'schema matches' : 'schemas match'} ${pattern}.`,
                                        );
                                        setSavedMessage(
                                            [
                                                'The change applies in 10 minutes or less.',
                                                ...counts,
                                            ].join(' '),
                                        );
                                        setDraft(null);
                                    },
                                },
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
