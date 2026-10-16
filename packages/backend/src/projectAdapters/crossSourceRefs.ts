import {
    getDbtManifestPackageNames,
    getExternalModelNodesFromManifest,
    ParameterError,
    stripExternalDbtNodes,
} from '@lightdash/common';
import { getMissingDbtNodeReferences } from '../dbt/dbtExternalNodes';
import {
    type DbtManifestFetchOptions,
    type DbtManifestFetchResult,
} from '../types';
import { runWithConcurrency } from '../utils/runWithConcurrency';

export type CrossSourceFetchResult = DbtManifestFetchResult;

export type CrossSourceFetchTask<T> = {
    key: string;
    fetch: (
        options: DbtManifestFetchOptions,
    ) => Promise<CrossSourceFetchResult>;
    context: T;
};

export type CrossSourceResolution<T> = {
    results: {
        task: CrossSourceFetchTask<T>;
        result: CrossSourceFetchResult;
        injectedFrom: string[];
    }[];
    rounds: number;
};

type FetchOutcome =
    | { ok: true; result: CrossSourceFetchResult }
    | { ok: false; error: unknown };

export const resolveCrossSourceManifests = async <T>({
    tasks,
    enabled,
    concurrency,
    onRoundComplete,
}: {
    tasks: CrossSourceFetchTask<T>[];
    enabled: boolean;
    concurrency: number;
    onRoundComplete?: (round: number) => void;
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
        return { results, rounds: 1 };
    }
    const resolved = new Map<
        CrossSourceFetchTask<T>,
        CrossSourceResolution<T>['results'][number]
    >();
    const pending = new Map<CrossSourceFetchTask<T>, unknown>();
    const neededPackages = new Map<CrossSourceFetchTask<T>, Set<string>>();
    const attempts = new Map<CrossSourceFetchTask<T>, Set<string>>();
    let rounds = 0;
    const fetchRound = async (
        roundTasks: CrossSourceFetchTask<T>[],
        options: DbtManifestFetchOptions,
    ) => {
        const outcomes = await runWithConcurrency(
            roundTasks,
            concurrency,
            async (task): Promise<FetchOutcome> => {
                try {
                    const result = await task.fetch(options);
                    if (rounds === 0) return { ok: true, result };
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
                    return { ok: false, error };
                }
            },
        );
        rounds += 1;
        onRoundComplete?.(rounds);
        return outcomes;
    };
    const firstRound = await fetchRound(tasks, { externalNodes: [] });
    firstRound.forEach((outcome, index) => {
        const task = tasks[index];
        if (outcome.ok) {
            resolved.set(task, {
                task,
                result: outcome.result,
                injectedFrom: [],
            });
        } else {
            pending.set(task, outcome.error);
        }
    });
    for (const error of pending.values()) {
        if (getMissingDbtNodeReferences(error).length === 0) throw error;
    }
    const unresolvedError = () =>
        new ParameterError(
            `Cannot resolve cross-source dbt refs: the pending sources depend on each other or on an upstream source that failed. ${[
                ...pending,
            ]
                .map(
                    ([task, error]) =>
                        `Source "${task.key}": ${getMissingDbtNodeReferences(
                            error,
                        )
                            .map((ref) => `${ref.packageName}.${ref.model}`)
                            .join(', ')}`,
                )
                .join('; ')}`,
        );
    const resolvePending = async (): Promise<void> => {
        if (pending.size === 0) return;
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
            if (!missing) {
                retryable.push(task);
            } else if (pending.size === 1) {
                throw new ParameterError(
                    `Cannot resolve dbt source "${task.key}": ref "${missing.packageName}.${missing.model}" was not found. No connected dbt source provides project "${missing.packageName}".`,
                );
            }
        }
        if (retryable.length === 0) throw unresolvedError();
        const externalNodes = [
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
        retryable.forEach((task) => {
            const signature = `${resolved.size}:${getMissingDbtNodeReferences(
                pending.get(task),
            )
                .map((ref) => `${ref.packageName}.${ref.model}`)
                .sort()
                .join(',')}`;
            const previousAttempts = attempts.get(task) ?? new Set<string>();
            if (previousAttempts.has(signature)) throw unresolvedError();
            previousAttempts.add(signature);
            attempts.set(task, previousAttempts);
        });
        const outcomes = await fetchRound(retryable, { externalNodes });
        let progressed = false;
        outcomes.forEach((outcome, index) => {
            const task = retryable[index];
            const previousRefs = getMissingDbtNodeReferences(pending.get(task));
            if (outcome.ok) {
                pending.delete(task);
                resolved.set(task, {
                    task,
                    result: outcome.result,
                    injectedFrom: providers
                        .filter(({ result }) =>
                            getDbtManifestPackageNames(result.manifest).some(
                                (name) => neededPackages.get(task)?.has(name),
                            ),
                        )
                        .map((provider) => provider.task.key),
                });
                progressed = true;
            } else {
                const references = getMissingDbtNodeReferences(outcome.error);
                if (references.length === 0) throw outcome.error;
                if (JSON.stringify(references) !== JSON.stringify(previousRefs))
                    progressed = true;
                pending.set(task, outcome.error);
            }
        });
        if (!progressed && pending.size > 0) throw unresolvedError();
        return resolvePending();
    };
    await resolvePending();
    return {
        rounds,
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
};
