import { type ApiSuccess } from '../../types/api/success';

/**
 * Static manifest of every `@lightdash/query-sdk` query a data app defines,
 * extracted at build time by the sandbox template's `queryManifest.js` and
 * stored as `dist/assets/queries.json`. The JS analyzer mirrors these shapes.
 */

/** A value the analyzer could not fold statically; `source` is the exact expression text. */
export type DataAppManifestDynamicValue = { source: string };

/** A value supplied at runtime by one of the query's `slots`. */
export type DataAppManifestSlotRef = { slot: string };

/** A template literal whose `${name}` holes are slot names. */
export type DataAppManifestTemplate = { template: string };

export type DataAppManifestValue =
    | string
    | number
    | boolean
    | null
    | DataAppManifestValue[]
    | { [key: string]: DataAppManifestValue }
    | DataAppManifestDynamicValue
    | DataAppManifestSlotRef
    | DataAppManifestTemplate;

export type DataAppManifestSlot = {
    name: string;
    /** `local`: React state in the component; `globalFilter`: `useGlobalFilters().filtersFor(explore)`. */
    kind: 'local' | 'globalFilter';
    /** The explore a global-filter slot reads; null for local state. */
    explore: DataAppManifestValue;
    default: DataAppManifestValue;
};

/** `static`: fully folded; `parametric`: has slots; `dynamic`: has unfoldable values. */
export type DataAppManifestBucket = 'static' | 'parametric' | 'dynamic';

type DataAppManifestQueryMeta = {
    /** From `compose(id)` or `.id()`. */
    id: string | null;
    /** From `.title()` or `.label()`. */
    title: string | null;
    description: string | null;
};

export type DataAppManifestSemanticSpec = DataAppManifestQueryMeta & {
    kind: 'semantic';
    explore: DataAppManifestValue;
    dimensions: DataAppManifestValue[];
    metrics: DataAppManifestValue[];
    filters: DataAppManifestValue[];
    metricFilters: DataAppManifestValue[];
    sorts: DataAppManifestValue[];
    limit: DataAppManifestValue;
    parameters: DataAppManifestValue;
};

export type DataAppManifestSavedChartSpec = DataAppManifestQueryMeta & {
    kind: 'savedChart';
    chartUuid: DataAppManifestValue;
    limit: DataAppManifestValue;
    filters: DataAppManifestValue[];
    parameters: DataAppManifestValue;
};

type DataAppManifestNodeMeta = {
    nodeId: DataAppManifestValue;
    title: DataAppManifestValue;
    description: DataAppManifestValue;
};

export type DataAppManifestComposerNode =
    | (DataAppManifestNodeMeta & {
          kind: 'semantic';
          query:
              | DataAppManifestSemanticSpec
              | DataAppManifestSavedChartSpec
              | DataAppManifestDynamicValue
              | null;
      })
    | (DataAppManifestNodeMeta & {
          kind: 'duckdb';
          sql: DataAppManifestValue;
          reads: DataAppManifestValue;
          limit: DataAppManifestValue;
      })
    | (DataAppManifestNodeMeta & {
          kind: 'python';
          code: DataAppManifestValue;
          reads: DataAppManifestValue;
          limit: DataAppManifestValue;
      });

export type DataAppManifestComposerSpec = DataAppManifestQueryMeta & {
    kind: 'composer';
    parameters: DataAppManifestValue;
    nodes: DataAppManifestComposerNode[];
    terminal: DataAppManifestValue;
};

type DataAppManifestQueryLocation = {
    /** `src/App.jsx:59` — where the chain is finalized. */
    loc: string;
    bucket: DataAppManifestBucket;
    slots: DataAppManifestSlot[];
};

export type DataAppManifestQuery = (
    | DataAppManifestSemanticSpec
    | DataAppManifestSavedChartSpec
    | DataAppManifestComposerSpec
) &
    DataAppManifestQueryLocation;

/** One `useLightdash(...)` call site. */
export type DataAppManifestBinding = {
    /** Enclosing component name; null outside a named function. */
    component: string | null;
    loc: string;
    /** `id` of the resolved query; null when unnamed or passed in as a prop. */
    query: string | null;
    /** `loc` of the resolved query; null when it could not be resolved statically. */
    queryLoc: string | null;
};

export type DataAppQueryManifest = {
    version: 1;
    queries: DataAppManifestQuery[];
    bindings: DataAppManifestBinding[];
    /** Analyzer failures, joined; the manifest is still emitted. */
    error: string | null;
};

export type DataAppQueryManifestResult = {
    /** The app version the manifest was read from. */
    version: number;
    /** null when the version predates manifests or the file is unreadable. */
    queries: DataAppQueryManifest | null;
};

export type ApiGetAppQueriesResponse = ApiSuccess<DataAppQueryManifestResult>;

export const DATA_APP_QUERY_MANIFEST_ASSET = 'assets/queries.json';

export const parseDataAppQueryManifest = (
    raw: string,
): DataAppQueryManifest | null => {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            parsed === null ||
            typeof parsed !== 'object' ||
            !('version' in parsed) ||
            parsed.version !== 1 ||
            !('queries' in parsed) ||
            !Array.isArray(parsed.queries)
        ) {
            return null;
        }
        const manifest = parsed as Partial<DataAppQueryManifest>;
        return {
            version: 1,
            queries: manifest.queries ?? [],
            bindings: Array.isArray(manifest.bindings) ? manifest.bindings : [],
            error: typeof manifest.error === 'string' ? manifest.error : null,
        };
    } catch {
        return null;
    }
};
