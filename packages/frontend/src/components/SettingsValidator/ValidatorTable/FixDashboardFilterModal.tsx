import {
    isExploreError as checkIsExploreError,
    isDashboardValidationError,
    RenameType,
    type ApiError,
    type ApiExploreResults,
    type DashboardFilterRule,
    type DashboardTileTarget,
    type Explore,
    type ValidationErrorDashboardResponse,
    type ValidationResponse,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Checkbox,
    Group,
    Highlight,
    Radio,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconTool } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import escapeRegExp from 'lodash/escapeRegExp';
import { useMemo, useState, type FC } from 'react';
import { lightdashApi } from '../../../api';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import { useExplores } from '../../../hooks/useExplores';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { getLinkToResource } from '../utils/utils';

type Props = {
    validationError: ValidationErrorDashboardResponse | undefined;
    allValidationErrors: ValidationResponse[] | undefined;
    projectUuid: string;
    onClose: () => void;
};

const getExplore = async (projectUuid: string, exploreId: string) => {
    return lightdashApi<ApiExploreResults>({
        url: `/projects/${projectUuid}/explores/${exploreId}`,
        method: 'GET',
    });
};

const useExploreWithProjectUuid = (
    projectUuid: string | undefined,
    exploreName: string | undefined,
) => {
    return useQuery<ApiExploreResults, ApiError>({
        queryKey: ['tables', exploreName, projectUuid],
        queryFn: () => getExplore(projectUuid!, exploreName!),
        enabled: !!projectUuid && !!exploreName,
        retry: false,
    });
};

const getFieldsFromExplore = (
    explore: Explore | undefined,
): { fields: Record<string, string[]> } => {
    if (!explore) return { fields: {} };

    const fields: Record<string, string[]> = {};

    Object.entries(explore.tables).forEach(([tableName, table]) => {
        const tableFields: string[] = [];

        // Add dimensions
        Object.keys(table.dimensions).forEach((dimName) => {
            tableFields.push(`${tableName}_${dimName}`);
        });

        // Add metrics
        Object.keys(table.metrics).forEach((metricName) => {
            tableFields.push(`${tableName}_${metricName}`);
        });

        if (tableFields.length > 0) {
            fields[tableName] = tableFields.sort();
        }
    });

    return { fields };
};

export const FixDashboardFilterModal: FC<Props> = ({
    validationError,
    allValidationErrors,
    projectUuid,
    onClose,
}) => {
    const dashboardUuid = validationError?.dashboardUuid;
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const { mutate: updateDashboard, isLoading: isUpdating } =
        useUpdateDashboard(dashboardUuid, false);

    const [renameType, setRenameType] = useState<RenameType>(RenameType.FIELD);
    const [oldModelName, setOldModelName] = useState<string | undefined>();
    const [newName, setNewName] = useState('');
    const [fixAllFilters, setFixAllFilters] = useState(false);
    const [search, setSearch] = useState('');
    const form = useForm({});

    // Extract the field prefix (old model name) from fieldId
    // e.g., "Related_Opportunity_TYPE" -> "Related_Opportunity"
    const fieldName = validationError?.fieldName;
    const targetTableName = validationError?.tableName;

    const fieldOldModelPrefix = useMemo(() => {
        if (!fieldName || !targetTableName) return undefined;
        // If fieldId starts with tableName_, the field belongs to the target table (no prefix issue)
        if (fieldName.startsWith(`${targetTableName}_`)) {
            return targetTableName;
        }
        // Otherwise, extract the prefix (everything before the last underscore segment)
        // e.g., "Related_Opportunity_TYPE" -> "Related_Opportunity"
        const lastUnderscoreIndex = fieldName.lastIndexOf('_');
        if (lastUnderscoreIndex > 0) {
            return fieldName.substring(0, lastUnderscoreIndex);
        }
        return fieldName.split('_')[0];
    }, [fieldName, targetTableName]);

    // Fetch the explore for the target table to get available fields
    const { data: explore, isError: isExploreLoadError } =
        useExploreWithProjectUuid(projectUuid, targetTableName);

    const { data: explores } = useExplores(projectUuid, true);

    // Get fields grouped by table from the explore
    const fields = useMemo(() => {
        if (!explore || checkIsExploreError(explore)) return { fields: {} };
        return getFieldsFromExplore(explore);
    }, [explore]);

    const fieldOptions = useMemo(
        () =>
            Object.entries(fields.fields)
                .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
                .map(([group, items]) => ({
                    group,
                    items: items.map((item) => ({
                        value: item,
                        label: item,
                    })),
                })),
        [fields],
    );

    // Count how many filters in this dashboard target the same table
    const filtersTargetingTable = useMemo(() => {
        if (!dashboard || !targetTableName) return [];
        const allFilters = [
            ...dashboard.filters.dimensions,
            ...dashboard.filters.metrics,
        ];
        return allFilters.filter(
            (filter) => filter.target.tableName === targetTableName,
        );
    }, [dashboard, targetTableName]);

    // Count how many errors exist for this table across all validation errors
    const totalOccurrences = useMemo(() => {
        if (!allValidationErrors || !targetTableName) return 0;

        if (renameType === RenameType.FIELD) {
            return allValidationErrors.filter(
                (e) =>
                    isDashboardValidationError(e) && e.fieldName === fieldName,
            ).length;
        }
        // For MODEL rename, count errors where tableName matches
        return allValidationErrors.filter(
            (e) =>
                isDashboardValidationError(e) &&
                e.tableName === targetTableName,
        ).length;
    }, [allValidationErrors, targetTableName, fieldName, renameType]);

    if (!validationError || !isDashboardValidationError(validationError)) {
        return null;
    }

    const handleClose = () => {
        setRenameType(RenameType.FIELD);
        setOldModelName(undefined);
        setNewName('');
        setFixAllFilters(false);
        setSearch('');
        form.reset();
        onClose();
    };

    const updateFilterTarget = (
        filter: DashboardFilterRule,
        fromModel: string,
        toModel: string,
    ): DashboardFilterRule => {
        // Update the main target fieldId by replacing the old model prefix with the new one
        const newFieldId = filter.target.fieldId.replace(
            new RegExp(`^${escapeRegExp(fromModel)}`),
            toModel,
        );

        // Update tileTargets if they exist
        let updatedTileTargets: Record<string, DashboardTileTarget> | undefined;
        if (filter.tileTargets) {
            updatedTileTargets = Object.fromEntries(
                Object.entries(filter.tileTargets).map(
                    ([tileUuid, tileTarget]) => {
                        if (
                            tileTarget === false ||
                            tileTarget.tableName !== filter.target.tableName
                        ) {
                            return [tileUuid, tileTarget];
                        }
                        return [
                            tileUuid,
                            {
                                ...tileTarget,
                                tableName: toModel,
                                fieldId: tileTarget.fieldId.replace(
                                    new RegExp(`^${escapeRegExp(fromModel)}`),
                                    toModel,
                                ),
                            },
                        ];
                    },
                ),
            );
        }

        return {
            ...filter,
            target: {
                ...filter.target,
                tableName: toModel,
                fieldId: newFieldId,
            },
            ...(updatedTileTargets && { tileTargets: updatedTileTargets }),
        };
    };

    const handleConfirm = form.onSubmit(() => {
        if (!dashboard || !fieldName) return;

        let updatedFilters = { ...dashboard.filters };

        if (renameType === RenameType.FIELD) {
            // FIELD rename: just update the single filter's fieldId
            updatedFilters = {
                dimensions: dashboard.filters.dimensions.map((filter) => {
                    if (filter.target.fieldId === fieldName) {
                        return {
                            ...filter,
                            target: {
                                ...filter.target,
                                fieldId: newName,
                            },
                        };
                    }
                    return filter;
                }),
                metrics: dashboard.filters.metrics.map((filter) => {
                    if (filter.target.fieldId === fieldName) {
                        return {
                            ...filter,
                            target: {
                                ...filter.target,
                                fieldId: newName,
                            },
                        };
                    }
                    return filter;
                }),
                tableCalculations: dashboard.filters.tableCalculations,
            };
        } else {
            // MODEL rename: update tableName and fieldId prefix
            const fromModel = oldModelName || fieldOldModelPrefix || '';
            const toModel = newName;

            // Guard against empty fromModel which would corrupt fieldIds
            if (!fromModel) {
                return;
            }

            if (fixAllFilters && targetTableName) {
                // Update ALL filters targeting the same table
                updatedFilters = {
                    dimensions: dashboard.filters.dimensions.map((filter) => {
                        if (filter.target.tableName === targetTableName) {
                            return updateFilterTarget(
                                filter,
                                fromModel,
                                toModel,
                            );
                        }
                        return filter;
                    }),
                    metrics: dashboard.filters.metrics.map((filter) => {
                        if (filter.target.tableName === targetTableName) {
                            return updateFilterTarget(
                                filter,
                                fromModel,
                                toModel,
                            );
                        }
                        return filter;
                    }),
                    tableCalculations: dashboard.filters.tableCalculations,
                };
            } else {
                // Update only the single filter
                updatedFilters = {
                    dimensions: dashboard.filters.dimensions.map((filter) => {
                        if (filter.target.fieldId === fieldName) {
                            return updateFilterTarget(
                                filter,
                                fromModel,
                                toModel,
                            );
                        }
                        return filter;
                    }),
                    metrics: dashboard.filters.metrics.map((filter) => {
                        if (filter.target.fieldId === fieldName) {
                            return updateFilterTarget(
                                filter,
                                fromModel,
                                toModel,
                            );
                        }
                        return filter;
                    }),
                    tableCalculations: dashboard.filters.tableCalculations,
                };
            }
        }

        updateDashboard(
            {
                tiles: dashboard.tiles,
                filters: updatedFilters,
                parameters: dashboard.parameters,
                tabs: dashboard.tabs,
                config: dashboard.config,
            },
            {
                onSuccess: () => {
                    handleClose();
                },
            },
        );
    });

    const FIX_DASHBOARD_FILTER_FORM_ID = 'fix-dashboard-filter-form';
    const resourceUrl = getLinkToResource(validationError, projectUuid);

    return (
        <MantineModal
            size="lg"
            title="Fix dashboard filter error"
            icon={IconTool}
            opened={!!validationError}
            onClose={handleClose}
            actions={
                <Button
                    type="submit"
                    form={FIX_DASHBOARD_FILTER_FORM_ID}
                    disabled={newName === '' || isUpdating}
                    loading={isUpdating}
                >
                    Rename
                </Button>
            }
        >
            <Text fz="sm">
                Fix dashboard filter error:{' '}
                <Anchor href={resourceUrl} target="_blank">
                    <Text span fz="sm">
                        {validationError.name}
                    </Text>
                </Anchor>
            </Text>

            <Callout
                variant="info"
                title="You can rename the filter by changing the field or model using the options below."
            />

            <form id={FIX_DASHBOARD_FILTER_FORM_ID} onSubmit={handleConfirm}>
                <Stack>
                    <Radio.Group
                        value={renameType}
                        onChange={(value) => {
                            const type = value as RenameType;
                            setRenameType(type);
                            setNewName('');
                            setSearch('');

                            if (type === RenameType.MODEL) {
                                setOldModelName(fieldOldModelPrefix);
                            }
                        }}
                    >
                        <Group>
                            <Radio value={RenameType.FIELD} label="Field" />
                            <Radio value={RenameType.MODEL} label="Model" />
                        </Group>
                    </Radio.Group>

                    {renameType === RenameType.FIELD ? (
                        <Stack>
                            <TextInput
                                disabled
                                label="Old field"
                                value={fieldName || ''}
                            />
                            <Tooltip
                                disabled={!isExploreLoadError}
                                label={`Could not find any fields on explore ${targetTableName}. Perhaps you want to replace the model instead?`}
                            >
                                <div>
                                    <Select
                                        renderOption={({ option }) => (
                                            <Highlight
                                                highlight={search}
                                                fz="sm"
                                                color="yellow"
                                            >
                                                {option.label}
                                            </Highlight>
                                        )}
                                        onSearchChange={setSearch}
                                        searchValue={search}
                                        radius="md"
                                        data={fieldOptions}
                                        required
                                        disabled={isExploreLoadError}
                                        searchable
                                        label="New field"
                                        placeholder="Select a field to rename to"
                                        onChange={(value) => {
                                            if (value) setNewName(value);
                                        }}
                                    />
                                </div>
                            </Tooltip>
                        </Stack>
                    ) : (
                        <Stack>
                            <TextInput
                                label="Old model prefix"
                                placeholder="Enter the model prefix to replace"
                                value={oldModelName || ''}
                                onChange={(e) =>
                                    setOldModelName(e.currentTarget.value)
                                }
                            />
                            <Text size="xs" c="dimmed">
                                The field &apos;{fieldName}&apos; references
                                table &apos;{targetTableName}&apos; but the
                                field prefix doesn&apos;t match. Enter the
                                prefix to replace (e.g., &apos;
                                {fieldOldModelPrefix}&apos;).
                            </Text>
                            <Select
                                searchValue={search}
                                onSearchChange={setSearch}
                                renderOption={({ option }) => (
                                    <Highlight
                                        highlight={search}
                                        fz="sm"
                                        color="yellow"
                                    >
                                        {option.label}
                                    </Highlight>
                                )}
                                data={explores?.map((e) => e.name) || []}
                                required
                                searchable
                                label="New model"
                                placeholder="Select a model to rename to"
                                onChange={(value) => {
                                    if (value) setNewName(value);
                                }}
                            />

                            {filtersTargetingTable.length > 1 && (
                                <Tooltip
                                    position="left"
                                    label={`Check this to fix all ${filtersTargetingTable.length} filters targeting table '${targetTableName}' in this dashboard.`}
                                >
                                    <Box>
                                        <Checkbox
                                            size="xs"
                                            label={`Fix all filters targeting this table (${filtersTargetingTable.length})`}
                                            checked={fixAllFilters}
                                            onChange={(e) =>
                                                setFixAllFilters(
                                                    e.currentTarget.checked,
                                                )
                                            }
                                        />
                                    </Box>
                                </Tooltip>
                            )}
                        </Stack>
                    )}

                    {totalOccurrences > 1 &&
                        renameType === RenameType.FIELD && (
                            <Text fz="xs" c="ldGray.7">
                                This field error appears in {totalOccurrences}{' '}
                                places across all dashboards. You will need to
                                fix each dashboard individually.
                            </Text>
                        )}
                </Stack>
            </form>
        </MantineModal>
    );
};
