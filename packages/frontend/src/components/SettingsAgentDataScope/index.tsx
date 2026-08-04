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
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
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

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

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

    const [schemas, setSchemas] = useState<string[] | null>(null);
    const [catalogs, setCatalogs] = useState<string[] | null>(null);

    const savedSchemas = useMemo(() => sorted(scope?.schemas ?? []), [scope]);
    const savedCatalogs = useMemo(() => sorted(scope?.catalogs ?? []), [scope]);

    const selectedSchemas = schemas ?? savedSchemas;
    const selectedCatalogs = catalogs ?? savedCatalogs;

    const { schemaOptions, catalogOptions } = useMemo(() => {
        const databases = Object.keys(catalog ?? {});
        const schemaNames = new Set<string>();
        Object.values(catalog ?? {}).forEach((db) => {
            Object.keys(db).forEach((schema) => schemaNames.add(schema));
        });
        // Keep any saved value that no longer exists in the warehouse visible,
        // otherwise editing an unrelated field would silently drop it.
        return {
            schemaOptions: sorted([...schemaNames, ...savedSchemas]),
            catalogOptions: sorted([...databases, ...savedCatalogs]),
        };
    }, [catalog, savedSchemas, savedCatalogs]);

    const hasChanged =
        JSON.stringify(sorted(selectedSchemas)) !==
            JSON.stringify(savedSchemas) ||
        JSON.stringify(sorted(selectedCatalogs)) !==
            JSON.stringify(savedCatalogs);

    const handleSubmit = useCallback(async () => {
        try {
            await mutation.mutateAsync({
                agentSqlScope:
                    selectedSchemas.length > 0
                        ? {
                              schemas: sorted(selectedSchemas),
                              catalogs: sorted(selectedCatalogs),
                          }
                        : null,
            });
            setSchemas(null);
            setCatalogs(null);
            showToastSuccess({
                title: `Successfully updated the agent's data scope`,
            });
        } catch (e) {
            showToastError({
                title: `Failed to update the agent's data scope`,
                subtitle: isApiError(e) ? e.error.message : getErrorMessage(e),
            });
        }
    }, [
        mutation,
        selectedSchemas,
        selectedCatalogs,
        showToastError,
        showToastSuccess,
    ]);

    const isLoading = isLoadingScope || isLoadingCatalog;

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
                    discover. Leave the schema list empty to allow the whole
                    warehouse connection, which is the default.
                </Text>
                <Text fz="xs" mt="xs">
                    This does not replace warehouse permissions. Anyone who can
                    use the SQL Runner can still query the rest of the
                    connection directly — to make data genuinely unreachable,
                    restrict it with warehouse grants.
                </Text>
            </Alert>

            <MultiSelect
                label="Allowed schemas"
                description="The agent can only read from these. Empty means no restriction."
                placeholder={
                    selectedSchemas.length === 0
                        ? 'All schemas (no restriction)'
                        : undefined
                }
                data={schemaOptions}
                value={selectedSchemas}
                onChange={setSchemas}
                searchable
                clearable
            />

            <MultiSelect
                label="Allowed catalogs"
                description="Optional. Restricts which catalogs/databases the schemas above may be read from."
                placeholder={
                    selectedCatalogs.length === 0 ? 'Any catalog' : undefined
                }
                data={catalogOptions}
                value={selectedCatalogs}
                onChange={setCatalogs}
                disabled={selectedSchemas.length === 0}
                searchable
                clearable
            />

            <Flex justify="flex-end" gap="sm">
                <Button
                    onClick={handleSubmit}
                    disabled={!hasChanged}
                    loading={mutation.isLoading}
                >
                    Update
                </Button>
            </Flex>
        </Stack>
    );
};

export default SettingsAgentDataScope;
