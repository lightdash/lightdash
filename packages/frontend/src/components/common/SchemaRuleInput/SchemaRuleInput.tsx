import { expandSchemaPatterns, isValidSchemaPattern } from '@lightdash/common';
import { Select, Stack, TagsInput, Text } from '@mantine/core';
import { useMemo } from 'react';
import {
    isValidSchemaSelection,
    type SchemaPatternSelection,
    type SchemaRulePreviewText,
} from './schemaRule';

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
    label,
    description,
    preview: previewText,
}: {
    value: SchemaPatternSelection;
    onChange: (selection: SchemaPatternSelection) => void;
    catalogSchemas: string[];
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
            isValidSchemaSelection(value)
                ? expandSchemaPatterns(value, catalogSchemas)
                : null,
        [value, catalogSchemas],
    );
    const first = previewText.first;
    const second = first === 'matched' ? 'unmatched' : 'matched';
    return (
        <Stack gap="xs">
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
                label={label}
                description={
                    description ??
                    'Use a prefix, suffix or glob with * and ?. Patterns are not case-sensitive.'
                }
                placeholder="Enter a pattern"
                value={value.patterns}
                onChange={(patterns) => onChange({ ...value, patterns })}
                error={
                    value.patterns.some(
                        (pattern) => !isValidSchemaPattern(pattern),
                    )
                        ? 'Use letters, digits, _, $, * and ?.'
                        : null
                }
            />
            {value.patterns.length === 0 &&
                previewText.emptyWarning !== null && (
                    <Text size="sm" c="orange" role="alert">
                        {previewText.emptyWarning}
                    </Text>
                )}
            {preview ? (
                <>
                    <Text size="sm">
                        {preview[first].length}{' '}
                        {preview[first].length === 1 ? 'schema' : 'schemas'}{' '}
                        {previewText[first]}, {preview[second].length}{' '}
                        {previewText[second]}
                    </Text>
                    <SchemaNames schemas={preview.matched} limit={50} />
                </>
            ) : (
                <Text size="sm" c="dimmed">
                    Complete the rule to preview schemas.
                </Text>
            )}
        </Stack>
    );
};
