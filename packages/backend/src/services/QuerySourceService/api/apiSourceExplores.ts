import {
    ApiConnectorType,
    assertUnreachable,
    DimensionType,
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
import { compilePostHogQuery } from './posthog/posthogCompiler';
import {
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
    connector: ApiConnectorType,
    connectionUuid: string,
    definitionName: string,
) =>
    `${connector}_${connectionUuid.replace(/-/g, '').slice(0, 8)}_${definitionName}`;

/** The explores a live data source answers metric queries with. */
export const buildApiSourceExplores = ({
    connectionUuid,
    name,
    apiSource,
    scan,
}: {
    connectionUuid: string;
    name: string;
    apiSource: ExternalConnectionApiSource;
    scan: ApiSourceScan;
}): Explore[] => {
    const getDefinitions = () => {
        switch (apiSource.connector) {
            case ApiConnectorType.GA4:
                return {
                    baseVersion: GA4_SEMANTIC_LAYER_VERSION,
                    definitions: [
                        withGa4MetadataFields(
                            GA4_REPORT_EXPLORE,
                            scan.ga4Metadata,
                        ),
                    ],
                };
            case ApiConnectorType.SEARCH_CONSOLE:
                return {
                    baseVersion: SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
                    definitions: [SEARCH_CONSOLE_PERFORMANCE_EXPLORE],
                };
            case ApiConnectorType.POSTHOG:
                return {
                    baseVersion: POSTHOG_SEMANTIC_LAYER_VERSION,
                    definitions: [
                        scan.posthogProperties
                            ? withPostHogPropertyFields(
                                  POSTHOG_EVENTS_EXPLORE,
                                  scan.posthogProperties,
                              )
                            : POSTHOG_EVENTS_EXPLORE,
                    ],
                };
            default:
                return assertUnreachable(apiSource, 'Unknown api connector');
        }
    };
    const { baseVersion, definitions } = getDefinitions();
    return definitions.map((definition) =>
        buildApiSourceExplore({
            definition,
            exploreName: getApiSourceExploreName(
                apiSource.connector,
                connectionUuid,
                definition.name,
            ),
            label: name,
            connectionUuid,
            integration: apiSource.connector,
            baseVersion,
            warehouseSqlBuilder: getSqlBuilder(apiSource.connector),
        }),
    );
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
