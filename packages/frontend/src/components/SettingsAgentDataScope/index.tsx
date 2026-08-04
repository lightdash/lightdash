import { getErrorMessage, isApiError } from '@lightdash/common';
import {
    Alert,
    Button,
    Flex,
    LoadingOverlay,
    MultiSelect,
    Stack,
    Text,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { useCallback, useMemo, type FC } from 'react';
import { useTables } from '../../features/sqlRunner/hooks/useTables';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useAgentSqlScope,
    useProjectUpdateAgentSqlScope,
} from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';

type SettingsAgentDataScopeProps = {
    projectUuid: string;
};

type AgentDataScopeFormValues = {
    schemas: string[];
    catalogs: string[];
    deniedSchemas: string[];
    deniedCatalogs: string[];
};

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

const AgentDataScopeForm: FC<{
    isLoading: boolean;
    initialValues: AgentDataScopeFormValues;
    schemaOptions: string[];
    catalogOptions: string[];
    onSubmit: (values: AgentDataScopeFormValues) => void;
}> = ({
    isLoading,
    initialValues,
    schemaOptions,
    catalogOptions,
    onSubmit,
}) => {
    const form = useForm<AgentDataScopeFormValues>({ initialValues });

    const hasChanged = (
        ['schemas', 'catalogs', 'deniedSchemas', 'deniedCatalogs'] as const
    ).some((key) => !isEqual(sorted(form.values[key]), initialValues[key]));

    // An empty schema list is the "no restriction" default, and a catalog
    // restriction on its own would be meaningless, so the catalog picker only
    // opens once at least one schema is chosen.
    const catalogsDisabled = form.values.schemas.length === 0;

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="md">
                <MultiSelect
                    label="Allowed schemas"
                    description="The agent can only read from these. Empty means no restriction."
                    placeholder={
                        form.values.schemas.length === 0
                            ? 'All schemas (no restriction)'
                            : undefined
                    }
                    data={schemaOptions}
                    searchable
                    clearable
                    {...form.getInputProps('schemas')}
                />

                <MultiSelect
                    label="Allowed catalogs"
                    description="Optional. Restricts which catalogs/databases the schemas above may be read from."
                    placeholder={
                        form.values.catalogs.length === 0
                            ? 'Any catalog'
                            : undefined
                    }
                    data={catalogOptions}
                    disabled={catalogsDisabled}
                    searchable
                    clearable
                    {...form.getInputProps('catalogs')}
                />

                <MultiSelect
                    label="Excluded schemas"
                    description="The agent can never read these, even if the allow list above would permit them."
                    placeholder={
                        form.values.deniedSchemas.length === 0
                            ? 'Nothing excluded'
                            : undefined
                    }
                    data={schemaOptions}
                    searchable
                    clearable
                    {...form.getInputProps('deniedSchemas')}
                />

                <MultiSelect
                    label="Excluded catalogs"
                    description="Optional. The agent can never read these catalogs/databases."
                    placeholder={
                        form.values.deniedCatalogs.length === 0
                            ? 'Nothing excluded'
                            : undefined
                    }
                    data={catalogOptions}
                    searchable
                    clearable
                    {...form.getInputProps('deniedCatalogs')}
                />
            </Stack>

            <Flex justify="flex-end" gap="sm" mt="sm">
                <Button
                    type="submit"
                    disabled={!hasChanged}
                    loading={isLoading}
                >
                    Update
                </Button>
            </Flex>
        </form>
    );
};

const SettingsAgentDataScope: FC<SettingsAgentDataScopeProps> = ({
    projectUuid,
}) => {
    const { showToastError, showToastSuccess } = useToaster();
    const { data: scope, isInitialLoading: isLoadingScope } =
        useAgentSqlScope(projectUuid);
    // The catalog is the source of truth for what exists, so admins pick real
    // schemas rather than typing names that silently match nothing.
    const { data: catalog, isInitialLoading: isLoadingCatalog } = useTables({
        projectUuid,
    });
    const mutation = useProjectUpdateAgentSqlScope(projectUuid);

    const isLoading = isLoadingScope || isLoadingCatalog;

    const initialValues = useMemo<AgentDataScopeFormValues>(
        () => ({
            schemas: sorted(scope?.schemas ?? []),
            catalogs: sorted(scope?.catalogs ?? []),
            deniedSchemas: sorted(scope?.deniedSchemas ?? []),
            deniedCatalogs: sorted(scope?.deniedCatalogs ?? []),
        }),
        [scope],
    );

    const { schemaOptions, catalogOptions } = useMemo(() => {
        const databases = Object.keys(catalog ?? {});
        const schemaNames = new Set<string>();
        Object.values(catalog ?? {}).forEach((db) => {
            Object.keys(db).forEach((schema) => schemaNames.add(schema));
        });
        // Keep any saved value that no longer exists in the warehouse visible,
        // otherwise editing an unrelated field would silently drop it.
        return {
            schemaOptions: sorted([
                ...schemaNames,
                ...initialValues.schemas,
                ...initialValues.deniedSchemas,
            ]),
            catalogOptions: sorted([
                ...databases,
                ...initialValues.catalogs,
                ...initialValues.deniedCatalogs,
            ]),
        };
    }, [catalog, initialValues]);

    const handleSubmit = useCallback(
        async (values: AgentDataScopeFormValues) => {
            try {
                const isEmpty = (
                    [
                        'schemas',
                        'catalogs',
                        'deniedSchemas',
                        'deniedCatalogs',
                    ] as const
                ).every((key) => values[key].length === 0);

                await mutation.mutateAsync({
                    agentSqlScope: isEmpty
                        ? null
                        : {
                              schemas: sorted(values.schemas),
                              catalogs: sorted(values.catalogs),
                              deniedSchemas: sorted(values.deniedSchemas),
                              deniedCatalogs: sorted(values.deniedCatalogs),
                          },
                });
                showToastSuccess({
                    title: `Successfully updated the agent's data scope`,
                });
            } catch (e) {
                showToastError({
                    title: `Failed to update the agent's data scope`,
                    subtitle: isApiError(e)
                        ? e.error.message
                        : getErrorMessage(e),
                });
            }
        },
        [mutation, showToastError, showToastSuccess],
    );

    return (
        <Stack gap="md" pos="relative">
            <LoadingOverlay visible={isLoading} />

            <Alert
                variant="light"
                icon={<MantineIcon icon={IconInfoCircle} />}
                title="What this does"
            >
                <Text fz="xs">
                    Restricts the schemas an AI agent may read when it writes
                    raw SQL, and hides everything else from the tables it can
                    discover. Leave everything empty to allow the whole
                    warehouse connection, which is the default.
                </Text>
                <Text fz="xs" mt="xs">
                    Excluding a schema is usually the better choice when you
                    only need to keep the agent off a known set — an allow list
                    goes stale as soon as someone adds a schema, because the
                    agent silently stops seeing new models.
                </Text>
                <Text fz="xs" mt="xs">
                    This does not replace warehouse permissions. Anyone who can
                    use the SQL Runner can still query the rest of the
                    connection directly — to make data genuinely unreachable,
                    restrict it with warehouse grants.
                </Text>
            </Alert>

            {!isLoading && (
                // Remounting when the saved scope changes resets the form to
                // it — the React-recommended way to reset state on new data,
                // rather than syncing state in an effect.
                <AgentDataScopeForm
                    key={JSON.stringify(initialValues)}
                    isLoading={mutation.isLoading}
                    initialValues={initialValues}
                    schemaOptions={schemaOptions}
                    catalogOptions={catalogOptions}
                    onSubmit={handleSubmit}
                />
            )}
        </Stack>
    );
};

export default SettingsAgentDataScope;
