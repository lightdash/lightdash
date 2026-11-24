import {
    applyModelFragment,
    getErrorMessage,
    ParameterError,
    parseModelFragment,
    removeModelParts,
    restoreModelParts,
    type ApplyModelFragmentResult,
    type SemanticLayerDraftItemResult,
    type SemanticLayerDraftModelInput,
    type SemanticLayerProposalItemResult,
} from '@lightdash/common';
import { isDerivedSqlFrom, toDerivedSqlFrom } from './derivedModel';

const MODEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const toModelPath = (modelName: string) => `models/${modelName}.yml`;

type Merged = Omit<ApplyModelFragmentResult, 'contents'> & {
    /** Null when the model is removed or was never there. */
    contents: string | null;
};

/** What a drafted item's removals and fragment do to one model's YAML. */
const mergeFragment = (
    current: string | null,
    { name, yaml, remove, removeModel }: SemanticLayerDraftModelInput,
): Merged => {
    if (removeModel) {
        return current === null
            ? {
                  contents: null,
                  changes: [],
                  refusals: [{ path: name, reason: 'not_found' }],
              }
            : {
                  contents: null,
                  changes: [{ path: name, action: 'removed' }],
                  refusals: [],
              };
    }
    const filename = toModelPath(name);
    const written = yaml === null ? null : parseModelFragment(name, yaml);
    const derivedFrom =
        written?.sql_from && isDerivedSqlFrom(written.sql_from)
            ? toDerivedSqlFrom(written.sql_from)
            : written?.sql_from;
    if (derivedFrom === null) {
        throw new ParameterError(
            'sql_from can only hold one SELECT statement, with no semicolons inside it',
        );
    }
    // Removals come first, so one item can give up a name and take it again.
    const removed = ((): Merged => {
        if (remove.length === 0 || current === null) {
            return {
                contents: current,
                changes: [],
                refusals: remove.map((path) => ({
                    path,
                    reason: 'not_found' as const,
                })),
            };
        }
        return removeModelParts({ contents: current, filename, paths: remove });
    })();
    if (written === null) return removed;
    const merged = applyModelFragment({
        contents: removed.contents,
        filename,
        fragment:
            derivedFrom === undefined
                ? written
                : { ...written, sql_from: derivedFrom },
    });
    return {
        contents:
            merged.changes.length > 0 ? merged.contents : removed.contents,
        changes: [...removed.changes, ...merged.changes],
        refusals: [...removed.refusals, ...merged.refusals],
    };
};

/** What one drafted item does to one model's YAML; `live` is the model as it is live, for the parts the item leaves as they are there. */
const mergeItem = (
    current: string | null,
    item: SemanticLayerDraftModelInput,
    live: string | null,
): Merged => {
    const merged = mergeFragment(current, item);
    const paths = item.restore ?? [];
    if (paths.length === 0 || merged.contents === null || live === null) {
        return merged;
    }
    const { contents, restored } = restoreModelParts({
        contents: merged.contents,
        live,
        paths,
    });
    return {
        ...merged,
        contents,
        changes: [
            ...merged.changes,
            ...restored.map(({ path, removed }) => ({
                path,
                action: removed ? ('removed' as const) : ('patched' as const),
            })),
        ],
    };
};

/** Replays draft changes in order on the given models, with no warehouse involved; results keep the shape of `changes`. */
export const foldDraft = (
    documents: Map<string, string>,
    changes: SemanticLayerDraftModelInput[][],
): {
    /** What the changes write; null content removes the model. */
    writes: Map<string, string | null>;
    results: SemanticLayerDraftItemResult[][];
} => {
    const writes = new Map<string, string | null>();
    const fold = (
        item: SemanticLayerDraftModelInput,
    ): SemanticLayerDraftItemResult => {
        const failed = (error: string): SemanticLayerDraftItemResult => ({
            model: item.name,
            status: 'failed',
            changes: [],
            refusals: [],
            error,
            notes: [],
        });
        if (!MODEL_NAME.test(item.name)) {
            return failed(
                'A model name can only use letters, numbers and underscores',
            );
        }
        try {
            const current = writes.has(item.name)
                ? (writes.get(item.name) ?? null)
                : (documents.get(item.name) ?? null);
            const {
                contents,
                changes: made,
                refusals,
            } = mergeItem(current, item, documents.get(item.name) ?? null);
            if (made.length > 0) writes.set(item.name, contents);
            return {
                model: item.name,
                status: made.length > 0 ? 'ready' : 'unchanged',
                changes: made,
                refusals,
                error: null,
                notes: [],
            };
        } catch (error) {
            return failed(getErrorMessage(error));
        }
    };
    return { results: changes.map((models) => models.map(fold)), writes };
};

/**
 * Folds a proposal on top of a draft, whole model by whole model: when any part
 * of a model's change is refused or fails, none of that model's change is kept.
 * Results keep the order of `models`.
 */
export const foldProposal = (
    documents: Map<string, string>,
    drafted: SemanticLayerDraftModelInput[][],
    models: SemanticLayerDraftModelInput[],
): {
    writes: Map<string, string | null>;
    results: SemanticLayerProposalItemResult[];
} => {
    const attempt = foldDraft(documents, [...drafted, models]);
    const attempted = attempt.results[drafted.length];
    const leftOut = new Set(
        attempted
            .filter(
                ({ status, refusals }) =>
                    status === 'failed' || refusals.length > 0,
            )
            .map(({ model }) => model),
    );
    const kept = models.filter(({ name }) => !leftOut.has(name));
    // Folded again without what is left out, so a check sees only what can join the draft.
    const { writes, results } =
        leftOut.size === 0 ? attempt : foldDraft(documents, [...drafted, kept]);
    const keptResults = results[drafted.length];
    let nextKept = 0;
    return {
        writes,
        results: attempted.map((result) => {
            if (leftOut.has(result.model)) {
                return {
                    model: result.model,
                    status: 'failed',
                    changes: [],
                    refusals: result.refusals,
                    error:
                        result.error ??
                        `None of this change to ${result.model} was added, because part of it could not be applied.`,
                    notes: [],
                };
            }
            const { model, changes } = keptResults[nextKept];
            nextKept += 1;
            return changes.length > 0
                ? {
                      model,
                      status: 'ready',
                      changes,
                      refusals: [],
                      error: null,
                      notes: [],
                  }
                : {
                      model,
                      status: 'unchanged',
                      changes: [],
                      refusals: [],
                      error: null,
                      notes: [],
                  };
        }),
    };
};

/** The documents with writes and removals on top. */
export const withWrites = (
    documents: Map<string, string>,
    writes: Map<string, string | null>,
): Map<string, string> => {
    const merged = new Map(documents);
    writes.forEach((content, name) => {
        if (content === null) merged.delete(name);
        else merged.set(name, content);
    });
    return merged;
};
