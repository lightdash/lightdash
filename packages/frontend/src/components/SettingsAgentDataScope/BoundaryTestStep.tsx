import {
    Button,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import dayjs from 'dayjs';
import InlineErrorState from '../common/InlineErrorState';
import { TestResults } from './TestResults';
import { type BoundaryGuide } from './useBoundaryGuide';

export const BoundaryTestStep = ({
    guide,
    onFix,
}: {
    guide: BoundaryGuide;
    onFix: (section: string) => void;
}) => {
    const { inputs, setInputs, config, test, catalogQuery } = guide;
    const savedProbe = config.data?.state.lastTest?.protectedColumn;
    const tables = Object.entries(catalogQuery.data ?? {}).flatMap(
        ([database, schemas]) =>
            Object.entries(schemas).flatMap(([schema, entries]) =>
                Object.keys(entries).map((table) => ({
                    database,
                    schema,
                    table,
                    value: JSON.stringify([database, schema, table]),
                    label: `${database}.${schema}.${table}`,
                })),
            ),
    );
    const selectedSchemaSet = new Set(inputs.selectedSchemas);
    const selectedTable = tables.find((table) =>
        selectedSchemaSet.has(JSON.stringify([table.database, table.schema])),
    );
    const probe = inputs.protectedColumn ??
        savedProbe ?? {
            database: selectedTable?.database ?? '',
            schema: selectedTable?.schema ?? '',
            table: selectedTable?.table ?? '',
            column: '',
        };
    const run = () =>
        test.mutate({
            protectedColumn: Object.values(probe).every(Boolean) ? probe : null,
        });
    const lastTest = config.data?.state.lastTest;
    return (
        <Stack gap="sm">
            <Text size="sm">
                Run read-only checks with your Snowflake sign-in for AI. The
                masking check covers the selected column only.
            </Text>
            <Group grow align="flex-start">
                <Select
                    label="Table"
                    placeholder={
                        catalogQuery.isInitialLoading
                            ? 'Loading tables…'
                            : 'Choose a table'
                    }
                    searchable
                    data={tables}
                    value={
                        probe.table
                            ? JSON.stringify([
                                  probe.database,
                                  probe.schema,
                                  probe.table,
                              ])
                            : null
                    }
                    onChange={(value) => {
                        const selected = tables.find(
                            (table) => table.value === value,
                        );
                        if (selected)
                            setInputs((current) => ({
                                ...current,
                                protectedColumn: {
                                    database: selected.database,
                                    schema: selected.schema,
                                    table: selected.table,
                                    column: probe.column,
                                },
                            }));
                    }}
                />
                <TextInput
                    label="Column"
                    placeholder="Protected column name"
                    value={probe.column}
                    onChange={(event) => {
                        const column = event.currentTarget.value;
                        setInputs((current) => ({
                            ...current,
                            protectedColumn: { ...probe, column },
                        }));
                    }}
                />
            </Group>
            {catalogQuery.isError && (
                <InlineErrorState
                    message="Could not load tables."
                    onRetry={() => void catalogQuery.refetch()}
                />
            )}
            <Group justify="flex-end">
                <Button size="xs" loading={test.isLoading} onClick={run}>
                    Run checks
                </Button>
            </Group>
            {test.isError && (
                <InlineErrorState
                    message={test.error.error.message}
                    onRetry={run}
                />
            )}
            {lastTest && (
                <>
                    <Tooltip label={new Date(lastTest.at).toLocaleString()}>
                        <Text size="xs" c="dimmed">
                            Last checked {dayjs(lastTest.at).fromNow()} by{' '}
                            {lastTest.name}
                        </Text>
                    </Tooltip>
                    <TestResults checks={lastTest.checks} onFix={onFix} />
                </>
            )}
        </Stack>
    );
};
