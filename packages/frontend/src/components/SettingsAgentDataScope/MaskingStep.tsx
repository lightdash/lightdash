import { Select, Stack, Paper, Text } from '@mantine/core';
import EmptyStateLoader from '../common/EmptyStateLoader';
import InlineErrorState from '../common/InlineErrorState';
import { SchemaRuleInput } from '../common/SchemaRuleInput/SchemaRuleInput';
import { SqlPanel } from './SqlPanel';
import { type BoundaryGuide } from './useBoundaryGuide';

export const MaskingStep = ({ guide }: { guide: BoundaryGuide }) => {
    const { inputs, setInputs, schemas, catalogQuery, maskingSql } = guide;
    if (catalogQuery.isInitialLoading)
        return <EmptyStateLoader title="Loading schemas" />;
    if (catalogQuery.isError)
        return (
            <InlineErrorState
                message="Could not load schemas."
                onRetry={() => void catalogQuery.refetch()}
            />
        );
    if (schemas.length === 0)
        return (
            <Paper variant="dotted" p="md">
                <Text size="sm">No schemas are available in the catalog.</Text>
            </Paper>
        );
    return (
        <Stack gap="sm">
            <SchemaRuleInput
                label="Protected schemas"
                description="The rule selects schemas to protect. Review and run the masking SQL, then check the results."
                catalogSchemas={guide.catalogSchemas}
                value={inputs.schemaRule}
                allowExistingRole={false}
                preview={{
                    allowed: 'protected',
                    excluded: 'not protected',
                    listed: 'allowed',
                }}
                onChange={(schemaRule) =>
                    setInputs((value) => ({ ...value, schemaRule }))
                }
            />
            <Select
                label="Tag database"
                placeholder="Choose a database"
                data={[...new Set(schemas.map((schema) => schema.database))]}
                searchable
                value={inputs.tagDatabase || null}
                onChange={(tagDatabase) =>
                    setInputs((value) => ({
                        ...value,
                        tagDatabase: tagDatabase ?? '',
                        tagSchema: '',
                    }))
                }
            />
            <Select
                label="Tag schema"
                placeholder="Choose a schema"
                data={schemas
                    .filter((schema) => schema.database === inputs.tagDatabase)
                    .map((schema) => schema.schema)}
                searchable
                disabled={!inputs.tagDatabase}
                value={inputs.tagSchema || null}
                onChange={(tagSchema) =>
                    setInputs((value) => ({
                        ...value,
                        tagSchema: tagSchema ?? '',
                    }))
                }
            />
            {maskingSql && guide.protectedSchemas.length > 0 && (
                <SqlPanel
                    sql={maskingSql}
                    filename="ai-masking.sql"
                    summary={`Creates a tag and nine masking policies, then tags ${guide.protectedSchemas.length} schemas. AI sessions see masked strings or NULL.`}
                />
            )}
        </Stack>
    );
};
