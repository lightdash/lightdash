import {
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type SemanticLayerDraft,
    type SemanticLayerDraftModel,
} from '@lightdash/common';
import { type ChangeKind } from './modelCode';
import { changedAttributes } from './modelFieldDiff';

const itemsOf = (explore: Explore) =>
    new Map(
        Object.values(explore.tables)
            .flatMap((table): (CompiledDimension | CompiledMetric)[] => [
                ...Object.values(table.dimensions),
                ...Object.values(table.metrics),
            ])
            .map((item) => [getItemId(item), item]),
    );

/** How the fields of a drafted explore differ from the live one; a null draft removes the model. */
export const diffDraftFields = (
    live: Explore,
    draft: Explore | null,
): Map<string, ChangeKind> => {
    const before = itemsOf(live);
    const after = draft ? itemsOf(draft) : new Map<string, object>();
    const states = new Map<string, ChangeKind>();
    before.forEach((item, id) => {
        const next = after.get(id);
        if (!next) states.set(id, 'removed');
        else if (changedAttributes(item, next).length > 0)
            states.set(id, 'changed');
    });
    after.forEach((_item, id) => {
        if (!before.has(id)) states.set(id, 'new');
    });
    return states;
};

/** How a draft's notices name whoever put a change live under it; another of the reader's own changes reads as theirs. */
export const describePublisher = (
    published: SemanticLayerDraftModel['publishedSince'],
): { subject: string; where: string; option: string; keepLabel: string } => {
    if (published?.isYours) {
        return {
            subject: 'You',
            where: ' from another change',
            option: 'You, in another change',
            keepLabel: 'Keep the published version',
        };
    }
    const by = published?.by ?? null;
    return {
        subject: by ?? 'Someone',
        where: '',
        option: by ?? 'Someone else',
        keepLabel: by ? `Keep ${by}'s version` : 'Keep their version',
    };
};

/** Whether the draft, or one model of it, fails its checks. */
export const cannotApply = (
    { changes, errors }: SemanticLayerDraft,
    model: string | null,
) => {
    const inScope = (name: string) => model === null || name === model;
    return (
        errors.some((error) => inScope(error.model)) ||
        changes.some((change) =>
            change.models.some(
                (entry) => inScope(entry.model) && entry.error !== null,
            ),
        )
    );
};
