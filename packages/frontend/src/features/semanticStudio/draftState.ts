import {
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type SemanticLayerDraft,
    type SemanticLayerDraftModel,
} from '@lightdash/common';
import { isEqual, omit } from 'es-toolkit/compat';
import { type ChangeKind } from './modelCode';

const itemsOf = (explore: Explore) =>
    new Map(
        Object.values(explore.tables)
            .flatMap((table): (CompiledDimension | CompiledMetric)[] => [
                ...Object.values(table.dimensions),
                ...Object.values(table.metrics),
            ])
            // A field's position shifts when another one comes or goes.
            .map((item) => [getItemId(item), omit(item, 'index')]),
    );

/** How the fields of a drafted explore differ from the live one; a null draft removes the model. */
export const diffDraftFields = (
    live: Explore,
    draft: Explore | null,
): Map<string, ChangeKind> => {
    const before = itemsOf(live);
    const after = draft ? itemsOf(draft) : new Map<string, unknown>();
    const states = new Map<string, ChangeKind>();
    before.forEach((item, id) => {
        if (!after.has(id)) states.set(id, 'removed');
        else if (!isEqual(item, after.get(id))) states.set(id, 'changed');
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
            keepLabel: 'Keep the live version',
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
