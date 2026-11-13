import {
    diffModelDocuments,
    doModelPathsOverlap,
    readModelPart,
    type SemanticLayerDraftItemResult,
    type SemanticLayerDraftReconciliation,
} from '@lightdash/common';

/** The parts of a model one person's draft changes; empty path when it creates or removes the model. */
export const findDraftedPaths = (
    model: string,
    results: SemanticLayerDraftItemResult[],
): string[] => [
    ...new Set(
        results
            .filter((result) => result.model === model)
            .flatMap(({ changes }) =>
                changes.map(({ path, action }) =>
                    path === model &&
                    (action === 'created' || action === 'removed')
                        ? ''
                        : path,
                ),
            ),
    ),
];

/** The parts a draft wanted to change that are no longer there to change; empty path for the whole model. */
export const findRefusedPaths = (
    model: string,
    results: SemanticLayerDraftItemResult[],
): string[] => [
    ...new Set(
        results
            .filter((result) => result.model === model)
            .flatMap(({ refusals }) =>
                refusals
                    .filter(
                        ({ reason }) =>
                            reason === 'not_found' || reason === 'incomplete',
                    )
                    .map(({ path }) => (path === model ? '' : path)),
            ),
    ),
];

/**
 * Sets what was published to a model since a draft was based against what the
 * draft changes. The draft replays on live, so anything published elsewhere in
 * the model is already under it; only a part both sides changed is a conflict.
 */
export const reconcileModel = ({
    base,
    live,
    mine,
    draftedPaths,
    refusedPaths,
    wanted,
}: {
    base: string | null;
    live: string | null;
    mine: string | null;
    draftedPaths: string[];
    /** Parts the draft changes that live no longer has, so they are missing from `mine`. */
    refusedPaths: string[];
    /** The draft replayed on its base, for what it wanted in a refused part. */
    wanted: string | null;
}): Omit<SemanticLayerDraftReconciliation, 'liveVersion'> => {
    const published = diffModelDocuments(base, live).map(({ path }) => path);
    const outer = (a: string, b: string) => (a.length <= b.length ? a : b);
    const contested = [
        ...new Set(
            published.flatMap((path) =>
                [...draftedPaths, ...refusedPaths]
                    .filter((drafted) => doModelPathsOverlap(path, drafted))
                    .map((drafted) => outer(path, drafted)),
            ),
        ),
    ];
    const conflicts = contested
        // An inner path is covered by the outer one that holds it.
        .filter(
            (path) =>
                !contested.some(
                    (other) =>
                        other !== path &&
                        other.length < path.length &&
                        doModelPathsOverlap(other, path),
                ),
        )
        .map((path) => ({
            path,
            base: readModelPart(base, path),
            live: readModelPart(live, path),
            mine: refusedPaths.some((refused) =>
                doModelPathsOverlap(path, refused),
            )
                ? readModelPart(wanted, path)
                : readModelPart(mine, path),
        }))
        // Both sides wrote the same thing.
        .filter((conflict) => conflict.live !== conflict.mine);
    const merged = published.filter(
        (path) =>
            ![...draftedPaths, ...refusedPaths].some((drafted) =>
                doModelPathsOverlap(path, drafted),
            ),
    );
    if (conflicts.length > 0) return { state: 'conflict', merged, conflicts };
    return {
        state: published.length > 0 ? 'merged' : 'current',
        merged,
        conflicts,
    };
};
