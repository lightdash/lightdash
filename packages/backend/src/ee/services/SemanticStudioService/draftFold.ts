import {
    applyModelFragment,
    getErrorMessage,
    ParameterError,
    parseModelFragment,
    removeModelParts,
    type ApplyModelFragmentResult,
    type SemanticLayerDraftItemResult,
    type SemanticLayerDraftModelInput,
} from '@lightdash/common';
import { isDerivedSqlFrom, toDerivedSqlFrom } from './derivedModel';

const MODEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const toModelPath = (modelName: string) => `models/${modelName}.yml`;

type Merged = Omit<ApplyModelFragmentResult, 'contents'> & {
    /** Null when the model is removed or was never there. */
    contents: string | null;
};

/** What one drafted item does to one model's YAML. */
const mergeItem = (
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
    const merged: Merged =
        written === null
            ? { contents: current, changes: [], refusals: [] }
            : applyModelFragment({
                  contents: current,
                  filename,
                  fragment:
                      derivedFrom === undefined
                          ? written
                          : { ...written, sql_from: derivedFrom },
              });
    const merging = merged.changes.length > 0 ? merged.contents : current;
    if (remove.length === 0) return merged;
    if (merging === null) {
        return {
            ...merged,
            contents: null,
            refusals: [
                ...merged.refusals,
                ...remove.map((path) => ({
                    path,
                    reason: 'not_found' as const,
                })),
            ],
        };
    }
    const removed = removeModelParts({
        contents: merging,
        filename,
        paths: remove,
    });
    return {
        contents: removed.contents,
        changes: [...merged.changes, ...removed.changes],
        refusals: [...merged.refusals, ...removed.refusals],
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
            } = mergeItem(current, item);
            if (made.length > 0) writes.set(item.name, contents);
            return {
                model: item.name,
                status: made.length > 0 ? 'ready' : 'unchanged',
                changes: made,
                refusals,
                error: null,
            };
        } catch (error) {
            return failed(getErrorMessage(error));
        }
    };
    return { results: changes.map((models) => models.map(fold)), writes };
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
