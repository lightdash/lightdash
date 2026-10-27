import { assertUnreachable } from '@lightdash/common';

/** The one control expanded in the rail: a filter or a date zoom. */
export type EditedControl =
    | { kind: 'filter'; filterId: string }
    | { kind: 'dateZoom'; controlUuid: string };

/** The id of the edited filter or the uuid of the edited zoom. */
export const getEditedControlId = (
    editing: EditedControl | null,
): string | null => {
    if (editing === null) return null;
    switch (editing.kind) {
        case 'filter':
            return editing.filterId;
        case 'dateZoom':
            return editing.controlUuid;
        default:
            return assertUnreachable(editing, 'Unknown edited control');
    }
};
