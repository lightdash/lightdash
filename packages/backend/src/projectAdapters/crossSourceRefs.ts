import {
    DbtError,
    findDbtNodeCycle,
    getExternalDbtNodeUniqueId,
    getExternalModelNodesFromManifest,
    isExternalDbtNode,
    ParameterError,
    stripExternalDbtNodes,
    type DbtExternalModelNode,
    type DbtRawModelNode,
} from '@lightdash/common';
import { getMissingDbtNodeReferences } from '../dbt/dbtExternalNodes';
import { type DbtProjectScan, type ScannedDbtRef } from '../dbt/dbtProjectScan';
import { DbtSourceError } from '../dbt/DbtSourceError';
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
import {
    isFatalSourceFailure,
    type SourceFailurePhase,
} from './sourceFailureIsolation';

export class DbtSourceDependencyError extends ParameterError {
    constructor() {
        super('A referenced dbt source failed during this refresh.');
        this.name = 'DbtSourceDependencyError';
    }
}

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
    sources?: {
        key: string;
        lsRuns: number;
        totalLsMs: number;
        injectedStubs: number;
    }[];
    preflightWarnings?: number;
};
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
    cache = [],
    onSourceResolved,
    onSourceFailure,
}: {
    tasks: CrossSourceFetchTask<T>[];
    onSourceFailure?: (
        task: CrossSourceFetchTask<T>,
        error: unknown,
        phase: SourceFailurePhase,
    ) => Promise<boolean>;
    enabled: boolean;
    concurrency: number;
    onRoundComplete?: (round: number) => void;
    onSourceFinal?: (task: CrossSourceFetchTask<T>) => Promise<void> | void;
    signal?: AbortSignal;
    timeouts?: CrossSourceTimeouts;
    resolutionElapsedMs?: number;
    otherConnectionProjects?: OtherConnectionProject[];
    connectionName?: string;
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
            async (task) => {
                try {
                    if (onSourceFailure) signal?.throwIfAborted();
                    return {
                        task,
                        result: await task.fetch({
                            externalNodes: [],
                            ...(onSourceFailure ? { signal } : {}),
                        }),
                        injectedFrom: [],
                    };
                } catch (error) {
                    if (onSourceFailure) signal?.throwIfAborted();
                    if (
                        !isFatalSourceFailure(error) &&
                        (await onSourceFailure?.(task, error, 'manifest'))
                    )
                        return null;
                    throw error;
                }
            },
        );
        onRoundComplete?.(1);
        return {
            results: results.filter((entry) => entry !== null),
            rounds: 1,
            attempts: tasks.length,
            warnings: [],
            scan: { known: 0, ordered: 0 },
            firstAttemptInjected: 0,
        };
    }
    const seededCatalogs = cache.map((row) => ({
        ...row,
        referencedProjects: [...row.referencedProjects],
        nodes: row.nodes.map((node) => ({
            ...node,
            depends_on_nodes: [...node.depends_on_nodes],
        })),
    }));
    const cancellation = new CrossSourceCancellation(
        signal,
        timeouts,
        resolutionElapsedMs,
    );
    try {
        const skipped = new Set<CrossSourceFetchTask<T>>();
        const skip = async (
            task: CrossSourceFetchTask<T>,
            error: unknown,
            phase: SourceFailurePhase,
        ) => {
            cancellation.controller.signal.throwIfAborted();
            if (skipped.has(task)) return true;
            if (
                isFatalSourceFailure(error) ||
                !(await onSourceFailure?.(task, error, phase))
            )
                return false;
            skipped.add(task);
            return true;
        };
        const scans = new Map<CrossSourceFetchTask<T>, DbtProjectScan | null>();
        await runWithConcurrency(tasks, concurrency, async (task) => {
            try {
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
            } catch (error) {
                if (!(await skip(task, error, 'prepare'))) throw error;
                scans.set(task, null);
            }
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
        const bootstrapCatalogs = new Map<
            CrossSourceFetchTask<T>,
            DbtExternalModelNode[]
        >();
        const failures = new Map<CrossSourceFetchTask<T>, unknown>();
        const supplied = new Map<
            CrossSourceFetchTask<T>,
            Map<CrossSourceFetchTask<T>, DbtExternalModelNode[]>
        >();
        const stats = new Map(
            tasks.map((task) => [
                task,
                { key: task.key, lsRuns: 0, totalLsMs: 0, injectedStubs: 0 },
            ]),
        );
        const warnings = new Set<string>();
        const projectName = (task: CrossSourceFetchTask<T>) =>
            scans.get(task)?.projectName ??
            resolved.get(task)?.result.manifest.metadata.project_name ??
            seededCatalogs.find((row) => row.key === task.key)?.projectName ??
            null;
        const cachedCatalog = (task: CrossSourceFetchTask<T>) =>
            seededCatalogs.find(
                (row) =>
                    row.key === task.key &&
                    (skipped.has(task) ||
                        row.projectName === projectName(task)),
            );
        const catalog = (task: CrossSourceFetchTask<T>) =>
            cachedCatalog(task)?.nodes ?? bootstrapCatalogs.get(task) ?? [];
        const providers = (name: string) =>
            tasks.filter(
                (task) =>
                    projectName(task) === name ||
                    catalog(task).some((node) => node.package_name === name),
            );
        const refsOf = (task: CrossSourceFetchTask<T>) =>
            scans.get(task)?.refs ?? [];
        const isLocalPackage = (
            consumer: CrossSourceFetchTask<T>,
            name: string,
        ) =>
            name === projectName(consumer) ||
            scans.get(consumer)?.installedPackages.includes(name) === true;
        const oneArgProviders = (
            consumer: CrossSourceFetchTask<T>,
            ref: ScannedDbtRef,
        ) => {
            const scan = scans.get(consumer);
            if (
                scan?.localModels.includes(ref.name) ||
                scan?.installedPackageModels.includes(ref.name)
            )
                return [];
            return tasks.filter(
                (provider) =>
                    provider !== consumer &&
                    (catalog(provider).some(
                        (node) =>
                            node.access === 'public' && matchesRef(node, ref),
                    ) ||
                        (!cachedCatalog(provider) &&
                            !bootstrapCatalogs.has(provider) &&
                            scans
                                .get(provider)
                                ?.localModels.includes(ref.name))),
            );
        };
        const referencedProviders = (consumer: CrossSourceFetchTask<T>) => {
            const names = new Set([
                ...(scans.get(consumer)?.referencedProjects ?? []),
                ...(scans.get(consumer)?.declaredUpstreams ?? []),
                ...(cachedCatalog(consumer)?.referencedProjects ?? []),
                ...refsOf(consumer).flatMap((ref) =>
                    ref.packageName === null ? [] : [ref.packageName],
                ),
            ]);
            const selected = new Set(
                [...names]
                    .filter((name) => !isLocalPackage(consumer, name))
                    .flatMap(providers),
            );
            for (const ref of refsOf(consumer).filter(
                (entry) => entry.packageName === null,
            )) {
                const candidates = oneArgProviders(consumer, ref);
                if (candidates.length === 1) selected.add(candidates[0]);
            }
            selected.delete(consumer);
            return selected;
        };
        const selectedSurface = (consumer: CrossSourceFetchTask<T>) => {
            const selected = new Map<
                string,
                {
                    provider: CrossSourceFetchTask<T>;
                    node: DbtExternalModelNode;
                }
            >();
            for (const provider of referencedProviders(consumer)) {
                for (const node of catalog(provider).filter(
                    (entry) =>
                        entry.access === 'public' &&
                        !isLocalPackage(consumer, entry.package_name),
                )) {
                    const id = getExternalDbtNodeUniqueId(node);
                    const previous = selected.get(id);
                    if (previous && previous.provider !== provider)
                        throw new ParameterError(
                            `External model "${id}" is provided by several dbt sources: "${previous.provider.key}", "${provider.key}". Connect only one source for this model.`,
                        );
                    selected.set(id, { provider, node });
                }
            }
            const owners = new Map<string, CrossSourceFetchTask<T>>();
            for (const provider of tasks) {
                for (const node of catalog(provider).filter(
                    (entry) =>
                        entry.access === 'public' &&
                        selected.has(getExternalDbtNodeUniqueId(entry)),
                )) {
                    const id = getExternalDbtNodeUniqueId(node);
                    const previous = owners.get(id);
                    if (previous && previous !== provider)
                        throw new ParameterError(
                            `External model "${id}" is provided by several dbt sources: "${previous.key}", "${provider.key}". Connect only one source for this model.`,
                        );
                    owners.set(id, provider);
                }
            }
            return [...selected.values()];
        };
        const missingSeedReports = (consumer: CrossSourceFetchTask<T>) =>
            [...referencedProviders(consumer)]
                .filter((provider) => !cachedCatalog(provider))
                .map(
                    (provider) =>
                        `Cold start: dbt source "${consumer.key}" references dbt source "${provider.key}" (project "${projectName(provider)}"), but that upstream source has no confirmed last-good manifest. This refresh will try to seed the upstream in dependency order before compiling this consumer.`,
                );
        const warnMissingSeeds = (consumer: CrossSourceFetchTask<T>) => {
            for (const warning of missingSeedReports(consumer)) {
                if (!warnings.has(warning))
                    Logger.warn(
                        `dbt.compile.crossSourceMissingSeed ${warning}`,
                        {
                            event: 'dbt.compile.crossSourceMissingSeed',
                            source: consumer.key,
                            warning,
                        },
                    );
                warnings.add(warning);
            }
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
        tasks.forEach(warnMissingSeeds);
        const preflightWarnings = warnings.size;
        const buildPayload = (consumer: CrossSourceFetchTask<T>) => {
            const surface = selectedSurface(consumer);
            const injectedIds = new Set(
                surface.map(({ node }) => getExternalDbtNodeUniqueId(node)),
            );
            const byProvider = new Map<
                CrossSourceFetchTask<T>,
                DbtExternalModelNode[]
            >();
            for (const { provider, node } of surface) {
                byProvider.set(provider, [
                    ...(byProvider.get(provider) ?? []),
                    {
                        ...node,
                        depends_on_nodes: node.depends_on_nodes.filter((id) =>
                            injectedIds.has(id),
                        ),
                    },
                ]);
            }
            supplied.set(consumer, byProvider);
            return [...byProvider.values()].flat();
        };
        const failureReason = (
            task: CrossSourceFetchTask<T>,
            error: unknown,
        ): string => {
            const missing = getMissingDbtNodeReferences(error);
            if (missing.length === 0)
                return [
                    ...new Set([
                        error instanceof Error ? error.message : String(error),
                        ...(error instanceof DbtError ||
                        error instanceof DbtSourceError
                            ? (error.logs ?? [])
                                  .filter((log) => log.info.level === 'error')
                                  .map((log) => log.info.msg)
                            : []),
                    ]),
                ].join('\n');
            return missing
                .map((reference) => {
                    const ref = {
                        packageName: reference.packageName,
                        name: reference.model,
                        version: reference.version,
                    };
                    const candidates =
                        ref.packageName === null
                            ? oneArgProviders(task, ref)
                            : providers(ref.packageName);
                    if (ref.packageName === null && candidates.length > 1)
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but the name '${ref.name}' is defined by several dbt sources. Use ref('project', 'model') to select a source.`;
                    const provider = candidates[0];
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
                    if (crossConnection) return crossConnection;
                    if (
                        provider &&
                        !cachedCatalog(provider) &&
                        !bootstrapCatalogs.has(provider)
                    )
                        return `${missingSeedReports(task).join(' ')} dbt source "${task.key}" could not resolve ${refLabel(ref)} during its single parse.`;
                    if (provider && failures.has(provider)) {
                        const failure = failures.get(provider);
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but dbt source "${provider.key}" failed: ${failure instanceof Error ? failure.message : String(failure)}`;
                    }
                    if (
                        provider &&
                        catalog(provider).some((node) =>
                            matchesRef(node, ref),
                        ) &&
                        !catalog(provider).some(
                            (node) =>
                                node.access === 'public' &&
                                matchesRef(node, ref),
                        )
                    )
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but dbt source "${provider.key}" does not expose that model (or version) with access: public.`;
                    if (
                        provider &&
                        cachedCatalog(provider) &&
                        !catalog(provider).some((node) => matchesRef(node, ref))
                    )
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but the confirmed last-good manifest of dbt source "${provider.key}" does not define that model (or version).`;
                    if (!provider && ref.packageName !== null)
                        return `dbt source "${task.key}" references ${refLabel(ref)}, but no connected dbt source provides project "${ref.packageName}".`;
                    return `dbt source "${task.key}" references ${refLabel(ref)}, which could not be resolved from its selected public upstreams. Declare the upstream project in dependencies.yml or use a literal ref('project', 'model').`;
                })
                .join(' ');
        };
        const hasAmbiguousRef = (task: CrossSourceFetchTask<T>) =>
            refsOf(task).some(
                (ref) =>
                    ref.packageName === null &&
                    oneArgProviders(task, ref).length > 1 &&
                    !refsOf(task).some(
                        (explicit) =>
                            explicit.packageName !== null &&
                            explicit.name === ref.name,
                    ),
            );
        const isDbtFailure = (error: unknown): boolean =>
            error instanceof DbtError ||
            (error instanceof DbtSourceError && isDbtFailure(error.cause));
        let firstAttemptInjected = 0;
        const fetchSource = async (task: CrossSourceFetchTask<T>) => {
            const externalNodes = buildPayload(task);
            const sourceStats = stats.get(task)!;
            if (externalNodes.length > 0) firstAttemptInjected += 1;
            sourceStats.lsRuns = 1;
            sourceStats.injectedStubs = externalNodes.length;
            const started = Date.now();
            try {
                const fetch = async () => {
                    if (task.prepareFetch)
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
                                )
                                    throw new ParameterError(
                                        `dbt source "${task.key}" changed while this project was compiling. Refresh dbt again.`,
                                    );
                            },
                        );
                    return cancellation.run(task.key, 'ls', (fetchSignal) =>
                        task.fetch({ externalNodes, signal: fetchSignal }),
                    );
                };
                const fetched = await (task.withDisk
                    ? task.withDisk(fetch, cancellation.controller.signal)
                    : fetch());
                sourceStats.totalLsMs = Date.now() - started;
                cancellation.controller.signal.throwIfAborted();
                const nodes = getExternalModelNodesFromManifest(
                    fetched.manifest,
                );
                const newName = fetched.manifest.metadata.project_name;
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
                resolved.set(task, {
                    task,
                    result: fetched,
                    injectedFrom: [...supplied.get(task)!.keys()].map(
                        (provider) => provider.key,
                    ),
                });
                if (!cachedCatalog(task)) bootstrapCatalogs.set(task, nodes);
                const injectedPackages = new Map(
                    externalNodes.map((node) => [
                        getExternalDbtNodeUniqueId(node),
                        node.package_name,
                    ]),
                );
                const referencedProjects = [
                    ...new Set(
                        Object.values(fetched.manifest.nodes)
                            .filter(
                                (node) =>
                                    ['model', 'seed', 'snapshot'].includes(
                                        node.resource_type,
                                    ) &&
                                    !isExternalDbtNode(node as DbtRawModelNode),
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
                failures.set(task, error);
                resolved.delete(task);
                bootstrapCatalogs.delete(task);
                if (isFatalSourceFailure(error) || hasAmbiguousRef(task))
                    throw new ParameterError(failureReason(task, error));
                if (onSourceFailure) {
                    if (await skip(task, error, 'manifest')) return;
                    throw new ParameterError(failureReason(task, error));
                }
                if (!isDbtFailure(error)) {
                    const consumers = tasks.filter(
                        (consumer) =>
                            consumer !== task &&
                            referencedProviders(consumer).has(task),
                    );
                    throw consumers.length === 0
                        ? error
                        : new ParameterError(
                              `dbt source "${task.key}" failed: ${failureReason(task, error)}. ${consumers.map((consumer) => `dbt source "${consumer.key}" references this provider.`).join(' ')}`,
                          );
                }
            } finally {
                if (sourceStats.totalLsMs === 0)
                    sourceStats.totalLsMs = Date.now() - started;
            }
        };
        const pending = new Set(tasks.filter((task) => !skipped.has(task)));
        let ordered = 0;
        const fetchPendingSources = async (): Promise<void> => {
            if (pending.size === 0) return;
            const ready = [...pending].filter((consumer) =>
                [...referencedProviders(consumer)].every(
                    (provider) =>
                        cachedCatalog(provider) || !pending.has(provider),
                ),
            );
            const batch = ready.length > 0 ? ready : [[...pending][0]];
            if (batch.length < pending.size) ordered += batch.length;
            await runWithConcurrency(batch, concurrency, fetchSource);
            batch.forEach((task) => pending.delete(task));
            await fetchPendingSources();
        };
        await fetchPendingSources();
        cancellation.controller.signal.throwIfAborted();
        for (const task of tasks) {
            for (const name of scans.get(task)?.declaredUpstreams ?? []) {
                if (providers(name).length === 0)
                    throw new ParameterError(
                        `dbt source "${task.key}" declares upstream project "${name}" in dependencies.yml, but no connected dbt source provides project "${name}".`,
                    );
            }
        }
        if (failures.size > 0 && !onSourceFailure)
            throw new ParameterError(
                [...failures]
                    .map(([task, error]) => failureReason(task, error))
                    .join(' '),
            );
        const discardFailedConsumers = async (): Promise<void> => {
            const consumers = [...resolved].filter(([consumer, entry]) => {
                const dependencies = new Set(
                    Object.values(entry.result.manifest.nodes).flatMap(
                        (raw) =>
                            (raw as DbtRawModelNode).depends_on?.nodes ?? [],
                    ),
                );
                return [...(supplied.get(consumer) ?? [])].some(
                    ([provider, nodes]) =>
                        skipped.has(provider) &&
                        nodes.some((node) =>
                            dependencies.has(getExternalDbtNodeUniqueId(node)),
                        ),
                );
            });
            if (consumers.length === 0) return;
            await Promise.all(
                consumers.map(async ([consumer]) => {
                    const error = new DbtSourceDependencyError();
                    if (!(await skip(consumer, error, 'dependency')))
                        throw error;
                    resolved.delete(consumer);
                    bootstrapCatalogs.delete(consumer);
                }),
            );
            await discardFailedConsumers();
        };
        await discardFailedConsumers();
        for (const [consumer, { result: fetched }] of resolved) {
            const available = new Map(
                tasks
                    .filter((provider) => provider !== consumer)
                    .flatMap((provider) =>
                        catalog(provider)
                            .filter((node) => node.access === 'public')
                            .map(
                                (node) =>
                                    [
                                        getExternalDbtNodeUniqueId(node),
                                        node,
                                    ] as const,
                            ),
                    ),
            );
            const graph = new Map<
                string,
                { unique_id: string; depends_on: { nodes: string[] } }
            >();
            const includeDependency = (id: string) => {
                const node = available.get(id);
                if (!node || graph.has(id)) return;
                graph.set(id, {
                    unique_id: id,
                    depends_on: { nodes: node.depends_on_nodes },
                });
                node.depends_on_nodes.forEach(includeDependency);
            };
            selectedSurface(consumer).forEach(({ node }) =>
                includeDependency(getExternalDbtNodeUniqueId(node)),
            );
            const localNodes = Object.values(fetched.manifest.nodes)
                .map((raw) => raw as DbtRawModelNode)
                .filter(
                    (node) =>
                        ['model', 'seed', 'snapshot'].includes(
                            node.resource_type,
                        ) && !isExternalDbtNode(node),
                );
            const aliases = new Map(
                localNodes.map((node) => [
                    getExternalDbtNodeUniqueId({
                        resource_type: node.resource_type as
                            | 'model'
                            | 'seed'
                            | 'snapshot',
                        package_name: node.package_name,
                        name: node.name,
                        version: node.version ?? null,
                    }),
                    node.unique_id,
                ]),
            );
            for (const node of localNodes)
                graph.set(node.unique_id, {
                    unique_id: node.unique_id,
                    depends_on: { nodes: node.depends_on?.nodes ?? [] },
                });
            const cycle = findDbtNodeCycle(
                [...graph.values()]
                    .sort((a, b) => a.unique_id.localeCompare(b.unique_id))
                    .map((node) => ({
                        ...node,
                        depends_on: {
                            nodes: node.depends_on.nodes
                                .map((id) => aliases.get(id) ?? id)
                                .filter((id) => graph.has(id)),
                        },
                    })),
            );
            if (cycle)
                throw new ParameterError(
                    `dbt models form a cycle across dbt sources: ${cycle.join(' -> ')}. Break the cycle in one of these models.`,
                );
            for (const model of localNodes) {
                for (const reference of (model.refs ?? []).filter(
                    (entry) => entry.package == null,
                )) {
                    const candidates = (model.depends_on?.nodes ?? [])
                        .map(
                            (id) =>
                                fetched.manifest.nodes[id] as
                                    | DbtRawModelNode
                                    | undefined,
                        )
                        .filter(
                            (node): node is DbtRawModelNode =>
                                node !== undefined &&
                                node.name === reference.name &&
                                (reference.version == null ||
                                    String(node.version) ===
                                        String(reference.version)),
                        );
                    const preferred =
                        [
                            candidates.filter(
                                (node) =>
                                    node.package_name === model.package_name,
                            ),
                            candidates.filter(
                                (node) =>
                                    node.package_name ===
                                    fetched.manifest.metadata.project_name,
                            ),
                        ].find((group) => group.length > 0) ?? candidates;
                    const dependency =
                        (reference.version == null
                            ? preferred.find(
                                  (node) =>
                                      node.version != null &&
                                      String(node.version) ===
                                          String(node.latest_version),
                              )
                            : undefined) ??
                        (preferred.length === 1 ? preferred[0] : undefined);
                    if (
                        preferred.length > 0 &&
                        preferred.every(isExternalDbtNode)
                    ) {
                        const referenceVersion =
                            reference.version == null
                                ? null
                                : String(reference.version);
                        const providerCandidates = tasks.filter(
                            (provider) =>
                                provider !== consumer &&
                                catalog(provider).some(
                                    (node) =>
                                        node.access === 'public' &&
                                        matchesRef(node, {
                                            packageName: null,
                                            name: reference.name,
                                            version: referenceVersion,
                                        }),
                                ),
                        );
                        const explicitProjects = new Set(
                            localNodes.flatMap((node) =>
                                (node.refs ?? [])
                                    .filter(
                                        (entry) =>
                                            entry.package != null &&
                                            entry.name === reference.name &&
                                            (referenceVersion === null ||
                                                entry.version == null ||
                                                String(entry.version) ===
                                                    referenceVersion),
                                    )
                                    .map((entry) => entry.package!),
                            ),
                        );
                        if (
                            providerCandidates.length > 1 &&
                            (explicitProjects.size !== 1 ||
                                !preferred.every((node) =>
                                    explicitProjects.has(node.package_name),
                                ))
                        )
                            throw new ParameterError(
                                `dbt source "${consumer.key}" references ${refLabel({ packageName: null, name: reference.name, version: referenceVersion })}, but the name '${reference.name}' is defined by several dbt sources. Use ref('project', 'model') to select a source.`,
                            );
                    }
                    if (dependency && isExternalDbtNode(dependency)) {
                        const versionArg =
                            reference.version == null
                                ? ''
                                : `, v=${versionLabel(reference.version)}`;
                        const warning = `Model "${model.name}" in dbt source "${consumer.key}" uses ref('${reference.name}'${versionArg}), which resolved to external model ${dependency.unique_id} from another dbt source. Use ref('${dependency.package_name}', '${reference.name}'${versionArg}) to make the cross-source reference explicit.`;
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
        await Promise.all(
            [...resolved.keys()].map(async (task) => onSourceFinal?.(task)),
        );
        cancellation.controller.signal.throwIfAborted();
        onRoundComplete?.(1);
        const sources = [...stats.values()];
        return {
            rounds: tasks.length === 0 ? 0 : 1,
            attempts: sources.reduce((sum, source) => sum + source.lsRuns, 0),
            sources,
            firstAttemptInjected,
            preflightWarnings,
            warnings: [...warnings],
            scan: {
                known: [...scans.values()].reduce(
                    (sum, scan) => sum + (scan?.referencedProjects.length ?? 0),
                    0,
                ),
                ordered,
            },
            results: tasks
                .filter((task) => !skipped.has(task))
                .map((task) => {
                    const entry = resolved.get(task)!;
                    const cleaned = stripExternalDbtNodes(
                        entry.result.manifest,
                    );
                    return {
                        ...entry,
                        result: {
                            ...entry.result,
                            manifest: cleaned,
                            ...(entry.result.selectedModelIds
                                ? {
                                      selectedModelIds:
                                          entry.result.selectedModelIds.filter(
                                              (id) => id in cleaned.nodes,
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
