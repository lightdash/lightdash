import {
    DbtError,
    getExternalDbtNodeUniqueId,
    getExternalModelNodesFromManifest,
    ParameterError,
    type DbtExternalModelNode,
    type DbtManifest,
    type DbtRawModelNode,
} from '@lightdash/common';
import * as fs from 'fs';
import { type DbtProjectScan, type ScannedDbtRef } from '../dbt/dbtProjectScan';
import { type DbtManifestFetchOptions } from '../types';
import {
    resolveCrossSourceManifests,
    type CrossSourceCatalog,
    type CrossSourceFetchTask,
} from './crossSourceRefs';

type ResourceType = 'model' | 'seed' | 'snapshot';
type Access = 'public' | 'protected' | 'private' | null;
type Ref = { packageName: string | null; name: string; version: string | null };
type Node = {
    resource_type: ResourceType;
    name: string;
    access: Access;
    version: string | null;
    latest_version: string | null;
    refs: Ref[];
    localDeps: string[];
};
type Project = { key: string; name: string; nodes: Node[]; seeded: boolean; staleSeed?: boolean };
type Case = { seed: number; projects: Project[]; concurrency: number };

const mulberry32 = (a: number) => () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const NAMES = ['orders', 'customers', 'ledger', 'measure', 'rate'];
const ACCESS: Access[] = ['public', 'public', 'public', 'public', 'protected', 'private', null];

const uniqueId = (pkg: string, node: Node) =>
    getExternalDbtNodeUniqueId({
        resource_type: node.resource_type,
        package_name: pkg,
        name: node.name,
        version: node.version,
    });

const generate = (seed: number): Case => {
    const rand = mulberry32(seed);
    const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];
    const count = 2 + Math.floor(rand() * 3);
    const projects: Project[] = [];
    for (let i = 0; i < count; i += 1) {
        const name = `proj_${String.fromCharCode(97 + i)}`;
        const nodes: Node[] = [];
        const nodeCount = 1 + Math.floor(rand() * 3);
        for (let j = 0; j < nodeCount; j += 1) {
            const base = pick(NAMES);
            if (nodes.some((n) => n.name === base && n.version === null)) continue;
            const versioned = rand() < 0.25;
            const resource: ResourceType =
                rand() < 0.75 ? 'model' : pick(['seed', 'snapshot'] as ResourceType[]);
            if (versioned && resource === 'model') {
                const latest = rand() < 0.5 ? '1' : '2';
                nodes.push(
                    {
                        resource_type: 'model',
                        name: base,
                        access: pick(ACCESS),
                        version: '1',
                        latest_version: latest,
                        refs: [],
                        localDeps: [],
                    },
                    {
                        resource_type: 'model',
                        name: base,
                        access: pick(ACCESS),
                        version: '2',
                        latest_version: latest,
                        refs: [],
                        localDeps: [],
                    },
                );
            } else {
                nodes.push({
                    resource_type: resource,
                    name: base,
                    access: pick(ACCESS),
                    version: null,
                    latest_version: null,
                    refs: [],
                    localDeps: [],
                });
            }
        }
        projects.push({ key: `src_${name}`, name, nodes, seeded: rand() < 0.75 });
    }
    for (const project of projects) {
        for (const node of project.nodes) {
            if (node.resource_type === 'seed') continue;
            const refCount = Math.floor(rand() * 3);
            for (let r = 0; r < refCount; r += 1) {
                const target = pick(projects);
                const targetNode = pick(target.nodes);
                if (target === project) {
                    if (
                        targetNode.name !== node.name &&
                        !node.localDeps.includes(targetNode.name)
                    )
                        node.localDeps.push(targetNode.name);
                    continue;
                }
                const explicit = rand() < 0.6;
                if (!explicit && targetNode.name === node.name) continue;
                const withVersion = targetNode.version !== null && rand() < 0.5;
                node.refs.push({
                    packageName: explicit ? target.name : null,
                    name: targetNode.name,
                    version: withVersion
                        ? pick(['1', '1', '2', '2', '3'])
                        : null,
                });
            }
        }
    }
    return { seed, projects, concurrency: 1 + Math.floor(rand() * 3) };
};

const rawNode = (
    pkg: string,
    node: Node,
    deps: string[],
    external: boolean,
): DbtRawModelNode & DbtManifest['nodes'][string] =>
    ({
        unique_id: uniqueId(pkg, node),
        resource_type: node.resource_type,
        raw_code: 'select 1',
        config: { materialized: 'table', snowflake_warehouse: '' },
        name: node.name,
        package_name: pkg,
        path: external ? '' : `${node.name}.sql`,
        original_file_path: external ? '' : `models/${node.name}.sql`,
        alias: node.name,
        schema: 'public',
        access: node.access ?? undefined,
        database: 'warehouse',
        columns: {},
        meta: {},
        fqn: [pkg, node.name],
        checksum: { name: 'sha256', checksum: 'test' },
        version: node.version ?? undefined,
        latest_version: node.latest_version ?? undefined,
        depends_on: { nodes: deps },
        refs: node.refs.map((ref) => ({
            name: ref.name,
            package: ref.packageName,
            version: ref.version,
        })),
    }) as unknown as DbtRawModelNode & DbtManifest['nodes'][string];

const externalRaw = (
    node: DbtExternalModelNode,
): DbtRawModelNode & DbtManifest['nodes'][string] =>
    ({
        unique_id: getExternalDbtNodeUniqueId(node),
        resource_type: node.resource_type ?? 'model',
        raw_code: '',
        config: { materialized: 'table', snowflake_warehouse: '' },
        name: node.name,
        package_name: node.package_name,
        path: '',
        original_file_path: '',
        alias: node.identifier,
        schema: node.schema,
        access: node.access ?? undefined,
        database: node.database ?? undefined,
        columns: {},
        meta: {},
        fqn: [node.package_name, node.name],
        checksum: { name: 'sha256', checksum: 'external' },
        version: node.version ?? undefined,
        latest_version: node.latest_version ?? undefined,
        depends_on: { nodes: node.depends_on_nodes },
    }) as unknown as DbtRawModelNode & DbtManifest['nodes'][string];

const emulateDbt = (
    project: Project,
    externalNodes: DbtExternalModelNode[],
): DbtManifest => {
    const errors: string[] = [];
    const localByName = new Map<string, Node[]>();
    project.nodes.forEach((node) => {
        localByName.set(node.name, [...(localByName.get(node.name) ?? []), node]);
    });
    const resolveLocal = (name: string): string | null => {
        const candidates = localByName.get(name) ?? [];
        if (candidates.length === 0) return null;
        const latest =
            candidates.find(
                (c) => c.version !== null && c.version === c.latest_version,
            ) ?? candidates[0];
        return uniqueId(project.name, latest);
    };
    const resolveRef = (owner: Node, ref: Ref): string | null => {
        const local = ref.packageName === null || ref.packageName === project.name
            ? (localByName.get(ref.name) ?? []).filter(
                  (c) => ref.version === null || c.version === ref.version,
              )
            : [];
        if (local.length > 0) {
            const chosen =
                ref.version === null
                    ? local.find(
                          (c) => c.version !== null && c.version === c.latest_version,
                      ) ?? local[0]
                    : local[0];
            return uniqueId(project.name, chosen);
        }
        const externals = externalNodes.filter(
            (node) =>
                node.name === ref.name &&
                (ref.packageName === null || node.package_name === ref.packageName) &&
                (ref.version === null
                    ? true
                    : String(node.version) === ref.version),
        );
        const packages = new Set(externals.map((node) => node.package_name));
        if (packages.size > 1) {
            errors.push(
                `When referencing '${ref.name}', dbt found nodes in multiple packages: ${[...packages].sort().join(', ')}`,
            );
            return null;
        }
        if (externals.length === 0) {
            const versionText =
                ref.version === null ? '' : ` with version '${ref.version}'`;
            errors.push(
                `Model '${uniqueId(project.name, owner)}' (models/${owner.name}.sql) depends on a node named '${ref.name}'${versionText}${ref.packageName === null ? '' : ` in package or project '${ref.packageName}'`} which was not found`,
            );
            return null;
        }
        const chosen =
            ref.version === null
                ? externals.find(
                      (node) =>
                          node.version !== null &&
                          String(node.version) === String(node.latest_version),
                  ) ?? externals[0]
                : externals[0];
        return getExternalDbtNodeUniqueId(chosen);
    };
    const nodes: DbtManifest['nodes'] = {};
    for (const node of project.nodes) {
        const deps = [
            ...node.localDeps
                .map(resolveLocal)
                .filter((id): id is string => id !== null),
            ...node.refs
                .map((ref) => resolveRef(node, ref))
                .filter((id): id is string => id !== null),
        ];
        const raw = rawNode(project.name, node, deps, false);
        nodes[raw.unique_id] = raw;
    }
    for (const node of externalNodes) {
        if (node.package_name === project.name) continue;
        const raw = externalRaw(node);
        nodes[raw.unique_id] = raw;
    }
    if (errors.length > 0) throw new DbtError(errors.join('\n'));
    return {
        metadata: {
            dbt_schema_version: '/v12.json',
            generated_at: '',
            adapter_type: 'postgres',
            project_name: project.name,
        },
        nodes,
        metrics: {},
        docs: {},
    };
};

const scanOf = (project: Project, all: Project[]): DbtProjectScan => {
    const refs: ScannedDbtRef[] = project.nodes.flatMap((node) => node.refs);
    const referenced = [
        ...new Set(
            refs.flatMap((ref) => (ref.packageName === null ? [] : [ref.packageName])),
        ),
    ];
    return {
        projectName: project.name,
        refs,
        localModels: [...new Set(project.nodes.map((node) => node.name))].sort(),
        installedPackageModels: [],
        referencedProjects: referenced.filter((name) =>
            all.some((other) => other.name === name),
        ),
        declaredUpstreams: [],
        installedPackages: [],
    };
};

const buildCase = (c: Case) => {
    const payloads = new Map<string, DbtExternalModelNode[][]>();
    const tasks: CrossSourceFetchTask<string>[] = c.projects.map((project) => ({
        key: project.key,
        context: project.key,
        prepare: async () => scanOf(project, c.projects),
        fetch: async (options: DbtManifestFetchOptions) => {
            payloads.set(project.key, [
                ...(payloads.get(project.key) ?? []),
                options.externalNodes,
            ]);
            return {
                manifest: emulateDbt(project, options.externalNodes),
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 1 },
            };
        },
    }));
    const cache: CrossSourceCatalog[] = c.projects
        .filter((project) => project.seeded)
        .map((project) => {
            const seedManifest = emulateDbtLenient(project, c.projects);
            return {
                key: project.key,
                projectName: project.name,
                referencedProjects: [],
                nodes: getExternalModelNodesFromManifest(seedManifest),
            };
        });
    return { tasks, cache, payloads };
};

const emulateDbtLenient = (project: Project, all: Project[] = []): DbtManifest => {
    const nodes: DbtManifest['nodes'] = {};
    const externals = new Map<string, DbtRawModelNode & DbtManifest['nodes'][string]>();
    for (const node of project.nodes) {
        const crossDeps = project.staleSeed
            ? []
            : node.refs.flatMap((ref) => {
                  const target = all.find(
                      (other) => other !== project && (ref.packageName === null || other.name === ref.packageName) && other.nodes.some((n) => n.name === ref.name && n.access === 'public'),
                  );
                  const found = target?.nodes.find((n) => n.name === ref.name && (ref.version === null ? n.version === null || n.version === n.latest_version : n.version === ref.version));
                  if (!target || !found) return [];
                  const externalId = uniqueId(target.name, found);
                  externals.set(externalId, rawNode(target.name, { ...found, refs: [] }, [], true));
                  return [externalId];
              });
        const raw = rawNode(
            project.name,
            node,
            [
                ...node.localDeps
                    .map((name) => {
                        const found = project.nodes.find((n) => n.name === name);
                        return found ? uniqueId(project.name, found) : null;
                    })
                    .filter((id): id is string => id !== null),
                ...crossDeps,
            ],
            false,
        );
        nodes[raw.unique_id] = raw;
    }
    for (const [id, raw] of externals) nodes[id] = raw;
    return {
        metadata: {
            dbt_schema_version: '/v12.json',
            generated_at: '',
            adapter_type: 'postgres',
            project_name: project.name,
        },
        nodes,
        metrics: {},
        docs: {},
    };
};

type Outcome = {
    seed: number;
    status: 'resolved' | 'parameter-error' | 'dbt-error' | 'crash';
    message: string;
    invariantFailures: string[];
    injectedTotal: number;
    sources: number;
    seeded: number;
    classes: string[];
    summary: string;
};

const classify = (message: string): string[] => {
    const classes: string[] = [];
    const checks: [string, RegExp][] = [
        ['ambiguous-one-arg', /defined by several dbt sources/],
        ['duplicate-provider-id', /provided by several dbt sources/],
        ['cycle', /form a cycle across dbt sources/],
        ['cold-start', /Cold start/],
        ['not-public', /does not expose that model/],
        ['missing-in-last-good', /confirmed last-good manifest .* does not define/],
        ['no-provider', /no connected dbt source provides project/],
        ['unresolved-generic', /could not be resolved from its selected public upstreams/],
        ['dbt-multiple-packages', /found nodes in multiple packages/],
        ['provider-failed', /failed:/],
    ];
    for (const [label, pattern] of checks) if (pattern.test(message)) classes.push(label);
    return classes;
};

const runCase = async (c: Case): Promise<Outcome> => {
    const { tasks, cache, payloads } = buildCase(c);
    const invariantFailures: string[] = [];
    let status: Outcome['status'] = 'resolved';
    let message = '';
    try {
        const resolution = await resolveCrossSourceManifests({
            tasks,
            enabled: true,
            concurrency: c.concurrency,
            cache,
        });
        for (const entry of resolution.results) {
            const project = c.projects.find((p) => p.key === entry.task.key)!;
            for (const external of Object.values(entry.result.manifest.nodes).filter(
                (node) => !(node as DbtRawModelNode).path,
            )) {
                if ((external as DbtRawModelNode).package_name === project.name)
                    invariantFailures.push(`I5 self-injection in ${project.key}`);
            }
        }
    } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        if (error instanceof ParameterError) status = 'parameter-error';
        else if (error instanceof DbtError) status = 'dbt-error';
        else status = 'crash';
    }
    let injectedTotal = 0;
    for (const [key, calls] of payloads) {
        const project = c.projects.find((p) => p.key === key)!;
        if (calls.length > 1)
            invariantFailures.push(`I7 ${key} fetched ${calls.length} times`);
        for (const nodes of calls) {
            injectedTotal += nodes.length;
            const ids = new Set(nodes.map(getExternalDbtNodeUniqueId));
            for (const node of nodes) {
                if (node.access !== 'public')
                    invariantFailures.push(
                        `I1 non-public injected into ${key}: ${getExternalDbtNodeUniqueId(node)} access=${node.access}`,
                    );
                if (node.package_name === project.name)
                    invariantFailures.push(`I5 own package injected into ${key}`);
                for (const dep of node.depends_on_nodes)
                    if (!ids.has(dep))
                        invariantFailures.push(
                            `I2 edge to non-injected id ${dep} from ${getExternalDbtNodeUniqueId(node)} in ${key}`,
                        );
            }
            const owners = new Map<string, string>();
            for (const node of nodes) {
                const id = getExternalDbtNodeUniqueId(node);
                if (owners.has(id) && owners.get(id) !== node.package_name)
                    invariantFailures.push(`I4 duplicate id ${id} in one payload for ${key}`);
                owners.set(id, node.package_name);
            }
        }
    }
    return {
        seed: c.seed,
        status,
        message,
        summary: c.projects
            .map(
                (p) =>
                    `${p.name}${p.seeded ? '[seeded]' : '[cold]'}: ${p.nodes
                        .map(
                            (n) =>
                                `${n.resource_type === 'model' ? '' : `${n.resource_type}:`}${n.name}${n.version === null ? '' : `.v${n.version}(latest ${n.latest_version})`}=${n.access ?? 'unset'}${n.refs.length ? ` refs ${n.refs.map((r) => `${r.packageName ?? '?'}.${r.name}${r.version === null ? '' : `.v${r.version}`}`).join(',')}` : ''}${n.localDeps.length ? ` local ${n.localDeps.join(',')}` : ''}`,
                        )
                        .join('; ')}`,
            )
            .join(' | '),
        invariantFailures,
        injectedTotal,
        sources: c.projects.length,
        seeded: c.projects.filter((p) => p.seeded).length,
        classes: classify(message),
    };
};

const SEEDS = Number(process.env.FUZZ_CASES ?? 400);
const START = Number(process.env.FUZZ_START ?? 1);

describe('cross-source resolver fuzz', () => {
    it(
        `runs ${SEEDS} generated loom-shaped cases without crashes or invariant breaks`,
        async () => {
            const outcomes: Outcome[] = [];
            for (let seed = START; seed < START + SEEDS; seed += 1) {
                outcomes.push(await runCase(generate(seed)));
            }
            const report = {
                productSha: process.env.FUZZ_PRODUCT_SHA ?? null,
                cases: SEEDS,
                start: START,
                byStatus: Object.fromEntries(
                    ['resolved', 'parameter-error', 'dbt-error', 'crash'].map((s) => [
                        s,
                        outcomes.filter((o) => o.status === s).length,
                    ]),
                ),
                classes: outcomes
                    .flatMap((o) => o.classes)
                    .reduce<Record<string, number>>((acc, label) => {
                        acc[label] = (acc[label] ?? 0) + 1;
                        return acc;
                    }, {}),
                crashes: outcomes.filter((o) => o.status === 'crash'),
                examples: Object.fromEntries(
                    [...new Set(outcomes.flatMap((o) => o.classes))].map((label) => [
                        label,
                        outcomes.filter((o) => o.classes.includes(label)).slice(0, 3).map((o) => ({ seed: o.seed, summary: o.summary, message: o.message })),
                    ]),
                ),
                invariantFailures: outcomes.filter((o) => o.invariantFailures.length > 0),
                dbtErrors: outcomes.filter((o) => o.status === 'dbt-error').slice(0, 20),
                sample: outcomes.slice(0, 40),
            };
            fs.writeFileSync(
                process.env.FUZZ_REPORT ?? '/tmp/fable-loom-fuzz/ts-fuzz-report.json',
                JSON.stringify(report, null, 1),
            );
            expect(report.crashes).toEqual([]);
            expect(report.invariantFailures).toEqual([]);
        },
        600000,
    );
});

const P = (
    name: string,
    nodes: Partial<Node>[],
    seeded = true,
): Project => ({
    key: `src_${name}`,
    name,
    seeded,
    nodes: nodes.map((node) => ({
        resource_type: 'model',
        access: 'public',
        version: null,
        latest_version: null,
        refs: [],
        localDeps: [],
        name: 'orders',
        ...node,
    })),
});
const R = (packageName: string | null, name: string, version: string | null = null): Ref => ({
    packageName,
    name,
    version,
});

const SEED_CASES: { id: string; projects: Project[]; expect: string }[] = [
    {
        id: 'S1a-both-public-one-arg',
        projects: [P('proj_a', [{}]), P('proj_b', [{}]), P('proj_x', [{ name: 'report', refs: [R(null, 'orders')] }], false)],
        expect: 'ambiguous-one-arg',
    },
    {
        id: 'S1b-unique-one-arg',
        projects: [P('proj_a', [{}]), P('proj_b', [{ name: 'other' }]), P('proj_x', [{ name: 'report', refs: [R(null, 'orders')] }], false)],
        expect: 'resolved',
    },
    {
        id: 'S2-public-vs-protected-one-arg',
        projects: [P('proj_a', [{}]), P('proj_b', [{ access: 'protected' }]), P('proj_x', [{ name: 'report', refs: [R(null, 'orders')] }], false)],
        expect: 'resolved',
    },
    {
        id: 'S3-only-nonpublic',
        projects: [P('proj_a', [{ access: 'protected' }]), P('proj_x', [{ name: 'report', refs: [R('proj_a', 'orders')] }], false)],
        expect: 'not-public',
    },
    {
        id: 'S5-protected-seed-under-public-model',
        projects: [
            P('proj_a', [{ resource_type: 'seed', name: 'base_seed', access: 'protected' }, { localDeps: ['base_seed'] }]),
            P('proj_x', [{ name: 'report', refs: [R('proj_a', 'orders')] }], false),
        ],
        expect: 'resolved',
    },
    {
        id: 'S6-latest-version-unversioned-ref',
        projects: [
            P('proj_a', [{ name: 'measure', version: '1', latest_version: '2' }, { name: 'measure', version: '2', latest_version: '2' }]),
            P('proj_x', [{ name: 'report', refs: [R('proj_a', 'measure')] }], false),
        ],
        expect: 'resolved',
    },
    {
        id: 'S7-explicit-v2',
        projects: [
            P('proj_a', [{ name: 'measure', version: '1', latest_version: '2' }, { name: 'measure', version: '2', latest_version: '2' }]),
            P('proj_x', [{ name: 'report', refs: [R('proj_a', 'measure', '2')] }], false),
        ],
        expect: 'resolved',
    },
    {
        id: 'S7b-missing-v3',
        projects: [
            P('proj_a', [{ name: 'measure', version: '1', latest_version: '2' }, { name: 'measure', version: '2', latest_version: '2' }]),
            P('proj_x', [{ name: 'report', refs: [R('proj_a', 'measure', '3')] }], false),
        ],
        expect: 'missing-in-last-good',
    },
    {
        id: 'S8-ordered-cold-chain',
        projects: [
            P('proj_a', [{ name: 'base' }], false),
            P('proj_b', [{ name: 'mid', refs: [R('proj_a', 'base')] }], false),
            P('proj_x', [{ name: 'top', refs: [R('proj_b', 'mid')] }], false),
        ],
        expect: 'resolved',
    },
    {
        id: 'S9-cold-ring',
        projects: [
            P('proj_a', [{ name: 'a_base' }, { name: 'a_top', refs: [R('proj_b', 'b_base')] }], false),
            P('proj_b', [{ name: 'b_base' }, { name: 'b_top', refs: [R('proj_a', 'a_base')] }], false),
        ],
        expect: 'cold-start',
    },
    {
        id: 'S9b-model-cycle-seeded',
        projects: [
            P('proj_a', [{ name: 'x', refs: [R('proj_b', 'y')] }]),
            P('proj_b', [{ name: 'y', refs: [R('proj_a', 'x')] }]),
        ],
        expect: 'cycle',
    },
    {
        id: 'S9c-cycle-via-protected-intermediate',
        projects: [
            P('proj_a', [{ name: 'pub', localDeps: ['prot'] }, { name: 'prot', access: 'protected', refs: [R('proj_b', 'm')] }]),
            P('proj_b', [{ name: 'm', refs: [R('proj_a', 'pub')] }]),
        ],
        expect: 'cycle',
    },
    {
        id: 'S9b-stale-acyclic-seeds-disk-now-cyclic',
        projects: [
            { ...P('proj_a', [{ name: 'x', refs: [R('proj_b', 'y')] }]), staleSeed: true },
            { ...P('proj_b', [{ name: 'y', refs: [R('proj_a', 'x')] }]), staleSeed: true },
        ],
        expect: 'cycle',
    },
    {
        id: 'S10-withheld-seeded-consumer-unseeded-provider',
        projects: [P('proj_a', [{}], false), P('proj_x', [{ name: 'report', refs: [R('proj_a', 'orders')] }], false)],
        expect: 'resolved',
    },
    {
        id: 'S13-provider-manifest-with-installed-package-nodes',
        projects: [
            P('proj_a', [{}]),
            P('proj_x', [{ name: 'report', refs: [R('shared_pkg', 'shared_model')] }], false),
        ],
        expect: 'resolved',
    },
    {
        id: 'D2-shared-package-in-two-providers-consumer-refs-one',
        projects: [P('proj_a', [{}]), P('proj_b', [{ name: 'other' }]), P('proj_x', [{ name: 'report', refs: [R('proj_a', 'orders')] }], false)],
        expect: 'resolved',
    },
    {
        id: 'D3-shared-package-in-two-providers-consumer-refs-package',
        projects: [P('proj_a', [{}]), P('proj_b', [{ name: 'other' }]), P('proj_x', [{ name: 'report', refs: [R('shared_pkg', 'shared_model')] }], false)],
        expect: 'duplicate-provider-id',
    },
    {
        id: 'S14-missing-upstream-no-optional',
        projects: [P('proj_x', [{ name: 'report', refs: [R('ghost', 'orders')] }], false)],
        expect: 'no-provider',
    },
    {
        id: 'S15-zero-sources',
        projects: [P('proj_x', [{ name: 'report' }], false)],
        expect: 'resolved',
    },
    {
        id: 'D-duplicate-public-id-two-providers-explicit',
        projects: [P('proj_a', [{}]), P('proj_b', [{}]), P('proj_x', [{ name: 'report', refs: [R('proj_a', 'orders'), R('proj_b', 'orders')] }], false)],
        expect: 'resolved',
    },
];

describe('cross-source resolver seed cases', () => {
    it('records S1-S15 outcomes', async () => {
        const rows: Record<string, Outcome & { expect: string; injectedIds: string[] }> = {};
        for (const c of SEED_CASES) {
            const projects = c.projects;
            if (c.id.startsWith('S13') || c.id.startsWith('D2') || c.id.startsWith('D3')) {
                // provider_a last-good manifest contains a public model owned by an installed package
                const extra: Node = { resource_type: 'model', name: 'shared_model', access: 'public', version: null, latest_version: null, refs: [], localDeps: [] };
                const built = buildCase({ seed: 0, projects, concurrency: 2 });
                const sharedNode = {
                    name: extra.name,
                    package_name: 'shared_pkg',
                    identifier: extra.name,
                    schema: 'public',
                    database: 'warehouse',
                    relation_name: null,
                    version: null,
                    latest_version: null,
                    access: 'public',
                    depends_on_nodes: [],
                };
                built.cache[0].nodes.push({ ...sharedNode });
                if (!c.id.startsWith('S13')) built.cache[1].nodes.push({ ...sharedNode });
                let status: Outcome['status'] = 'resolved';
                let message = '';
                try {
                    await resolveCrossSourceManifests({ tasks: built.tasks, enabled: true, concurrency: 2, cache: built.cache });
                } catch (error) {
                    message = error instanceof Error ? error.message : String(error);
                    status = error instanceof ParameterError ? 'parameter-error' : 'crash';
                }
                rows[c.id] = {
                    seed: 0, status, message, summary: c.id, invariantFailures: [], injectedTotal: 0, sources: projects.length, seeded: 1, classes: classify(message), expect: c.expect,
                    injectedIds: [...built.payloads.values()].flat().flat().map(getExternalDbtNodeUniqueId),
                };
                continue;
            }
            const built = buildCase({ seed: 0, projects, concurrency: 2 });
            const outcome = await runCase({ seed: 0, projects, concurrency: 2 });
            const rerun = buildCase({ seed: 0, projects, concurrency: 2 });
            try {
                await resolveCrossSourceManifests({ tasks: rerun.tasks, enabled: true, concurrency: 2, cache: rerun.cache });
            } catch {
                // outcome already captured
            }
            rows[c.id] = {
                ...outcome,
                expect: c.expect,
                injectedIds: [...rerun.payloads.values()].flat().flat().map(getExternalDbtNodeUniqueId),
            };
            void built;
        }
        fs.writeFileSync('/tmp/fable-loom-fuzz/ts-seed-cases.json', JSON.stringify(rows, null, 1));
        expect(Object.values(rows).filter((row) => row.status === 'crash')).toEqual([]);
    });
});
