import {
    AiIdentitySchemaRuleMode,
    assertUnreachable,
    expandAiIdentitySchemaRule,
    isValidSchemaPattern,
    type AiIdentitySchemaRule,
} from '@lightdash/common';
import { MultiSelect, Select, Stack, TagsInput, Text } from '@mantine/core';
import { useMemo } from 'react';
import { isValidSchemaRule, type SchemaRulePreviewText } from './schemaRule';

const modeLabels = {
    [AiIdentitySchemaRuleMode.ALL_EXCEPT]:
        'All schemas except names that match',
    [AiIdentitySchemaRuleMode.ONLY_MATCHING]: 'Only schemas whose names match',
    [AiIdentitySchemaRuleMode.LIST]: 'Pick schemas',
    [AiIdentitySchemaRuleMode.EXISTING_ROLE]: 'Use an existing role',
};

export const SchemaNames = ({
    schemas,
    limit,
}: {
    schemas: string[];
    limit: number | null;
}) => (
    <Stack gap={2} mah={200} style={{ overflowY: 'auto' }}>
        {schemas.slice(0, limit ?? schemas.length).map((schema) => (
            <Text size="sm" key={schema}>
                {schema}
            </Text>
        ))}
        {limit !== null && schemas.length > limit && (
            <Text size="sm">and {schemas.length - (limit ?? 0)} more</Text>
        )}
    </Stack>
);

export const SchemaRuleInput = ({
    value,
    onChange,
    catalogSchemas,
    allowExistingRole,
    label,
    description,
    preview: previewText,
}: {
    value: AiIdentitySchemaRule;
    onChange: (rule: AiIdentitySchemaRule) => void;
    catalogSchemas: string[];
    allowExistingRole: boolean;
    label: string;
    description: string | null;
    preview: SchemaRulePreviewText;
}) => {
    const databases = useMemo(
        () => [
            ...new Set(catalogSchemas.map((schema) => schema.split('.')[0])),
        ],
        [catalogSchemas],
    );
    const preview = useMemo(
        () =>
            isValidSchemaRule(value)
                ? expandAiIdentitySchemaRule(value, catalogSchemas)
                : null,
        [value, catalogSchemas],
    );
    const changeMode = (mode: AiIdentitySchemaRuleMode) => {
        switch (mode) {
            case AiIdentitySchemaRuleMode.EXISTING_ROLE:
                onChange({ mode });
                break;
            case AiIdentitySchemaRuleMode.LIST:
                onChange({ mode, schemas: [] });
                break;
            case AiIdentitySchemaRuleMode.ALL_EXCEPT:
            case AiIdentitySchemaRuleMode.ONLY_MATCHING:
                onChange(
                    value.mode === AiIdentitySchemaRuleMode.ALL_EXCEPT ||
                        value.mode === AiIdentitySchemaRuleMode.ONLY_MATCHING
                        ? { ...value, mode }
                        : { mode, database: databases[0] ?? '', patterns: [] },
                );
                break;
            default:
                assertUnreachable(mode, 'Unknown schema rule');
        }
    };
    return (
        <Stack gap="xs">
            <Select
                label={label}
                description={description}
                value={value.mode}
                allowDeselect={false}
                data={Object.values(AiIdentitySchemaRuleMode)
                    .filter(
                        (mode) =>
                            allowExistingRole ||
                            mode !== AiIdentitySchemaRuleMode.EXISTING_ROLE,
                    )
                    .map((mode) => ({ value: mode, label: modeLabels[mode] }))}
                onChange={(mode) => {
                    if (mode) changeMode(mode as AiIdentitySchemaRuleMode);
                }}
            />
            {value.mode === AiIdentitySchemaRuleMode.LIST && (
                <MultiSelect
                    label="Schemas"
                    searchable
                    limit={50}
                    data={catalogSchemas}
                    value={value.schemas}
                    onChange={(schemas) => onChange({ ...value, schemas })}
                />
            )}
            {(value.mode === AiIdentitySchemaRuleMode.ALL_EXCEPT ||
                value.mode === AiIdentitySchemaRuleMode.ONLY_MATCHING) && (
                <>
                    <Select
                        label="Database"
                        searchable
                        data={databases}
                        value={value.database || null}
                        onChange={(database) =>
                            onChange({ ...value, database: database ?? '' })
                        }
                    />
                    <TagsInput
                        label="Patterns"
                        description="Use a prefix, suffix or glob with * and ?. Patterns are not case-sensitive."
                        placeholder="Enter a pattern"
                        value={value.patterns}
                        onChange={(patterns) =>
                            onChange({ ...value, patterns })
                        }
                        error={
                            value.patterns.some(
                                (pattern) => !isValidSchemaPattern(pattern),
                            )
                                ? 'Use letters, digits, _, $, * and ?.'
                                : null
                        }
                    />
                </>
            )}
            {value.mode === AiIdentitySchemaRuleMode.EXISTING_ROLE ? (
                <Text size="sm" c="dimmed">
                    The existing role keeps its current schema access.
                </Text>
            ) : preview ? (
                <>
                    <Text size="sm">
                        {preview.allowed.length}{' '}
                        {preview.allowed.length === 1 ? 'schema' : 'schemas'}{' '}
                        {previewText.allowed}, {preview.excluded.length}{' '}
                        {previewText.excluded}
                    </Text>
                    <SchemaNames
                        schemas={preview[previewText.listed]}
                        limit={50}
                    />
                </>
            ) : (
                <Text size="sm" c="dimmed">
                    Complete the rule to preview schema access.
                </Text>
            )}
        </Stack>
    );
};
