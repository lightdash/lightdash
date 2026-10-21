import {
    findDbtNodeCycle,
    getDbtManifestPackageNames,
    getExternalModelNodesFromManifest,
    isExternalDbtNode,
    ParameterError,
    stripExternalDbtNodes,
    type DbtExternalModelNode,
    type DbtRawModelNode,
} from '@lightdash/common';
import {
    getMissingDbtNodeReferences,
    placeholderExternalNode,
} from '../dbt/dbtExternalNodes';
import { type DbtProjectScan, type ScannedDbtRef } from '../dbt/dbtProjectScan';
import Logger from '../logging/logger';
import {
    type DbtManifestFetchOptions,
    type DbtManifestFetchResult,
} from '../types';
import { runWithConcurrency } from '../utils/runWithConcurrency';
import {
    CrossSourceCancellation,
    DEFAULT_CROSS_SOURCE_TIMEOUTS,
    type CrossSourceTimeouts,
} from './crossSourceCancellation';
import {
    crossConnectionReferenceReason,
    duplicateProjectNameReason,
    validateCrossSourceProjectScans,
    type OtherConnectionProject,
} from './crossSourcePreflight';

export type CrossSourceFetchResult = DbtManifestFetchResult;
export type CrossSourceFetchTask<T> = {
    key: string;
    fetch: (
        options: DbtManifestFetchOptions,
    ) => Promise<CrossSourceFetchResult>;
    context: T;
    withDisk?: <R>(
        operation: () => Promise<R>,
        signal: AbortSignal,
    ) => Promise<R>;
    prepareFetch?: (options: {
        signal: AbortSignal;
    }) => Promise<DbtProjectScan | null | void>;
    prepare?: (options?: {
        signal?: AbortSignal;
    }) => Promise<DbtProjectScan | null>;
};
export type CrossSourceStubOrigin =
    | 'fresh'
    | 'cached'
    | 'placeholder'
    | 'error';
type OriginCounts = Record<CrossSourceStubOrigin, number>;
export type CrossSourceCatalog = {
    key: string;
    projectName: string;
    referencedProjects: string[];
    nodes: DbtExternalModelNode[];
};
export type CrossSourceResolution<T> = {
    results: {
        task: CrossSourceFetchTask<T>;
        result: CrossSourceFetchResult;
        injectedFrom: string[];
    }[];
    rounds: number;
    attempts: number;
    warnings: string[];
    scan: { known: number; ordered: number };
    firstAttemptInjected: number;
    passes?: number;
    stubs?: OriginCounts;
    contradictions?: number;
    sources?: {
        key: string;
        lsRuns: number;
        totalLsMs: number;
        injectedStubs: number;
        origins: OriginCounts;
    }[];
    preflightWarnings?: number;
};
const emptyOrigins = (): OriginCounts => ({
    fresh: 0,
    cached: 0,
    placeholder: 0,
    error: 0,
});
const nodeKey = (node: DbtExternalModelNode) =>
    `${node.package_name}.${node.name}.${node.version ?? ''}`;
const nodeId = (
    node: Pick<DbtExternalModelNode, 'package_name' | 'name' | 'version'>,
) =>
    `model.${node.package_name}.${node.name}${node.version === null ? '' : `.v${node.version}`}`;
const refKey = (ref: ScannedDbtRef) => JSON.stringify([ref.name, ref.version]);
const versionLabel = (version: string | number) =>
    /^\d+(?:\.\d+)?$/.test(String(version))
        ? String(version)
        : JSON.stringify(version);
const refLabel = (ref: ScannedDbtRef) =>
    `ref(${ref.packageName === null ? '' : `'${ref.packageName}', `}'${ref.name}'${ref.version === null ? '' : `, v=${versionLabel(ref.version)}`})`;
const matchesRef = (node: DbtExternalModelNode, ref: ScannedDbtRef) =>
    node.name === ref.name &&
    (ref.packageName === null || node.package_name === ref.packageName) &&
    (ref.version === null || String(node.version) === ref.version);
const bindingProjection = (
    nodes: DbtExternalModelNode[],
    refs: ScannedDbtRef[],
) =>
    JSON.stringify(
        nodes
            .filter((node) => refs.some((ref) => matchesRef(node, ref)))
            .map((node) => [
                node.package_name,
                node.name,
                node.version === null ? null : String(node.version),
                node.latest_version === null
                    ? null
                    : String(node.latest_version),
                node.access ?? 'protected',
            ])
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );

export const resolveCrossSourceManifests = async <T>({
    tasks,
    enabled,
    concurrency,
    onRoundComplete,
    onSourceFinal,
    signal,
    timeouts = DEFAULT_CROSS_SOURCE_TIMEOUTS,
    resolutionElapsedMs = 0,
    otherConnectionProjects = [],
    connectionName,
    maxPasses = 3,
    cache = [],
    onSourceResolved,
}: {
    tasks: CrossSourceFetchTask<T>[];
    enabled: boolean;
    concurrency: number;
    onRoundComplete?: (round: number) => void;
    onSourceFinal?: (task: CrossSourceFetchTask<T>) => Promise<void> | void;
    signal?: AbortSignal;
    timeouts?: CrossSourceTimeouts;
    resolutionElapsedMs?: number;
    otherConnectionProjects?: OtherConnectionProject[];
    connectionName?: string;
    maxPasses?: number;
    cache?: CrossSourceCatalog[];
    onSourceResolved?: (entry: {
        task: CrossSourceFetchTask<T>;
        nodes: DbtExternalModelNode[];
        projectName: string | null;
        referencedProjects: string[];
    }) => Promise<void>;
}): Promise<CrossSourceResolution<T>> => {
    if (!enabled) {
        const results = await runWithConcurrency(
            tasks,
            concurrency,
            async (task) => ({
                task,
                result: await task.fetch({ externalNodes: [] }),
                injectedFrom: [],
            }),
        );
        onRoundComplete?.(1);
        return {
            results,
            rounds: 1,
            attempts: tasks.length,
            warnings: [],
            scan: { known: 0, ordered: 0 },
            firstAttemptInjected: 0,
        };
    }
    const cancellation = new CrossSourceCancellation(
        signal,
        timeouts,
        resolutionElapsedMs,
    );
    try {
        const scans = new Map<CrossSourceFetchTask<T>, DbtProjectScan | null>();
        await runWithConcurrency(tasks, concurrency, async (task) => {
            scans.set(
                task,
                await cancellation.run(
                    task.key,
                    'prepare',
                    async (prepareSignal) =>
                        (await task.prepare?.({ signal: prepareSignal })) ??
                        null,
                ),
            );
        });
        validateCrossSourceProjectScans(
            tasks.map((task) => ({
                key: task.key,
                scan: scans.get(task) ?? null,
            })),
            otherConnectionProjects,
            connectionName,
        );
        const resolved = new Map<
            CrossSourceFetchTask<T>,
            CrossSourceResolution<T>['results'][number]
        >();
        const fresh = new Map<
            CrossSourceFetchTask<T>,
            DbtExternalModelNode[]
        >();
        const failures = new Map<CrossSourceFetchTask<T>, unknown>();
        const learned = new Map<
            CrossSourceFetchTask<T>,
            Map<string, ScannedDbtRef>
        >();
        const supplied = new Map<
            CrossSourceFetchTask<T>,
            Map<CrossSourceFetchTask<T>, DbtExternalModelNode[]>
        >();
        const origins = new Map<
            CrossSourceFetchTask<T>,
            Map<string, CrossSourceStubOrigin>
        >();
        const stats = new Map(
            tasks.map((task) => [
                task,
                {
                    key: task.key,
                    lsRuns: 0,
                    totalLsMs: 0,
                    injectedStubs: 0,
                    origins: emptyOrigins(),
                },
            ]),
        );
        const warnings = new Set<string>();
        const projectName = (task: CrossSourceFetchTask<T>) =>
            scans.get(task)?.projectName ??
            resolved.get(task)?.result.manifest.metadata.project_name ??
            null;
        const cachedCatalog = (task: CrossSourceFetchTask<T>) =>
            cache.find(
                (row) =>
                    row.key === task.key &&
                    row.projectName === scans.get(task)?.projectName,
            );
        const catalog = (task: CrossSourceFetchTask<T>) =>
            fresh.get(task) ?? cachedCatalog(task)?.nodes ?? [];
        const providers = (name: string) =>
            tasks.filter(
                (task) =>
                    projectName(task) === name ||
                    (resolved.has(task) &&
                        getDbtManifestPackageNames(
                            resolved.get(task)!.result.manifest,
                        ).includes(name)),
            );
        const refsOf = (task: CrossSourceFetchTask<T>) => [
            ...(scans.get(task)?.refs ?? []),
            ...(learned.get(task)?.values() ?? []),
        ];
        const referencedProviders = (consumer: CrossSourceFetchTask<T>) => {
            const names = new Set([
                ...(scans.get(consumer)?.referencedProjects ?? []),
                ...(scans.get(consumer)?.declaredUpstreams ?? []),
                ...(cachedCatalog(consumer)?.referencedProjects ?? []),
                ...refsOf(consumer).flatMap((ref) =>
                    ref.packageName === null ? [] : [ref.packageName],
                ),
            ]);
            return new Set([...names].flatMap(providers));
        };
        const oneArgProviders = (
            consumer: CrossSourceFetchTask<T>,
            ref: ScannedDbtRef,
        ) => {
            const scan = scans.get(consumer);
            if (
                scan?.localModels.includes(ref.name) ||
                scan?.installedPackageModels.includes(ref.name) ||
                fresh.get(consumer)?.some((node) => node.name === ref.name)
            )
                return [];
            return tasks.filter(
                (provider) =>
                    provider !== consumer &&
                    (catalog(provider).some((node) => matchesRef(node, ref)) ||
                        (!fresh.has(provider) &&
                            !catalog(provider).some(
                                (node) => node.name === ref.name,
                            ) &&
                            scans
                                .get(provider)
                                ?.localModels.includes(ref.name))),
            );
        };
        for (const task of tasks) {
            for (const name of scans.get(task)?.referencedProjects ?? []) {
                if (
                    providers(name).length === 0 &&
                    name !== projectName(task) &&
                    !scans.get(task)?.installedPackages.includes(name)
                ) {
                    const warning =
                        crossConnectionReferenceReason(
                            task.key,
                            name,
                            false,
                            connectionName,
                            otherConnectionProjects,
                        ) ??
                        `dbt source "${task.key}" references project "${name}", but no connected dbt source or installed package provides this project. The reference may be in a comment or a disabled model.`;
                    warnings.add(warning);
                    Logger.warn('dbt.compile.crossSourceUnknownProject', {
                        event: 'dbt.compile.crossSourceUnknownProject',
                        source: task.key,
                        warning,
                    });
                }
            }
        }
        const preflightWarnings = warnings.size;
        const buildPayload = (consumer: CrossSourceFetchTask<T>) => {
            const byProvider = new Map<
                CrossSourceFetchTask<T>,
                DbtExternalModelNode[]
            >();
            const sideMap = new Map<string, CrossSourceStubOrigin>();
            const refs = refsOf(consumer);
            const referenced = referencedProviders(consumer);
            const oneArgs = new Map(
                refs
                    .filter((ref) => ref.packageName === null)
                    .map((ref) => [
                        refKey(ref),
                        oneArgProviders(consumer, ref),
                    ]),
            );
            for (const provider of tasks.filter(
                (source) => source !== consumer,
            )) {
                const name = projectName(provider);
                const nodes = new Map<string, DbtExternalModelNode>();
                const add = (
                    node: DbtExternalModelNode,
                    origin: CrossSourceStubOrigin,
                ) => {
                    if (
                        node.package_name === projectName(consumer) ||
                        scans
                            .get(consumer)
                            ?.installedPackages.includes(node.package_name)
                    )
                        return;
                    if (
                        refs.some(
                            (ref) =>
                                ref.packageName === null &&
                                matchesRef(node, ref) &&
                                oneArgs.get(refKey(ref))?.length !== 1,
                        ) &&
                        !refs.some(
                            (ref) =>
                                ref.packageName === node.package_name &&
                                ref.name === node.name,
                        )
                    )
                        return;
                    nodes.set(
                        nodeKey(node),
                        origin === 'fresh'
                            ? node
                            : { ...node, access: 'public' },
                    );
                    sideMap.set(nodeKey(node), origin);
                };
                catalog(provider)
                    .filter(
                        (node) =>
                            referenced.has(provider) ||
                            refs.some(
                                (ref) =>
                                    ref.packageName === null &&
                                    matchesRef(node, ref) &&
                                    oneArgs.get(refKey(ref))?.length === 1 &&
                                    oneArgs.get(refKey(ref))?.[0] === provider,
                            ),
                    )
                    .forEach((node) =>
                        add(node, fresh.has(provider) ? 'fresh' : 'cached'),
                    );
                if (name !== null) {
                    for (const ref of refs.filter(
                        (candidate) =>
                            (candidate.packageName === name ||
                                (candidate.packageName === null &&
                                    oneArgs.get(refKey(candidate))?.length ===
                                        1 &&
                                    oneArgs.get(refKey(candidate))?.[0] ===
                                        provider)) &&
                            ![...nodes.values()].some((node) =>
                                matchesRef(node, candidate),
                            ),
                    )) {
                        const error =
                            learned.get(consumer)?.has(JSON.stringify(ref)) ??
                            false;
                        add(
                            placeholderExternalNode({
                                packageName: name,
                                name: ref.name,
                                version: ref.version,
                                latestVersion: ref.version,
                            }),
                            error ? 'error' : 'placeholder',
                        );
                    }
                }
                const groups = new Map<string, DbtExternalModelNode[]>();
                nodes.forEach((node) => {
                    const key = `${node.package_name}.${node.name}`;
                    groups.set(key, [...(groups.get(key) ?? []), node]);
                });
                for (const group of groups.values()) {
                    const versioned = group.filter(
                        (node) => node.version !== null,
                    );
                    if (versioned.length > 0) {
                        const realLatest = versioned.find(
                            (node) =>
                                ['fresh', 'cached'].includes(
                                    sideMap.get(nodeKey(node))!,
                                ) && node.latest_version !== null,
                        )?.latest_version;
                        const latest =
                            realLatest ??
                            versioned
                                .map((node) => String(node.version))
                                .sort((a, b) =>
                                    a.localeCompare(b, undefined, {
                                        numeric: true,
                                    }),
                                )
                                .at(-1)!;
                        for (const node of group) {
                            if (node.version === null) {
                                nodes.delete(nodeKey(node));
                                sideMap.delete(nodeKey(node));
                            } else
                                nodes.set(nodeKey(node), {
                                    ...node,
                                    latest_version: latest,
                                });
                        }
                    }
                }
                if (nodes.size > 0)
                    byProvider.set(provider, [...nodes.values()]);
            }
            const injectedIds = new Set(
                [...byProvider.values()].flat().map(nodeId),
            );
            for (const [provider, nodes] of byProvider)
                byProvider.set(
                    provider,
                    nodes.map((node) => ({
                        ...node,
                        depends_on_nodes: node.depends_on_nodes.filter((id) =>
                            injectedIds.has(id),
                        ),
                    })),
                );
            supplied.set(consumer, byProvider);
            origins.set(consumer, sideMap);
            return [...byProvider.values()].flat();
        };
        const contradictedRefs = new Map<
            CrossSourceFetchTask<T>,
            { provider: CrossSourceFetchTask<T>; ref: ScannedDbtRef }[]
        >();
        const hiddenRefReason = (
            task: CrossSourceFetchTask<T>,
            project: string,
        ) =>
            `dbt source "${task.key}" references a model in project "${project}" that could not be found before compiling (for example a ref built in a macro or var()). Use the literal form ref('${project}', 'model').`;
        const unresolvedError = (queued: Set<CrossSourceFetchTask<T>>) => {
            const reports = [...queued].flatMap((task) => {
                if (resolved.has(task))
                    return (contradictedRefs.get(task) ?? []).map(
                        ({ provider, ref }) =>
                            `dbt source "${task.key}" was compiled against an out-of-date version of model "${ref.name}"${ref.version === null ? '' : ` (version ${JSON.stringify(ref.version)})`} from dbt source "${provider.key}" and the compile ran out of retries. Refresh again; the next compile usually succeeds.`,
                    );
                const missing = getMissingDbtNodeReferences(failures.get(task));
                const refs =
                    missing.length > 0
                        ? missing.map((ref) => ({
                              packageName: ref.packageName,
                              name: ref.model,
                              version: ref.version,
                          }))
                        : refsOf(task);
                if (refs.length === 0)
                    return [hiddenRefReason(task, 'project')];
                return refs.map((ref) => {
                    if (
                        ref.packageName === null &&
                        oneArgProviders(task, ref).length > 1
                    )
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but the name '${ref.name}' is defined by several dbt sources. Use ref('project', 'model') to select a source.`;
                    const provider =
                        ref.packageName === null
                            ? oneArgProviders(task, ref)[0]
                            : providers(ref.packageName)[0];
                    const crossConnection =
                        ref.packageName === null
                            ? null
                            : crossConnectionReferenceReason(
                                  task.key,
                                  ref.packageName,
                                  false,
                                  connectionName,
                                  otherConnectionProjects,
                              );
                    if (crossConnection !== null) return crossConnection;
                    if (provider && failures.has(provider)) {
                        const failure = failures.get(provider);
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but dbt source "${provider.key}" failed: ${failure instanceof Error ? failure.message : String(failure)}`;
                    }
                    if (!provider && ref.packageName !== null)
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but no connected dbt source provides project "${ref.packageName}".`;
                    return `dbt source "${task.key}" references ${refLabel(ref)}. ${hiddenRefReason(task, ref.packageName ?? 'project')}`;
                });
            });
            return new ParameterError(reports.join(' '));
        };
        const finalized = new Set<CrossSourceFetchTask<T>>();
        const finalDependencies = new Map<
            CrossSourceFetchTask<T>,
            Set<CrossSourceFetchTask<T>>
        >();
        const finalizeSource = async (task: CrossSourceFetchTask<T>) => {
            if (finalized.has(task)) return;
            await onSourceFinal?.(task);
            finalized.add(task);
        };
        let contradictions = 0;
        let firstAttemptInjected = 0;
        const runPass = async (
            passTasks: CrossSourceFetchTask<T>[],
            pass: number,
        ): Promise<number> => {
            let progress = false;
            const queued = new Set<CrossSourceFetchTask<T>>();
            const payloads = new Map(
                passTasks.map((task) => [task, buildPayload(task)]),
            );
            await runWithConcurrency(passTasks, concurrency, async (task) => {
                const externalNodes = payloads.get(task)!;
                const sourceStats = stats.get(task)!;
                if (sourceStats.lsRuns === 0 && externalNodes.length > 0)
                    firstAttemptInjected += 1;
                sourceStats.lsRuns += 1;
                sourceStats.injectedStubs += externalNodes.length;
                origins.get(task)!.forEach((origin) => {
                    sourceStats.origins[origin] += 1;
                });
                const started = Date.now();
                let lsFinishedAt: number | null = null;
                try {
                    const fetch = async () => {
                        if (task.prepareFetch) {
                            await cancellation.run(
                                task.key,
                                'prepare',
                                async (prepareSignal) => {
                                    const current = await task.prepareFetch!({
                                        signal: prepareSignal,
                                    });
                                    const original = scans.get(task);
                                    if (
                                        current &&
                                        original &&
                                        (current.projectName !==
                                            original.projectName ||
                                            JSON.stringify(
                                                [
                                                    ...current.declaredUpstreams,
                                                ].sort(),
                                            ) !==
                                                JSON.stringify(
                                                    [
                                                        ...original.declaredUpstreams,
                                                    ].sort(),
                                                ))
                                    ) {
                                        throw new ParameterError(
                                            `dbt source "${task.key}" changed while this project was compiling. Refresh dbt again.`,
                                        );
                                    }
                                },
                            );
                        }
                        return cancellation.run(task.key, 'ls', (fetchSignal) =>
                            task.fetch({ externalNodes, signal: fetchSignal }),
                        );
                    };
                    const result = await (task.withDisk
                        ? task.withDisk(fetch, cancellation.controller.signal)
                        : fetch());
                    lsFinishedAt = Date.now();
                    const nodes = getExternalModelNodesFromManifest(
                        result.manifest,
                    );
                    const newName = result.manifest.metadata.project_name;
                    const duplicate = tasks.find(
                        (other) =>
                            other !== task &&
                            newName != null &&
                            projectName(other) === newName,
                    );
                    if (duplicate)
                        throw new ParameterError(
                            duplicateProjectNameReason(newName!, [
                                duplicate.key,
                                task.key,
                            ]),
                        );
                    progress = true;
                    resolved.set(task, {
                        task,
                        result,
                        injectedFrom: [...supplied.get(task)!.keys()].map(
                            (provider) => provider.key,
                        ),
                    });
                    fresh.set(task, nodes);
                    failures.delete(task);
                    cancellation.controller.signal.throwIfAborted();
                    const injectedPackages = new Map(
                        externalNodes.map((node) => [
                            nodeId(node),
                            node.package_name,
                        ]),
                    );
                    const referencedProjects = [
                        ...new Set(
                            Object.values(result.manifest.nodes)
                                .filter(
                                    (node) =>
                                        ['model', 'snapshot'].includes(
                                            node.resource_type,
                                        ) &&
                                        !isExternalDbtNode(
                                            node as DbtRawModelNode,
                                        ),
                                )
                                .flatMap((node) =>
                                    (
                                        (node as DbtRawModelNode).depends_on
                                            ?.nodes ?? []
                                    ).flatMap((id) => {
                                        const name = injectedPackages.get(id);
                                        return name === undefined ? [] : [name];
                                    }),
                                ),
                        ),
                    ].sort();
                    await onSourceResolved?.({
                        task,
                        nodes,
                        projectName: newName ?? null,
                        referencedProjects,
                    });
                    cancellation.controller.signal.throwIfAborted();
                } catch (error) {
                    cancellation.controller.signal.throwIfAborted();
                    const references = getMissingDbtNodeReferences(error);
                    if (references.length === 0) {
                        const consumerReports = tasks
                            .filter((consumer) => consumer !== task)
                            .flatMap((consumer) =>
                                refsOf(consumer)
                                    .filter(
                                        (ref) =>
                                            ref.packageName ===
                                                projectName(task) ||
                                            (ref.packageName === null &&
                                                oneArgProviders(consumer, ref)
                                                    .length === 1 &&
                                                oneArgProviders(
                                                    consumer,
                                                    ref,
                                                )[0] === task),
                                    )
                                    .map(
                                        (ref) =>
                                            `dbt source "${consumer.key}" references ${refLabel(ref)} from dbt source "${task.key}", which failed with this root cause.`,
                                    ),
                            );
                        const failure =
                            consumerReports.length === 0
                                ? error
                                : new ParameterError(
                                      `dbt source "${task.key}" failed: ${error instanceof Error ? error.message : String(error)}. ${consumerReports.join(' ')}`,
                                  );
                        cancellation.controller.abort(failure);
                        throw failure;
                    }
                    const ownName = projectName(task);
                    const duplicate = tasks.find(
                        (other) =>
                            other !== task &&
                            ownName !== null &&
                            projectName(other) === ownName,
                    );
                    if (
                        ownName &&
                        duplicate &&
                        references.some((ref) => ref.packageName === ownName)
                    )
                        throw new ParameterError(
                            duplicateProjectNameReason(ownName, [
                                task.key,
                                duplicate.key,
                            ]),
                        );
                    const known =
                        learned.get(task) ?? new Map<string, ScannedDbtRef>();
                    for (const reference of references) {
                        const ref = {
                            packageName: reference.packageName,
                            name: reference.model,
                            version: reference.version,
                        };
                        const key = JSON.stringify(ref);
                        if (!known.has(key)) progress = true;
                        known.set(key, ref);
                    }
                    learned.set(task, known);
                    failures.set(task, error);
                    resolved.delete(task);
                    fresh.delete(task);
                    queued.add(task);
                } finally {
                    sourceStats.totalLsMs +=
                        (lsFinishedAt ?? Date.now()) - started;
                }
            });
            cancellation.controller.signal.throwIfAborted();
            if (
                tasks.every(
                    (task) => scans.get(task) !== null || resolved.has(task),
                )
            ) {
                for (const task of tasks) {
                    for (const name of scans.get(task)?.declaredUpstreams ??
                        []) {
                        if (providers(name).length === 0)
                            throw new ParameterError(
                                `dbt source "${task.key}" declares upstream project "${name}" in dependencies.yml, but no connected dbt source provides project "${name}".`,
                            );
                    }
                }
            }
            for (const [consumer, entry] of resolved) {
                const given = supplied.get(consumer)!;
                const requiredProviders = new Set([
                    ...referencedProviders(consumer),
                    ...given.keys(),
                ]);
                finalDependencies.set(consumer, requiredProviders);
                const actualRefs: ScannedDbtRef[] = [];
                const injectedById = new Map(
                    [...given.entries()].flatMap(([provider, nodes]) =>
                        nodes.map(
                            (node) =>
                                [nodeId(node), { provider, node }] as const,
                        ),
                    ),
                );
                for (const raw of Object.values(
                    entry.result.manifest.nodes,
                ).filter(
                    (node) =>
                        ['model', 'snapshot'].includes(node.resource_type) &&
                        !isExternalDbtNode(node as DbtRawModelNode),
                )) {
                    const model = raw as DbtRawModelNode;
                    const dependencies = (
                        model.depends_on?.nodes ?? []
                    ).flatMap((id) => {
                        const injected = injectedById.get(id);
                        return injected ? [injected] : [];
                    });
                    for (const injected of dependencies) {
                        const { provider, node: stub } = injected;
                        requiredProviders.add(provider);
                        const ref: ScannedDbtRef = {
                            packageName: stub.package_name,
                            name: stub.name,
                            version:
                                stub.version === null
                                    ? null
                                    : String(stub.version),
                        };
                        const requested = (model.refs ?? []).filter(
                            (reference) =>
                                reference.name === stub.name &&
                                (reference.package == null ||
                                    reference.package === stub.package_name),
                        );
                        const requestedVersion =
                            requested.length > 0 &&
                            !requested.some(
                                (reference) =>
                                    reference.version != null &&
                                    String(reference.version) === ref.version,
                            )
                                ? null
                                : ref.version;
                        actualRefs.push({ ...ref, version: requestedVersion });
                        if (fresh.has(provider)) {
                            const candidates = fresh
                                .get(provider)!
                                .filter((node) =>
                                    matchesRef(node, {
                                        ...ref,
                                        version: requestedVersion,
                                    }),
                                );
                            const real =
                                requestedVersion === null
                                    ? (candidates.find(
                                          (node) =>
                                              node.version === null ||
                                              String(node.version) ===
                                                  String(node.latest_version),
                                      ) ?? candidates[0])
                                    : candidates[0];
                            if (!real || real.access === 'private')
                                throw new ParameterError(
                                    `Model "${model.name}" in dbt source "${consumer.key}" references ${refLabel({ ...ref, version: requestedVersion })}, but dbt source "${provider.key}" ${real ? 'defines that model as private' : 'does not define that model (or version)'}.`,
                                );
                        }
                    }
                    for (const ref of model.refs ?? []) {
                        if (ref.package == null) {
                            const candidates = (model.depends_on?.nodes ?? [])
                                .map(
                                    (id) =>
                                        entry.result.manifest.nodes[id] as
                                            | DbtRawModelNode
                                            | undefined,
                                )
                                .filter(
                                    (node): node is DbtRawModelNode =>
                                        node !== undefined &&
                                        node.name === ref.name &&
                                        (ref.version == null ||
                                            String(node.version) ===
                                                String(ref.version)),
                                );
                            const preferred =
                                [
                                    candidates.filter(
                                        (node) =>
                                            node.package_name ===
                                            model.package_name,
                                    ),
                                    candidates.filter(
                                        (node) =>
                                            node.package_name ===
                                            entry.result.manifest.metadata
                                                .project_name,
                                    ),
                                ].find((group) => group.length > 0) ??
                                candidates;
                            const dependency =
                                (ref.version == null
                                    ? preferred.find(
                                          (node) =>
                                              node.version != null &&
                                              String(node.version) ===
                                                  String(node.latest_version),
                                      )
                                    : undefined) ??
                                (preferred.length === 1
                                    ? preferred[0]
                                    : undefined);
                            if (dependency && isExternalDbtNode(dependency)) {
                                actualRefs.push({
                                    packageName: refsOf(consumer).some(
                                        (candidate) =>
                                            candidate.packageName ===
                                                dependency.package_name &&
                                            candidate.name === ref.name,
                                    )
                                        ? dependency.package_name
                                        : null,
                                    name: ref.name,
                                    version:
                                        ref.version == null
                                            ? null
                                            : String(ref.version),
                                });
                                const versionArg =
                                    ref.version == null
                                        ? ''
                                        : `, v=${versionLabel(ref.version)}`;
                                const warning = `Model "${model.name}" in dbt source "${consumer.key}" uses ref('${ref.name}'${versionArg}), which resolved to external model ${dependency.unique_id} from another dbt source. Use ref('${dependency.package_name}', '${ref.name}'${versionArg}) to make the cross-source reference explicit.`;
                                if (!warnings.has(warning))
                                    Logger.warn(
                                        `dbt.compile.crossSourceRefWarning ${warning}`,
                                        {
                                            event: 'dbt.compile.crossSourceRefWarning',
                                            source: consumer.key,
                                            warning,
                                        },
                                    );
                                warnings.add(warning);
                            }
                        }
                    }
                }
                const changed: {
                    provider: CrossSourceFetchTask<T>;
                    ref: ScannedDbtRef;
                }[] = [];
                for (const provider of tasks.filter(
                    (source) => source !== consumer && fresh.has(source),
                )) {
                    const visible = (nodes: DbtExternalModelNode[]) =>
                        nodes.filter(
                            (node) =>
                                node.package_name !== projectName(consumer) &&
                                !scans
                                    .get(consumer)
                                    ?.installedPackages.includes(
                                        node.package_name,
                                    ),
                        );
                    const previous = visible(given.get(provider) ?? []);
                    const current = visible(fresh.get(provider)!);
                    for (const ref of actualRefs) {
                        if (
                            bindingProjection(previous, [ref]) !==
                                bindingProjection(current, [ref]) &&
                            !changed.some(
                                (changedRef) =>
                                    changedRef.provider === provider &&
                                    changedRef.ref.name === ref.name &&
                                    changedRef.ref.version === ref.version,
                            )
                        )
                            changed.push({ provider, ref });
                    }
                }
                contradictedRefs.set(consumer, changed);
                if (changed.length > 0 && !queued.has(consumer)) {
                    queued.add(consumer);
                    contradictions += 1;
                }
            }
            const unsettled = new Set(
                tasks.filter((task) => queued.has(task) || !resolved.has(task)),
            );
            let added = true;
            while (added) {
                added = false;
                for (const [
                    consumer,
                    providersToValidate,
                ] of finalDependencies) {
                    if (
                        !unsettled.has(consumer) &&
                        [...providersToValidate].some(
                            (provider) =>
                                !fresh.has(provider) || unsettled.has(provider),
                        )
                    ) {
                        unsettled.add(consumer);
                        added = true;
                    }
                }
            }
            await Promise.all(
                [...resolved.keys()]
                    .filter((task) => !unsettled.has(task))
                    .map(finalizeSource),
            );
            onRoundComplete?.(pass);
            const canLearn = [...queued].some(
                (task) =>
                    !failures.has(task) ||
                    getMissingDbtNodeReferences(failures.get(task)).some(
                        (missing) =>
                            missing.packageName === null
                                ? oneArgProviders(task, {
                                      packageName: null,
                                      name: missing.model,
                                      version: missing.version,
                                  }).length === 1
                                : providers(missing.packageName).length > 0,
                    ) ||
                    tasks.some(
                        (provider) =>
                            scans.get(provider) === null &&
                            !resolved.has(provider),
                    ),
            );
            if (
                queued.size > 0 &&
                (!progress || !canLearn || pass === maxPasses)
            )
                throw unresolvedError(queued);
            if (queued.size > 0) return runPass([...queued], pass + 1);
            return pass;
        };
        if (tasks.length > 0 && maxPasses < 1)
            throw unresolvedError(new Set(tasks));
        const passes = tasks.length === 0 ? 0 : await runPass(tasks, 1);
        cancellation.controller.signal.throwIfAborted();
        const realNodes = new Map<string, DbtRawModelNode>();
        resolved.forEach(({ result }) =>
            Object.values(result.manifest.nodes).forEach((raw) => {
                const node = raw as DbtRawModelNode;
                if (
                    ['model', 'seed', 'snapshot'].includes(
                        node.resource_type,
                    ) &&
                    !isExternalDbtNode(node)
                )
                    realNodes.set(node.unique_id, node);
            }),
        );
        const realIds = new Map(
            [...realNodes.values()]
                .filter((node) => node.resource_type === 'model')
                .map((node) => [
                    nodeId({
                        package_name: node.package_name,
                        name: node.name,
                        version: node.version ?? null,
                    }),
                    node.unique_id,
                ]),
        );
        const cycle = findDbtNodeCycle(
            [...realNodes.values()].map((node) => ({
                unique_id: node.unique_id,
                depends_on: {
                    nodes: (node.depends_on?.nodes ?? []).map(
                        (id) => realIds.get(id) ?? id,
                    ),
                },
            })),
        );
        if (cycle)
            throw new ParameterError(
                `dbt models form a cycle across dbt sources: ${cycle.join(' -> ')}. Break the cycle in one of these models.`,
            );
        await Promise.all([...resolved.keys()].map(finalizeSource));
        const sources = [...stats.values()];
        return {
            rounds: passes,
            passes,
            attempts: sources.reduce((sum, source) => sum + source.lsRuns, 0),
            stubs: sources.reduce(
                (counts, source) => ({
                    fresh: counts.fresh + source.origins.fresh,
                    cached: counts.cached + source.origins.cached,
                    placeholder:
                        counts.placeholder + source.origins.placeholder,
                    error: counts.error + source.origins.error,
                }),
                emptyOrigins(),
            ),
            contradictions,
            sources,
            firstAttemptInjected,
            preflightWarnings,
            warnings: [...warnings],
            scan: {
                known: [...scans.values()].reduce(
                    (sum, scan) => sum + (scan?.referencedProjects.length ?? 0),
                    0,
                ),
                ordered: 0,
            },
            results: tasks.map((task) => {
                const entry = resolved.get(task)!;
                const manifest = stripExternalDbtNodes(entry.result.manifest);
                return {
                    ...entry,
                    result: {
                        ...entry.result,
                        manifest,
                        ...(entry.result.selectedModelIds
                            ? {
                                  selectedModelIds:
                                      entry.result.selectedModelIds.filter(
                                          (id) => id in manifest.nodes,
                                      ),
                              }
                            : {}),
                    },
                };
            }),
        };
    } catch (error) {
        return await cancellation.fail(error);
    } finally {
        cancellation.dispose();
    }
};
