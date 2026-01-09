import {
    ExploreType,
    friendlyName,
    SupportedDbtAdapter,
    type CompiledTable,
    type Explore,
    type SummaryExplore,
} from '@lightdash/common';
import {
    type GetMetricFlowFieldsResponse,
    type GetSemanticLayerMetricsResponse,
    type MetricFlowSemanticModel,
} from '../../../api/MetricFlowAPI';
import convertMetricFlowFieldsToExplore from './convertMetricFlowFieldsToExplore';

const METRICFLOW_EXPLORE_PREFIX = 'mf__';
const METRICFLOW_UNASSIGNED = `${METRICFLOW_EXPLORE_PREFIX}unassigned`;

export const isMetricFlowExploreName = (name?: string): boolean =>
    !!name && name.startsWith(METRICFLOW_EXPLORE_PREFIX);

const getMetricFlowExploreName = (semanticModelName: string) =>
    `${METRICFLOW_EXPLORE_PREFIX}${semanticModelName}`;

const getSemanticModelNameFromExplore = (exploreName: string) =>
    exploreName.replace(METRICFLOW_EXPLORE_PREFIX, '');

type MetricFlowFields = {
    dimensions: GetMetricFlowFieldsResponse['dimensions'];
    metricsForDimensions: GetSemanticLayerMetricsResponse['metricsForDimensions'];
};

type SemanticModelMetadata = Pick<
    MetricFlowSemanticModel,
    'name' | 'label' | 'description'
>;

const collectSemanticModels = ({
    dimensions,
    metricsForDimensions,
}: MetricFlowFields): Map<string, SemanticModelMetadata> => {
    const models = new Map<string, SemanticModelMetadata>();

    dimensions.forEach((dimension) => {
        if (!dimension.semanticModel) return;
        models.set(dimension.semanticModel.name, dimension.semanticModel);
    });

    metricsForDimensions.forEach((metric) => {
        metric.semanticModels?.forEach((model) => {
            if (!model) return;
            models.set(model.name, model);
        });
    });

    return models;
};

const filterDimensionsForModel = (
    dimensions: MetricFlowFields['dimensions'],
    semanticModelName: string | null,
) => {
    if (semanticModelName === null) {
        return dimensions.filter((dimension) => !dimension.semanticModel);
    }
    return dimensions.filter(
        (dimension) => dimension.semanticModel?.name === semanticModelName,
    );
};

const filterMetricsForModel = (
    metricsForDimensions: MetricFlowFields['metricsForDimensions'],
    semanticModelName: string | null,
) => {
    if (semanticModelName === null) {
        return metricsForDimensions.filter(
            (metric) =>
                !metric.semanticModels || metric.semanticModels.length === 0,
        );
    }
    return metricsForDimensions.filter((metric) =>
        metric.semanticModels?.some(
            (model) => model.name === semanticModelName,
        ),
    );
};

const buildSummaryExplore = ({
    name,
    label,
    description,
}: {
    name: string;
    label: string;
    description?: string | null;
}): SummaryExplore => ({
    name,
    label,
    description: description ?? undefined,
    tags: [],
    groupLabel: 'Semantic layer',
    type: ExploreType.SEMANTIC_LAYER,
    schemaName: '',
    databaseName: '',
});

export const buildMetricFlowExploreSummaries = (
    fields: MetricFlowFields,
): SummaryExplore[] => {
    const models = collectSemanticModels(fields);
    const summaries = Array.from(models.values()).map((model) =>
        buildSummaryExplore({
            name: getMetricFlowExploreName(model.name),
            label: model.label || friendlyName(model.name),
            description: model.description ?? undefined,
        }),
    );

    const hasUnassigned =
        filterDimensionsForModel(fields.dimensions, null).length > 0 ||
        filterMetricsForModel(fields.metricsForDimensions, null).length > 0;
    if (hasUnassigned) {
        summaries.push(
            buildSummaryExplore({
                name: METRICFLOW_UNASSIGNED,
                label: 'Unassigned',
            }),
        );
    }

    return summaries;
};

export const buildMetricFlowExplore = (
    exploreName: string,
    fields: MetricFlowFields,
): Explore => {
    const semanticModelName =
        exploreName === METRICFLOW_UNASSIGNED
            ? null
            : getSemanticModelNameFromExplore(exploreName);

    const models = collectSemanticModels(fields);
    const modelMetadata = semanticModelName
        ? models.get(semanticModelName)
        : undefined;

    const tables = new Map<string, CompiledTable>();
    Array.from(models.values()).forEach((model) => {
        const tableName = getMetricFlowExploreName(model.name);
        const table = convertMetricFlowFieldsToExplore(
            tableName,
            filterDimensionsForModel(fields.dimensions, model.name),
            filterMetricsForModel(fields.metricsForDimensions, model.name),
            {
                tableLabel: model.label || friendlyName(model.name),
                tableDescription: model.description,
            },
        ).tables[tableName];
        tables.set(tableName, table);
    });

    const hasUnassigned =
        filterDimensionsForModel(fields.dimensions, null).length > 0 ||
        filterMetricsForModel(fields.metricsForDimensions, null).length > 0;
    if (hasUnassigned) {
        const tableName = METRICFLOW_UNASSIGNED;
        const table = convertMetricFlowFieldsToExplore(
            tableName,
            filterDimensionsForModel(fields.dimensions, null),
            filterMetricsForModel(fields.metricsForDimensions, null),
            {
                tableLabel: 'Unassigned',
            },
        ).tables[tableName];
        tables.set(tableName, table);
    }

    const exploreTables = Object.fromEntries(tables.entries());

    return {
        name: exploreName,
        tags: [],
        baseTable: exploreName,
        joinedTables: [],
        tables: exploreTables,
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        label:
            semanticModelName === null
                ? 'Unassigned'
                : modelMetadata?.label || friendlyName(semanticModelName),
        groupLabel: 'Semantic layer',
        type: ExploreType.SEMANTIC_LAYER,
    };
};
