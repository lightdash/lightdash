import {
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
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
