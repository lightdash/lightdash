import {
    DbtError,
    getDbtManifestPackageNames,
    getExternalModelNodesFromManifest,
    isExternalDbtNode,
    ParameterError,
    stripExternalDbtNodes,
    type DbtRawModelNode,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { getMissingDbtNodeReferences } from '../dbt/dbtExternalNodes';
import { type DbtProjectScan } from '../dbt/dbtProjectScan';
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
    prepare?: (options?: {
        signal?: AbortSignal;
    }) => Promise<DbtProjectScan | null>;
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
    signatureExhausted?: number;
    preflightWarnings?: number;
};

type FetchOutcome =
    | { ok: true; result: CrossSourceFetchResult }
    | { ok: false; error: unknown };

export const resolveCrossSourceManifests = async <T>({
    tasks,
    enabled,
    concurrency,
    onRoundComplete,
    signal,
    timeouts = DEFAULT_CROSS_SOURCE_TIMEOUTS,
    otherConnectionProjects = [],
    connectionName,
}: {
    tasks: CrossSourceFetchTask<T>[];
    enabled: boolean;
    concurrency: number;
    onRoundComplete?: (round: number) => void;
    signal?: AbortSignal;
    timeouts?: CrossSourceTimeouts;
    otherConnectionProjects?: OtherConnectionProject[];
    connectionName?: string;
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
    const cancellation = new CrossSourceCancellation(signal, timeouts);
    try {
        const resolved = new Map<
            CrossSourceFetchTask<T>,
            CrossSourceResolution<T>['results'][number]
        >();
        const pending = new Map<CrossSourceFetchTask<T>, unknown>();
        const neededPackages = new Map<CrossSourceFetchTask<T>, Set<string>>();
        const attempts = new Map<CrossSourceFetchTask<T>, Set<string>>();
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
        const providersByName = new Map<string, CrossSourceFetchTask<T>[]>();
        for (const task of tasks) {
            const scan = scans.get(task);
            if (scan?.projectName) {
                const providers = providersByName.get(scan.projectName) ?? [];
                providers.push(task);
                providersByName.set(scan.projectName, providers);
            }
        }
        const warnings = new Set<string>();
        let signatureExhausted = 0;
        const crossConnectionReason = (
            task: CrossSourceFetchTask<T>,
            name: string,
            declaredRef: boolean,
        ) =>
            crossConnectionReferenceReason(
                task.key,
                name,
                declaredRef,
                connectionName,
                otherConnectionProjects,
            );
        validateCrossSourceProjectScans(
            tasks.map((task) => ({
                key: task.key,
                scan: scans.get(task) ?? null,
            })),
            otherConnectionProjects,
            connectionName,
        );
        for (const task of tasks) {
            const scan = scans.get(task);
            for (const name of scan?.referencedProjects ?? []) {
                if (
                    !providersByName.has(name) &&
                    name !== scan?.projectName &&
                    !scan?.installedPackages.includes(name)
                ) {
                    const warning =
                        crossConnectionReason(task, name, false) ??
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
        const declared = new Map(
            tasks.map((task) => [task, new Set<CrossSourceFetchTask<T>>()]),
        );
        const edges = new Map(
            tasks.map((task) => [task, new Set<CrossSourceFetchTask<T>>()]),
        );
        const unresolvedDeclared = new Map<
            CrossSourceFetchTask<T>,
            Set<string>
        >();
        const updateDeclaredUpstreams = () => {
            for (const task of tasks) {
                const missing = new Set<string>();
                for (const name of scans.get(task)?.declaredUpstreams ?? []) {
                    const providers = new Set(providersByName.get(name) ?? []);
                    for (const [provider, { result }] of resolved) {
                        if (
                            getDbtManifestPackageNames(
                                result.manifest,
                            ).includes(name)
                        )
                            providers.add(provider);
                    }
                    if (providers.size === 0) {
                        if (
                            tasks.every(
                                (source) =>
                                    scans.get(source) !== null ||
                                    resolved.has(source),
                            )
                        ) {
                            throw new ParameterError(
                                `dbt source "${task.key}" declares upstream project "${name}" in dependencies.yml, but no connected dbt source provides project "${name}".`,
                            );
                        }
                        missing.add(name);
                    }
                    providers.forEach((provider) => {
                        declared.get(task)!.add(provider);
                        edges.get(task)!.add(provider);
                    });
                }
                if (missing.size > 0) unresolvedDeclared.set(task, missing);
                else unresolvedDeclared.delete(task);
            }
        };
        updateDeclaredUpstreams();
        for (const task of tasks) {
            const scan = scans.get(task);
            for (const name of scan?.referencedProjects ?? []) {
                for (const provider of providersByName.get(name) ?? []) {
                    if (provider !== task && !edges.get(task)!.has(provider)) {
                        edges.get(task)!.add(provider);
                    }
                }
            }
        }
        const scannedEdges = [...edges.values()].reduce(
            (count, upstreams) => count + upstreams.size,
            0,
        );
        const findCycle = (
            graph: typeof edges,
        ): CrossSourceFetchTask<T>[] | null => {
            const visited = new Set<CrossSourceFetchTask<T>>();
            const stack: CrossSourceFetchTask<T>[] = [];
            const visit = (
                task: CrossSourceFetchTask<T>,
            ): CrossSourceFetchTask<T>[] | null => {
                const index = stack.indexOf(task);
                if (index >= 0) return [...stack.slice(index), task];
                if (visited.has(task)) return null;
                stack.push(task);
                for (const provider of graph.get(task) ?? []) {
                    const cycle = visit(provider);
                    if (cycle) return cycle;
                }
                stack.pop();
                visited.add(task);
                return null;
            };
            for (const task of tasks) {
                const cycle = visit(task);
                if (cycle) return cycle;
            }
            return null;
        };
        const declaredCycle = findCycle(declared);
        if (declaredCycle) {
            throw new ParameterError(
                `Declared dbt upstreams form a cycle: ${declaredCycle.map((task) => `"${scans.get(task)?.projectName}"`).join(' -> ')}. Fix dependencies.yml in one of the repositories.`,
            );
        }
        let scanCycle = findCycle(edges);
        while (scanCycle) {
            Logger.debug('dbt.compile.crossSourceScanCycleIgnored', {
                event: 'dbt.compile.crossSourceScanCycleIgnored',
                sources: scanCycle.map((task) => task.key),
            });
            for (let index = 0; index < scanCycle.length - 1; index += 1) {
                const consumer = scanCycle[index];
                const provider = scanCycle[index + 1];
                if (!declared.get(consumer)!.has(provider))
                    edges.get(consumer)!.delete(provider);
            }
            scanCycle = findCycle(edges);
        }
        let dbtLsRuns = 0;
        const fetchedTasks = new Set<CrossSourceFetchTask<T>>();
        let firstAttemptInjected = 0;
        let rounds = 1;
        const externalNodesFrom = (
            providers: CrossSourceResolution<T>['results'],
        ) => [
            ...new Map(
                providers
                    .flatMap(({ result }) =>
                        getExternalModelNodesFromManifest(result.manifest),
                    )
                    .map((node) => [
                        `${node.package_name}.${node.name}.${node.version ?? ''}`,
                        node,
                    ]),
            ).values(),
        ];
        const fetchOne = async (
            task: CrossSourceFetchTask<T>,
            options: DbtManifestFetchOptions,
            onFetchStart?: () => void,
        ): Promise<FetchOutcome> => {
            dbtLsRuns += 1;
            if (!fetchedTasks.has(task) && options.externalNodes.length > 0)
                firstAttemptInjected += 1;
            fetchedTasks.add(task);
            try {
                const result = await cancellation.run(
                    task.key,
                    'ls',
                    (fetchSignal) => {
                        onFetchStart?.();
                        return task.fetch({ ...options, signal: fetchSignal });
                    },
                );
                if (options.externalNodes.length === 0)
                    return { ok: true, result };
                Object.values(result.manifest.nodes)
                    .filter((node) => node.resource_type === 'model')
                    .map((node) => node as DbtRawModelNode)
                    .filter((node) => !isExternalDbtNode(node))
                    .forEach((node) => {
                        (node.refs ?? [])
                            .filter((ref) => ref.package == null)
                            .forEach((ref) => {
                                const matches = (node.depends_on?.nodes ?? [])
                                    .map(
                                        (id) =>
                                            result.manifest.nodes[id] as
                                                | DbtRawModelNode
                                                | undefined,
                                    )
                                    .filter(
                                        (
                                            dependency,
                                        ): dependency is DbtRawModelNode =>
                                            dependency !== undefined &&
                                            dependency.name === ref.name &&
                                            (ref.version == null ||
                                                String(dependency.version) ===
                                                    String(ref.version)),
                                    );
                                const localMatches = matches.filter(
                                    (candidate) =>
                                        candidate.package_name ===
                                        node.package_name,
                                );
                                const rootMatches = matches.filter(
                                    (candidate) =>
                                        candidate.package_name ===
                                        result.manifest.metadata.project_name,
                                );
                                const candidates =
                                    [localMatches, rootMatches].find(
                                        (group) => group.length > 0,
                                    ) ?? matches;
                                const dependency =
                                    (ref.version == null
                                        ? candidates.find(
                                              (candidate) =>
                                                  candidate.version != null &&
                                                  String(candidate.version) ===
                                                      String(
                                                          candidate.latest_version,
                                                      ),
                                          )
                                        : undefined) ??
                                    (candidates.length === 1
                                        ? candidates[0]
                                        : undefined);
                                if (
                                    dependency &&
                                    isExternalDbtNode(dependency)
                                ) {
                                    const versionArg =
                                        ref.version == null
                                            ? ''
                                            : `, v=${JSON.stringify(ref.version)}`;
                                    const warning = `Model "${node.name}" in dbt source "${task.key}" uses ref('${ref.name}'${versionArg}), which resolved to external model ${dependency.unique_id} from another dbt source. Use ref('${dependency.package_name}', '${ref.name}'${versionArg}) to make the cross-source reference explicit.`;
                                    if (!warnings.has(warning))
                                        Logger.warn(
                                            `dbt.compile.crossSourceRefWarning ${warning}`,
                                            {
                                                event: 'dbt.compile.crossSourceRefWarning',
                                                source: task.key,
                                                warning,
                                            },
                                        );
                                    warnings.add(warning);
                                }
                            });
                    });
                const manifest = stripExternalDbtNodes(result.manifest);
                return {
                    ok: true,
                    result: {
                        ...result,
                        manifest,
                        ...(result.selectedModelIds
                            ? {
                                  selectedModelIds:
                                      result.selectedModelIds.filter(
                                          (id) => id in manifest.nodes,
                                      ),
                              }
                            : {}),
                    },
                };
            } catch (error) {
                cancellation.controller.signal.throwIfAborted();
                if (getMissingDbtNodeReferences(error).length === 0) {
                    cancellation.controller.abort(error);
                    throw error;
                }
                const name = scans.get(task)?.projectName;
                const providers = name ? providersByName.get(name) : undefined;
                if (
                    providers &&
                    providers.some((provider) => provider !== task) &&
                    getMissingDbtNodeReferences(error).some(
                        (ref) => ref.packageName === name,
                    )
                ) {
                    throw new ParameterError(
                        `dbt sources "${providers[0].key}" and "${providers[1].key}" both use the dbt project name "${name}". A model cannot reference another dbt project that has its own name. Change the name: value in one repository's dbt_project.yml.`,
                    );
                }
                return { ok: false, error };
            }
        };
        const fetchRound = async (
            roundTasks: CrossSourceFetchTask<T>[],
            options: (task: CrossSourceFetchTask<T>) => DbtManifestFetchOptions,
            onFetchStart?: (task: CrossSourceFetchTask<T>) => void,
        ) => {
            const outcomes = await runWithConcurrency(
                roundTasks,
                concurrency,
                (task) =>
                    fetchOne(task, options(task), () => onFetchStart?.(task)),
            );
            cancellation.controller.signal.throwIfAborted();
            rounds += 1;
            onRoundComplete?.(rounds);
            return outcomes;
        };
        const remaining = new Set(tasks);
        const active = new Map<
            CrossSourceFetchTask<T>,
            Promise<{
                task: CrossSourceFetchTask<T>;
                outcome: FetchOutcome;
                providers: CrossSourceResolution<T>['results'];
            }>
        >();
        const depths = new Map<CrossSourceFetchTask<T>, number>();
        const runReady = async (): Promise<void> => {
            updateDeclaredUpstreams();
            for (const task of remaining) {
                if (active.size >= Math.max(1, concurrency)) break;
                const upstreams = [...edges.get(task)!];
                if (
                    !unresolvedDeclared.has(task) &&
                    upstreams.every((provider) => resolved.has(provider))
                ) {
                    remaining.delete(task);
                    const providers = upstreams.map(
                        (provider) => resolved.get(provider)!,
                    );
                    const externalNodes = externalNodesFrom(providers);
                    const depth =
                        1 +
                        Math.max(
                            0,
                            ...upstreams.map(
                                (provider) => depths.get(provider) ?? 0,
                            ),
                        );
                    depths.set(task, depth);
                    rounds = Math.max(rounds, depth);
                    active.set(
                        task,
                        fetchOne(task, { externalNodes }).then((outcome) => ({
                            task,
                            outcome,
                            providers,
                        })),
                    );
                }
            }
            if (active.size === 0) return;
            const { task, outcome, providers } = await Promise.race(
                active.values(),
            );
            cancellation.controller.signal.throwIfAborted();
            active.delete(task);
            if (outcome.ok) {
                pending.delete(task);
                resolved.set(task, {
                    task,
                    result: outcome.result,
                    injectedFrom: providers.map(
                        (provider) => provider.task.key,
                    ),
                });
            } else {
                if (getMissingDbtNodeReferences(outcome.error).length === 0)
                    throw outcome.error;
                pending.set(task, outcome.error);
            }
            return runReady();
        };
        await runReady();
        const blocked = new Set(remaining);
        const updateBlockedFailure = (task: CrossSourceFetchTask<T>) => {
            const upstreams = [...edges.get(task)!].filter(
                (provider) => !resolved.has(provider),
            );
            const names = [
                ...upstreams.map(
                    (provider) =>
                        scans.get(provider)?.projectName ?? provider.key,
                ),
                ...(unresolvedDeclared.get(task) ?? []),
            ];
            if (names.length > 0) {
                pending.set(
                    task,
                    new DbtError(
                        names
                            .map(
                                (name) =>
                                    `depends on a node named '*' in package or project '${name}' which was not found`,
                            )
                            .join('\n'),
                    ),
                );
            }
        };
        blocked.forEach(updateBlockedFailure);
        onRoundComplete?.(rounds);
        const unresolvedError = () => {
            const cycleReason = 'the pending sources depend on each other';
            const pendingGraph = new Map(
                [...pending].map(([task, error]) => [
                    task,
                    new Set(
                        [...pending.keys()].filter((provider) =>
                            getMissingDbtNodeReferences(error).some(
                                (ref) =>
                                    ref.packageName ===
                                    (scans.get(provider)?.projectName ??
                                        provider.key),
                            ),
                        ),
                    ),
                ]),
            );
            const isPendingCycle = (source: CrossSourceFetchTask<T>) => {
                const visited = new Set<CrossSourceFetchTask<T>>();
                const visit = (candidate: CrossSourceFetchTask<T>): boolean => {
                    if (candidate === source) return true;
                    if (visited.has(candidate)) return false;
                    visited.add(candidate);
                    return [...(pendingGraph.get(candidate) ?? [])].some(visit);
                };
                return [...(pendingGraph.get(source) ?? [])].some(visit);
            };
            const rootCause = (source: CrossSourceFetchTask<T>): string => {
                const visited = new Set<CrossSourceFetchTask<T>>();
                const find = (candidate: CrossSourceFetchTask<T>): string => {
                    visited.add(candidate);
                    const failedUpstream = [
                        ...(pendingGraph.get(candidate) ?? []),
                    ].find(
                        (upstream) =>
                            !visited.has(upstream) && !isPendingCycle(upstream),
                    );
                    if (failedUpstream) return find(failedUpstream);
                    const error = pending.get(candidate);
                    return error instanceof Error
                        ? error.message
                        : String(error);
                };
                return find(source);
            };
            const failures = [...pending].map(([task, error]) => ({
                task,
                references: getMissingDbtNodeReferences(error).map((ref) => {
                    const provider = [...resolved.values()].find(({ result }) =>
                        getDbtManifestPackageNames(result.manifest).includes(
                            ref.packageName,
                        ),
                    );
                    const pendingProvider = [...pending.keys()].find(
                        (candidate) =>
                            candidate.key === ref.packageName ||
                            scans.get(candidate)?.projectName ===
                                ref.packageName,
                    );
                    if (provider) {
                        return {
                            ...ref,
                            providerState: 'resolved',
                            reason: `source "${provider.task.key}" provides project "${ref.packageName}" but has no model "${ref.model}"`,
                        };
                    }
                    if (pendingProvider) {
                        return {
                            ...ref,
                            providerState: 'pending',
                            reason: isPendingCycle(pendingProvider)
                                ? cycleReason
                                : `waiting for dbt source "${pendingProvider.key}", which failed: ${rootCause(pendingProvider)}`,
                        };
                    }
                    return {
                        ...ref,
                        providerState: crossConnectionReason(
                            task,
                            ref.packageName,
                            false,
                        )
                            ? 'otherConnection'
                            : 'missing',
                        reason:
                            crossConnectionReason(
                                task,
                                ref.packageName,
                                false,
                            ) ??
                            `No connected dbt source provides project "${ref.packageName}"`,
                    };
                }),
            }));
            if (
                failures.length === 1 &&
                failures[0].references.length === 1 &&
                failures[0].references[0].providerState === 'missing'
            ) {
                const [
                    {
                        task,
                        references: [ref],
                    },
                ] = failures;
                return new ParameterError(
                    `Cannot resolve dbt source "${task.key}": ref "${ref.packageName}.${ref.model}" was not found. ${ref.reason}.`,
                );
            }
            const onlyPendingProviders = failures.every(({ references }) =>
                references.every(
                    (ref) =>
                        ref.providerState === 'pending' &&
                        ref.reason === cycleReason,
                ),
            );
            return new ParameterError(
                `Cannot resolve cross-source dbt refs: ${
                    onlyPendingProviders ? `${cycleReason}. ` : ''
                }${failures
                    .map(
                        ({ task, references }) =>
                            `Source "${task.key}": ${references
                                .map(
                                    (ref) =>
                                        `${ref.packageName}.${ref.model}${
                                            onlyPendingProviders
                                                ? ''
                                                : `: ${ref.reason}`
                                        }`,
                                )
                                .join(', ')}`,
                    )
                    .join('; ')}`,
            );
        };
        const resolvePending = async (): Promise<void> => {
            if (pending.size === 0) return;
            updateDeclaredUpstreams();
            blocked.forEach(updateBlockedFailure);
            const providers = [...resolved.values()];
            const packages = new Set(
                providers.flatMap(({ result }) =>
                    getDbtManifestPackageNames(result.manifest),
                ),
            );
            const retryable: CrossSourceFetchTask<T>[] = [];
            for (const [task, error] of pending) {
                const references = getMissingDbtNodeReferences(error);
                const needed = neededPackages.get(task) ?? new Set<string>();
                references.forEach((ref) => needed.add(ref.packageName));
                neededPackages.set(task, needed);
                const missing = references.find(
                    (ref) => !packages.has(ref.packageName),
                );
                if (
                    !missing &&
                    !unresolvedDeclared.has(task) &&
                    [...edges.get(task)!].every((provider) =>
                        resolved.has(provider),
                    )
                ) {
                    retryable.push(task);
                }
            }
            const releaseHints = async () => {
                const released = [...blocked].filter(
                    (task) =>
                        !fetchedTasks.has(task) &&
                        !unresolvedDeclared.has(task) &&
                        [...declared.get(task)!].every((provider) =>
                            resolved.has(provider),
                        ),
                );
                if (released.length === 0) throw unresolvedError();
                released.forEach((task) => {
                    for (const provider of edges.get(task)!) {
                        if (
                            !resolved.has(provider) &&
                            !declared.get(task)!.has(provider)
                        )
                            edges.get(task)!.delete(provider);
                    }
                    pending.delete(task);
                    blocked.delete(task);
                });
                await runReady();
                for (const task of blocked) {
                    if (fetchedTasks.has(task)) blocked.delete(task);
                }
                blocked.forEach(updateBlockedFailure);
                return resolvePending();
            };
            if (retryable.length === 0) return releaseHints();
            const attemptProviders = new Map(
                retryable.map((task) => [
                    task,
                    fetchedTasks.has(task)
                        ? providers
                        : providers.filter((provider) =>
                              edges.get(task)!.has(provider.task),
                          ),
                ]),
            );
            const signatures = new Map<CrossSourceFetchTask<T>, string>();
            const ready = retryable.filter((task) => {
                const catalogue = externalNodesFrom(
                    attemptProviders.get(task)!,
                );
                const signature = createHash('sha256')
                    .update(
                        JSON.stringify({
                            catalogue: catalogue
                                .map((node) =>
                                    Object.fromEntries(
                                        Object.entries(node).sort(([a], [b]) =>
                                            a.localeCompare(b),
                                        ),
                                    ),
                                )
                                .sort((a, b) =>
                                    JSON.stringify(a).localeCompare(
                                        JSON.stringify(b),
                                    ),
                                ),
                            missing: getMissingDbtNodeReferences(
                                pending.get(task),
                            )
                                .map((ref) => [
                                    ref.packageName,
                                    ref.model,
                                    ref.version,
                                ])
                                .sort((a, b) =>
                                    JSON.stringify(a).localeCompare(
                                        JSON.stringify(b),
                                    ),
                                ),
                        }),
                    )
                    .digest('hex');
                if (attempts.get(task)?.has(signature)) {
                    signatureExhausted += 1;
                    return false;
                }
                signatures.set(task, signature);
                return true;
            });
            if (ready.length === 0) return releaseHints();
            const outcomes = await fetchRound(
                ready,
                (task) => ({
                    externalNodes: externalNodesFrom(
                        attemptProviders.get(task)!,
                    ),
                }),
                (task) => {
                    const previousAttempts =
                        attempts.get(task) ?? new Set<string>();
                    previousAttempts.add(signatures.get(task)!);
                    attempts.set(task, previousAttempts);
                },
            );
            let progressed = false;
            outcomes.forEach((outcome, index) => {
                const task = ready[index];
                remaining.delete(task);
                blocked.delete(task);
                const previousRefs = getMissingDbtNodeReferences(
                    pending.get(task),
                );
                if (outcome.ok) {
                    pending.delete(task);
                    resolved.set(task, {
                        task,
                        result: outcome.result,
                        injectedFrom: attemptProviders
                            .get(task)!
                            .filter(({ result }) =>
                                getDbtManifestPackageNames(
                                    result.manifest,
                                ).some((name) =>
                                    neededPackages.get(task)?.has(name),
                                ),
                            )
                            .map((provider) => provider.task.key),
                    });
                    progressed = true;
                } else {
                    const references = getMissingDbtNodeReferences(
                        outcome.error,
                    );
                    if (references.length === 0) throw outcome.error;
                    if (
                        JSON.stringify(references) !==
                        JSON.stringify(previousRefs)
                    )
                        progressed = true;
                    pending.set(task, outcome.error);
                }
            });
            if (!progressed && pending.size > 0) return releaseHints();
            return resolvePending();
        };
        await resolvePending();
        cancellation.controller.signal.throwIfAborted();
        return {
            rounds,
            attempts: dbtLsRuns,
            signatureExhausted,
            preflightWarnings,
            warnings: [...warnings],
            scan: {
                known: scannedEdges,
                ordered: [...edges.values()].reduce(
                    (count, upstreams) => count + upstreams.size,
                    0,
                ),
            },
            firstAttemptInjected,
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
