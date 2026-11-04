import {
    ApiConnectorType,
    assertUnreachable,
    DimensionType,
    generateSlug,
    isDimension,
    SupportedDbtAdapter,
    UnexpectedServerError,
    type Explore,
    type ExternalConnectionApiSource,
    type ItemsMap,
    type MetricQuery,
    type ResultColumns,
    type SortField,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { getIsoDateInTimeZone } from './apiDateRange';
import {
    buildApiSourceExplore,
    type ApiSourceExploreDefinition,
    type CompiledApiSourceQuery,
} from './apiSourceExplore';
import { compileGa4Query } from './google/ga4Compiler';
import {
    GA4_REPORT_EXPLORE,
    GA4_SEMANTIC_LAYER_VERSION,
    withGa4MetadataFields,
} from './google/ga4SemanticLayer';
import { compileSearchConsoleQuery } from './google/searchConsoleCompiler';
import { SEARCH_CONSOLE_MAX_QUERY_ROWS } from './google/SearchConsoleConnector';
import {
    SEARCH_CONSOLE_PERFORMANCE_EXPLORE,
    SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
} from './google/searchConsoleSemanticLayer';
import {
    applyLiveSourceFieldEdits,
    type LiveSourceFieldEdits,
    type ScannedLiveSourceField,
} from './liveSourceFields';
import { compilePostHogQuery } from './posthog/posthogCompiler';
import {
    isInternalPostHogProperty,
    POSTHOG_EVENTS_EXPLORE,
    POSTHOG_SEMANTIC_LAYER_VERSION,
    withPostHogPropertyFields,
    type PostHogPropertyKind,
} from './posthog/posthogSemanticLayer';

/** What an integration reports about its own fields; absent when not scanned. */
export type ApiSourceScan = {
    ga4Metadata?: unknown;
    posthogProperties?: Record<PostHogPropertyKind, unknown>;
};

// Search Console reports dates in Pacific Time, whatever the property.
const SEARCH_CONSOLE_TIME_ZONE = 'America/Los_Angeles';

const getSqlBuilder = (connector: ApiConnectorType) =>
    warehouseSqlBuilderFromType(
        connector === ApiConnectorType.POSTHOG
            ? SupportedDbtAdapter.CLICKHOUSE
            : SupportedDbtAdapter.DUCKDB,
    );

/** Stable per source: saved charts reference its field ids forever. */
export const getApiSourceExploreName = (
    sourceName: string,
    definitionName: string,
) => `${sourceName}_${definitionName}`;

/** The source name of sources built before names were stored, from their id. */
export const getLegacyLiveSourceName = (
    connector: ApiConnectorType,
    connectionUuid: string,
) => `${connector}_${connectionUuid.replace(/-/g, '').slice(0, 8)}`;

/** A new source's name before any clash suffix: `PostHog` → `posthog`. */
export const getLiveSourceNameBase = (
    connector: ApiConnectorType,
    name: string,
) => {
    const base = generateSlug(name).replace(/-/g, '_');
    return /^[a-z][a-z0-9_]*$/.test(base) ? base : connector;
};

/** The hand-written explore of an integration, before any scan. */
export const getApiSourceBaseLayer = (
    connector: ApiConnectorType,
): { baseVersion: number; definition: ApiSourceExploreDefinition } => {
    switch (connector) {
        case ApiConnectorType.GA4:
            return {
                baseVersion: GA4_SEMANTIC_LAYER_VERSION,
                definition: GA4_REPORT_EXPLORE,
            };
        case ApiConnectorType.SEARCH_CONSOLE:
            return {
                baseVersion: SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
                definition: SEARCH_CONSOLE_PERFORMANCE_EXPLORE,
            };
        case ApiConnectorType.POSTHOG:
            return {
                baseVersion: POSTHOG_SEMANTIC_LAYER_VERSION,
                definition: POSTHOG_EVENTS_EXPLORE,
            };
        default:
            return assertUnreachable(connector, 'Unknown api connector');
    }
};

/** The explore names a source with this name would get. */
export const getApiSourceExploreNames = (
    connector: ApiConnectorType,
    sourceName: string,
): string[] => [
    getApiSourceExploreName(
        sourceName,
        getApiSourceBaseLayer(connector).definition.name,
    ),
];

/** The fields a scan found beyond the integration's built-in ones. */
export const toScannedLiveSourceFields = (
    connector: ApiConnectorType,
    scan: ApiSourceScan,
): ScannedLiveSourceField[] => {
    const { definition } = getApiSourceBaseLayer(connector);
    const getScannedDefinition = (): ApiSourceExploreDefinition => {
        switch (connector) {
            case ApiConnectorType.GA4:
                return withGa4MetadataFields(definition, scan.ga4Metadata);
            case ApiConnectorType.SEARCH_CONSOLE:
                return definition;
            case ApiConnectorType.POSTHOG:
                return scan.posthogProperties
                    ? withPostHogPropertyFields(
                          definition,
                          scan.posthogProperties,
                      )
                    : definition;
            default:
                return assertUnreachable(connector, 'Unknown api connector');
        }
    };
    const scanned = getScannedDefinition();
    const builtInNames = new Set([
        ...definition.dimensions.map(({ name }) => name),
        ...definition.metrics.map(({ name }) => name),
    ]);
    const isInternal = (apiName: string) =>
        connector === ApiConnectorType.POSTHOG &&
        isInternalPostHogProperty(apiName);
    return [
        ...scanned.dimensions
            .filter(({ name }) => !builtInNames.has(name))
            .map(
                (field): ScannedLiveSourceField => ({
                    kind: 'dimension',
                    definition: field,
                    isInternal: isInternal(field.apiName),
                }),
            ),
        ...scanned.metrics
            .filter(({ name }) => !builtInNames.has(name))
            .map(
                (field): ScannedLiveSourceField => ({
                    kind: 'metric',
                    definition: field,
                    isInternal: isInternal(field.apiName),
                }),
            ),
    ];
};

/** The explores a live data source answers metric queries with. */
export const buildApiSourceExplores = ({
    connectionUuid,
    sourceName,
    name,
    apiSource,
    scannedFields,
    edits,
}: {
    connectionUuid: string;
    sourceName: string;
    name: string;
    apiSource: ExternalConnectionApiSource;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
}): Explore[] => {
    const { baseVersion, definition } = getApiSourceBaseLayer(
        apiSource.connector,
    );
    return [
        buildApiSourceExplore({
            definition: applyLiveSourceFieldEdits({
                base: definition,
                scannedFields,
                edits,
            }),
            exploreName: getApiSourceExploreName(sourceName, definition.name),
            label: name,
            connectionUuid,
            integration: apiSource.connector,
            baseVersion,
            warehouseSqlBuilder: getSqlBuilder(apiSource.connector),
        }),
    ];
};

/** Compiles a metric query on a live data source explore into its integration's request. */
export const compileApiSourceMetricQuery = ({
    explore,
    metricQuery,
    timezone,
    now,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    timezone: string;
    now: Date;
}): CompiledApiSourceQuery => {
    const integration = explore.apiSource?.integration;
    switch (integration) {
        case ApiConnectorType.GA4:
            return compileGa4Query({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, timezone),
            });
        case ApiConnectorType.SEARCH_CONSOLE:
            return compileSearchConsoleQuery({
                explore,
                metricQuery,
                today: getIsoDateInTimeZone(now, SEARCH_CONSOLE_TIME_ZONE),
                maxRows: SEARCH_CONSOLE_MAX_QUERY_ROWS,
            });
        case ApiConnectorType.POSTHOG:
            return compilePostHogQuery({
                explore,
                metricQuery,
                warehouseSqlBuilder: getSqlBuilder(integration),
                timezone,
            });
        case undefined:
            throw new UnexpectedServerError(
                `"${explore.name}" isn't a live data source explore`,
            );
        default:
            return assertUnreachable(integration, 'Unknown api connector');
    }
};

const compareValues = (left: unknown, right: unknown): number => {
    if (left === right) {
        return 0;
    }
    if (left === null || left === undefined) {
        return 1;
    }
    if (right === null || right === undefined) {
        return -1;
    }
    if (typeof left === 'number' && typeof right === 'number') {
        return left - right;
    }
    return String(left).localeCompare(String(right));
};

const sortRows = (rows: Record<string, unknown>[], sorts: SortField[]) =>
    sorts.length === 0
        ? rows
        : [...rows].sort((left, right) => {
              const order = sorts
                  .map(({ fieldId, descending }) => {
                      const comparison = compareValues(
                          left[fieldId],
                          right[fieldId],
                      );
                      // Missing values stay last in either direction
                      const isMissing =
                          left[fieldId] == null || right[fieldId] == null;
                      return descending && !isMissing
                          ? -comparison
                          : comparison;
                  })
                  .find((comparison) => comparison !== 0);
              return order ?? 0;
          });

/** The connector's rows as result rows keyed by field id, sorted and limited. */
export const toApiSourceResult = ({
    compiled,
    rows,
    fields,
}: {
    compiled: CompiledApiSourceQuery;
    rows: Record<string, unknown>[];
    fields: ItemsMap;
}): { rows: Record<string, unknown>[]; columns: ResultColumns } => {
    const columnEntries = Object.entries(compiled.fieldIdsByColumn);
    const resultRows = rows.map((row) =>
        Object.fromEntries(
            columnEntries.map(([column, fieldId]) => [
                fieldId,
                row[column] ?? null,
            ]),
        ),
    );
    const columns: ResultColumns = Object.fromEntries(
        columnEntries.map(([, fieldId]) => {
            const field = fields[fieldId];
            return [
                fieldId,
                {
                    reference: fieldId,
                    type:
                        field && isDimension(field)
                            ? field.type
                            : DimensionType.NUMBER,
                },
            ];
        }),
    );
    return {
        rows: sortRows(resultRows, compiled.localSorts).slice(
            0,
            compiled.limit,
        ),
        columns,
    };
};
