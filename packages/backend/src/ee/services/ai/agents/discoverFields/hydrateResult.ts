import {
    assertUnreachable,
    DEFAULT_FILTER_CASE_SENSITIVE,
    DimensionType,
    FieldType,
    getErrorMessage,
    getFilterTypeFromItemType,
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
} from '@lightdash/common';
import type { GetExploreFn } from '../../types/aiAgentDependencies';
import { getExploreRequiredFilters } from '../../utils/requiredFilters';
import { truncate } from '../../utils/truncation';
import type { DiscoverFieldsResult, DiscoverFieldsSelection } from './schema';

type HydrateDiscoverFieldsSelectionArgs = {
    selection: DiscoverFieldsSelection;
    availableExplores: Explore[];
    getExplore: GetExploreFn;
    toolDescriptionMaxChars: number;
};

type HydrateDiscoverFieldsSelectionResult =
    | { status: 'success'; discovery: DiscoverFieldsResult }
    | { status: 'error'; error: string };

type ResolvedDiscoverFieldsResult = Extract<
    DiscoverFieldsResult,
    { status: 'resolved' }
>;
type DiscoverFieldsField = ResolvedDiscoverFieldsResult['fields'][number];

type VisibleFieldMaps = {
    dimensions: Map<string, CompiledDimension>;
    metrics: Map<string, CompiledMetric>;
};

const unique = (values: string[]) => [...new Set(values)];

const getVisibleJoinedTables = (explore: Explore) =>
    explore.joinedTables.filter((join) => !join.hidden);

const getVisibleFieldMaps = (explore: Explore): VisibleFieldMaps => {
    const dimensions = new Map<string, CompiledDimension>();
    const metrics = new Map<string, CompiledMetric>();
    const visibleTableNames = new Set([
        explore.baseTable,
        ...getVisibleJoinedTables(explore).map((join) => join.table),
    ]);

    Object.values(explore.tables).forEach((table) => {
        if (!visibleTableNames.has(table.name)) return;

        Object.values(table.dimensions).forEach((dimension) => {
            if (!dimension.hidden) {
                dimensions.set(getItemId(dimension), dimension);
            }
        });
        Object.values(table.metrics).forEach((metric) => {
            if (!metric.hidden) {
                metrics.set(getItemId(metric), metric);
            }
        });
    });

    return { dimensions, metrics };
};

const resolveFields = <TField extends CompiledDimension | CompiledMetric>({
    fieldIds,
    fieldMap,
    fieldTypeName,
    exploreName,
}: {
    fieldIds: string[];
    fieldMap: Map<string, TField>;
    fieldTypeName: 'dimension' | 'metric';
    exploreName: string;
}):
    | { status: 'success'; fields: TField[] }
    | { status: 'error'; error: string } => {
    const fields: TField[] = [];
    const missingFieldIds: string[] = [];

    fieldIds.forEach((fieldId) => {
        const field = fieldMap.get(fieldId);
        if (field) {
            fields.push(field);
        } else {
            missingFieldIds.push(fieldId);
        }
    });

    if (missingFieldIds.length > 0) {
        return {
            status: 'error',
            error: `Selected ${fieldTypeName} IDs do not exist or are hidden in explore "${exploreName}": ${missingFieldIds.join(
                ', ',
            )}`,
        };
    }

    return { status: 'success', fields };
};

const resolveSelectedFields = ({
    dimensionIds,
    metricIds,
    fieldMaps,
    exploreName,
}: {
    dimensionIds: string[];
    metricIds: string[];
    fieldMaps: VisibleFieldMaps;
    exploreName: string;
}):
    | {
          status: 'success';
          dimensions: CompiledDimension[];
          metrics: CompiledMetric[];
      }
    | { status: 'error'; error: string } => {
    const selectedDimensionIds = unique(dimensionIds);
    const selectedMetricIds = unique(metricIds);

    if (selectedDimensionIds.length + selectedMetricIds.length === 0) {
        return {
            status: 'error',
            error: 'Resolved discovery must select at least one dimension or metric ID.',
        };
    }

    const selectedAsBoth = selectedDimensionIds.filter((fieldId) =>
        selectedMetricIds.includes(fieldId),
    );
    if (selectedAsBoth.length > 0) {
        return {
            status: 'error',
            error: `Field IDs cannot be selected as both dimensions and metrics: ${selectedAsBoth.join(
                ', ',
            )}`,
        };
    }

    const metricIdsSelectedAsDimensions = selectedDimensionIds.filter(
        (fieldId) => fieldMaps.metrics.has(fieldId),
    );
    if (metricIdsSelectedAsDimensions.length > 0) {
        return {
            status: 'error',
            error: `Expected dimension IDs but received metric IDs: ${metricIdsSelectedAsDimensions.join(
                ', ',
            )}`,
        };
    }

    const dimensionIdsSelectedAsMetrics = selectedMetricIds.filter((fieldId) =>
        fieldMaps.dimensions.has(fieldId),
    );
    if (dimensionIdsSelectedAsMetrics.length > 0) {
        return {
            status: 'error',
            error: `Expected metric IDs but received dimension IDs: ${dimensionIdsSelectedAsMetrics.join(
                ', ',
            )}`,
        };
    }

    const dimensions = resolveFields({
        fieldIds: selectedDimensionIds,
        fieldMap: fieldMaps.dimensions,
        fieldTypeName: 'dimension',
        exploreName,
    });
    if (dimensions.status === 'error') {
        return dimensions;
    }

    const metrics = resolveFields({
        fieldIds: selectedMetricIds,
        fieldMap: fieldMaps.metrics,
        fieldTypeName: 'metric',
        exploreName,
    });
    if (metrics.status === 'error') {
        return metrics;
    }

    return {
        status: 'success',
        dimensions: dimensions.fields,
        metrics: metrics.fields,
    };
};

const getCaseSensitiveFilters = (
    field: CompiledDimension | CompiledMetric,
    explore: Explore,
): DiscoverFieldsField['caseSensitiveFilters'] => {
    if (
        field.fieldType !== FieldType.DIMENSION ||
        field.type !== DimensionType.STRING
    ) {
        return 'not_applicable';
    }

    return (field.caseSensitive ??
        explore.caseSensitive ??
        DEFAULT_FILTER_CASE_SENSITIVE)
        ? 'true'
        : 'false';
};

const hydrateField = ({
    field,
    explore,
    toolDescriptionMaxChars,
}: {
    field: CompiledDimension | CompiledMetric;
    explore: Explore;
    toolDescriptionMaxChars: number;
}): DiscoverFieldsField => ({
    fieldId: getItemId(field),
    name: field.name,
    label: field.label,
    table: field.table,
    fieldType: field.fieldType === FieldType.DIMENSION ? 'dimension' : 'metric',
    fieldValueType: field.type,
    fieldFilterType: getFilterTypeFromItemType(field.type),
    caseSensitiveFilters: getCaseSensitiveFilters(field, explore),
    isFromJoinedTable:
        field.table !== explore.baseTable &&
        getVisibleJoinedTables(explore).some(
            (join) => join.table === field.table,
        ),
    description: field.description
        ? truncate(field.description, toolDescriptionMaxChars)
        : null,
});

const hydrateResolvedSelection = async ({
    selection,
    getExplore,
    toolDescriptionMaxChars,
}: {
    selection: Extract<DiscoverFieldsSelection, { status: 'resolved' }>;
    getExplore: GetExploreFn;
    toolDescriptionMaxChars: number;
}): Promise<HydrateDiscoverFieldsSelectionResult> => {
    let explore: Explore;
    try {
        explore = await getExplore({ table: selection.exploreName });
    } catch (error) {
        return {
            status: 'error',
            error: `Selected explore "${selection.exploreName}" could not be loaded: ${getErrorMessage(
                error,
            )}`,
        };
    }

    const selectedFields = resolveSelectedFields({
        dimensionIds: selection.dimensionIds,
        metricIds: selection.metricIds,
        fieldMaps: getVisibleFieldMaps(explore),
        exploreName: explore.name,
    });
    if (selectedFields.status === 'error') {
        return selectedFields;
    }

    const requiredFilters = getExploreRequiredFilters(explore);
    const fields = [
        ...selectedFields.dimensions,
        ...selectedFields.metrics,
    ].map((field) => hydrateField({ field, explore, toolDescriptionMaxChars }));

    return {
        status: 'success',
        discovery: {
            status: 'resolved',
            explore: {
                name: explore.name,
                label: explore.label,
                baseTable: explore.baseTable,
                joinedTables: getVisibleJoinedTables(explore).map(
                    (join) => join.table,
                ),
                ...(requiredFilters.length > 0 ? { requiredFilters } : {}),
            },
            fields,
            rationale: selection.rationale,
        },
    };
};

const hydrateAmbiguousSelection = ({
    selection,
    availableExplores,
}: {
    selection: Extract<DiscoverFieldsSelection, { status: 'ambiguous' }>;
    availableExplores: Explore[];
}): HydrateDiscoverFieldsSelectionResult => {
    const availableExploresByName = new Map(
        availableExplores.map((explore) => [explore.name, explore]),
    );
    const candidates: Extract<
        DiscoverFieldsResult,
        { status: 'ambiguous' }
    >['candidates'] = [];

    for (const candidate of selection.candidates) {
        const explore = availableExploresByName.get(candidate.exploreName);
        if (!explore) {
            return {
                status: 'error',
                error: `Ambiguous discovery candidate explore "${candidate.exploreName}" is not available.`,
            };
        }

        candidates.push({
            exploreName: explore.name,
            exploreLabel: explore.label,
            reason: candidate.reason,
        });
    }

    return {
        status: 'success',
        discovery: {
            status: 'ambiguous',
            candidates,
            suggestedQuestion: selection.suggestedQuestion,
        },
    };
};

export const hydrateDiscoverFieldsSelection = async (
    args: HydrateDiscoverFieldsSelectionArgs,
): Promise<HydrateDiscoverFieldsSelectionResult> => {
    switch (args.selection.status) {
        case 'resolved':
            return hydrateResolvedSelection({
                selection: args.selection,
                getExplore: args.getExplore,
                toolDescriptionMaxChars: args.toolDescriptionMaxChars,
            });
        case 'ambiguous':
            return hydrateAmbiguousSelection({
                selection: args.selection,
                availableExplores: args.availableExplores,
            });
        case 'no_match':
            return {
                status: 'success',
                discovery: {
                    status: 'no_match',
                    reason: args.selection.reason,
                },
            };
        default:
            return assertUnreachable(
                args.selection,
                'Unknown discover fields selection status',
            );
    }
};
