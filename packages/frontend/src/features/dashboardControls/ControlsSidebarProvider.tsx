import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    createDashboardFilterRuleFromSqlColumn,
    FilterOperator,
    isMetric,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type ResultColumn,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';
import omitBy from 'lodash/omitBy';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type FC,
    type PropsWithChildren,
    type RefObject,
    type SetStateAction,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    type DashboardFilterEditorCloseOutcome,
    type TrackingContextType,
} from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import {
    selectActiveTabUuid,
    selectControlSections,
    selectDashboardFilters,
    selectDashboardTiles,
    selectHaveFiltersChanged,
    selectRawTemporaryFilters,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import {
    getFilterRuleWithDisabledState,
    isLockedRequiredMissingValue,
} from '../dashboardFilters/FilterConfiguration/utils';
import { getLinkKey } from './linkCandidates';
import {
    getFieldCount,
    getFilterFields,
    getFilterRows,
    isSqlColumnRow,
    removeField,
    withoutDefaultTileTargets,
} from './peers';
import {
    RailContractClasses,
    type RailContractClassNames,
} from './railContractClasses';
import { countFilters } from './sections';
import {
    canKeepFilterRule,
    findFilterRule,
    haveFiltersChangedSince,
    haveOtherFilterRulesChanged,
    isDefaultValueIncomplete,
    isFilterRuleDirty,
    PLACEHOLDER_TARGET,
    applyDraft,
    removeFilterRule,
    replaceFilterRule,
    withSectionOf,
    type ControlsSidebarSnapshot,
} from './sidebarState';
import {
    ControlsSidebarContext,
    type FieldApply,
    useControlsSidebarSelector,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';
import { useEditorDismiss } from './useEditorDismiss';

// The bar's "Add", and the pills, which carry their filter id
const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
// `FilterPill` sets it
const PILL_ATTRIBUTE = 'data-controls-pill';
// The editor's Apply (or Create), the prompt's while it asks
const APPLY_SELECTOR = '[data-controls-apply]';

const findPill = (filterId: string): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>(`[${PILL_ATTRIBUTE}]`)].find(
        (element) => element.getAttribute(PILL_ATTRIBUTE) === filterId,
    ) ?? null;

// What follows once the prompt is answered: the pill clicked, a new filter
// (in a section, or null), or nothing after a click outside
type Pending =
    | { kind: 'close' }
    | { kind: 'open'; filterId: string }
    | { kind: 'new'; sectionId: string | null };

// A pending pill whose rule is gone is no question any more
const getPending = ({
    pending,
    savedFilters,
    temporaryFilters,
}: Pick<
    Latest,
    'pending' | 'savedFilters' | 'temporaryFilters'
>): Pending | null =>
    pending === null ||
    pending.kind !== 'open' ||
    findFilterRule(savedFilters, pending.filterId) !== null ||
    findFilterRule(temporaryFilters, pending.filterId) !== null
        ? pending
        : null;

const focusApply = () =>
    document.querySelector<HTMLElement>(APPLY_SELECTOR)?.focus();

// Apply, else the editor's first enabled control
const focusInEditor = () =>
    (
        document.querySelector<HTMLElement>(
            `${APPLY_SELECTOR}:not(:disabled)`,
        ) ??
        document.querySelector<HTMLElement>(
            '[data-controls-editor] [role="dialog"] input:not(:disabled), [data-controls-editor] [role="dialog"] button:not(:disabled)',
        )
    )?.focus();

// The filter whose pill takes focus back, null for "Add"
type FocusTarget = { filterId: string | null };

// Focus is a DOM matter: it moves once the editor has left the page. The bar
// reads the context through selectors, which update after the provider's own
// effects, so this is a reader too
const FocusReturn: FC<{ target: RefObject<FocusTarget | null> }> = ({
    target,
}) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    useEffect(() => {
        const current = target.current;
        if (current === null || isSidebarOpen) return;
        target.current = null;
        // A pill disabled by a refetch cannot take it
        const pill =
            current.filterId === null ? null : findPill(current.filterId);
        (pill !== null && !pill.hasAttribute('disabled')
            ? pill
            : document.querySelector<HTMLElement>(ADD_SELECTOR)
        )?.focus();
    }, [isSidebarOpen, target]);
    return null;
};

type FilterGroup = 'dimensions' | 'metrics';

// Which of the dashboard's filters an edit is on: an editor's and a viewer's
// saved ones are 'saved', a viewer's own are 'temporary'
type FilterSet = 'saved' | 'temporary';

const NO_FIELD_IDS: string[] = [];

type SidebarState = {
    filterId: string;
    isNew: boolean;
    // The mode the edit was started in: it keeps writing that mode's filters
    // until the mode change has closed it
    isViewer: boolean;
    filterSet: FilterSet;
    snapshot: ControlsSidebarSnapshot;
    // Where the control sat before its last field was removed, else null
    emptiedAt: {
        group: FilterGroup;
        index: number;
        // Null when the field it lost was not known
        fieldLabel: string | null;
    } | null;
    // Other filters the editor itself wrote since this control was opened
    touchedFilterIds: string[];
};

// What Apply or Cancel would decide: a new filter with no field yet has
// nothing to lose, and a section move is applied at once, so it is no edit
const isEditUnapplied = (
    state: SidebarState,
    isPlaceholder: boolean,
    dashboardFilters: DashboardFilters,
    toSaved: (rule: DashboardFilterRule) => DashboardFilterRule,
): boolean => {
    if (isPlaceholder) return !state.isNew;
    const { snapshot, filterId, touchedFilterIds } = state;
    const toEdited = (rule: DashboardFilterRule) =>
        omit(toSaved(rule), 'sectionId');
    return (
        isFilterRuleDirty(
            snapshot.dashboardFilters,
            dashboardFilters,
            filterId,
            toEdited,
        ) ||
        haveOtherFilterRulesChanged(
            snapshot.dashboardFilters,
            dashboardFilters,
            touchedFilterIds,
            toEdited,
        )
    );
};

const createPlaceholder = (
    id: string,
    sectionId?: string,
): DashboardFilterRule => ({
    id,
    target: PLACEHOLDER_TARGET,
    operator: FilterOperator.EQUALS,
    values: [],
    label: undefined,
    tileTargets: {},
    disabled: true,
    // No key written as undefined: the rule must equal a saved one
    ...(sectionId === undefined ? {} : { sectionId }),
});

// What the callbacks read. Kept in a ref so their identity never changes, and
// written eagerly so two calls in one event (commit a label, then close) agree.
type Latest = {
    state: SidebarState | null;
    // Asked while the edit had unapplied changes, until answered
    pending: Pending | null;
    placeholder: DashboardFilterRule | null;
    // The edit's copy of its filter set: every editor write lands here, and
    // only Apply takes it to the dashboard. Null while nothing is edited
    draft: DashboardFilters | null;
    savedFilters: DashboardFilters;
    // A viewer's own filters, as the store holds them
    temporaryFilters: DashboardFilters;
    // The temporary filters shipped code reads
    dashboardTemporaryFilters: DashboardFilters;
    setSavedFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setTemporaryFilters: Dispatch<SetStateAction<DashboardFilters>>;
    // A viewer's saved filter is written as the shipped popover writes it,
    // so the URL carries the change
    updateDimensionDashboardFilter: DashboardContextType['updateDimensionDashboardFilter'];
    updateMetricDashboardFilter: DashboardContextType['updateMetricDashboardFilter'];
    // The edit's mode, else the page's
    isViewer: boolean;
    // The page's mode, which a new edit starts in
    isPageViewer: boolean;
    isEmbedded: boolean;
    haveFiltersChanged: boolean;
    filterableFieldsByTileUuid: DashboardContextType['filterableFieldsByTileUuid'];
    dashboardTiles: Dashboard['tiles'] | undefined;
    controlSectionIds: string[];
    highlightedFieldId: string | null;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    track: TrackingContextType['track'];
    dashboardUuid: string | undefined;
    undo: ApplyUndo | null;
    waiting: Waiting | null;
    activeTabUuid: string | undefined;
};

// Where the edit's filters come from
type FilterSources = Pick<
    Latest,
    'state' | 'isPageViewer' | 'draft' | 'savedFilters' | 'temporaryFilters'
>;

const getFilterSet = ({ state, isPageViewer }: FilterSources): FilterSet =>
    state?.filterSet ?? (isPageViewer ? 'temporary' : 'saved');

// The edit's filters as the dashboard holds them now
const getStoreFilters = (current: FilterSources): DashboardFilters =>
    getFilterSet(current) === 'temporary'
        ? current.temporaryFilters
        : current.savedFilters;

// What the editor sees and writes: its draft while a filter is open
const getFilters = (current: FilterSources): DashboardFilters =>
    current.draft ?? getStoreFilters(current);

// The other set, which shipped code writes
const getOtherFilters = (current: Latest): DashboardFilters =>
    getFilterSet(current) === 'temporary'
        ? current.savedFilters
        : current.dashboardTemporaryFilters;

// Fields of the filter on no tile yet, keyed by filter so a stale entry
// never leaks into another filter
type Waiting = { filterId: string; fieldIds: string[] };

// The last "Apply to all": what Undo puts back (the rule and the fields that
// were waiting), the filters as the press left them, which tell whether the
// rule changed since, and the tab a this-tab apply was made on
type ApplyUndo = FieldApply & {
    filterId: string;
    previous: DashboardFilterRule;
    waitingFieldIds: string[];
    written: DashboardFilters;
    tabUuid: string | undefined;
};

// Undo can still take it back: same control, the rule as the press left it,
// and, for a this-tab apply, that tab in view
const isUndoLive = (
    undo: ApplyUndo,
    editingFilterId: string | undefined,
    filters: DashboardFilters,
    activeTabUuid: string | undefined,
    toSaved: (rule: DashboardFilterRule) => DashboardFilterRule,
): boolean =>
    editingFilterId === undo.filterId &&
    (undo.acrossTabs || undo.tabUuid === activeTabUuid) &&
    !isFilterRuleDirty(undo.written, filters, undo.filterId, toSaved);

const getEditingRule = (
    current: FilterSources & Pick<Latest, 'placeholder'>,
): DashboardFilterRule | null => {
    const { state, placeholder } = current;
    if (state === null) return null;
    if (placeholder !== null) return placeholder;
    // A filter taken off the dashboard from outside ends its edit
    if (
        !state.isNew &&
        findFilterRule(getStoreFilters(current), state.filterId) === null
    )
        return null;
    return findFilterRule(getFilters(current), state.filterId);
};

// What every controls event carries
const getEventBase = (current: Latest) => ({
    dashboardUuid: current.dashboardUuid,
    filtersCount: countFilters(getFilters(current)),
});

// Operator, values and tile targets come from the field or SQL column;
// identity, label and settings come from the placeholder, where it has them
const adoptPlaceholder = (
    placeholder: DashboardFilterRule,
    created: DashboardFilterRule,
): DashboardFilterRule => {
    const adopted: DashboardFilterRule = {
        ...created,
        id: placeholder.id,
        // No key written as undefined: the rule must equal a saved one
        ...omitBy(
            {
                label: placeholder.label,
                lockedTabUuids: placeholder.lockedTabUuids,
                required: placeholder.required,
                requiredGroupId: placeholder.requiredGroupId,
                sectionId: placeholder.sectionId,
                singleValue: placeholder.singleValue,
            },
            (value) => value === undefined,
        ),
    };
    // A locked filter cannot stay required once its value went with the field
    return isLockedRequiredMissingValue(adopted)
        ? { ...adopted, required: false }
        : adopted;
};

// A viewer's filter with no value reads "any value", as the shipped popover
// writes it in view mode
const asWritten = (rule: DashboardFilterRule, isViewer: boolean) =>
    isViewer ? getFilterRuleWithDisabledState(rule, false) : rule;

const getFirstFieldRule = (
    placeholder: DashboardFilterRule,
    field: DashboardFilterableField,
    filterableFieldsByTileUuid: Latest['filterableFieldsByTileUuid'],
    isViewer: boolean,
): DashboardFilterRule =>
    asWritten(
        adoptPlaceholder(
            placeholder,
            createDashboardFilterRuleFromField({
                field,
                availableTileFilters: filterableFieldsByTileUuid ?? {},
                isTemporary: isViewer,
            }),
        ),
        isViewer,
    );

type ProviderProps = PropsWithChildren<{
    /** An embed may let viewers change filters but not add them (default true). */
    canAddFilters?: boolean;
    /** The dashboard's mode where no route says it, as in an embed (default: the route's). */
    isEditMode?: boolean;
    /** An embed's public class names on the editor (default none). */
    contractClasses?: RailContractClassNames | null;
}>;

export const ControlsSidebarProvider: FC<ProviderProps> = ({
    canAddFilters = true,
    isEditMode: isEditModeInput,
    contractClasses = null,
    children,
}) => {
    // A mode change closes the edit as Apply does; in the app the header guard
    // closes it before the dashboard's own Save or Cancel.
    // Outside edit mode the editor is a viewer's: it writes temporary filters
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = isEditModeInput ?? mode === 'edit';
    const isViewer = !isEditMode;
    const isEmbedded = useIsEmbedded();
    const savedFilters = useDashboardSelector(selectDashboardFilters);
    const rawTemporaryFilters = useDashboardSelector(selectRawTemporaryFilters);
    const setSavedFilters = useDashboardContext((c) => c.setDashboardFilters);
    const setTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );
    const dashboardTemporaryFilters = useDashboardTemporaryFilters();
    const haveFiltersChanged = useDashboardSelector(selectHaveFiltersChanged);
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const savedTiles = useDashboardContext((c) => c.dashboard?.tiles);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const controlSections = useDashboardSelector(selectControlSections);
    const controlSectionIds = useMemo(
        () => controlSections.map((section) => section.id),
        [controlSections],
    );
    const { track } = useTracking();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const [dismissedLinks, setDismissedLinks] = useState<string[]>([]);

    const [state, setState] = useState<SidebarState | null>(null);
    // An edit writes the filters of the mode it started in, also in the render
    // where the mode has changed and before the change has closed it
    const isEditViewer = state?.isViewer ?? isViewer;
    const isOtherModeEdit = state !== null && state.isViewer !== isViewer;
    const [draft, setDraft] = useState<DashboardFilters | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    // Lives here, never in the dashboard filters, until it gets a mapping
    const [placeholder, setPlaceholder] = useState<DashboardFilterRule | null>(
        null,
    );
    const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(
        null,
    );
    const [undo, setUndo] = useState<ApplyUndo | null>(null);
    const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
    // The filter whose pill marked the tiles: only that pill clears them
    const tileHoverOwner = useRef<string | null>(null);
    const [waiting, setWaiting] = useState<Waiting | null>(null);

    const rendered: Latest = {
        state,
        pending,
        placeholder,
        draft,
        savedFilters,
        temporaryFilters: rawTemporaryFilters,
        dashboardTemporaryFilters,
        setSavedFilters,
        setTemporaryFilters,
        updateDimensionDashboardFilter,
        updateMetricDashboardFilter,
        isViewer: isEditViewer,
        isPageViewer: isViewer,
        isEmbedded,
        haveFiltersChanged,
        filterableFieldsByTileUuid,
        dashboardTiles,
        controlSectionIds,
        highlightedFieldId,
        setHaveFiltersChanged,
        track,
        dashboardUuid,
        undo,
        waiting,
        activeTabUuid,
    };
    const latest = useRef(rendered);
    useLayoutEffect(() => {
        latest.current = rendered;
    });
    const dashboardFilters = getFilters(rendered);
    const toSavedRule = useCallback(
        (rule: DashboardFilterRule) =>
            withoutDefaultTileTargets(
                rule,
                dashboardTiles,
                filterableFieldsByTileUuid,
            ),
        [dashboardTiles, filterableFieldsByTileUuid],
    );

    // As toSavedRule, from the latest tiles: for callbacks that never change
    const toSavedNow = useCallback(
        (rule: DashboardFilterRule) =>
            withoutDefaultTileTargets(
                rule,
                latest.current.dashboardTiles,
                latest.current.filterableFieldsByTileUuid,
            ),
        [],
    );

    // Straight to the dashboard: Apply, a removal, a section move
    const writeStore = useCallback(
        (update: (filters: DashboardFilters) => DashboardFilters) => {
            const current = latest.current;
            if (getFilterSet(current) === 'temporary') {
                current.temporaryFilters = update(current.temporaryFilters);
                current.setTemporaryFilters(update);
            } else {
                current.savedFilters = update(current.savedFilters);
                current.setSavedFilters(update);
            }
        },
        [],
    );

    const writeDraft = useCallback((next: DashboardFilters | null) => {
        latest.current.draft = next;
        setDraft(next);
    }, []);

    // What the editor may lower again: only a flag it raised itself, with the
    // other filters as they were (shipped code raises it for those too)
    const ownRaise = useRef<{ otherFilters: DashboardFilters } | null>(null);
    const writeFiltersChanged = useCallback((changed: boolean) => {
        const current = latest.current;
        if (changed && !current.haveFiltersChanged && current.state !== null) {
            ownRaise.current = { otherFilters: getOtherFilters(current) };
        }
        current.haveFiltersChanged = changed;
        current.setHaveFiltersChanged(changed);
    }, []);

    // The editor's writes: to the draft while a filter is open, else (a link
    // prompt's) to the dashboard at once
    const writeFilters = useCallback(
        (update: (filters: DashboardFilters) => DashboardFilters) => {
            const { draft: editDraft } = latest.current;
            if (editDraft === null) {
                writeStore(update);
                writeFiltersChanged(true);
                return;
            }
            writeDraft(update(editDraft));
        },
        [writeStore, writeDraft, writeFiltersChanged],
    );

    // Once the editor is done: changed when the filters differ from the
    // snapshot; unchanged only when the flag was the editor's own to lower
    const settleFiltersChanged = useCallback(
        (snapshot: ControlsSidebarSnapshot) => {
            const current = latest.current;
            const toSaved = (rule: DashboardFilterRule) =>
                withoutDefaultTileTargets(
                    rule,
                    current.dashboardTiles,
                    current.filterableFieldsByTileUuid,
                );
            if (
                haveFiltersChangedSince(
                    snapshot,
                    getStoreFilters(current),
                    toSaved,
                )
            ) {
                writeFiltersChanged(true);
                return;
            }
            if (
                ownRaise.current !== null &&
                isEqual(ownRaise.current.otherFilters, getOtherFilters(current))
            ) {
                writeFiltersChanged(false);
            }
        },
        [writeFiltersChanged],
    );

    const writePlaceholder = useCallback((next: DashboardFilterRule | null) => {
        latest.current.placeholder = next;
        setPlaceholder(next);
    }, []);

    const writeState = useCallback((next: SidebarState | null) => {
        latest.current.state = next;
        setState(next);
    }, []);

    const writePending = useCallback((next: Pending | null) => {
        latest.current.pending = next;
        setPending(next);
    }, []);

    const writeUndo = useCallback((next: ApplyUndo | null) => {
        latest.current.undo = next;
        setUndo(next);
    }, []);

    // Ends the edit, which closes the editor; the draft goes with it
    const reset = useCallback(() => {
        writeUndo(null);
        writeState(null);
        writeDraft(null);
        writePending(null);
        writePlaceholder(null);
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        setWaiting(null);
    }, [writeState, writeDraft, writePending, writePlaceholder, writeUndo]);

    // Unclicks the field and drops its hover, so the tiles go back at once
    const clearHighlightedField = useCallback(() => {
        const clicked = latest.current.highlightedFieldId;
        if (clicked === null) return;
        latest.current.highlightedFieldId = null;
        setHighlightedFieldId(null);
        setHoveredFieldId((hovered) => (hovered === clicked ? null : hovered));
        // The bar that showed its undo is gone
        writeUndo(null);
    }, [writeUndo]);

    // Where focus goes once the editor is gone: the control's pill when it
    // is on the bar, else "Add". Null while nothing asked for it
    const focusReturn = useRef<FocusTarget | null>(null);
    const rememberFocusReturn = useCallback(() => {
        const { placeholder: rule, state: editingState } = latest.current;
        // A control with no field yet was never on the bar
        focusReturn.current = {
            filterId: rule === null ? (editingState?.filterId ?? null) : null,
        };
    }, []);

    // A filter opens on a draft of its set, taken from the dashboard as it is
    const openExisting = useCallback(
        (filterId: string) => {
            const current = latest.current;
            if (current.state?.filterId === filterId) return;
            const ownSet: FilterSet = current.isPageViewer
                ? 'temporary'
                : 'saved';
            const ownFilters =
                ownSet === 'temporary'
                    ? current.temporaryFilters
                    : current.savedFilters;
            // A viewer's saved filter too; a pill removed meanwhile opens nothing
            const filterSet: FilterSet | null =
                findFilterRule(ownFilters, filterId) !== null
                    ? ownSet
                    : current.isPageViewer &&
                        findFilterRule(current.savedFilters, filterId) !== null
                      ? 'saved'
                      : null;
            if (filterSet === null) return;
            const filters =
                filterSet === 'temporary'
                    ? current.temporaryFilters
                    : current.savedFilters;
            writeUndo(null);
            focusReturn.current = null;
            ownRaise.current = null;
            writePending(null);
            writePlaceholder(null);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
            writeDraft(filters);
            writeState({
                filterId,
                isNew: false,
                isViewer: current.isPageViewer,
                filterSet,
                emptiedAt: null,
                snapshot: {
                    dashboardFilters: filters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
                touchedFilterIds: [],
            });
            if (!current.isPageViewer) {
                current.track({
                    name: EventName.DASHBOARD_FILTER_EDITOR_OPENED,
                    properties: {
                        ...getEventBase(latest.current),
                        source: 'pill',
                        isNew: false,
                    },
                });
            }
        },
        [writeState, writeDraft, writePending, writePlaceholder, writeUndo],
    );

    const openPlaceholder = useCallback(
        (sectionId?: string) => {
            const current = latest.current;
            const rule = createPlaceholder(uuidv4(), sectionId);
            writeUndo(null);
            focusReturn.current = null;
            ownRaise.current = null;
            writePending(null);
            writePlaceholder(rule);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
            const filters = getStoreFilters(current);
            writeDraft(filters);
            writeState({
                filterId: rule.id,
                isNew: true,
                isViewer: current.isPageViewer,
                filterSet: current.isPageViewer ? 'temporary' : 'saved',
                emptiedAt: null,
                snapshot: {
                    dashboardFilters: filters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
                touchedFilterIds: [],
            });
            if (!current.isPageViewer) {
                current.track({
                    name: EventName.DASHBOARD_FILTER_EDITOR_OPENED,
                    properties: {
                        ...getEventBase(latest.current),
                        source:
                            sectionId === undefined
                                ? 'add_filter'
                                : 'section_add',
                        isNew: true,
                    },
                });
            }
        },
        [writeState, writeDraft, writePending, writePlaceholder, writeUndo],
    );

    // A control that lost its last field goes back where it was. A section
    // removed meanwhile is not written back
    const writeFirstRule = useCallback(
        (adopted: DashboardFilterRule, group: FilterGroup) => {
            const { state: editingState, controlSectionIds: sectionIds } =
                latest.current;
            const rule =
                adopted.sectionId !== undefined &&
                !sectionIds.includes(adopted.sectionId)
                    ? omit(adopted, 'sectionId')
                    : adopted;
            const emptiedAt = editingState?.emptiedAt ?? null;
            const index =
                emptiedAt?.group === group ? emptiedAt.index : Infinity;
            writeFilters((filters) => ({
                ...filters,
                [group]: [
                    ...filters[group].slice(0, index),
                    rule,
                    ...filters[group].slice(index),
                ],
            }));
            writePlaceholder(null);
            if (editingState !== null && emptiedAt !== null) {
                writeState({ ...editingState, emptiedAt: null });
            }
        },
        [writeFilters, writePlaceholder, writeState],
    );

    const addFirstField = useCallback(
        (field: DashboardFilterableField) => {
            const current = latest.current;
            if (current.placeholder === null) return;
            writeFirstRule(
                getFirstFieldRule(
                    current.placeholder,
                    field,
                    current.filterableFieldsByTileUuid,
                    current.isViewer,
                ),
                isMetric(field) ? 'metrics' : 'dimensions',
            );
        },
        [writeFirstRule],
    );

    // Lands on every SQL chart tile that has the column, as "Add filter" does
    const addFirstSqlColumn = useCallback(
        (
            column: ResultColumn,
            availableTileColumns: Record<string, ResultColumn[]>,
        ) => {
            const current = latest.current;
            if (current.placeholder === null) return;
            writeFirstRule(
                asWritten(
                    adoptPlaceholder(
                        current.placeholder,
                        createDashboardFilterRuleFromSqlColumn({
                            column,
                            availableTileColumns,
                            isTemporary: current.isViewer,
                        }),
                    ),
                    current.isViewer,
                ),
                'dimensions',
            );
        },
        [writeFirstRule],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            // Any write ends the undo of the last "Apply to all"
            writeUndo(null);
            const current = latest.current;
            if (
                current.placeholder !== null &&
                current.placeholder.id === next.id
            ) {
                writePlaceholder(next);
                return;
            }
            const tiles = current.dashboardTiles;
            const fieldsByTile = current.filterableFieldsByTileUuid;
            const firstFieldId = next.target.fieldId;
            const previous = findFilterRule(getFilters(current), next.id);
            // The first field leaves when this write takes its last tile,
            // unless it is the filter's only field
            const isFirstFieldGone =
                tiles !== undefined &&
                fieldsByTile !== undefined &&
                previous !== null &&
                previous.target.fieldId === firstFieldId &&
                !isSqlColumnRow(next, firstFieldId) &&
                getFilterFields(next, tiles).length > 1 &&
                getFieldCount(previous, firstFieldId, tiles, fieldsByTile)
                    .applied > 0 &&
                getFieldCount(next, firstFieldId, tiles, fieldsByTile)
                    .applied === 0;
            const rule = isFirstFieldGone
                ? removeField(next, firstFieldId, tiles, fieldsByTile)
                : next;
            if (isFirstFieldGone && current.highlightedFieldId === firstFieldId)
                clearHighlightedField();
            // A field on a tile no longer waits, so losing that tile drops it
            const fields = new Set(getFilterFields(rule, tiles));
            setWaiting((waitingNow) =>
                waitingNow?.filterId === rule.id &&
                waitingNow.fieldIds.some((fieldId) => fields.has(fieldId))
                    ? {
                          ...waitingNow,
                          fieldIds: waitingNow.fieldIds.filter(
                              (fieldId) => !fields.has(fieldId),
                          ),
                      }
                    : waitingNow,
            );
            const shownSection = ({ sectionId }: DashboardFilterRule) =>
                sectionId !== undefined &&
                current.controlSectionIds.includes(sectionId)
                    ? sectionId
                    : null;
            if (
                current.state?.filterId === rule.id &&
                !current.state.isNew &&
                !current.state.isViewer &&
                previous !== null &&
                shownSection(previous) !== shownSection(rule)
            ) {
                current.track({
                    name: EventName.DASHBOARD_FILTERS_MOVED,
                    properties: {
                        ...getEventBase(current),
                        method: 'editor_section_select',
                        count: 1,
                        whileEditing: true,
                    },
                });
            }
            writeFilters((filters) => replaceFilterRule(filters, rule));
            // A section move is no edit: it reaches the dashboard at once
            if (
                current.draft !== null &&
                previous !== null &&
                previous.sectionId !== rule.sectionId
            ) {
                const stored = findFilterRule(
                    getStoreFilters(current),
                    rule.id,
                );
                if (stored !== null) {
                    writeStore((filters) =>
                        replaceFilterRule(filters, withSectionOf(stored, rule)),
                    );
                    writeFiltersChanged(true);
                }
            }
        },
        [
            writeFilters,
            writeStore,
            writeFiltersChanged,
            writePlaceholder,
            writeUndo,
            clearHighlightedField,
        ],
    );

    // Undo is the bar's: an apply makes one only on the clicked field
    const applyWithUndo = useCallback(
        (next: DashboardFilterRule, apply: FieldApply) => {
            const current = latest.current;
            const filterId = current.state?.filterId;
            const previous = getEditingRule(current);
            if (
                filterId === undefined ||
                current.placeholder !== null ||
                previous === null
            )
                return;
            const before = getFilters(current);
            const waitingFieldIds =
                current.waiting?.filterId === filterId
                    ? current.waiting.fieldIds
                    : [];
            const isClicked = current.highlightedFieldId === apply.fieldId;
            updateFilter(next);
            const written = getFilters(latest.current);
            // Still clicked: a field the write promoted away is unclicked
            if (
                !isClicked ||
                latest.current.highlightedFieldId !== apply.fieldId ||
                !isFilterRuleDirty(before, written, filterId, toSavedNow)
            )
                return;
            writeUndo({
                ...apply,
                filterId,
                previous,
                waitingFieldIds,
                written,
                tabUuid: current.activeTabUuid,
            });
        },
        [updateFilter, writeUndo, toSavedNow],
    );

    const undoApply = useCallback(() => {
        const current = latest.current;
        const { undo: applied } = current;
        if (
            applied === null ||
            !isUndoLive(
                applied,
                current.state?.filterId,
                getFilters(current),
                current.activeTabUuid,
                toSavedNow,
            )
        )
            return;
        updateFilter(applied.previous);
        // A waiting field the apply put on tiles waits again
        const { filterId, waitingFieldIds } = applied;
        setWaiting({ filterId, fieldIds: waitingFieldIds });
    }, [updateFilter, toSavedNow]);

    // Any other field clicked, or the field unclicked, ends the undo
    const selectField = useCallback(
        (fieldId: string | null) => {
            if (fieldId !== latest.current.undo?.fieldId) writeUndo(null);
            latest.current.highlightedFieldId = fieldId;
            setHighlightedFieldId(fieldId);
        },
        [writeUndo],
    );

    // The control stays open and empty, as a new one starts: same id, label
    // and viewer rules, none of the settings that came with the field's type
    const removeLastField = useCallback(
        (fieldLabel: string | null) => {
            const current = latest.current;
            if (current.state === null || current.placeholder !== null) return;
            const { filterId } = current.state;
            const filters = getFilters(current);
            const rule = findFilterRule(filters, filterId);
            if (rule === null) return;
            const group: FilterGroup = filters.metrics.some(
                (metric) => metric.id === filterId,
            )
                ? 'metrics'
                : 'dimensions';
            const index = filters[group].findIndex(
                (candidate) => candidate.id === filterId,
            );
            writeState({
                ...current.state,
                emptiedAt: { group, index, fieldLabel },
            });
            writeFilters((next) => removeFilterRule(next, filterId));
            writePlaceholder({
                ...createPlaceholder(filterId),
                label: rule.label,
                lockedTabUuids: rule.lockedTabUuids,
                required: rule.required,
                requiredGroupId: rule.requiredGroupId,
                sectionId: rule.sectionId,
            });
            current.highlightedFieldId = null;
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
        },
        [writeState, writeFilters, writePlaceholder],
    );

    // The editor's writes to filters other than the edited one (a required
    // alternative). Their ids are kept so Discard and Remove undo them too
    const updateOtherFilters = useCallback(
        (rules: DashboardFilterRule[]) => {
            const { state: editingState } = latest.current;
            if (editingState === null || rules.length === 0) return;
            writeUndo(null);
            const byId = new Map(rules.map((rule) => [rule.id, rule]));
            const swap = (existing: DashboardFilterRule[]) =>
                existing.map((rule) => byId.get(rule.id) ?? rule);
            writeState({
                ...editingState,
                touchedFilterIds: [
                    ...new Set([
                        ...editingState.touchedFilterIds,
                        ...byId.keys(),
                    ]),
                ],
            });
            writeFilters((filters) => ({
                ...filters,
                dimensions: swap(filters.dimensions),
                metrics: swap(filters.metrics),
            }));
        },
        [writeState, writeFilters, writeUndo],
    );

    const addWaitingField = useCallback((fieldId: string) => {
        if (latest.current.state === null) return;
        const { filterId } = latest.current.state;
        // A stale click on this field would show it clicked again once it waits
        if (latest.current.highlightedFieldId === fieldId) {
            latest.current.highlightedFieldId = null;
            setHighlightedFieldId(null);
        }
        setWaiting((current) => ({
            filterId,
            fieldIds: [
                ...new Set([
                    ...(current?.filterId === filterId ? current.fieldIds : []),
                    fieldId,
                ]),
            ],
        }));
    }, []);

    const removeWaitingField = useCallback(
        (fieldId: string) => {
            // Undo would bring the removed field back
            writeUndo(null);
            setWaiting((current) =>
                current === null
                    ? null
                    : {
                          ...current,
                          fieldIds: current.fieldIds.filter(
                              (id) => id !== fieldId,
                          ),
                      },
            );
        },
        [writeUndo],
    );

    // The context's `isDirty`, read from `latest`
    const hasUnappliedChanges = useCallback(() => {
        const current = latest.current;
        const { state: editingState, placeholder: editingPlaceholder } =
            current;
        if (editingState === null) return false;
        return isEditUnapplied(
            editingState,
            editingPlaceholder !== null,
            getFilters(current),
            toSavedNow,
        );
    }, [toSavedNow]);

    // An editor's way out of an open edit, read before it acts
    const trackClosed = useCallback(
        (outcome: DashboardFilterEditorCloseOutcome) => {
            const current = latest.current;
            if (
                current.state === null ||
                current.state.isViewer ||
                getEditingRule(current) === null
            )
                return;
            current.track({
                name: EventName.DASHBOARD_FILTER_EDITOR_CLOSED,
                properties: {
                    ...getEventBase(current),
                    outcome,
                    hadChanges: hasUnappliedChanges(),
                },
            });
        },
        [hasUnappliedChanges],
    );

    // The edited rule leaves the dashboard; the draft, with the editor's
    // writes to other rules, goes with the edit
    const removeEdited = useCallback(() => {
        const { state: editingState } = latest.current;
        if (editingState === null) return;
        rememberFocusReturn();
        const { snapshot, filterId } = editingState;
        writeStore((filters) => removeFilterRule(filters, filterId));
        settleFiltersChanged(snapshot);
        reset();
    }, [writeStore, settleFiltersChanged, reset, rememberFocusReturn]);

    // The pill's X; on the edited filter it ends the edit as well
    const removeFilterById = useCallback(
        (filterId: string) => {
            if (latest.current.state?.filterId === filterId) {
                trackClosed('remove');
                removeEdited();
                return;
            }
            const { draft: editDraft } = latest.current;
            if (editDraft !== null)
                writeDraft(removeFilterRule(editDraft, filterId));
            writeStore((filters) => removeFilterRule(filters, filterId));
            writeFiltersChanged(true);
        },
        [
            removeEdited,
            writeDraft,
            writeStore,
            writeFiltersChanged,
            trackClosed,
        ],
    );

    // Cancel: the draft is dropped. Nothing of it reached the dashboard; a
    // section move did, and stays
    const discard = useCallback(() => {
        const { state: editingState } = latest.current;
        if (editingState === null) return;
        rememberFocusReturn();
        settleFiltersChanged(editingState.snapshot);
        reset();
    }, [settleFiltersChanged, reset, rememberFocusReturn]);

    const isPlaceholder =
        state !== null && placeholder !== null && !isOtherModeEdit;
    const newTileUuids = useMemo(() => {
        if (!savedTiles || !dashboardTiles) return [];
        const saved = new Set(savedTiles.map((tile) => tile.uuid));
        return dashboardTiles
            .map((tile) => tile.uuid)
            .filter((uuid) => !saved.has(uuid));
    }, [savedTiles, dashboardTiles]);

    const dismissLink = useCallback(
        (tileUuid: string, ruleId: string) =>
            setDismissedLinks((links) => [
                ...links,
                getLinkKey(tileUuid, ruleId),
            ]),
        [],
    );

    // An edit of the other mode is not shown while the mode change closes it
    const editingRule = useMemo(
        () =>
            isOtherModeEdit
                ? null
                : getEditingRule({
                      state,
                      placeholder,
                      draft,
                      isPageViewer: isViewer,
                      savedFilters,
                      temporaryFilters: rawTemporaryFilters,
                  }),
        [
            isOtherModeEdit,
            state,
            placeholder,
            draft,
            isViewer,
            savedFilters,
            rawTemporaryFilters,
        ],
    );

    const waitingFieldIds = useMemo(() => {
        if (state === null || waiting?.filterId !== state.filterId)
            return NO_FIELD_IDS;
        const current = new Set(
            editingRule === null
                ? []
                : getFilterFields(editingRule, dashboardTiles),
        );
        return waiting.fieldIds.filter((fieldId) => !current.has(fieldId));
    }, [state, waiting, editingRule, dashboardTiles]);

    // The draft reaches the dashboard: a viewer's saved filter through the
    // shipped write (the URL override), else onto the edit's filter set
    const commitDraft = useCallback(
        (rule: DashboardFilterRule) => {
            const current = latest.current;
            const { state: editingState, draft: editDraft } = current;
            if (editingState === null || editDraft === null) return;
            if (editingState.isViewer && editingState.filterSet === 'saved') {
                const group: FilterGroup = current.savedFilters.metrics.some(
                    (metric) => metric.id === rule.id,
                )
                    ? 'metrics'
                    : 'dimensions';
                const index = current.savedFilters[group].findIndex(
                    (saved) => saved.id === rule.id,
                );
                if (index === -1) return;
                (group === 'metrics'
                    ? current.updateMetricDashboardFilter
                    : current.updateDimensionDashboardFilter)(
                    rule,
                    index,
                    false,
                    false,
                );
                current.savedFilters = replaceFilterRule(
                    current.savedFilters,
                    rule,
                );
                return;
            }
            const written = replaceFilterRule(editDraft, rule);
            writeStore((filters) =>
                applyDraft(
                    filters,
                    written,
                    editingState.filterId,
                    editingState.touchedFilterIds,
                ),
            );
        },
        [writeStore],
    );

    // Apply: the draft reaches the dashboard, once, and the edit ends
    const close = useCallback(() => {
        const current = latest.current;
        if (current.state === null) return;
        const { snapshot } = current.state;
        const rule = getEditingRule(current);
        // Something outside took the rule away: that write is kept, and
        // nothing of this edit is put back
        if (rule === null) {
            reset();
            return;
        }
        if (!canKeepFilterRule(rule)) {
            // An existing control left with no field goes as "Remove filter"
            if (!current.state.isNew) removeEdited();
            else discard();
            return;
        }
        rememberFocusReturn();
        // A new filter is created once it is kept, as the shipped bar tracks it
        if (current.state.isNew) {
            current.track({
                name: EventName.ADD_FILTER_CLICKED,
                properties: {
                    mode: !current.isViewer
                        ? 'edit'
                        : current.isEmbedded
                          ? 'embed'
                          : 'viewer',
                },
            });
        }
        const kept = isDefaultValueIncomplete(rule)
            ? { ...rule, disabled: true }
            : rule;
        // A clean edit writes nothing, so no tile reruns
        if (kept !== rule || hasUnappliedChanges()) commitDraft(kept);
        // An edit that was undone by hand leaves the dashboard unchanged
        settleFiltersChanged(snapshot);
        reset();
    }, [
        discard,
        removeEdited,
        reset,
        commitDraft,
        hasUnappliedChanges,
        settleFiltersChanged,
        rememberFocusReturn,
    ]);

    // Entering or leaving edit mode closes whatever was edited as Apply
    // would, on the filters of the mode it started in.
    // The one effect that writes: Back, the URL and an embed's mode input
    // change the mode with no event here (the header guard closes first)
    const lastIsEditMode = useRef(isEditMode);
    useEffect(() => {
        if (lastIsEditMode.current === isEditMode) return;
        lastIsEditMode.current = isEditMode;
        trackClosed('mode_change');
        close();
        // The bar of the other mode has other pills: focus stays put
        focusReturn.current = null;
        if (!isEditMode) setDismissedLinks([]);
    }, [isEditMode, close, trackClosed]);

    // A clean edit is applied first, a dirty one asks as a pill switch does.
    // A new control with no field yet stays as it is, label included; asked
    // for from a section, it moves there instead
    const openNew = useCallback(
        (sectionId?: string) => {
            const { state: editingState, placeholder: editingPlaceholder } =
                latest.current;
            if (editingState?.isNew && editingPlaceholder !== null) {
                if (sectionId !== undefined)
                    writePlaceholder({ ...editingPlaceholder, sectionId });
                return;
            }
            // A stale edit, its rule taken away from outside, just closes
            if (
                getEditingRule(latest.current) !== null &&
                hasUnappliedChanges()
            ) {
                writePending({ kind: 'new', sectionId: sectionId ?? null });
                focusApply();
                return;
            }
            trackClosed('switch');
            close();
            openPlaceholder(sectionId);
        },
        [
            close,
            hasUnappliedChanges,
            openPlaceholder,
            writePending,
            writePlaceholder,
            trackClosed,
        ],
    );

    // A pill: with nothing edited it opens. On the edited filter it closes a
    // clean edit and hands focus to Apply otherwise; another filter switches
    // a clean edit, else the editor asks first
    const open = useCallback(
        (filterId: string) => {
            const current = latest.current;
            if (current.state !== null && getEditingRule(current) !== null) {
                const isOwn = current.state.filterId === filterId;
                if (hasUnappliedChanges()) {
                    if (!isOwn) writePending({ kind: 'open', filterId });
                    focusApply();
                    return;
                }
                trackClosed(isOwn ? 'apply' : 'switch');
                close();
                if (isOwn) return;
            } else {
                // A stale edit, its rule taken away from outside
                close();
            }
            openExisting(filterId);
        },
        [close, hasUnappliedChanges, openExisting, writePending, trackClosed],
    );

    // A click outside: a clean edit closes, else the editor asks first (true)
    const requestClose = useCallback(() => {
        if (latest.current.state === null) return false;
        if (hasUnappliedChanges()) {
            writePending({ kind: 'close' });
            return true;
        }
        trackClosed('cancel');
        discard();
        return false;
    }, [discard, hasUnappliedChanges, writePending, trackClosed]);

    // The prompt's answer: Apply or Discard the edit, then open the filter
    // that was clicked, if one was
    const resolvePending = useCallback(
        (isApply: boolean) => {
            const current = latest.current;
            const next = getPending(current);
            if (next === null) return;
            if (current.state?.isViewer === false) {
                current.track({
                    name: EventName.DASHBOARD_FILTER_EDITOR_SWITCH_ANSWERED,
                    properties: {
                        ...getEventBase(current),
                        choice: isApply ? 'apply' : 'discard',
                    },
                });
            }
            trackClosed(
                next.kind !== 'close' ? 'switch' : isApply ? 'apply' : 'cancel',
            );
            if (isApply) close();
            else discard();
            switch (next.kind) {
                case 'close':
                    return;
                case 'open':
                    openExisting(next.filterId);
                    return;
                case 'new':
                    openPlaceholder(next.sectionId ?? undefined);
                    return;
                default:
                    assertUnreachable(next, 'Unknown pending step');
            }
        },
        [close, discard, openExisting, openPlaceholder, trackClosed],
    );

    // Escape: a pending question is withdrawn, else the edit is cancelled
    const dismiss = useCallback(() => {
        const current = latest.current;
        if (getPending(current) === null) {
            trackClosed('cancel');
            discard();
            return;
        }
        if (current.state?.isViewer === false) {
            current.track({
                name: EventName.DASHBOARD_FILTER_EDITOR_SWITCH_ANSWERED,
                properties: { ...getEventBase(current), choice: 'withdrawn' },
            });
        }
        writePending(null);
        // Once the question has left: it held the focus
        setTimeout(focusInEditor);
    }, [discard, writePending, trackClosed]);

    // The editor's Apply and Cancel, tracked; the provider's own ways out
    // call `close` and `discard` and track their own outcome
    const apply = useCallback(() => {
        trackClosed('apply');
        close();
    }, [close, trackClosed]);
    const cancel = useCallback(() => {
        trackClosed('cancel');
        discard();
    }, [discard, trackClosed]);

    // Derived, not reset: a rule that left the dashboard filters closes the
    // sidebar, and the next open or Add starts over
    const isSidebarOpen = state !== null && editingRule !== null;
    const isAsking =
        isSidebarOpen &&
        getPending({
            pending,
            savedFilters,
            temporaryFilters: rawTemporaryFilters,
        }) !== null;

    // Derived: only while Undo can still take it back
    const fieldUndo = useMemo(
        () =>
            undo !== null &&
            isUndoLive(
                undo,
                state?.filterId,
                dashboardFilters,
                activeTabUuid,
                toSavedRule,
            )
                ? {
                      kind: undo.kind,
                      fieldId: undo.fieldId,
                      tileCount: undo.tileCount,
                      replaced: undo.replaced,
                      acrossTabs: undo.acrossTabs,
                  }
                : null,
        [undo, state, dashboardFilters, activeTabUuid, toSavedRule],
    );
    // The clicked field, while it is one: a row of the filter, a waiting
    // field, or the field of a live undo. A clear that took it off its last
    // tile leaves it clicked only as long as that undo
    const clickedFieldId = useMemo(
        () =>
            highlightedFieldId !== null &&
            editingRule !== null &&
            (getFilterRows(editingRule, dashboardTiles).includes(
                highlightedFieldId,
            ) ||
                waitingFieldIds.includes(highlightedFieldId) ||
                fieldUndo?.fieldId === highlightedFieldId)
                ? highlightedFieldId
                : null,
        [
            highlightedFieldId,
            editingRule,
            dashboardTiles,
            waitingFieldIds,
            fieldUndo,
        ],
    );
    useEditorDismiss({
        isOpen: isSidebarOpen,
        isFieldClicked: clickedFieldId !== null,
        isAsking,
        isPristineNew: isPlaceholder && state?.isNew === true,
        clearField: clearHighlightedField,
        dismiss,
        dismissOutside: requestClose,
    });

    // Its own memo so a hover does not hand selectors a new object
    const editingFilterId = isOtherModeEdit ? null : (state?.filterId ?? null);
    const editing = useMemo(
        () => (editingFilterId === null ? null : { filterId: editingFilterId }),
        [editingFilterId],
    );

    const value = useMemo<ControlsSidebarContextValue>(
        () => ({
            editing,
            isViewer,
            canAddFilters,
            isNew: state?.isNew ?? false,
            emptiedFieldLabel: state?.emptiedAt?.fieldLabel ?? null,
            isPlaceholder,
            editingRule,
            isSidebarOpen,
            isAsking,
            resolvePending,
            newTileUuids,
            dismissedLinks,
            dismissLink,
            open,
            openNew,
            addFirstField,
            addFirstSqlColumn,
            removeLastField,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            highlightedFieldId: clickedFieldId,
            setHighlightedFieldId: selectField,
            clearHighlightedField,
            hoveredFieldId,
            setHoveredFieldId,
            tileHoverOwner,
            activeFieldId: hoveredFieldId ?? clickedFieldId,
            updateFilter,
            applyWithUndo,
            undoApply,
            fieldUndo,
            updateOtherFilters,
            removeFilterById,
            discard: cancel,
            close: apply,
            // A new filter with no field yet has nothing to lose
            isDirty:
                state !== null &&
                isEditUnapplied(
                    state,
                    isPlaceholder,
                    dashboardFilters,
                    toSavedRule,
                ),
        }),
        [
            state,
            isViewer,
            canAddFilters,
            isSidebarOpen,
            isAsking,
            resolvePending,
            editing,
            isPlaceholder,
            editingRule,
            open,
            openNew,
            addFirstField,
            addFirstSqlColumn,
            removeLastField,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            clickedFieldId,
            clearHighlightedField,
            hoveredFieldId,
            updateFilter,
            applyWithUndo,
            undoApply,
            fieldUndo,
            selectField,
            updateOtherFilters,
            removeFilterById,
            cancel,
            apply,
            dashboardFilters,
            toSavedRule,
            newTileUuids,
            dismissedLinks,
            dismissLink,
        ],
    );

    return (
        <ControlsSidebarContext.Provider value={value}>
            <RailContractClasses.Provider value={contractClasses}>
                {children}
            </RailContractClasses.Provider>
            <FocusReturn target={focusReturn} />
        </ControlsSidebarContext.Provider>
    );
};
