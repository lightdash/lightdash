import { getErrorMessage, isApiError } from '@lightdash/common';
import {
    Button,
    Group,
    LoadingOverlay,
    MultiSelect,
    type MultiSelectProps,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLock } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { useCallback, useMemo, type FC } from 'react';
import { useTables } from '../../features/sqlRunner/hooks/useTables';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useAgentSqlScope,
    useProjectUpdateAgentSqlScope,
} from '../../hooks/useProject';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import classes from './SettingsAgentDataScope.module.css';

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

const compactMultiSelectClassNames: MultiSelectProps['classNames'] = {
    input: classes.compactInput,
};

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
                    variant="subtle"
                    size="xs"
                    classNames={compactMultiSelectClassNames}
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
                    variant="subtle"
                    size="xs"
                    classNames={compactMultiSelectClassNames}
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
                    variant="subtle"
                    size="xs"
                    classNames={compactMultiSelectClassNames}
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
                    variant="subtle"
                    size="xs"
                    classNames={compactMultiSelectClassNames}
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

            <Group justify="flex-end" gap="xs" mt="md">
                <Button
                    type="button"
                    variant="default"
                    size="xs"
                    disabled={!hasChanged || isLoading}
                    onClick={() => form.reset()}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    size="xs"
                    disabled={!hasChanged}
                    loading={isLoading}
                >
                    Save changes
                </Button>
            </Group>
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
        <SettingsCard p="xl" pos="relative">
            <LoadingOverlay visible={isLoading} />

            <Stack gap="lg">
                <Group align="flex-start" gap="xs" wrap="nowrap">
                    <Paper p="xxs" radius="sm">
                        <MantineIcon icon={IconLock} size="md" />
                    </Paper>
                    <Stack gap={2}>
                        <Title order={5}>Warehouse access</Title>
                        <Text size="xs" c="dimmed">
                            Control which warehouse schemas and catalogs AI
                            agents can query with SQL.
                        </Text>
                    </Stack>
                </Group>

                <Callout
                    variant="info"
                    color="gray"
                    title="How agent data scope works"
                >
                    <Text fz="xs">
                        Leave every field empty to let AI agents query the
                        entire warehouse connection.
                    </Text>
                    <Text fz="xs" mt="xs">
                        Use exclusions to block known schemas or catalogs. Use
                        allow lists when agents should query only an approved
                        set; newly added schemas are not included automatically.
                    </Text>
                    <Text fz="xs" mt="xs">
                        Agents query the semantic layer by default; direct SQL
                        requires approval for every query and is available only
                        to users with SQL Runner access. These rules apply to AI
                        agents only. They do not change warehouse permissions or
                        restrict SQL Runner users. Use warehouse grants to
                        enforce security.
                    </Text>
                </Callout>

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
        </SettingsCard>
    );
};

export default SettingsAgentDataScope;
