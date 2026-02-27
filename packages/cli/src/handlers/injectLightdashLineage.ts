/**
 * Inject Lightdash metric definitions into a dbt manifest.json.
 *
 * dbt's lineage graph only shows nodes that exist in the manifest (models, sources,
 * exposures, etc). Lightdash metrics are defined in dbt model YAML (under meta.metrics
 * or column.meta.metrics) but dbt doesn't create lineage nodes for them.
 *
 * This module reads a dbt manifest and injects two types of nodes:
 *
 *   1. semantic_model nodes — one per dbt model that has Lightdash metrics.
 *      These appear as intermediate nodes between the model and its metrics.
 *      Lineage: model -> semantic_model -> metric
 *
 *   2. metric nodes — one per Lightdash metric definition.
 *      "Simple" metrics (sum, count, etc.) depend on their semantic_model.
 *      "Derived" metrics (type: number, with ${ref} SQL) depend on other metrics.
 *
 * All injected nodes are tagged with _lightdash_injected in their meta, so they
 * can be cleanly removed and re-injected on subsequent runs (idempotency).
 *
 * Injected nodes use Lightdash brand purple in the lineage graph via the
 * `node_color` data attribute, which dbt docs' Cytoscape config picks up.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import GlobalState from '../globalState';

/** Marker added to meta on all injected nodes, used to identify and clean them up */
const LIGHTDASH_MARKER = '_lightdash_injected';

/**
 * dbt docs uses Cytoscape.js for the lineage graph. The `node[node_color]` CSS
 * selector overrides the default color with a per-node data attribute.
 * We use Lightdash brand purple (#7262FF) for metrics and a lighter tint for
 * semantic models so they're visually distinct.
 */
const LIGHTDASH_PURPLE = '#7262FF';
const LIGHTDASH_PURPLE_LIGHT = '#b8b0ff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MetricDef = {
    type?: string;
    label?: string;
    description?: string;
    sql?: string;
};

type ManifestNode = {
    unique_id: string;
    resource_type: string;
    name: string;
    label?: string;
    package_name: string;
    original_file_path?: string;
    columns?: Record<
        string,
        { meta?: { metrics?: Record<string, MetricDef> } }
    >;
    meta?: { metrics?: Record<string, MetricDef>; [key: string]: unknown };
    [key: string]: unknown;
};

type InjectedNodeBase = {
    unique_id: string;
    resource_type: string;
    name: string;
    label: string;
    description: string;
    package_name: string;
    path: string;
    original_file_path: string;
    fqn: string[];
    depends_on: { nodes: string[]; macros: string[] };
    config: { enabled: boolean };
    tags: string[];
    node_color: string;
    meta: { [LIGHTDASH_MARKER]: true };
    created_at: number;
};

type InjectedSemanticModel = InjectedNodeBase & {
    resource_type: 'semantic_model';
    model: string;
    group: null;
    entities: never[];
    measures: never[];
    dimensions: never[];
    defaults: Record<string, never>;
    primary_entity: null;
};

type InjectedMetric = InjectedNodeBase & {
    resource_type: 'metric';
    type: 'simple' | 'derived';
    type_params: { measure: { name: string } };
    filter: null;
};

type Manifest = {
    metadata: { generated_at?: string; project_name: string };
    nodes: Record<string, ManifestNode>;
    semantic_models: Record<string, InjectedSemanticModel>;
    metrics: Record<string, InjectedMetric>;
    parent_map: Record<string, string[]>;
    child_map: Record<string, string[]>;
    [key: string]: unknown;
};

type InjectResult = {
    manifest: Manifest;
    semanticModelCount: number;
    metricCount: number;
};

/** Info tracked per metric during injection, used to resolve derived metric refs */
type ResolvedMetricInfo = {
    resolved: string;
    modelUid: string;
    metricUid: string;
};

// ---------------------------------------------------------------------------
// Lineage map helpers
// ---------------------------------------------------------------------------

/** Ensure a uid has an entry in the child_map (even if empty) */
function ensureChildMapEntry(
    childMap: Record<string, string[]>,
    uid: string,
): void {
    if (!childMap[uid]) {
        childMap[uid] = []; // eslint-disable-line no-param-reassign
    }
}

/** Add a parent -> child edge in the child_map */
function addChild(
    childMap: Record<string, string[]>,
    parentUid: string,
    childUid: string,
): void {
    ensureChildMapEntry(childMap, parentUid);
    if (!childMap[parentUid].includes(childUid)) {
        childMap[parentUid].push(childUid);
    }
}

/** Remove a child from a parent's child_map entry */
function removeChild(
    childMap: Record<string, string[]>,
    parentUid: string,
    childUid: string,
): void {
    const children = childMap[parentUid] ?? [];
    const idx = children.indexOf(childUid);
    if (idx !== -1) {
        children.splice(idx, 1);
    }
}

// ---------------------------------------------------------------------------
// Metric extraction
// ---------------------------------------------------------------------------

/**
 * Extract all Lightdash metrics from a dbt model node.
 *
 * Lightdash metrics can be defined in two places in dbt YAML:
 *   - Column-level: columns.<col>.meta.metrics.<name>
 *   - Table-level:  meta.metrics.<name>  (used for derived/calculated metrics)
 */
function extractMetricsFromModel(
    node: ManifestNode,
): Array<[string, MetricDef]> {
    const metrics: Array<[string, MetricDef]> = [];

    // Column-level metrics
    const columns = node.columns ?? {};
    for (const col of Object.values(columns)) {
        const colMetrics = col.meta?.metrics ?? {};
        for (const [name, definition] of Object.entries(colMetrics)) {
            metrics.push([name, definition]);
        }
    }

    // Table-level metrics (often derived metrics that reference other metrics)
    const tableMetrics = node.meta?.metrics ?? {};
    for (const [name, definition] of Object.entries(tableMetrics)) {
        metrics.push([name, definition]);
    }

    return metrics;
}

/**
 * When the same metric name (e.g. "total_revenue") exists in multiple models,
 * we need to prefix metrics to avoid unique_id collisions in the manifest.
 * The first model (by insertion order) keeps unprefixed names; all other models
 * with a collision get ALL their metrics prefixed with the model short name.
 */
function findModelsNeedingPrefix(
    modelMetrics: Map<string, Array<[string, MetricDef]>>,
): Set<string> {
    const firstSeen: Record<string, string> = {};
    const modelsToPrefix = new Set<string>();

    for (const [modelId, metrics] of modelMetrics) {
        for (const [name] of metrics) {
            if (name in firstSeen) {
                modelsToPrefix.add(modelId);
            } else {
                firstSeen[name] = modelId;
            }
        }
    }

    return modelsToPrefix;
}

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

/** Strip the "dbt_" prefix from model names to produce shorter prefixes (e.g. "dbt_orders" -> "orders") */
function modelShortName(modelName: string): string {
    if (modelName.startsWith('dbt_')) {
        return modelName.slice(4);
    }
    return modelName;
}

function resolveMetricName(
    metricName: string,
    modelName: string,
    needsPrefix: boolean,
): string {
    if (needsPrefix) {
        return `${modelShortName(modelName)}_${metricName}`;
    }
    return metricName;
}

/**
 * Parse ${metric_name} references from a derived metric's SQL expression.
 * e.g. "${total_revenue} / ${total_orders}" -> ["total_revenue", "total_orders"]
 */
function parseDerivedRefs(sql: string): string[] {
    const matches = sql.match(/\$\{(\w+)\}/g);
    if (!matches) return [];
    return matches.map((m) => m.slice(2, -1));
}

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

/** Derive the YAML file path from the model's SQL path (for the injected node metadata) */
function getYmlPath(node: ManifestNode): string {
    const orig = node.original_file_path ?? '';
    return orig.replace('.sql', '.yml');
}

/** Build a dbt semantic_model manifest node that sits between a model and its metrics */
function buildSemanticModel(
    modelNode: ManifestNode,
    packageName: string,
    timestamp: number,
): InjectedSemanticModel {
    const modelName = modelNode.name;
    const ymlPath = getYmlPath(modelNode);

    return {
        unique_id: `semantic_model.${packageName}.${modelName}`,
        resource_type: 'semantic_model',
        name: modelName,
        label: modelNode.label ?? modelName,
        description: `Lightdash semantic model for ${modelName}`,
        package_name: packageName,
        path: ymlPath,
        original_file_path: ymlPath,
        fqn: [packageName, modelName],
        model: `ref('${modelName}')`,
        depends_on: { nodes: [modelNode.unique_id], macros: [] },
        config: { enabled: true },
        tags: [],
        node_color: LIGHTDASH_PURPLE_LIGHT,
        meta: { [LIGHTDASH_MARKER]: true },
        created_at: timestamp,
        group: null,
        entities: [],
        measures: [],
        dimensions: [],
        defaults: {},
        primary_entity: null,
    };
}

/**
 * Build a dbt metric manifest node for a Lightdash metric.
 * Lightdash "number" type metrics become dbt "derived" metrics (they reference other metrics).
 * All other types (sum, count, average, etc.) become dbt "simple" metrics.
 */
function buildMetric(
    resolvedName: string,
    metricDef: MetricDef,
    smUniqueId: string,
    packageName: string,
    ymlPath: string,
    timestamp: number,
): InjectedMetric {
    const lightdashType = metricDef.type ?? 'count';

    return {
        unique_id: `metric.${packageName}.${resolvedName}`,
        resource_type: 'metric',
        name: resolvedName,
        label: metricDef.label ?? resolvedName,
        description: metricDef.description ?? '',
        type: lightdashType === 'number' ? 'derived' : 'simple',
        type_params: { measure: { name: resolvedName } },
        package_name: packageName,
        path: ymlPath,
        original_file_path: ymlPath,
        fqn: [packageName, resolvedName],
        depends_on: { nodes: [smUniqueId], macros: [] },
        config: { enabled: true },
        tags: [],
        node_color: LIGHTDASH_PURPLE,
        meta: { [LIGHTDASH_MARKER]: true },
        created_at: timestamp,
        filter: null,
    };
}

// ---------------------------------------------------------------------------
// Injection logic
// ---------------------------------------------------------------------------

/**
 * Remove all previously injected nodes so we can re-inject cleanly.
 * Nodes are identified by the _lightdash_injected marker in their meta.
 * Also cleans up parent_map and child_map references to removed nodes.
 */
function clearPreviousInjections(manifest: Manifest): void {
    for (const section of ['semantic_models', 'metrics'] as const) {
        const sectionData = manifest[section] ?? {};
        const toRemove = Object.keys(sectionData).filter(
            (uid) => sectionData[uid].meta?.[LIGHTDASH_MARKER],
        );

        for (const uid of toRemove) {
            delete sectionData[uid]; // eslint-disable-line no-param-reassign
            delete manifest.parent_map[uid]; // eslint-disable-line no-param-reassign

            // Remove this uid from any parent's children list
            for (const parentUid of Object.keys(manifest.child_map)) {
                removeChild(manifest.child_map, parentUid, uid);
            }
            delete manifest.child_map[uid]; // eslint-disable-line no-param-reassign
        }
    }
}

/**
 * Fix up derived metrics so their lineage points to input metrics, not the semantic model.
 *
 * Derived metrics (Lightdash type: "number") have SQL like "${total_revenue} / ${total_orders}".
 * We parse those refs, find the corresponding injected metric nodes, and rewire the
 * depends_on / parent_map / child_map so the lineage accurately reflects the dependency.
 */
function fixupDerivedMetricLineage(
    manifest: Manifest,
    modelsToPrefix: Set<string>,
    originalToResolved: Map<string, ResolvedMetricInfo[]>,
): void {
    for (const [metricUid, metricNode] of Object.entries(manifest.metrics)) {
        if (
            !metricNode.meta?.[LIGHTDASH_MARKER] ||
            metricNode.type !== 'derived'
        ) {
            // eslint-disable-next-line no-continue -- skip non-Lightdash and non-derived metrics
            continue;
        }

        // Walk the lineage chain back: metric -> semantic_model -> model
        const smParent = manifest.parent_map[metricUid][0];
        const modelParent = manifest.parent_map[smParent][0];
        const modelNode = manifest.nodes[modelParent];

        // Find the original SQL for this derived metric
        const needsPrefix = modelsToPrefix.has(modelParent);
        let sql: string | null = null;
        const tableMetrics = modelNode.meta?.metrics ?? {};
        for (const [name, definition] of Object.entries(tableMetrics)) {
            if (definition.type !== 'number') {
                // eslint-disable-next-line no-continue
                continue;
            }
            const testResolved = resolveMetricName(
                name,
                modelNode.name,
                needsPrefix,
            );
            if (testResolved === metricNode.name || name === metricNode.name) {
                sql = definition.sql ?? '';
                break;
            }
        }

        if (!sql) {
            // eslint-disable-next-line no-continue -- no SQL to parse
            continue;
        }

        // Parse ${ref} from SQL to find input metrics
        const refs = parseDerivedRefs(sql);
        const dependencyIds: string[] = [];
        for (const refName of refs) {
            const candidates = originalToResolved.get(refName) ?? [];
            // Prefer a metric from the same model, fall back to the first match
            const sameModel = candidates.find(
                (c) => c.modelUid === modelParent,
            );
            const matched = sameModel ?? candidates[0];
            if (matched) {
                dependencyIds.push(matched.metricUid);
            }
        }

        if (dependencyIds.length === 0) {
            // eslint-disable-next-line no-continue
            continue;
        }

        // Rewire: derived metric depends on its input metrics, not the semantic model
        metricNode.depends_on.nodes = dependencyIds;
        manifest.parent_map[metricUid] = dependencyIds; // eslint-disable-line no-param-reassign

        // Remove from semantic model's children
        removeChild(manifest.child_map, smParent, metricUid);

        // Add as child of each input metric
        for (const depUid of dependencyIds) {
            addChild(manifest.child_map, depUid, metricUid);
        }
    }
}

/**
 * Core injection logic. Mutates the manifest in place: clears old injections,
 * then walks all project models to create semantic_model + metric nodes.
 *
 * The process has 4 steps:
 *   1. Collect all models with Lightdash metrics
 *   2. Determine which models need metric name prefixes (collision avoidance)
 *   3. For each model: create a semantic_model, then a metric per Lightdash metric
 *   4. Fix up derived metrics so their lineage points to input metrics, not semantic_model
 */
function inject(manifest: Manifest): InjectResult {
    clearPreviousInjections(manifest);

    // Use manifest generation time for stable timestamps (idempotency)
    const generatedAt = manifest.metadata.generated_at ?? '';
    let timestamp: number;
    try {
        const dt = new Date(generatedAt);
        timestamp = dt.getTime() / 1000;
        if (Number.isNaN(timestamp)) {
            timestamp = Date.now() / 1000;
        }
    } catch {
        timestamp = Date.now() / 1000;
    }

    const packageName = manifest.metadata.project_name;

    // Ensure top-level sections exist
    manifest.semantic_models = manifest.semantic_models ?? {}; // eslint-disable-line no-param-reassign
    manifest.metrics = manifest.metrics ?? {}; // eslint-disable-line no-param-reassign
    manifest.parent_map = manifest.parent_map ?? {}; // eslint-disable-line no-param-reassign
    manifest.child_map = manifest.child_map ?? {}; // eslint-disable-line no-param-reassign

    // Step 1: Collect all model nodes and their metrics
    const modelMetrics = new Map<string, Array<[string, MetricDef]>>();
    const modelNodes = new Map<string, ManifestNode>();
    for (const [uid, node] of Object.entries(manifest.nodes)) {
        if (
            node.resource_type === 'model' &&
            node.package_name === packageName
        ) {
            const metrics = extractMetricsFromModel(node);
            if (metrics.length > 0) {
                modelMetrics.set(uid, metrics);
                modelNodes.set(uid, node);
            }
        }
    }

    // Step 2: Find which models need all metrics prefixed (collision handling)
    const modelsToPrefix = findModelsNeedingPrefix(modelMetrics);

    // Track original metric name -> resolved info for derived metric resolution
    const originalToResolved = new Map<string, ResolvedMetricInfo[]>();
    let semanticModelCount = 0;
    let metricCount = 0;

    // Step 3: Process each model — create semantic_model + metric nodes
    for (const modelUid of modelNodes.keys()) {
        const node = modelNodes.get(modelUid)!;
        const metrics = modelMetrics.get(modelUid)!;
        const ymlPath = getYmlPath(node);
        const needsPrefix = modelsToPrefix.has(modelUid);

        // Create semantic model
        const smNode = buildSemanticModel(node, packageName, timestamp);
        const smUid = smNode.unique_id;
        manifest.semantic_models[smUid] = smNode; // eslint-disable-line no-param-reassign
        semanticModelCount += 1;

        // Wire up lineage: model -> semantic_model
        manifest.parent_map[smUid] = [modelUid]; // eslint-disable-line no-param-reassign
        addChild(manifest.child_map, modelUid, smUid);
        ensureChildMapEntry(manifest.child_map, smUid);

        // Create metric nodes
        for (const [metricName, metricDef] of metrics) {
            const resolved = resolveMetricName(
                metricName,
                node.name,
                needsPrefix,
            );
            const metricNode = buildMetric(
                resolved,
                metricDef,
                smUid,
                packageName,
                ymlPath,
                timestamp,
            );
            const metricUid = metricNode.unique_id;
            manifest.metrics[metricUid] = metricNode; // eslint-disable-line no-param-reassign
            metricCount += 1;

            // Track original name -> resolved for derived metric resolution
            if (!originalToResolved.has(metricName)) {
                originalToResolved.set(metricName, []);
            }
            originalToResolved.get(metricName)!.push({
                resolved,
                modelUid,
                metricUid,
            });

            // Wire up lineage: semantic_model -> metric
            manifest.parent_map[metricUid] = [smUid]; // eslint-disable-line no-param-reassign
            addChild(manifest.child_map, smUid, metricUid);
            ensureChildMapEntry(manifest.child_map, metricUid);
        }
    }

    // Step 4: Fix up derived metrics so their lineage points to input metrics
    fixupDerivedMetricLineage(manifest, modelsToPrefix, originalToResolved);

    return { manifest, semanticModelCount, metricCount };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Main entry point: reads a dbt manifest.json, injects Lightdash metric nodes,
 * writes the modified manifest back, and returns a count of what was injected.
 */
export async function injectLightdashLineage(
    manifestPath: string,
): Promise<{ semanticModelCount: number; metricCount: number }> {
    GlobalState.debug(`Reading manifest from ${manifestPath}`);

    const raw = await fs.readFile(manifestPath, { encoding: 'utf-8' });
    let manifest: Manifest;
    try {
        manifest = JSON.parse(raw) as Manifest;
    } catch (e) {
        throw new Error(
            `Failed to parse manifest.json at ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    const result = inject(manifest);

    await fs.writeFile(manifestPath, JSON.stringify(result.manifest, null, 2));

    return {
        semanticModelCount: result.semanticModelCount,
        metricCount: result.metricCount,
    };
}

/** Resolve a path inside the dbt target directory, respecting --target-path if provided */
export function getTargetFilePath(
    projectDir: string,
    targetPath: string | undefined,
    filename: string,
): string {
    const targetDir = targetPath ?? path.join(projectDir, 'target');
    return path.join(targetDir, filename);
}

/**
 * Patch static_index.html with the injected manifest.
 *
 * `dbt docs generate --static` produces a self-contained HTML file that embeds
 * the manifest and catalog inline as JavaScript:
 *   var n = { manifest: {<JSON>}, catalog: {<JSON>} }
 *
 * Since we modified manifest.json after dbt generated this file, we need to
 * find and replace the embedded manifest with our injected version.
 */
export async function patchStaticIndex(
    manifestPath: string,
    staticIndexPath: string,
): Promise<void> {
    const manifestContent = await fs.readFile(manifestPath, {
        encoding: 'utf-8',
    });
    const html = await fs.readFile(staticIndexPath, { encoding: 'utf-8' });

    // The static HTML embeds the manifest as: manifest: {<JSON>}, catalog:
    // Replace the manifest JSON between "manifest: " and ", catalog:"
    const startMarker = 'manifest: ';
    const endMarker = ', catalog:';
    const startIdx = html.indexOf(startMarker);
    const endIdx = html.indexOf(endMarker, startIdx);

    if (startIdx === -1 || endIdx === -1) {
        throw new Error(
            'Could not find manifest embedding in static_index.html',
        );
    }

    const patched =
        html.slice(0, startIdx + startMarker.length) +
        manifestContent +
        html.slice(endIdx);

    await fs.writeFile(staticIndexPath, patched);
}
