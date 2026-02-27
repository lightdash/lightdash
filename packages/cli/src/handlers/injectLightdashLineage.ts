import { promises as fs } from 'fs';
import * as path from 'path';
import GlobalState from '../globalState';

const LIGHTDASH_MARKER = '_lightdash_injected';

// Lightdash brand purple for dbt docs lineage graph (uses Cytoscape node_color data attr)
const LIGHTDASH_PURPLE = '#7262FF';
const LIGHTDASH_PURPLE_LIGHT = '#b8b0ff';

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

type Manifest = {
    metadata: { generated_at?: string; project_name: string };
    nodes: Record<string, ManifestNode>;
    semantic_models: Record<string, Record<string, unknown>>;
    metrics: Record<string, Record<string, unknown>>;
    parent_map: Record<string, string[]>;
    child_map: Record<string, string[]>;
    [key: string]: unknown;
};

function extractMetricsFromModel(
    node: ManifestNode,
): Array<[string, MetricDef]> {
    const metrics: Array<[string, MetricDef]> = [];

    const columns = node.columns ?? {};
    for (const col of Object.values(columns)) {
        const colMetrics = col.meta?.metrics ?? {};
        for (const [name, definition] of Object.entries(colMetrics)) {
            metrics.push([name, definition]);
        }
    }

    const tableMetrics = node.meta?.metrics ?? {};
    for (const [name, definition] of Object.entries(tableMetrics)) {
        metrics.push([name, definition]);
    }

    return metrics;
}

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

function parseDerivedRefs(sql: string): string[] {
    const matches = sql.match(/\$\{(\w+)\}/g);
    if (!matches) return [];
    return matches.map((m) => m.slice(2, -1));
}

function getYmlPath(node: ManifestNode): string {
    const orig = node.original_file_path ?? '';
    return orig.replace('.sql', '.yml');
}

function buildSemanticModel(
    modelNode: ManifestNode,
    packageName: string,
    timestamp: number,
): [string, Record<string, unknown>] {
    const modelName = modelNode.name;
    const smLabel = modelNode.label ?? modelName;
    const uniqueId = `semantic_model.${packageName}.${modelName}`;
    const modelUid = modelNode.unique_id;
    const ymlPath = getYmlPath(modelNode);

    return [
        uniqueId,
        {
            unique_id: uniqueId,
            resource_type: 'semantic_model',
            name: modelName,
            label: smLabel,
            package_name: packageName,
            path: ymlPath,
            original_file_path: ymlPath,
            fqn: [packageName, modelName],
            description: `Lightdash semantic model for ${modelName}`,
            model: `ref('${modelName}')`,
            depends_on: { nodes: [modelUid], macros: [] },
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
        },
    ];
}

function buildMetric(
    resolvedName: string,
    metricDef: MetricDef,
    smUniqueId: string,
    packageName: string,
    ymlPath: string,
    timestamp: number,
): [string, Record<string, unknown>] {
    const uniqueId = `metric.${packageName}.${resolvedName}`;
    const lightdashType = metricDef.type ?? 'count';
    const label = metricDef.label ?? resolvedName;
    const description = metricDef.description ?? '';
    const metricType = lightdashType === 'number' ? 'derived' : 'simple';

    return [
        uniqueId,
        {
            unique_id: uniqueId,
            resource_type: 'metric',
            name: resolvedName,
            label,
            description,
            type: metricType,
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
        },
    ];
}

// eslint-disable-next-line no-param-reassign
function clearPreviousInjections(m: Manifest): void {
    for (const section of ['semantic_models', 'metrics'] as const) {
        const sectionData = m[section] ?? {};
        const toRemove = Object.keys(sectionData).filter((uid) => {
            const node = sectionData[uid] as Record<string, unknown>;
            const meta = node.meta as Record<string, unknown> | undefined;
            return meta?.[LIGHTDASH_MARKER];
        });

        for (const uid of toRemove) {
            delete sectionData[uid]; // eslint-disable-line no-param-reassign
            delete m.parent_map[uid]; // eslint-disable-line no-param-reassign

            for (const children of Object.values(m.child_map)) {
                const idx = children.indexOf(uid);
                if (idx !== -1) {
                    children.splice(idx, 1);
                }
            }
            delete m.child_map[uid]; // eslint-disable-line no-param-reassign
        }
    }
}

function inject(m: Manifest): Manifest {
    clearPreviousInjections(m);

    // Use manifest generation time for stable timestamps (idempotency)
    const generatedAt = m.metadata.generated_at ?? '';
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

    const packageName = m.metadata.project_name;

    // Ensure top-level dicts exist
    const result = {
        ...m,
        semantic_models: m.semantic_models ?? {},
        metrics: m.metrics ?? {},
        parent_map: m.parent_map ?? {},
        child_map: m.child_map ?? {},
    };

    // Step 1: Collect all model nodes and their metrics
    const modelMetrics = new Map<string, Array<[string, MetricDef]>>();
    const modelNodes = new Map<string, ManifestNode>();
    for (const [uid, node] of Object.entries(result.nodes)) {
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

    // Map from original metric name -> [{resolved, modelUid, metricUid}]
    const originalToResolved = new Map<
        string,
        Array<{ resolved: string; modelUid: string; metricUid: string }>
    >();

    // Step 3: Process each model
    for (const modelUid of modelNodes.keys()) {
        const node = modelNodes.get(modelUid)!;
        const metrics = modelMetrics.get(modelUid)!;
        const ymlPath = getYmlPath(node);
        const needsPrefix = modelsToPrefix.has(modelUid);

        // Create semantic model
        const [smUid, smNode] = buildSemanticModel(
            node,
            packageName,
            timestamp,
        );
        result.semantic_models[smUid] = smNode;

        // Update parent/child maps for semantic model
        result.parent_map[smUid] = [modelUid];
        if (!result.child_map[modelUid]) result.child_map[modelUid] = [];
        if (!result.child_map[modelUid].includes(smUid)) {
            result.child_map[modelUid].push(smUid);
        }
        if (!result.child_map[smUid]) result.child_map[smUid] = [];

        // Create metric nodes
        for (const [metricName, metricDef] of metrics) {
            const resolved = resolveMetricName(
                metricName,
                node.name,
                needsPrefix,
            );
            const [metricUid, metricNode] = buildMetric(
                resolved,
                metricDef,
                smUid,
                packageName,
                ymlPath,
                timestamp,
            );
            result.metrics[metricUid] = metricNode;

            // Track original name -> resolved for derived metric resolution
            if (!originalToResolved.has(metricName)) {
                originalToResolved.set(metricName, []);
            }
            originalToResolved.get(metricName)!.push({
                resolved,
                modelUid,
                metricUid,
            });

            // Update parent/child maps for metric
            result.parent_map[metricUid] = [smUid];
            if (!result.child_map[smUid].includes(metricUid)) {
                result.child_map[smUid].push(metricUid);
            }
            if (!result.child_map[metricUid]) result.child_map[metricUid] = [];
        }
    }

    // Step 4: Fix up derived metrics - parse SQL refs and set correct depends_on
    for (const [metricUid, metricNode] of Object.entries(result.metrics)) {
        const meta = metricNode.meta as Record<string, unknown> | undefined;
        if (
            !meta?.[LIGHTDASH_MARKER] ||
            (metricNode as Record<string, unknown>).type !== 'derived'
        ) {
            // eslint-disable-next-line no-continue -- skip non-Lightdash and non-derived metrics
            continue;
        }

        const resolvedName = (metricNode as Record<string, unknown>)
            .name as string;
        const smParent = result.parent_map[metricUid][0];
        const modelParent = result.parent_map[smParent][0];
        const modelNode = result.nodes[modelParent];

        const needsPrefix = modelsToPrefix.has(modelParent);
        let sql: string | null = null;
        const tableMetrics = modelNode.meta?.metrics ?? {};
        for (const [name, defn] of Object.entries(tableMetrics)) {
            if (defn.type === 'number') {
                const testResolved = resolveMetricName(
                    name,
                    modelNode.name,
                    needsPrefix,
                );
                if (testResolved === resolvedName || name === resolvedName) {
                    sql = defn.sql ?? '';
                    break;
                }
            }
        }

        if (!sql) {
            // eslint-disable-next-line no-continue -- no SQL to parse
            continue;
        }

        // Parse ${ref} from SQL to find input metrics
        const refs = parseDerivedRefs(sql);
        const depUids: string[] = [];
        for (const refName of refs) {
            const candidates = originalToResolved.get(refName) ?? [];
            let matched: string | null = null;
            for (const candidate of candidates) {
                if (candidate.modelUid === modelParent) {
                    matched = candidate.metricUid;
                    break;
                }
            }
            if (!matched && candidates.length > 0) {
                matched = candidates[0].metricUid;
            }
            if (matched) {
                depUids.push(matched);
            }
        }

        if (depUids.length > 0) {
            // Derived metric depends on its input metrics, not the semantic model
            (
                metricNode as Record<string, unknown> & {
                    depends_on: { nodes: string[] };
                }
            ).depends_on.nodes = depUids;

            // Update parent_map
            result.parent_map[metricUid] = depUids;

            // Remove from semantic model's children
            const smChildren = result.child_map[smParent] ?? [];
            const idx = smChildren.indexOf(metricUid);
            if (idx !== -1) {
                smChildren.splice(idx, 1);
            }

            // Add as child of each input metric
            for (const depUid of depUids) {
                if (!result.child_map[depUid]) result.child_map[depUid] = [];
                if (!result.child_map[depUid].includes(metricUid)) {
                    result.child_map[depUid].push(metricUid);
                }
            }
        }
    }

    return result;
}

type InjectResult = {
    semanticModelCount: number;
    metricCount: number;
};

export async function injectLightdashLineage(
    manifestPath: string,
): Promise<InjectResult> {
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

    manifest = inject(manifest);

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const semanticModelCount = Object.values(manifest.semantic_models).filter(
        (n) => {
            const meta = (n as Record<string, unknown>).meta as
                | Record<string, unknown>
                | undefined;
            return meta?.[LIGHTDASH_MARKER];
        },
    ).length;

    const metricCount = Object.values(manifest.metrics).filter((n) => {
        const meta = (n as Record<string, unknown>).meta as
            | Record<string, unknown>
            | undefined;
        return meta?.[LIGHTDASH_MARKER];
    }).length;

    return { semanticModelCount, metricCount };
}

export function getManifestPath(
    projectDir: string,
    targetPath?: string,
): string {
    const targetDir = targetPath ?? path.join(projectDir, 'target');
    return path.join(targetDir, 'manifest.json');
}

export function getStaticIndexPath(
    projectDir: string,
    targetPath?: string,
): string {
    const targetDir = targetPath ?? path.join(projectDir, 'target');
    return path.join(targetDir, 'static_index.html');
}

export async function patchStaticIndex(
    manifestPath: string,
    staticIndexPath: string,
): Promise<void> {
    const manifestContent = await fs.readFile(manifestPath, {
        encoding: 'utf-8',
    });
    let html = await fs.readFile(staticIndexPath, { encoding: 'utf-8' });

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

    const before = html.slice(0, startIdx + startMarker.length);
    const after = html.slice(endIdx);
    html = before + manifestContent + after;

    await fs.writeFile(staticIndexPath, html);
}
