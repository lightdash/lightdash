import {
    applyModelFragment,
    diffModelDocuments,
    getErrorMessage,
    ParameterError,
    parseModelFragment,
    removeModelParts,
    restoreModelParts,
    type ApplyModelFragmentResult,
    type ModelFragmentRefusal,
    type ModelFragmentRefusalReason,
    type SemanticLayerDraftItemResult,
    type SemanticLayerDraftModelInput,
    type SemanticLayerProposalItemResult,
} from '@lightdash/common';
import { parse, stringify } from 'yaml';
import { isDerivedSqlFrom, toDerivedSqlFrom } from './derivedModel';

const MODEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const toModelPath = (modelName: string) => `models/${modelName}.yml`;

const REFUSAL_REASONS: Record<ModelFragmentRefusalReason, string> = {
    access: 'changes who can see it, which cannot be changed here.',
    name_taken: 'uses a name another field of this model already has.',
    incomplete: 'is missing what it needs, such as its type or sql.',
    invalid_filter: 'has a filter that is not a single field: value pair.',
    not_found: 'is not in the model.',
};

/** Why a part was refused, as a sentence a person or the agent can act on. */
export const describeRefusal = ({
    path,
    reason,
}: ModelFragmentRefusal): string => `${path} ${REFUSAL_REASONS[reason]}`;

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

type YamlObject = Record<string, unknown>;

const isObject = (value: unknown): value is YamlObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asObject = (value: unknown): YamlObject => (isObject(value) ? value : {});

const NAMED_LISTS = {
    dimensions: (entry: YamlObject) => entry.name,
    joins: (entry: YamlObject) => entry.alias ?? entry.join,
};

const isNamedList = (key: string): key is keyof typeof NAMED_LISTS =>
    key in NAMED_LISTS;

const findEntry = (
    list: unknown,
    key: keyof typeof NAMED_LISTS,
    id: string,
): YamlObject =>
    asObject(
        (Array.isArray(list) ? list : []).find(
            (entry) => isObject(entry) && NAMED_LISTS[key](entry) === id,
        ),
    );

/** A key the edit leaves out is written as null, which a fragment reads as removing it. */
const withKey = (into: unknown, key: string, value: unknown): YamlObject => ({
    ...asObject(into),
    [key]: value === undefined ? null : value,
});

/**
 * What turns one model's YAML into an edited version of it, as the fragments and
 * removals a draft keeps, so it replays on what is live like any other change.
 * Removals come first, so one edit can give up a name and take it again.
 */
export const toDraftEdit = (
    name: string,
    current: string,
    edited: string,
): SemanticLayerDraftModelInput[] => {
    const after = asObject(parse(edited));
    const parts = diffModelDocuments(current, edited);
    const top: YamlObject = {};
    const metrics: Record<string, YamlObject> = {};
    const entries = {
        dimensions: new Map<string, YamlObject>(),
        joins: new Map<string, YamlObject>(),
    };
    parts
        .filter(({ kind }) => kind !== 'removed')
        .forEach(({ path }) => {
            const [head, id, ...rest] = path.split('.');
            if (id === undefined) {
                Object.assign(top, withKey(top, head, after[head]));
                return;
            }
            if (head === 'metrics') {
                const definition = asObject(asObject(after.metrics)[id]);
                metrics[id] =
                    rest.length === 0
                        ? definition
                        : withKey(metrics[id], rest[0], definition[rest[0]]);
                return;
            }
            if (!isNamedList(head)) return;
            const entry = findEntry(after[head], head, id);
            const identity: YamlObject =
                head === 'dimensions'
                    ? { name: id }
                    : {
                          join: entry.join,
                          ...(entry.alias === undefined
                              ? {}
                              : { alias: entry.alias }),
                      };
            const target = entries[head].get(id) ?? identity;
            const [key, nested, nestedKey] = rest;
            if (key === undefined) {
                entries[head].set(id, { ...target, ...entry });
            } else if (nested === undefined) {
                entries[head].set(id, withKey(target, key, entry[key]));
            } else {
                const definition = asObject(asObject(entry[key])[nested]);
                const within = asObject(target[key]);
                entries[head].set(id, {
                    ...target,
                    [key]: {
                        ...within,
                        [nested]:
                            nestedKey === undefined
                                ? definition
                                : withKey(
                                      within[nested],
                                      nestedKey,
                                      definition[nestedKey],
                                  ),
                    },
                });
            }
        });
    const fragment: YamlObject = {
        ...top,
        ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
        ...Object.fromEntries(
            (['dimensions', 'joins'] as const).flatMap((key) =>
                entries[key].size > 0
                    ? [[key, [...entries[key].values()]]]
                    : [],
            ),
        ),
    };
    const remove = parts
        .filter(({ kind }) => kind === 'removed')
        .map(({ path }) => path);
    return [
        ...(remove.length > 0
            ? [{ name, yaml: null, remove, removeModel: false }]
            : []),
        ...(Object.keys(fragment).length > 0
            ? [
                  {
                      name,
                      yaml: stringify(fragment),
                      remove: [],
                      removeModel: false,
                  },
              ]
            : []),
    ];
};
