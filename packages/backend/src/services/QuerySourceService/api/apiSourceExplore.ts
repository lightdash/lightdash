import {
    ExploreCompiler,
    ExploreType,
    FieldType,
    getApiSourceQueryIssues,
    getItemId,
    ParameterError,
    type ApiConnectorType,
    type ApiSourceExplore,
    type ApiSourceMetricAggregation,
    type ApiSourceQueryContext,
    type Dimension,
    type DimensionType,
    type Explore,
    type FieldId,
    type FilterOperator,
    type Metric,
    type MetricQuery,
    type MetricType,
    type SortField,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { type ApiConnectorCapabilities } from './ApiConnector';

type ApiSourceFieldDefinition = {
    /** Stable within the explore: saved charts reference it forever, so never rename it. */
    name: string;
    apiName: string;
    label: string;
    description?: string;
    filterOperators: FilterOperator[];
    /** Defaults to the API name; only SQL APIs need anything else. */
    sql?: string;
    /** Set from an admin's edits; built-in and scanned fields have none. */
    aiHint?: string;
    groups?: string[];
};

export type ApiSourceDimensionDefinition = ApiSourceFieldDefinition & {
    type: DimensionType;
};

export type ApiSourceMetricDefinition = ApiSourceFieldDefinition & {
    type: MetricType;
    format?: string;
    /**
     * Whether the metric's values can be summed, checked against the API's
     * docs. Saved charts will rely on it, so never loosen a tag without
     * evidence. Absent (scanned metrics) means `non_additive`.
     */
    aggregation?: ApiSourceMetricAggregation;
};

/** One explore of an integration's semantic layer, written by hand or found by a scan. */
export type ApiSourceExploreDefinition = {
    name: string;
    label: string;
    description: string;
    dimensions: ApiSourceDimensionDefinition[];
    metrics: ApiSourceMetricDefinition[];
    maxDimensions: number | null;
    maxMetrics: number | null;
    dateRange: { dimension: string; defaultDays: number } | null;
    incompatible: { fields: string[]; with: string[]; reason: string }[];
};

/** Builds a live data source explore whose field ids are `<exploreName>_<field name>`. */
export const buildApiSourceExplore = ({
    definition,
    exploreName,
    label,
    connectionUuid,
    integration,
    baseVersion,
    capabilities,
    warehouseSqlBuilder,
}: {
    definition: ApiSourceExploreDefinition;
    exploreName: string;
    label: string;
    connectionUuid: string;
    integration: ApiConnectorType;
    baseVersion: number;
    capabilities: ApiConnectorCapabilities;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): Explore => {
    const quote = warehouseSqlBuilder.getFieldQuoteChar();
    const base = {
        table: exploreName,
        tableLabel: label,
        hidden: false,
    };
    const toSql = (field: ApiSourceFieldDefinition) =>
        field.sql ?? `\${TABLE}.${quote}${field.apiName}${quote}`;
    const toCuratedProperties = (field: ApiSourceFieldDefinition) => ({
        ...(field.aiHint ? { aiHint: field.aiHint } : {}),
        ...(field.groups ? { groups: field.groups } : {}),
    });
    const dimensions = definition.dimensions.map(
        (dimension): Dimension => ({
            ...base,
            fieldType: FieldType.DIMENSION,
            name: dimension.name,
            label: dimension.label,
            description: dimension.description,
            type: dimension.type,
            sql: toSql(dimension),
            ...toCuratedProperties(dimension),
        }),
    );
    const metrics = definition.metrics.map(
        (metric): Metric => ({
            ...base,
            fieldType: FieldType.METRIC,
            name: metric.name,
            label: metric.label,
            description: metric.description,
            type: metric.type,
            sql: toSql(metric),
            ...(metric.format ? { format: metric.format } : {}),
            ...toCuratedProperties(metric),
        }),
    );
    const toFieldId = (name: string) => getItemId({ table: exploreName, name });
    const fields = [...definition.dimensions, ...definition.metrics];

    const explore = new ExploreCompiler(warehouseSqlBuilder).compileExplore({
        name: exploreName,
        label,
        tags: [],
        baseTable: exploreName,
        joinedTables: [],
        tables: {
            [exploreName]: {
                name: exploreName,
                label,
                description: definition.description,
                sqlTable: `${quote}${definition.name}${quote}`,
                dimensions: Object.fromEntries(
                    dimensions.map((dimension) => [dimension.name, dimension]),
                ),
                metrics: Object.fromEntries(
                    metrics.map((metric) => [metric.name, metric]),
                ),
                lineageGraph: {},
                database: '',
                schema: '',
            },
        },
        targetDatabase: warehouseSqlBuilder.getAdapterType(),
        meta: {},
    });
    return {
        ...explore,
        type: ExploreType.API_SOURCE,
        apiSource: {
            connectionUuid,
            integration,
            baseVersion,
            // Kept for readers of explores built before capabilities
            filterGroups: {
                or: capabilities.filters.or,
                nested: capabilities.filters.nestedGroups,
            },
            maxDimensions: definition.maxDimensions,
            maxMetrics: definition.maxMetrics,
            dateRange: definition.dateRange
                ? {
                      fieldId: toFieldId(definition.dateRange.dimension),
                      defaultDays: definition.dateRange.defaultDays,
                  }
                : null,
            fields: Object.fromEntries(
                fields.map((field) => [
                    toFieldId(field.name),
                    {
                        apiName: field.apiName,
                        filterOperators: field.filterOperators,
                    },
                ]),
            ),
            incompatible: definition.incompatible.map((incompatibility) => ({
                fields: incompatibility.fields.map(toFieldId),
                with: incompatibility.with.map(toFieldId),
                reason: incompatibility.reason,
            })),
            capabilities: {
                ...capabilities,
                metrics: Object.fromEntries(
                    definition.metrics.map((metric) => [
                        metric.name,
                        metric.aggregation ?? { aggregation: 'non_additive' },
                    ]),
                ),
            },
        },
    };
};

/** A metric query compiled into one connector call, plus what to do with its rows. */
export type CompiledApiSourceQuery = {
    /** The connector's own request, e.g. a GA4 runReport body. */
    query: string;
    /** Rows to ask the connector for; more than `limit` when rows are sorted locally. */
    requestLimit: number;
    limit: number;
    /** The field each column of the connector's rows answers. */
    fieldIdsByColumn: Record<string, FieldId>;
    /** Sorts the API can't apply; they run on the returned rows. */
    localSorts: SortField[];
};

/** The explore's live data source rules; fails for any other explore. */
export const getApiSourceExplore = (explore: Explore): ApiSourceExplore => {
    const { apiSource } = explore;
    if (explore.type !== ExploreType.API_SOURCE || !apiSource) {
        throw new ParameterError(
            `"${explore.name}" isn't a live data source explore`,
        );
    }
    return apiSource;
};

/**
 * Fails with every fixable reason the API can't answer the query, from the
 * shared check every entry point runs, so compilers only translate.
 */
export const assertApiSourceQuery = (
    explore: Explore,
    metricQuery: MetricQuery,
    context: ApiSourceQueryContext = {},
): ApiSourceExplore => {
    const apiSource = getApiSourceExplore(explore);
    const issues = getApiSourceQueryIssues(apiSource, metricQuery, context);
    if (issues.length > 0) {
        throw new ParameterError(
            issues.map(({ message }) => message).join(' '),
        );
    }
    return apiSource;
};

/** The API's name for every field the query selects, sorts or filters by. */
export const getApiName = (apiSource: ApiSourceExplore, fieldId: FieldId) => {
    const rule = Object.hasOwn(apiSource.fields, fieldId)
        ? apiSource.fields[fieldId]
        : undefined;
    if (!rule) {
        throw new ParameterError(
            `"${fieldId}" isn't available from this live data source.`,
        );
    }
    return rule.apiName;
};
