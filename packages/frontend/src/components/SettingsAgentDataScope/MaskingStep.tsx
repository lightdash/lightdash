import { Checkbox, Stack, TextInput } from '@mantine/core';
import { SqlPanel } from './SqlPanel';
export const MaskingStep = ({
    schemas,
    selectedSchemas,
    setSelectedSchemas,
    selectedSchemaSet,
    schemaFilter,
    setSchemaFilter,
    tagDatabase,
    setTagDatabase,
    tagSchema,
    setTagSchema,
    maskingSql,
    confirmed,
    setConfirmed,
}: {
    schemas: { database: string; schema: string; key: string; label: string }[];
    selectedSchemas: string[];
    setSelectedSchemas: (value: string[]) => void;
    selectedSchemaSet: Set<string>;
    schemaFilter: string;
    setSchemaFilter: (value: string) => void;
    tagDatabase: string;
    setTagDatabase: (value: string) => void;
    tagSchema: string;
    setTagSchema: (value: string) => void;
    maskingSql: string;
    confirmed: boolean;
    setConfirmed: (value: boolean) => void;
}) => (
    <Stack gap="sm">
        <TextInput
            label="Find schemas"
            value={schemaFilter}
            onChange={(event) => setSchemaFilter(event.currentTarget.value)}
        />
        <Stack gap="xs">
            {schemas
                .filter((item) =>
                    item.label
                        .toLowerCase()
                        .includes(schemaFilter.toLowerCase()),
                )
                .map((item) => (
                    <Checkbox
                        key={item.key}
                        label={item.label}
                        checked={selectedSchemaSet.has(item.key)}
                        onChange={(event) =>
                            setSelectedSchemas(
                                event.currentTarget.checked
                                    ? [...selectedSchemas, item.key]
                                    : selectedSchemas.filter(
                                          (key) => key !== item.key,
                                      ),
                            )
                        }
                    />
                ))}
        </Stack>
        <TextInput
            label="Tag database"
            value={tagDatabase}
            onChange={(event) => setTagDatabase(event.currentTarget.value)}
        />
        <TextInput
            label="Tag schema"
            value={tagSchema}
            onChange={(event) => setTagSchema(event.currentTarget.value)}
        />
        {maskingSql && <SqlPanel sql={maskingSql} />}
        <Checkbox
            label="I ran this SQL"
            checked={confirmed}
            disabled={selectedSchemas.length === 0 || !maskingSql}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
    </Stack>
);
