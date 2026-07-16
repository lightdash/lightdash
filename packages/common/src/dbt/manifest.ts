import { type AnyType } from '../types/any';
import {
    type DbtManifest,
    type DbtNode,
    type DbtRawModelNode,
} from '../types/dbt';

export type CombineManifestsResult = {
    manifest: DbtManifest;
    addedModelIds: string[];
};

/**
 * One dbt source feeding the multi-source merge. `precedence` orders sources
 * (lower wins on key collision; the primary source is precedence 0); `name`
 * tie-breaks equal precedence and labels collisions in the report.
 */
export type ManifestSource = {
    name: string;
    precedence: number;
    manifest: DbtManifest;
};

/**
 * Sections where a repeated key is surfaced as a collision. `macros` and `docs`
 * are deliberately absent: dbt namespaces their unique_ids by package (`dbt`,
 * `dbt_postgres`, `dbt_utils`, …), so any two projects on the same adapter
 * share hundreds of byte-identical built-in ids (`macro.dbt.*`,
 * `doc.dbt.__overview__`). Those are unioned silently — lowest precedence
 * wins — because a duplicate definition there loses no user data.
 */
export type ManifestCollisionSection =
    | 'nodes'
    | 'metrics'
    | 'sources'
    | 'semantic_models';

/**
 * A key present in more than one source. The lower-precedence source's entry
 * is kept (`winningSource`); the other is dropped (`supersededSource`). Surfaced
 * non-blocking so we no longer drop siblings silently like the CLI does today.
 */
export type ManifestCollision = {
    section: ManifestCollisionSection;
    key: string;
    winningSource: string;
    supersededSource: string;
};

export type CombineManifestSourcesResult = {
    manifest: DbtManifest;
    addedModelIds: string[];
    collisions: ManifestCollision[];
};

/**
 * Fold one manifest section (a `Record` keyed by unique_id) across sources in
 * precedence order. The first source to define a key wins; later sources hitting
 * an existing key are skipped and recorded as collisions — unless `section` is
 * `null`, which unions silently (used for `macros`/`docs`, see
 * {@link ManifestCollisionSection}). Sources iterate lowest-precedence-first,
 * so the lowest precedence wins.
 */
const mergeSection = <T>(
    orderedSources: ManifestSource[],
    pick: (manifest: DbtManifest) => Record<string, T> | undefined,
    section: ManifestCollisionSection | null,
    collisions: ManifestCollision[],
): Record<string, T> => {
    const merged: Record<string, T> = {};
    const winningSourceByKey: Record<string, string> = {};
    orderedSources.forEach((source) => {
        const entries = pick(source.manifest);
        if (!entries) return;
        Object.entries(entries).forEach(([key, value]) => {
            if (key in merged) {
                if (section !== null) {
                    collisions.push({
                        section,
                        key,
                        winningSource: winningSourceByKey[key],
                        supersededSource: source.name,
                    });
                }
            } else {
                merged[key] = value;
                winningSourceByKey[key] = source.name;
            }
        });
    });
    return merged;
};

/**
 * Merge N dbt manifests into one combined manifest for compilation.
 *
 * Sources are sorted by `precedence` ASC then `name` ASC; the lowest-precedence
 * source is treated as primary. All sources' `nodes` are merged (lower precedence
 * wins on collision) so name-based ref/join lookups resolve across sources during
 * compile — this is what lets a model from one source join to a model from another.
 * Only nodes that are already `compiled === true` become explores downstream, so
 * non-compiled nodes still help reference resolution without producing explores.
 *
 * `metrics`, `docs`, `sources`, `macros` and `semantic_models` are unioned across
 * sources (lower precedence wins on collision) — unlike the legacy two-manifest
 * merge which took them from the primary only. `macros` and `docs` collide
 * silently (see {@link ManifestCollisionSection}); the other sections report
 * collisions. `metadata` (a single object, not a keyed record) comes from the
 * primary source.
 *
 * `addedModelIds` lists compiled model unique_ids contributed by non-primary
 * sources (not present in the primary). Server-side the node's own `compiled`
 * flag drives explore creation, so this is returned for CLI parity, where it is
 * appended to the locally-compiled model id list.
 */
export const combineManifestSources = (
    sources: ManifestSource[],
): CombineManifestSourcesResult => {
    if (sources.length === 0) {
        throw new Error('combineManifestSources requires at least one source');
    }

    const orderedSources = [...sources].sort(
        (a, b) => a.precedence - b.precedence || a.name.localeCompare(b.name),
    );
    const primary = orderedSources[0];
    const collisions: ManifestCollision[] = [];

    const mergedNodes = mergeSection<DbtNode>(
        orderedSources,
        (manifest) => manifest.nodes,
        'nodes',
        collisions,
    );
    const mergedMetrics = mergeSection(
        orderedSources,
        (manifest) => manifest.metrics,
        'metrics',
        collisions,
    );
    const mergedDocs = mergeSection(
        orderedSources,
        (manifest) => manifest.docs,
        null,
        collisions,
    );
    const mergedSources = mergeSection<AnyType>(
        orderedSources,
        (manifest) => manifest.sources,
        'sources',
        collisions,
    );
    const mergedMacros = mergeSection<AnyType>(
        orderedSources,
        (manifest) => manifest.macros,
        null,
        collisions,
    );
    const mergedSemanticModels = mergeSection<AnyType>(
        orderedSources,
        (manifest) => manifest.semantic_models,
        'semantic_models',
        collisions,
    );

    const primaryNodeIds = new Set(Object.keys(primary.manifest.nodes));
    const addedModelIds: string[] = [];
    const seenAddedIds = new Set<string>();
    orderedSources.forEach((source) => {
        if (source === primary) return;
        Object.entries(source.manifest.nodes).forEach(([id, node]) => {
            if (
                !primaryNodeIds.has(id) &&
                !seenAddedIds.has(id) &&
                node.resource_type === 'model' &&
                (node as DbtRawModelNode).compiled === true
            ) {
                addedModelIds.push(id);
                seenAddedIds.add(id);
            }
        });
    });

    // Spread the primary manifest first so single-source merges stay byte-identical
    // (metadata + any extra fields carry through, top-level key order is preserved).
    // Reassigning an existing key does not move it; only present optional sections
    // are written, so a source without `sources`/`macros`/`semantic_models` does
    // not gain an empty one.
    const manifest: DbtManifest = {
        ...primary.manifest,
        nodes: mergedNodes,
        metrics: mergedMetrics,
        docs: mergedDocs,
    };
    if (
        orderedSources.some((source) => source.manifest.sources !== undefined)
    ) {
        manifest.sources = mergedSources;
    }
    if (orderedSources.some((source) => source.manifest.macros !== undefined)) {
        manifest.macros = mergedMacros;
    }
    if (
        orderedSources.some(
            (source) => source.manifest.semantic_models !== undefined,
        )
    ) {
        manifest.semantic_models = mergedSemanticModels;
    }

    return { manifest, addedModelIds, collisions };
};

/**
 * Merge model nodes from `external` into `primary`. Thin two-manifest wrapper
 * over {@link combineManifestSources} (primary = precedence 0, external = 1),
 * kept for the CLI `--combine-manifest` flag. Nodes already present in `primary`
 * keep their primary version (primary wins on conflict). Returns the combined
 * manifest and the unique_ids of compiled model nodes pulled in from `external`.
 *
 * Note: unlike the original CLI-only implementation, metrics and docs are now
 * unioned across both manifests (not taken from `primary` only); `metadata`
 * still comes from `primary`.
 */
export const combineManifests = (
    primary: DbtManifest,
    external: DbtManifest,
): CombineManifestsResult => {
    const { manifest, addedModelIds } = combineManifestSources([
        { name: 'primary', precedence: 0, manifest: primary },
        { name: 'external', precedence: 1, manifest: external },
    ]);
    return { manifest, addedModelIds };
};
