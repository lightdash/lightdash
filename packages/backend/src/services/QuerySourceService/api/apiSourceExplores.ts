import {
    ApiConnectorType,
    assertUnreachable,
    DimensionType,
    generateSlug,
    isDimension,
    SupportedDbtAdapter,
    UnexpectedServerError,
    WeekDay,
    type Explore,
    type ExternalConnectionApiSource,
    type ItemsMap,
    type MetricQuery,
    type ResultColumns,
    type SortField,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { type ApiConnectorCapabilities } from './ApiConnector';
import { getIsoDateInTimeZone } from './apiDateRange';
import {
    assertApiSourceQuery,
    buildApiSourceExplore,
    type ApiSourceExploreDefinition,
    type ApiSourcePeriodFormat,
    type CompiledApiSourceQuery,
} from './apiSourceExplore';
import { compileGa4Query } from './google/ga4Compiler';
import { GA4_CAPABILITIES } from './google/Ga4Connector';
import {
    GA4_REPORT_EXPLORE,
    GA4_SEMANTIC_LAYER_VERSION,
    withGa4MetadataFields,
} from './google/ga4SemanticLayer';
import { compileSearchConsoleQuery } from './google/searchConsoleCompiler';
import {
    SEARCH_CONSOLE_CAPABILITIES,
    SEARCH_CONSOLE_MAX_QUERY_ROWS,
} from './google/SearchConsoleConnector';
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
import { POSTHOG_CAPABILITIES } from './posthog/PostHogConnector';
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

// PostHog weeks start on Monday, like its week field, not on ClickHouse's
// default Sunday
const getSqlBuilder = (connector: ApiConnectorType) =>
    connector === ApiConnectorType.POSTHOG
        ? warehouseSqlBuilderFromType(
              SupportedDbtAdapter.CLICKHOUSE,
              WeekDay.MONDAY,
          )
        : warehouseSqlBuilderFromType(SupportedDbtAdapter.DUCKDB);

/**
 * The naming contract of live data source explores and fields. Saved charts,
 * dashboard filters, scheduled deliveries and field edits store these ids, so
 * they must never change once a customer has content on them:
 *
 * - explore = `<prefix>_<model>`, e.g. `google_analytics_report`
 * - field id = `<explore>_<field>`, e.g. `google_analytics_report_sessions`
 * - the prefix is the source name, fixed when the source is first built and
 *   stored (`liveSourceName`); a future configurable prefix follows the
 *   same rule
 * - display names change no id: the source's display name seeds the prefix
 *   only at first build, and model or field labels never feed ids, so
 *   renaming a source or relabelling a field keeps every chart working
 * - models are only ever added: today's model of each integration stays
 *   as its permanent wide model, and planned models reserve their names
 *   up front (`plannedModelNames`) so a dbt explore can't take them first
 *
 * `apiSourceNames.test.ts` snapshots every integration's explore names and
 * field ids; a failing snapshot means saved content would break.
 */
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

/**
 * The hand-written models of an integration, before any scan. The first is
 * the wide model: scans and field edits apply to it. Planned models aren't
 * built yet, but their explore names are reserved for every new source.
 */
export type ApiSourceBaseLayer = {
    baseVersion: number;
    /** The connector's own declaration, shared by every model. */
    capabilities: ApiConnectorCapabilities;
    definitions: readonly [
        ApiSourceExploreDefinition,
        ...ApiSourceExploreDefinition[],
    ];
    plannedModelNames: readonly string[];
};

export const getApiSourceBaseLayer = (
    connector: ApiConnectorType,
): ApiSourceBaseLayer => {
    switch (connector) {
        case ApiConnectorType.GA4:
            return {
                baseVersion: GA4_SEMANTIC_LAYER_VERSION,
                capabilities: GA4_CAPABILITIES,
                definitions: [GA4_REPORT_EXPLORE],
                plannedModelNames: ['ecommerce'],
            };
        case ApiConnectorType.SEARCH_CONSOLE:
            return {
                baseVersion: SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION,
                capabilities: SEARCH_CONSOLE_CAPABILITIES,
                definitions: [SEARCH_CONSOLE_PERFORMANCE_EXPLORE],
                plannedModelNames: ['search_appearance'],
            };
        case ApiConnectorType.POSTHOG:
            return {
                baseVersion: POSTHOG_SEMANTIC_LAYER_VERSION,
                capabilities: POSTHOG_CAPABILITIES,
                definitions: [POSTHOG_EVENTS_EXPLORE],
                plannedModelNames: ['persons', 'sessions'],
            };
        default:
            return assertUnreachable(connector, 'Unknown api connector');
    }
};

/** The wide model of an integration, which scans and field edits apply to. */
export const getApiSourceWideDefinition = (
    connector: ApiConnectorType,
): ApiSourceExploreDefinition =>
    getApiSourceBaseLayer(connector).definitions[0];

/** The explore names a source with this name gets today. */
export const getApiSourceExploreNames = (
    connector: ApiConnectorType,
    sourceName: string,
): string[] =>
    getApiSourceBaseLayer(connector).definitions.map(({ name }) =>
        getApiSourceExploreName(sourceName, name),
    );

/** The explore names kept free for the integration's planned models. */
export const getApiSourceReservedExploreNames = (
    connector: ApiConnectorType,
    sourceName: string,
): string[] =>
    getApiSourceBaseLayer(connector).plannedModelNames.map((modelName) =>
        getApiSourceExploreName(sourceName, modelName),
    );

/** The fields a scan found beyond the integration's built-in ones. */
export const toScannedLiveSourceFields = (
    connector: ApiConnectorType,
    scan: ApiSourceScan,
): ScannedLiveSourceField[] => {
    const definition = getApiSourceWideDefinition(connector);
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
    name: label,
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
    const {
        baseVersion,
        capabilities,
        definitions: [wide, ...others],
    } = getApiSourceBaseLayer(apiSource.connector);
    const build = (definition: ApiSourceExploreDefinition, isWide: boolean) =>
        buildApiSourceExplore({
            definition,
            exploreName: getApiSourceExploreName(sourceName, definition.name),
            // The wide model keeps the source's name; the others add theirs
            label: isWide ? label : `${label} ${definition.label}`,
            connectionUuid,
            integration: apiSource.connector,
            baseVersion,
            capabilities,
            warehouseSqlBuilder: getSqlBuilder(apiSource.connector),
        });
    return [
        build(
            applyLiveSourceFieldEdits({ base: wide, scannedFields, edits }),
            true,
        ),
        ...others.map((definition) => build(definition, false)),
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
    if (integration !== undefined) {
        assertApiSourceQuery(explore, metricQuery);
    }
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

const DAY_MS = 86_400_000;

/** The first day of a compact period such as 202644 (ISO week), 202610 or 2026. */
export const toPeriodStart = (
    value: unknown,
    format: ApiSourcePeriodFormat,
): unknown => {
    const text = String(value);
    const pad = (number: number) => String(number).padStart(2, '0');
    switch (format) {
        case 'year':
            return /^\d{4}$/.test(text) ? `${text}-01-01` : value;
        case 'year_month':
            return /^\d{6}$/.test(text)
                ? `${text.slice(0, 4)}-${text.slice(4)}-01`
                : value;
        case 'iso_week': {
            if (!/^\d{6}$/.test(text)) {
                return value;
            }
            // ISO week 1 holds January 4th; weeks start on Monday
            const year = Number(text.slice(0, 4));
            const week = Number(text.slice(4));
            const january4 = Date.UTC(year, 0, 4);
            const weekOneMonday =
                january4 - ((new Date(january4).getUTCDay() + 6) % 7) * DAY_MS;
            const monday = new Date(weekOneMonday + (week - 1) * 7 * DAY_MS);
            return `${monday.getUTCFullYear()}-${pad(
                monday.getUTCMonth() + 1,
            )}-${pad(monday.getUTCDate())}`;
        }
        default:
            return assertUnreachable(format, 'Unknown period format');
    }
};

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
    const periodColumns = compiled.periodColumns ?? {};
    const resultRows = rows.map((row) =>
        Object.fromEntries(
            columnEntries.map(([column, fieldId]) => {
                const value = row[column] ?? null;
                const format = periodColumns[column];
                return [
                    fieldId,
                    format && value !== null
                        ? toPeriodStart(value, format)
                        : value,
                ];
            }),
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
