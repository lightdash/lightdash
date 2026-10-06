import {
    expandAiIdentitySchemaRule,
    isValidSchemaPattern,
    type AiIdentitySchemaRule,
} from '@lightdash/common';
import {
    Button,
    CloseButton,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useCallback, useState } from 'react';
import { isValidSchemaSelection } from '../../components/common/SchemaRuleInput/schemaRule';
import { SchemaNames } from '../../components/common/SchemaRuleInput/SchemaRuleInput';

export const AiIdentityRoleEditor = ({
    roleName,
    warehouse,
    schemaRule,
    schemas,
    catalogLoaded,
    onChange,
}: {
    roleName: string;
    warehouse: string;
    schemaRule: AiIdentitySchemaRule;
    schemas: string[];
    catalogLoaded: boolean;
    onChange: (value: {
        roleName: string;
        warehouse: string;
        schemaRule: AiIdentitySchemaRule;
    }) => void;
}) => {
    const focusPatternInput = useCallback(
        (input: HTMLInputElement | null) => input?.focus(),
        [],
    );
    const [adding, setAdding] = useState(false);
    const [pattern, setPattern] = useState('');
    const valid = isValidSchemaSelection({
        database: schemaRule.database,
        patterns: schemaRule.excludePatterns,
    });
    const expansion =
        valid && catalogLoaded
            ? expandAiIdentitySchemaRule(schemaRule, schemas)
            : null;
    const updateRule = (rule: AiIdentitySchemaRule) =>
        onChange({ roleName, warehouse, schemaRule: rule });
    const addPattern = () => {
        const value = pattern.trim();
        if (!isValidSchemaPattern(value)) return;
        if (
            !schemaRule.excludePatterns.some(
                (entry) => entry.toUpperCase() === value.toUpperCase(),
            )
        ) {
            updateRule({
                ...schemaRule,
                excludePatterns: [...schemaRule.excludePatterns, value],
            });
        }
        setPattern('');
        setAdding(false);
    };
    return (
        <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={10}>
                <TextInput
                    aria-label="AI role name"
                    placeholder="AI role name"
                    value={roleName}
                    styles={{ input: { fontFamily: 'monospace' } }}
                    onChange={(event) =>
                        onChange({
                            roleName: event.currentTarget.value,
                            warehouse,
                            schemaRule,
                        })
                    }
                />
                <TextInput
                    aria-label="Database"
                    placeholder="Database"
                    value={schemaRule.database}
                    styles={{ input: { fontFamily: 'monospace' } }}
                    onChange={(event) =>
                        updateRule({
                            ...schemaRule,
                            database: event.currentTarget.value,
                        })
                    }
                />
                <TextInput
                    aria-label="Warehouse"
                    placeholder="Warehouse"
                    value={warehouse}
                    styles={{ input: { fontFamily: 'monospace' } }}
                    onChange={(event) =>
                        onChange({
                            roleName,
                            warehouse: event.currentTarget.value,
                            schemaRule,
                        })
                    }
                />
            </SimpleGrid>
            <Stack gap={4}>
                <Text size="xs" fw={600}>
                    AI can read all schemas in{' '}
                    {schemaRule.database || 'the database'}, except:
                </Text>
                <Group gap="xs">
                    {schemaRule.excludePatterns.map((entry) => (
                        <Paper
                            key={entry}
                            withBorder
                            bg="gray.0"
                            radius="sm"
                            px={8}
                            py={2}
                        >
                            <Group gap={4}>
                                <Text size="xs" ff="monospace">
                                    {entry}
                                </Text>
                                <CloseButton
                                    size={14}
                                    aria-label={`Remove ${entry}`}
                                    onClick={() =>
                                        updateRule({
                                            ...schemaRule,
                                            excludePatterns:
                                                schemaRule.excludePatterns.filter(
                                                    (item) => item !== entry,
                                                ),
                                        })
                                    }
                                />
                            </Group>
                        </Paper>
                    ))}
                    {adding ? (
                        <Group gap={4}>
                            <TextInput
                                size="xs"
                                aria-label="Schema pattern"
                                ref={focusPatternInput}
                                placeholder="Enter a pattern"
                                value={pattern}
                                error={
                                    pattern.length > 0 &&
                                    !isValidSchemaPattern(pattern)
                                        ? 'Use letters, digits, _, $, * and ?.'
                                        : null
                                }
                                onChange={(event) =>
                                    setPattern(event.currentTarget.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        addPattern();
                                    }
                                    if (event.key === 'Escape') {
                                        setAdding(false);
                                        setPattern('');
                                    }
                                }}
                            />
                            <Button
                                size="compact-xs"
                                variant="default"
                                disabled={!isValidSchemaPattern(pattern)}
                                onClick={addPattern}
                            >
                                Add
                            </Button>
                            <CloseButton
                                aria-label="Cancel exclusion"
                                size="sm"
                                onClick={() => {
                                    setAdding(false);
                                    setPattern('');
                                }}
                            />
                        </Group>
                    ) : (
                        <Button
                            size="compact-xs"
                            variant="default"
                            bg="gray.0"
                            ff="monospace"
                            fw={400}
                            onClick={() => setAdding(true)}
                        >
                            + Exclude schemas
                        </Button>
                    )}
                </Group>
            </Stack>
            {schemaRule.excludePatterns.some(
                (entry) => !isValidSchemaPattern(entry),
            ) && (
                <Text size="xs" c="red">
                    Use letters, digits, _, $, * and ?.
                </Text>
            )}
            {expansion ? (
                <>
                    <SimpleGrid cols={2} spacing={10}>
                        <Paper withBorder radius="sm" p={12}>
                            <Text size="xl" fw={700} lh={1.1}>
                                {expansion.allowed.length}
                            </Text>
                            <Text size="xs" c="dimmed">
                                schemas that AI can read
                            </Text>
                        </Paper>
                        <Paper withBorder radius="sm" p={12}>
                            <Text size="xl" fw={700} lh={1.1}>
                                {expansion.excluded.length}
                            </Text>
                            <Text size="xs" c="dimmed">
                                excluded:{' '}
                                {expansion.excludedByPattern
                                    .map(
                                        ({ pattern: entry, count }) =>
                                            `${count} match ${entry}`,
                                    )
                                    .join(', ') || 'none'}
                            </Text>
                        </Paper>
                    </SimpleGrid>
                    {expansion.excluded.length > 0 && (
                        <details>
                            <summary>Show excluded schemas</summary>
                            <SchemaNames
                                schemas={expansion.excluded}
                                limit={null}
                            />
                        </details>
                    )}
                </>
            ) : (
                <Text size="sm" c="dimmed">
                    {valid
                        ? 'Loading schemas…'
                        : 'Complete the rule to preview schemas.'}
                </Text>
            )}
        </Stack>
    );
};
