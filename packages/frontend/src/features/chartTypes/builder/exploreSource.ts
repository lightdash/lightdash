import { type Field } from '@lightdash/common';
import { formatDistanceToNow } from 'date-fns';
import { type PreviewSource } from './savedChartSource';

/** One visible field of the attached explore, with the label it reads by. */
export type ExploreFieldOption = {
    id: string;
    label: string;
    item: Field;
};

/** How the query over the bound inputs is going. 'idle' has nothing bound. */
export type ExploreQueryStatus =
    | 'loading'
    | 'idle'
    | 'running'
    | 'ready'
    | 'error';

/** The explore whose fields the chart inputs bind to. */
export type AttachedExplore = {
    name: string;
    /** The explore's label; its name until the explore loads. */
    label: string;
    /** Labels of the tables joined into the explore. */
    joinedTableLabels: string[];
    /** Visible fields the explore offers. */
    fieldCount: number;
    /** Distinct fields the chart inputs are bound to: the query's fields. */
    queriedFieldCount: number;
    status: ExploreQueryStatus;
    /** A run is pending or in flight; a ready run keeps its rows meanwhile. */
    isRunning: boolean;
    /** Ambient AI is choosing the inputs' fields; the query waits for it. */
    isPickingFields: boolean;
    /** Rows the latest run returned; null until one finishes. */
    rowCount: number | null;
    ranAt: Date | null;
    /** Why the explore or its query failed; null unless `status` is 'error'. */
    message: string | null;
};

/** One explore the picker handed back. */
export type PickedExplore = { name: string; label: string };

/**
 * Attaching and detaching an explore, offered wherever the author can reach
 * it: the canvas card, the composer chip and the sidebar. Which fields the
 * query selects is not an action here; the chart inputs' bindings decide it.
 */
export type ExploreSourceControls = {
    /** Changes for every attach or detach action. */
    sourceIdentity: string | null;
    attached: AttachedExplore | null;
    previewSource: PreviewSource;
    includeRows: boolean;
    setIncludeRows: (included: boolean) => void;
    attach: (explore: PickedExplore) => void;
    detach: () => void;
    viewRows: () => void;
    retry: () => void;
};

const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "Table · 42 fields, Customers joined" */
export const exploreSummary = (attached: AttachedExplore): string => {
    const joined =
        attached.joinedTableLabels.length > 0
            ? `, ${attached.joinedTableLabels.join(', ')} joined`
            : '';
    return `Table · ${plural(attached.fieldCount, 'field')}${joined}`;
};

/** The query's state after the field count, e.g. "142 rows"; null while
 *  no field is picked. */
const queryState = (attached: AttachedExplore): string | null => {
    if (attached.status === 'error') return 'query failed';
    if (attached.queriedFieldCount === 0) return null;
    if (attached.isRunning || attached.rowCount === null) {
        return 'running query';
    }
    return plural(attached.rowCount, 'row');
};

/** The composer chip: "Orders", then "Orders · 3 fields · 142 rows". */
export const exploreChipLabel = (attached: AttachedExplore): string => {
    if (attached.isPickingFields) return `${attached.label} · picking fields`;
    const state = queryState(attached);
    if (state === null) return attached.label;
    if (attached.status === 'error') return `${attached.label} · ${state}`;
    return `${attached.label} · ${plural(attached.queriedFieldCount, 'field')} · ${state}`;
};

/** The sidebar tile's meta line, e.g.
 *  "Table · 3 fields · 142 rows · ran less than a minute ago". */
export const exploreQueryMeta = (attached: AttachedExplore): string => {
    if (attached.status === 'loading') return 'Table · loading';
    if (attached.isPickingFields) return 'Table · picking fields';
    const state = queryState(attached);
    if (state === null) return 'Table · no fields picked yet';
    if (attached.status === 'error') return `Table · ${state}`;
    const ran =
        attached.ranAt !== null && !attached.isRunning
            ? ` · ran ${formatDistanceToNow(attached.ranAt, { addSuffix: true })}`
            : '';
    return `Table · ${plural(attached.queriedFieldCount, 'field')} · ${state}${ran}`;
};
