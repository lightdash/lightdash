import {
    ApiConnectorType,
    assertUnreachable,
    DimensionType,
    getItemId,
    isDimension,
    SupportedDbtAdapter,
    UnexpectedServerError,
    type Explore,
    type ExternalConnectionApiSource,
    type ItemsMap,
    type LiveSourceResultCompleteness,
    type MetricQuery,
    type ResultColumns,
    type SortField,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { createHash } from 'crypto';
import { isPlainObject, memoize } from 'es-toolkit/compat';
import {
    assertApiSourceQuery,
    buildApiSourceExplore,
    type ApiSourceExploreDefinition,
    type ApiSourcePeriodFormat,
    type CompiledApiSourceQuery,
} from './apiSourceExplore';
import {
    type ApiSourceBaseLayer,
    type ApiSourceScan,
} from './ApiSourceIntegration';
import { getApiSourceIntegration } from './apiSourceIntegrations';
import {
    applyLiveSourceFieldEdits,
    type LiveSourceFieldEdits,
    type ScannedLiveSourceField,
} from './liveSourceFields';

const DEFAULT_SQL_BUILDER = warehouseSqlBuilderFromType(
    SupportedDbtAdapter.DUCKDB,
);

/**
 * The naming contract of live data source explores and fields. Saved charts,
 * dashboard filters, scheduled deliveries and field edits store these ids, so
 * they must never change once a customer has content on them:
 *
 * - explore = `<prefix>_<model>`, e.g. `google_analytics_report`
 * - field id = `<explore>_<field>`, e.g. `google_analytics_report_sessions`
 * - the prefix is set once, when a source is created or reattached, and
 *   stored (`liveSourceName`). A deleted source's prefix stays held until a
 *   source reattaches to it, so its charts can't read another target
 * - display names change no id: renaming a source or relabelling a field
 *   keeps every chart working
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

export const getApiSourceBaseLayer = (
    connector: ApiConnectorType,
): ApiSourceBaseLayer => getApiSourceIntegration(connector).baseLayer;

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
    const { withScannedFields, isInternalField } =
        getApiSourceIntegration(connector);
    const scanned = withScannedFields?.(definition, scan) ?? definition;
    const builtInNames = new Set([
        ...definition.dimensions.map(({ name }) => name),
        ...definition.metrics.map(({ name }) => name),
    ]);
    const isInternal = (apiName: string) => isInternalField?.(apiName) ?? false;
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

const buildDefinitionExplore = (
    connector: ApiConnectorType,
    args: Pick<
        Parameters<typeof buildApiSourceExplore>[0],
        | 'definition'
        | 'exploreName'
        | 'label'
        | 'connectionUuid'
        | 'definitionHash'
        | 'aiHint'
    >,
) => {
    const { baseVersion, capabilities } = getApiSourceBaseLayer(connector);
    return buildApiSourceExplore({
        ...args,
        integration: connector,
        baseVersion,
        capabilities,
        warehouseSqlBuilder:
            getApiSourceIntegration(connector).warehouseSqlBuilder ??
            DEFAULT_SQL_BUILDER,
    });
};

/** JSON with object keys sorted, so a hash can't depend on key order. */
const toStableJson = (value: unknown): string =>
    JSON.stringify(value, (_key, nested: unknown) =>
        isPlainObject(nested)
            ? Object.fromEntries(
                  Object.entries(nested as object).sort(([left], [right]) =>
                      left < right ? -1 : 1,
                  ),
              )
            : nested,
    );

/**
 * What the integration's code currently builds, by model name. Each hash
 * comes from the explore built with placeholders for everything specific to
 * one source (prefix, label, connection, scanned fields, field edits), so it
 * changes when the code's output does, and nobody has to bump a version.
 */
export const getApiSourceDefinitionHashes = memoize(
    (connector: ApiConnectorType): Record<string, string> =>
        Object.fromEntries(
            getApiSourceBaseLayer(connector).definitions.map((definition) => [
                definition.name,
                createHash('sha256')
                    .update(
                        toStableJson(
                            buildDefinitionExplore(connector, {
                                definition,
                                exploreName: getApiSourceExploreName(
                                    'source',
                                    definition.name,
                                ),
                                label: 'source',
                                connectionUuid: 'connection',
                                // A placeholder, so a change to how hints
                                // are built still changes the hash
                                aiHint: ['hint'],
                            }),
                        ),
                    )
                    .digest('hex'),
            ]),
        ),
);

/**
 * Field ids stored today that a rebuild would lose, which would break the
 * charts on them. A field an admin took out of use isn't lost.
 */
export const getLostApiSourceFieldIds = ({
    storedFieldIds,
    rebuilt,
    edits,
}: {
    storedFieldIds: string[];
    rebuilt: Explore[];
    edits: LiveSourceFieldEdits;
}): string[] => {
    const kept = new Set([
        ...rebuilt.flatMap(({ apiSource }) =>
            Object.keys(apiSource?.fields ?? {}),
        ),
        ...Object.entries(edits).flatMap(([name, edit]) =>
            edit.inUse === false
                ? [getItemId({ table: rebuilt[0].name, name })]
                : [],
        ),
    ]);
    return storedFieldIds.filter((fieldId) => !kept.has(fieldId));
};

/** What the source reads, for the AI agent. Admins can't remove this. */
export const describeApiSourceTarget = (
    apiSource: ExternalConnectionApiSource,
    origin: string,
    targetLabel: string | null,
): string =>
    getApiSourceIntegration(apiSource.connector).describeTarget({
        apiSource,
        origin,
        targetLabel,
    });

/** The explores a live data source answers metric queries with. */
export const buildApiSourceExplores = ({
    connectionUuid,
    sourceName,
    name: label,
    apiSource,
    scannedFields,
    edits,
    aiHint,
}: {
    connectionUuid: string;
    sourceName: string;
    name: string;
    apiSource: ExternalConnectionApiSource;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
    /** The target first, then the admin's text. */
    aiHint?: string[];
}): Explore[] => {
    const {
        definitions: [wide, ...others],
    } = getApiSourceBaseLayer(apiSource.connector);
    const definitionHashes = getApiSourceDefinitionHashes(apiSource.connector);
    const build = (definition: ApiSourceExploreDefinition, isWide: boolean) =>
        buildDefinitionExplore(apiSource.connector, {
            definition,
            exploreName: getApiSourceExploreName(sourceName, definition.name),
            // The wide model keeps the source's name; the others add theirs
            label: isWide ? label : `${label} ${definition.label}`,
            connectionUuid,
            definitionHash: definitionHashes[definition.name],
            aiHint,
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
    if (integration === undefined) {
        throw new UnexpectedServerError(
            `"${explore.name}" isn't a live data source explore`,
        );
    }
    assertApiSourceQuery(explore, metricQuery);
    return getApiSourceIntegration(integration).compile({
        explore,
        metricQuery,
        timezone,
        now,
    });
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

/**
 * Whether a compiled query got every row it needed. Rows past the query's own
 * limit don't matter when the API returned them in the query's order. A query
 * sorted on our side needs every row, so rows the API kept back can be the
 * ones the sort would show, and the result is incomplete.
 */
export const getApiResultCompleteness = ({
    compiled,
    hasMoreRows,
}: {
    compiled: Pick<CompiledApiSourceQuery, 'localSorts'>;
    hasMoreRows: boolean;
}): LiveSourceResultCompleteness => {
    if (!hasMoreRows) {
        return 'complete';
    }
    return compiled.localSorts.length > 0 ? 'source_cut' : 'own_limit';
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
