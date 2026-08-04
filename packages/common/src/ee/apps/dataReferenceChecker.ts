import { parse as parseYaml } from 'yaml';
import { type Explore } from '../../types/explore';
import { ValidationErrorType } from '../../types/validation';
import assertUnreachable from '../../utils/assertUnreachable';
import {
    getDimensionMapFromTables,
    getMetricsMapFromTables,
} from '../../utils/fields';
import { getItemId } from '../../utils/item';
import {
    type DataAppSourceFile,
    type DataReferenceLocation,
    type ExtractedDataReference,
    type ExtractedGlobalFilterReference,
    type ExtractedQueryReference,
    type ExtractedSavedChartReference,
} from './dataReferences';

/**
 * Semantic checker for extracted data-app references: reports explores and
 * fields that cannot resolve at query time. Shares the extractor's trust
 * property — never a false alarm; anything ambiguous is skipped, not guessed.
 */

export type DataAppExploreFields = {
    dimensionIds: Set<string>;
    metricIds: Set<string>;
};

/** Queryable explore names → their valid field ids. */
export type DataAppExploreIndex = {
    explores: Map<string, DataAppExploreFields>;
};

export type DataAppValidationError = {
    errorType: ValidationErrorType;
    error: string;
    /** Explore the reference targets; null when it could not be resolved. */
    modelName: string | null;
    /** Offending field ref as written in the app source; null for explore-level errors. */
    fieldName: string | null;
    location: DataReferenceLocation;
};

export const buildDataAppExploreIndexFromExplores = (
    explores: Pick<Explore, 'name' | 'tables'>[],
): DataAppExploreIndex => {
    const map = new Map<string, DataAppExploreFields>();
    for (const explore of explores) {
        map.set(explore.name, {
            dimensionIds: new Set(
                Object.keys(getDimensionMapFromTables(explore.tables)),
            ),
            metricIds: new Set(
                Object.keys(getMetricsMapFromTables(explore.tables)),
            ),
        });
    }
    return { explores: map };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

type ModelFields = DataAppExploreFields & { joins: string[] };

const collectModelEntry = (
    modelRaw: unknown,
    modelsByName: Map<string, ModelFields>,
): void => {
    const model = asRecord(modelRaw);
    const name = typeof model?.name === 'string' ? model.name : null;
    if (!model || !name) return;

    const entry = modelsByName.get(name) ?? {
        dimensionIds: new Set<string>(),
        metricIds: new Set<string>(),
        joins: [],
    };
    modelsByName.set(name, entry);

    const meta = asRecord(model.meta);
    for (const metricName of Object.keys(asRecord(meta?.metrics) ?? {})) {
        entry.metricIds.add(getItemId({ table: name, name: metricName }));
    }
    const joins = Array.isArray(meta?.joins) ? meta.joins : [];
    for (const joinRaw of joins) {
        const join = asRecord(joinRaw);
        if (typeof join?.join === 'string') entry.joins.push(join.join);
    }

    const columns = Array.isArray(model.columns) ? model.columns : [];
    for (const columnRaw of columns) {
        const column = asRecord(columnRaw);
        const columnName =
            typeof column?.name === 'string' ? column.name : null;
        if (column && columnName) {
            entry.dimensionIds.add(
                getItemId({ table: name, name: columnName }),
            );
        }
    }
};

/**
 * Builds the index from the sharded semantic layer written by
 * `lightdash download` (`.lightdash/context/models/*.yml`). Each file is a
 * standalone `models:` document rendered from the compiled explores, with
 * time-interval dimensions materialized as columns and joined tables emitted
 * as their own models — so no field derivation happens here beyond ids.
 *
 * Non-YAML files and YAML files without a `models` root are skipped, so the
 * whole models/ listing (including `_index.md`) can be passed as-is. An
 * unparseable .yml file throws: a silently dropped model would turn every
 * query against it into a false "explore does not exist" error.
 */
export const buildDataAppExploreIndexFromModelFiles = (
    files: DataAppSourceFile[],
): DataAppExploreIndex => {
    const modelsByName = new Map<string, ModelFields>();
    for (const file of files) {
        if (file.path.endsWith('.yml') || file.path.endsWith('.yaml')) {
            let parsed: unknown;
            try {
                parsed = parseYaml(file.content);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                throw new Error(
                    `Invalid semantic layer file ${file.path}: ${message}`,
                );
            }
            const root = asRecord(parsed);
            if (root && Array.isArray(root.models)) {
                // Merging by name folds `<model>.partN.yml` column overflow
                // files into their model.
                for (const modelRaw of root.models) {
                    collectModelEntry(modelRaw, modelsByName);
                }
            }
        }
    }
    if (modelsByName.size === 0) {
        throw new Error(
            'Invalid semantic layer: no models found — re-download the app to refresh .lightdash/context/models/',
        );
    }

    // An explore's queryable fields include its joined models' fields
    // (dot-notation refs resolve to `<joinedTable>_<field>` ids).
    const map = new Map<string, DataAppExploreFields>();
    for (const [name, fields] of modelsByName) {
        const dimensionIds = new Set(fields.dimensionIds);
        const metricIds = new Set(fields.metricIds);
        for (const joinName of fields.joins) {
            const joined = modelsByName.get(joinName);
            if (joined) {
                for (const id of joined.dimensionIds) dimensionIds.add(id);
                for (const id of joined.metricIds) metricIds.add(id);
            }
        }
        map.set(name, { dimensionIds, metricIds });
    }
    return { explores: map };
};

/**
 * Mirrors the SDK's field qualifier (`createFieldQualifier` in apiTransport):
 * dot refs collapse their first dot, refs already prefixed with the explore
 * name pass through, bare refs get the explore prefix. The checker must agree
 * with what the runtime sends — `convertFieldRefToFieldId` differs on the
 * passthrough case and would double-prefix already-qualified refs.
 */
const qualifyFieldRef = (exploreName: string, ref: string): string => {
    if (ref.includes('.')) return ref.replace('.', '_');
    if (ref.startsWith(`${exploreName}_`)) return ref;
    return `${exploreName}_${ref}`;
};

const levenshtein = (a: string, b: string): number => {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
        const row = [i];
        for (let j = 1; j <= b.length; j += 1) {
            const substitution = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
            row.push(Math.min(prev[j] + 1, row[j - 1] + 1, substitution));
        }
        prev = row;
    }
    return prev[b.length];
};

const MAX_SUGGESTION_DISTANCE = 2;

/** Closest candidate within edit distance 2; ties broken alphabetically.
 *  No suggestion when the distance spans the whole input — replacing every
 *  character is a different name, not a typo, and a wrong suggestion misleads. */
const findClosest = (
    input: string,
    candidates: Iterable<string>,
): string | null => {
    let best: string | null = null;
    let bestDistance = MAX_SUGGESTION_DISTANCE + 1;
    for (const candidate of [...candidates].sort()) {
        const distance = levenshtein(input, candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best !== null && bestDistance < input.length ? best : null;
};

/** Field ids read more like the source when the explore prefix is dropped. */
const presentFieldId = (exploreName: string, id: string): string =>
    id.startsWith(`${exploreName}_`) ? id.slice(exploreName.length + 1) : id;

type FieldRole = 'dimension' | 'metric' | 'filter' | 'sort';

const ROLE_ERROR_TYPE: Record<FieldRole, ValidationErrorType> = {
    dimension: ValidationErrorType.Dimension,
    metric: ValidationErrorType.Metric,
    filter: ValidationErrorType.Filter,
    sort: ValidationErrorType.Sorting,
};

const ROLE_LABEL: Record<FieldRole, string> = {
    dimension: 'Dimension',
    metric: 'Metric',
    filter: 'Filter field',
    sort: 'Sort field',
};

type FieldScope = {
    explore: string;
    fields: DataAppExploreFields;
    localFields: Set<string>;
};

class DataAppReferenceChecker {
    private readonly index: DataAppExploreIndex;

    private readonly allDimensionIds = new Set<string>();

    private readonly allMetricIds = new Set<string>();

    private readonly errors: DataAppValidationError[] = [];

    constructor(index: DataAppExploreIndex) {
        this.index = index;
        for (const fields of index.explores.values()) {
            for (const id of fields.dimensionIds) this.allDimensionIds.add(id);
            for (const id of fields.metricIds) this.allMetricIds.add(id);
        }
    }

    check(references: ExtractedDataReference[]): DataAppValidationError[] {
        for (const ref of references) {
            switch (ref.kind) {
                case 'query':
                    this.checkQuery(ref);
                    break;
                case 'savedChart':
                    this.checkSavedChart(ref);
                    break;
                case 'globalFilter':
                    this.checkGlobalFilter(ref);
                    break;
                case 'externalFetch':
                    break;
                default:
                    assertUnreachable(ref, 'Unknown data reference kind');
            }
        }
        return this.errors;
    }

    private checkQuery(ref: ExtractedQueryReference): void {
        if (ref.explore === null) {
            this.checkUnscopedQueryRefs(ref);
            return;
        }
        const fields = this.index.explores.get(ref.explore);
        if (!fields) {
            this.pushMissingExplore(ref.explore, ref.location);
            return;
        }
        // Unresolvable local definitions could shadow any field id, so
        // field-level checks would risk false alarms.
        if (ref.unresolved.includes('localFields')) return;
        const scope: FieldScope = {
            explore: ref.explore,
            fields,
            localFields: new Set(ref.localFields),
        };
        for (const dim of ref.dimensions) {
            this.checkFieldRef(scope, dim, 'dimension', ref.location);
        }
        for (const metric of ref.metrics) {
            this.checkFieldRef(scope, metric, 'metric', ref.location);
        }
        for (const filterField of ref.filterFields) {
            this.checkFieldRef(scope, filterField, 'filter', ref.location);
        }
        for (const sortField of ref.sortFields) {
            this.checkFieldRef(scope, sortField, 'sort', ref.location);
        }
    }

    private checkFieldRef(
        scope: FieldScope,
        rawRef: string,
        role: FieldRole,
        location: DataReferenceLocation,
    ): void {
        const id = qualifyFieldRef(scope.explore, rawRef);
        if (DataAppReferenceChecker.isLocalField(scope, rawRef, id)) return;
        const isDimension = scope.fields.dimensionIds.has(id);
        const isMetric = scope.fields.metricIds.has(id);
        if (role === 'dimension' && isMetric && !isDimension) {
            this.errors.push({
                errorType: ValidationErrorType.Dimension,
                error: `'${rawRef}' is a metric, not a dimension — select it with .metrics()`,
                modelName: scope.explore,
                fieldName: rawRef,
                location,
            });
        } else if (role === 'metric' && isDimension && !isMetric) {
            this.errors.push({
                errorType: ValidationErrorType.Metric,
                error: `'${rawRef}' is a dimension, not a metric — select it with .dimensions()`,
                modelName: scope.explore,
                fieldName: rawRef,
                location,
            });
        } else if (!isDimension && !isMetric) {
            const closest = findClosest(
                id,
                DataAppReferenceChecker.candidatesForRole(scope.fields, role),
            );
            const suggestion = closest
                ? ` — did you mean '${presentFieldId(scope.explore, closest)}'?`
                : '';
            this.errors.push({
                errorType: ROLE_ERROR_TYPE[role],
                error: `${ROLE_LABEL[role]} '${rawRef}' not found in explore '${scope.explore}'${suggestion}`,
                modelName: scope.explore,
                fieldName: rawRef,
                location,
            });
        }
    }

    /**
     * Without the explore, bare refs cannot be qualified — but dot refs name
     * a concrete table, so a dot ref matching no known field id is broken in
     * every explore.
     */
    private checkUnscopedQueryRefs(ref: ExtractedQueryReference): void {
        if (ref.unresolved.includes('localFields')) return;
        const localFields = new Set(ref.localFields);
        const parts: [string[], FieldRole][] = [
            [ref.dimensions, 'dimension'],
            [ref.metrics, 'metric'],
            [ref.filterFields, 'filter'],
            [ref.sortFields, 'sort'],
        ];
        for (const [refs, role] of parts) {
            for (const rawRef of refs) {
                if (rawRef.includes('.') && !localFields.has(rawRef)) {
                    const id = rawRef.replace('.', '_');
                    if (
                        !localFields.has(id) &&
                        !this.allDimensionIds.has(id) &&
                        !this.allMetricIds.has(id)
                    ) {
                        this.errors.push({
                            errorType: ROLE_ERROR_TYPE[role],
                            error: `${ROLE_LABEL[role]} '${rawRef}' not found in any explore`,
                            modelName: null,
                            fieldName: rawRef,
                            location: ref.location,
                        });
                    }
                }
            }
        }
    }

    /**
     * Chart filter field ids are sent to the API verbatim (no explore
     * qualification) and the chart's explore is not known statically, so
     * existence in any explore is the strongest safe check. Whether the
     * chartUuid exists needs project content, not explores — later ticket.
     */
    private checkSavedChart(ref: ExtractedSavedChartReference): void {
        for (const rawRef of ref.filterFields) {
            if (
                !this.allDimensionIds.has(rawRef) &&
                !this.allMetricIds.has(rawRef)
            ) {
                const closest = findClosest(rawRef, [
                    ...this.allDimensionIds,
                    ...this.allMetricIds,
                ]);
                const suggestion = closest
                    ? ` — did you mean '${closest}'?`
                    : '';
                this.errors.push({
                    errorType: ValidationErrorType.Filter,
                    error: `Filter field '${rawRef}' does not exist in any explore${suggestion}`,
                    modelName: null,
                    fieldName: rawRef,
                    location: ref.location,
                });
            }
        }
    }

    private checkGlobalFilter(ref: ExtractedGlobalFilterReference): void {
        if (ref.explore === null) {
            if (ref.field !== null && ref.field.includes('.')) {
                const id = ref.field.replace('.', '_');
                if (
                    !this.allDimensionIds.has(id) &&
                    !this.allMetricIds.has(id)
                ) {
                    this.errors.push({
                        errorType: ValidationErrorType.Filter,
                        error: `Global filter field '${ref.field}' not found in any explore`,
                        modelName: null,
                        fieldName: ref.field,
                        location: ref.location,
                    });
                }
            }
            return;
        }
        const fields = this.index.explores.get(ref.explore);
        if (!fields) {
            this.pushMissingExplore(ref.explore, ref.location);
            return;
        }
        if (ref.field !== null) {
            const id = qualifyFieldRef(ref.explore, ref.field);
            if (!fields.dimensionIds.has(id) && !fields.metricIds.has(id)) {
                const closest = findClosest(id, [
                    ...fields.dimensionIds,
                    ...fields.metricIds,
                ]);
                const suggestion = closest
                    ? ` — did you mean '${presentFieldId(ref.explore, closest)}'?`
                    : '';
                this.errors.push({
                    errorType: ValidationErrorType.Filter,
                    error: `Global filter field '${ref.field}' not found in explore '${ref.explore}'${suggestion}`,
                    modelName: ref.explore,
                    fieldName: ref.field,
                    location: ref.location,
                });
            }
        }
    }

    private pushMissingExplore(
        explore: string,
        location: DataReferenceLocation,
    ): void {
        const closest = findClosest(explore, this.index.explores.keys());
        const suggestion = closest ? ` — did you mean '${closest}'?` : '';
        this.errors.push({
            errorType: ValidationErrorType.Model,
            error: `Explore '${explore}' does not exist${suggestion}`,
            modelName: explore,
            fieldName: null,
            location,
        });
    }

    /**
     * Locally defined fields (table calcs, additional metrics, custom
     * dimensions) are recorded by name; additional metrics resolve at runtime
     * to `<table>_<name>` ids, so the qualified ref minus the explore prefix
     * must also match.
     */
    private static isLocalField(
        scope: FieldScope,
        rawRef: string,
        qualifiedId: string,
    ): boolean {
        if (scope.localFields.size === 0) return false;
        if (
            scope.localFields.has(rawRef) ||
            scope.localFields.has(qualifiedId)
        ) {
            return true;
        }
        const prefix = `${scope.explore}_`;
        return (
            qualifiedId.startsWith(prefix) &&
            scope.localFields.has(qualifiedId.slice(prefix.length))
        );
    }

    private static candidatesForRole(
        fields: DataAppExploreFields,
        role: FieldRole,
    ): Iterable<string> {
        if (role === 'dimension') return fields.dimensionIds;
        if (role === 'metric') return fields.metricIds;
        return [...fields.dimensionIds, ...fields.metricIds];
    }
}

/**
 * Validates extracted data references against an explore index. Partial
 * references validate partially: resolved values are always exact (extractor
 * guarantee), so known entries are checked even when a list is incomplete.
 * Parameter keys are not validated — parameters can be defined at project
 * level, which the explore index cannot see.
 */
export const checkDataAppDataReferences = (
    references: ExtractedDataReference[],
    index: DataAppExploreIndex,
): DataAppValidationError[] =>
    new DataAppReferenceChecker(index).check(references);
