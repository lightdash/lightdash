import {
    Code,
    Group,
    MultiSelect,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { CopyActionIcon } from '../common/CopyActionIcon';
import EmptyStateLoader from '../common/EmptyStateLoader';
import InlineErrorState from '../common/InlineErrorState';
import { SqlPanel } from './SqlPanel';
import { type BoundaryGuide } from './useBoundaryGuide';

export const AiQueryProcedureStep = ({ guide }: { guide: BoundaryGuide }) => {
    const { inputs, setInputs, schemas, catalogQuery, procedure } = guide;
    return (
        <Stack gap="sm">
            <Text size="sm">
                Run this in Snowflake as an admin. Lightdash runs nothing in
                your account.
            </Text>
            <Text size="sm">
                Snowflake does not force AI to use this procedure. Lightdash
                sends every AI query through it once you save the setting on the
                connection.
            </Text>
            <TextInput
                label="Procedure database"
                value={inputs.procedureDatabase}
                onChange={(event) => {
                    const procedureDatabase = event.currentTarget.value;
                    setInputs((value) => ({ ...value, procedureDatabase }));
                }}
            />
            <TextInput
                label="Procedure schema"
                value={inputs.procedureSchema}
                onChange={(event) => {
                    const procedureSchema = event.currentTarget.value;
                    setInputs((value) => ({ ...value, procedureSchema }));
                }}
            />
            <TextInput
                label="Procedure name"
                value={inputs.procedureName}
                onChange={(event) => {
                    const procedureName = event.currentTarget.value;
                    setInputs((value) => ({ ...value, procedureName }));
                }}
            />
            <TextInput
                label="Procedure owner role"
                value={inputs.procedureOwnerRole}
                onChange={(event) => {
                    const procedureOwnerRole = event.currentTarget.value;
                    setInputs((value) => ({ ...value, procedureOwnerRole }));
                }}
            />
            {catalogQuery.isInitialLoading ? (
                <EmptyStateLoader title="Loading schemas" />
            ) : catalogQuery.isError ? (
                <InlineErrorState
                    message="Could not load schemas."
                    onRetry={() => void catalogQuery.refetch()}
                />
            ) : (
                <MultiSelect
                    label="Allowed schemas"
                    description="Choose the database.schema entries AI queries can read."
                    data={schemas.map((schema) => ({
                        value: schema.key,
                        label: schema.label,
                    }))}
                    value={inputs.allowedSchemas}
                    searchable
                    clearable
                    nothingFoundMessage="No matching schemas"
                    size="xs"
                    onChange={(allowedSchemas) =>
                        setInputs((value) => ({ ...value, allowedSchemas }))
                    }
                />
            )}
            <TextInput
                label="AI roles"
                description="Uses the pre-authorized roles from the OAuth integration step. Separate roles with commas."
                value={inputs.roles}
                onChange={(event) => {
                    const roles = event.currentTarget.value;
                    setInputs((value) => ({ ...value, roles }));
                }}
            />
            {procedure ? (
                <>
                    <SqlPanel
                        sql={procedure.sql}
                        filename="ai-query-procedure.sql"
                        summary="Creates the restricted caller procedure and grants schema reads, compute usage and procedure access."
                    />
                    <Text size="sm">
                        Paste this into the connection's AI query procedure
                        setting:
                    </Text>
                    <Group gap="xs">
                        <Code>{procedure.settingValue}</Code>
                        <CopyActionIcon
                            value={procedure.settingValue}
                            copyLabel="Copy AI query procedure setting"
                        />
                    </Group>
                    {!guide.ceilingSql && (
                        <Text size="sm" c="dimmed">
                            To add this procedure to the session scope, choose a
                            tag database and schema in Hide personal data from
                            AI. The session scope needs plain database and
                            schema names.
                        </Text>
                    )}
                </>
            ) : (
                <Text size="sm" c="dimmed">
                    Complete the procedure details and choose at least one
                    allowed schema and AI role to generate SQL.
                </Text>
            )}
        </Stack>
    );
};
