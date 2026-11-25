import {
    ApiConnectorType,
    assertUnreachable,
    DimensionType,
    getEffectiveItemType,
    getItemId,
    getItemMap,
    isDimension,
    isMetric,
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
import { createHash } from 'crypto';
import { isPlainObject, memoize } from 'es-toolkit/compat';
import { tooManyRowsError } from '../query/rows';
import { getLiveIntegration, isLiveIntegrationRegistered } from '../registry';
import { type LiveCapabilities, type LiveScanResult } from '../types';
import {
    buildLiveExplore,
    getApiName,
    getLiveRequestLimit,
    type CompiledLiveQuery,
    type LiveExploreDefinition,
    type LivePeriodFormat,
} from './definition';
import {
    applyLiveSourceFieldEdits,
    getLiveExploreEdit,
    getLiveModelFieldInputs,
    isLiveExploreInUse,
    type LiveSourceExploreEdits,
    type LiveSourceFieldEdits,
    type ScannedLiveSourceField,
} from './fields';

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
 * `explores/names.test.ts` snapshots every integration's explore names and
 * field ids; a failing snapshot means saved content would break.
 */
export const getLiveExploreName = (
    sourceName: string,
    definitionName: string,
) => `${sourceName}_${definitionName}`;

/** What every source of an integration starts from, before scans and edits. */
export type LiveBaseLayer = {
    baseVersion: number;
    /** The integration's own declaration, shared by every model. */
    capabilities: LiveCapabilities;
    definitions: readonly [LiveExploreDefinition, ...LiveExploreDefinition[]];
    plannedModelNames: readonly string[];
};

export const getLiveBaseLayer = (
    connector: ApiConnectorType,
): LiveBaseLayer => {
    const { capabilities, explores, plannedModelNames } =
        getLiveIntegration(connector);
    return {
        baseVersion: 1,
        capabilities,
        definitions: explores,
        plannedModelNames,
    };
};

/** The explore names a source with this name gets today. */
export const getLiveExploreNames = (
    connector: ApiConnectorType,
    sourceName: string,
): string[] =>
    getLiveBaseLayer(connector).definitions.map(({ name }) =>
        getLiveExploreName(sourceName, name),
    );

/** The explore names kept free for the integration's planned models. */
export const getLiveReservedExploreNames = (
    connector: ApiConnectorType,
    sourceName: string,
): string[] =>
    getLiveBaseLayer(connector).plannedModelNames.map((modelName) =>
        getLiveExploreName(sourceName, modelName),
    );

/** An explore that scans add fields to; `model` is null for the first one. */
export type LiveScannedModel = {
    model: string | null;
    definition: LiveExploreDefinition;
};

/** The explores scans add fields to: the first, then any the integration names. */
export const getLiveScannedModels = (
    connector: ApiConnectorType,
): LiveScannedModel[] => {
    const {
        definitions: [wide, ...others],
    } = getLiveBaseLayer(connector);
    const models = new Set(getLiveIntegration(connector).scan?.models ?? []);
    return [
        { model: null, definition: wide },
        ...others
            .filter(({ name }) => models.has(name))
            .map((definition) => ({ model: definition.name, definition })),
    ];
};

/** The fields a scan found beyond the integration's built-in ones. */
export const toScannedLiveSourceFields = (
    connector: ApiConnectorType,
    scan: LiveScanResult,
): ScannedLiveSourceField[] => {
    const { scan: scanning } = getLiveIntegration(connector);
    const isInternal = (apiName: string) =>
        scanning?.isInternalField?.(apiName) ?? false;
    return getLiveScannedModels(connector).flatMap(({ model, definition }) => {
        const scanned =
            scanning?.withScannedFields(definition, scan) ?? definition;
        const builtInNames = new Set([
            ...definition.dimensions.map(({ name }) => name),
            ...definition.metrics.map(({ name }) => name),
        ]);
        const tag = model === null ? {} : { model };
        return [
            ...scanned.dimensions
                .filter(({ name }) => !builtInNames.has(name))
                .map(
                    (field): ScannedLiveSourceField => ({
                        kind: 'dimension',
                        definition: field,
                        isInternal: isInternal(field.apiName),
                        ...tag,
                    }),
                ),
            ...scanned.metrics
                .filter(({ name }) => !builtInNames.has(name))
                .map(
                    (field): ScannedLiveSourceField => ({
                        kind: 'metric',
                        definition: field,
                        isInternal: isInternal(field.apiName),
                        ...tag,
                    }),
                ),
        ];
    });
};

const buildDefinitionExplore = (
    connector: ApiConnectorType,
    args: Pick<
        Parameters<typeof buildLiveExplore>[0],
        | 'definition'
        | 'exploreName'
        | 'label'
        | 'groupLabel'
        | 'connectionUuid'
        | 'definitionHash'
        | 'aiHint'
        | 'tags'
    >,
) => {
    const { baseVersion, capabilities } = getLiveBaseLayer(connector);
    return buildLiveExplore({
        ...args,
        integration: connector,
        baseVersion,
        capabilities,
        warehouseSqlBuilder:
            getLiveIntegration(connector).warehouseSqlBuilder ??
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
export const getLiveDefinitionHashes = memoize(
    (connector: ApiConnectorType): Record<string, string> =>
        Object.fromEntries(
            getLiveBaseLayer(connector).definitions.map((definition) => [
                definition.name,
                createHash('sha256')
                    .update(
                        toStableJson(
                            buildDefinitionExplore(connector, {
                                definition,
                                exploreName: getLiveExploreName(
                                    'source',
                                    definition.name,
                                ),
                                label: definition.label,
                                groupLabel: 'source',
                                connectionUuid: 'connection',
                                // A placeholder for the source's hints, so
                                // a change to how hints are built still
                                // changes the hash
                                aiHint: ['hint', definition.aiHint ?? ''],
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
export const getLostLiveFieldIds = ({
    storedFieldIds,
    rebuilt,
    edits,
    exploreEdits = {},
    sourceName,
    firstModel,
}: {
    storedFieldIds: string[];
    rebuilt: Explore[];
    edits: LiveSourceFieldEdits;
    exploreEdits?: LiveSourceExploreEdits;
    /** Names the explores of edits keyed `<model>.<name>`. */
    sourceName: string;
    /** The model of the first explore, whose edits have bare keys. */
    firstModel: string;
}): string[] => {
    // A bare key is the first explore's field; `<model>.<name>` another's
    const toFieldId = (key: string) => {
        const dot = key.indexOf('.');
        return dot === -1
            ? getItemId({
                  table: getLiveExploreName(sourceName, firstModel),
                  name: key,
              })
            : getItemId({
                  table: getLiveExploreName(sourceName, key.slice(0, dot)),
                  name: key.slice(dot + 1),
              });
    };
    // Charts on a switched-off explore lose it on purpose
    const switchedOff = Object.keys(exploreEdits)
        .filter((model) => !isLiveExploreInUse(exploreEdits, model))
        .map((model) => `${getLiveExploreName(sourceName, model)}_`);
    const kept = new Set([
        ...rebuilt.flatMap(({ apiSource }) =>
            Object.keys(apiSource?.fields ?? {}),
        ),
        ...Object.entries(edits).flatMap(([key, edit]) =>
            edit.inUse === false ? [toFieldId(key)] : [],
        ),
    ]);
    return storedFieldIds.filter(
        (fieldId) =>
            !kept.has(fieldId) &&
            !switchedOff.some((prefix) => fieldId.startsWith(prefix)),
    );
};

/** What the source reads, for the AI agent. Admins can't remove this. */
export const describeLiveTarget = (
    apiSource: ExternalConnectionApiSource,
    origin: string,
    targetLabel: string | null,
): string =>
    getLiveIntegration(apiSource.connector).describeTarget({
        settings: apiSource,
        origin,
        targetLabel,
    });

/**
 * The explores a live data source answers metric queries with: every
 * explore an admin hasn't switched off, with its label, description and
 * AI hint overrides.
 */
export const buildLiveExplores = ({
    connectionUuid,
    sourceName,
    name: label,
    apiSource,
    scannedFields,
    edits,
    exploreEdits = {},
    aiHint,
    tags,
}: {
    connectionUuid: string;
    sourceName: string;
    name: string;
    apiSource: ExternalConnectionApiSource;
    scannedFields: ScannedLiveSourceField[];
    edits: LiveSourceFieldEdits;
    exploreEdits?: LiveSourceExploreEdits;
    /** The target first, then the admin's source hint; each explore's own hint follows. */
    aiHint?: string[];
    /** The source's tags, carried by each of its explores. */
    tags?: string[];
}): Explore[] => {
    const { definitions } = getLiveBaseLayer(apiSource.connector);
    const scannedModels = getLiveScannedModels(apiSource.connector);
    const definitionHashes = getLiveDefinitionHashes(apiSource.connector);
    const build = (definition: LiveExploreDefinition) => {
        const exploreEdit = getLiveExploreEdit(exploreEdits, definition.name);
        return buildDefinitionExplore(apiSource.connector, {
            definition: exploreEdit?.description
                ? { ...definition, description: exploreEdit.description }
                : definition,
            exploreName: getLiveExploreName(sourceName, definition.name),
            // Every explore is named by its model and grouped under the
            // source, even when the source has only one
            label: exploreEdit?.label ?? definition.label,
            groupLabel: label,
            connectionUuid,
            definitionHash: definitionHashes[definition.name],
            // An admin's hint replaces the built-in one
            aiHint: [
                ...(aiHint ?? []),
                ...[exploreEdit?.aiHint ?? definition.aiHint].filter(
                    (hint): hint is string => Boolean(hint),
                ),
            ],
            tags,
        });
    };
    return definitions
        .filter(({ name }) => isLiveExploreInUse(exploreEdits, name))
        .map((definition) => {
            const scanned = scannedModels.find(
                (candidate) => candidate.definition === definition,
            );
            return build(
                scanned
                    ? applyLiveSourceFieldEdits({
                          base: definition,
                          ...getLiveModelFieldInputs({
                              model: scanned.model,
                              scannedFields,
                              edits,
                          }),
                      })
                    : definition,
            );
        });
};

/**
 * Compiles a metric query on a live data source explore into its
 * integration's request. Callers refuse the query first, with
 * `assertLiveQuery` or the composer-aware check, so it runs once.
 */
export const compileLiveMetricQuery = ({
    explore,
    metricQuery,
    timezone,
    now,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    timezone: string;
    now: Date;
}): CompiledLiveQuery => {
    const { apiSource } = explore;
    if (!apiSource) {
        throw new UnexpectedServerError(
            `"${explore.name}" isn't a live data source explore`,
        );
    }
    const { compile, limits, periodFormats } = getLiveIntegration(
        apiSource.integration,
    );
    const {
        query,
        localSorts = [],
        fieldIdsByColumn = Object.fromEntries(
            [...metricQuery.dimensions, ...metricQuery.metrics].map(
                (fieldId) => [getApiName(apiSource, fieldId), fieldId],
            ),
        ),
    } = compile({ explore, metricQuery, timezone, now });
    const getPeriodColumns = (formats: typeof periodFormats & object) => {
        const columnByFieldId = new Map(
            Object.entries(fieldIdsByColumn).map(([column, fieldId]) => [
                fieldId,
                column,
            ]),
        );
        const itemsMap = getItemMap(explore);
        return Object.fromEntries(
            metricQuery.dimensions.flatMap((fieldId) => {
                const item = itemsMap[fieldId];
                const format =
                    item && isDimension(item) && item.timeInterval
                        ? formats[item.timeInterval]
                        : undefined;
                const column = columnByFieldId.get(fieldId);
                return format && column ? [[column, format]] : [];
            }),
        );
    };
    return {
        query,
        requestLimit: getLiveRequestLimit(
            metricQuery.limit,
            localSorts,
            limits.maxRows,
        ),
        limit: metricQuery.limit,
        fieldIdsByColumn,
        localSorts,
        ...(periodFormats
            ? { periodColumns: getPeriodColumns(periodFormats) }
            : {}),
    };
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
    format: LivePeriodFormat,
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
 * Refuses a result sorted on our side when the API kept rows back: the sort
 * would rank only the rows read, so the top rows shown could be the wrong
 * ones. A result in the API's own order only loses rows past its limit.
 */
export const assertLiveResultComplete = ({
    compiled,
    hasMoreRows,
    label,
    maxRows,
}: {
    compiled: Pick<CompiledLiveQuery, 'localSorts'>;
    hasMoreRows: boolean;
    label: string;
    maxRows: number;
}): void => {
    if (hasMoreRows && compiled.localSorts.length > 0) {
        throw tooManyRowsError({ label, maxRows });
    }
};

/**
 * A result column's type: a dimension's own, or a metric's, where a minimum
 * or maximum of a date stays a date.
 */
const toResultColumnType = (
    field: ItemsMap[string] | undefined,
    fields: ItemsMap,
): DimensionType => {
    if (!field) return DimensionType.NUMBER;
    if (isDimension(field)) return field.type;
    // Custom metrics carry their base dimension's type
    if (isMetric(field) && field.baseDimensionType) {
        return field.baseDimensionType;
    }
    const type = getEffectiveItemType(field, fields);
    return type === DimensionType.DATE || type === DimensionType.TIMESTAMP
        ? type
        : DimensionType.NUMBER;
};

/** The connector's rows as result rows keyed by field id, sorted and limited. */
export const toLiveResult = ({
    compiled,
    rows,
    fields,
}: {
    compiled: CompiledLiveQuery;
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
                { reference: fieldId, type: toResultColumnType(field, fields) },
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

/** A stored live source, as much of it as names its explores. */
export type StoredLiveSourceExplores = {
    /** The source's display name. */
    name: string;
    sourceName: string;
    connector: ApiConnectorType;
    exploreEdits: LiveSourceExploreEdits;
};

/**
 * The source and label of a live explore an admin switched off, when the
 * explore name is one, so a chart on it can say so instead of "not found".
 */
export const findSwitchedOffLiveExplore = (
    sources: StoredLiveSourceExplores[],
    exploreName: string,
): { sourceName: string; exploreLabel: string } | undefined =>
    sources
        .filter(({ connector }) => isLiveIntegrationRegistered(connector))
        .flatMap((source) =>
            getLiveBaseLayer(source.connector)
                .definitions.filter(
                    (definition) =>
                        getLiveExploreName(
                            source.sourceName,
                            definition.name,
                        ) === exploreName &&
                        !isLiveExploreInUse(
                            source.exploreEdits,
                            definition.name,
                        ),
                )
                .map((definition) => ({
                    sourceName: source.name,
                    exploreLabel:
                        getLiveExploreEdit(source.exploreEdits, definition.name)
                            ?.label ?? definition.label,
                })),
        )
        .at(0);
