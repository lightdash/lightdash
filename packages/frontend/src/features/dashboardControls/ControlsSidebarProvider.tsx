import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    createDashboardFilterRuleFromSqlColumn,
    FilterOperator,
    isMetric,
    type Dashboard,
    type DashboardControlSection,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DateZoomConfig,
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
import { type TrackingContextType } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import {
    selectActiveTabUuid,
    selectControlSections,
    selectDashboardFilters,
    selectDashboardTiles,
    selectHaveFiltersChanged,
    selectRawTemporaryFilters,
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
    useDashboardTemporaryFilters,
    useDefaultDateZoomGranularity,
    useHasDateZoomConfigChanged,
} from '../dashboard/store';
import {
    getFilterRuleWithDisabledState,
    hasFilterValueSet,
    isLockedRequiredMissingValue,
} from '../dashboardFilters/FilterConfiguration/utils';
import { type EditedControl } from './editedControl';
import { getLinkKey } from './linkCandidates';
import {
    getFieldCount,
    getFilterFields,
    getTileField,
    isSqlColumnRow,
    removeField,
    setTileField,
    withoutDefaultTileTargets,
} from './peers';
import {
    RailContractClasses,
    type RailContractClassNames,
} from './railContractClasses';
import { moveRuleToSection, type RuleDropTarget } from './sections';
import {
    canKeepFilterRule,
    findFilterRule,
    haveFiltersChangedSince,
    haveOtherFilterRulesChanged,
    isDefaultValueIncomplete,
    isFilterRuleDirty,
    isFilterRuleMoved,
    PLACEHOLDER_TARGET,
    removeFilterRule,
    replaceFilterRule,
    restoreFilterRule,
    restoreFilterRules,
    type ControlsSidebarSnapshot,
} from './sidebarState';
import {
    ControlsSidebarContext,
    type FieldApply,
    useControlsSidebarSelector,
    type ControlsSidebarContextValue,
    type ControlsSidebarSection,
} from './useControlsSidebar';
import { useEditorDismiss } from './useEditorDismiss';
import {
    addZoomControl,
    applyZoomEdit,
    createZoomControl,
    findZoomControl,
    getZoomTileUuids,
    isZoomDirty,
    removeZoomControl,
    restoreZoom,
    type ZoomSnapshot,
} from './zoomState';

// The bar's "Add", and the pills, which carry their filter id
const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
// `FilterPill` sets it
const PILL_ATTRIBUTE = 'data-controls-pill';
// The rail footer's Apply (or Create)
const APPLY_SELECTOR = '[data-controls-apply]';

const findPill = (filterId: string): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>(`[${PILL_ATTRIBUTE}]`)].find(
        (element) => element.getAttribute(PILL_ATTRIBUTE) === filterId,
    ) ?? null;

// A pending pill whose control is gone is no question any more
const getPending = ({
    pending,
    dashboardFilters,
    dateZoomConfig,
}: {
    pending: EditedControl | null;
    dashboardFilters: DashboardFilters;
    dateZoomConfig: DateZoomConfig;
}): EditedControl | null => {
    if (pending === null) return null;
    switch (pending.kind) {
        case 'filter':
            return findFilterRule(dashboardFilters, pending.filterId) === null
                ? null
                : pending;
        case 'dateZoom':
            return findZoomControl(dateZoomConfig, pending.controlUuid) === null
                ? null
                : pending;
        default:
            return assertUnreachable(pending, 'Unknown pending control');
    }
};

const focusApply = () =>
    document.querySelector<HTMLElement>(APPLY_SELECTOR)?.focus();

// The filter or zoom whose pill takes focus back, null for "Add"
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

const NO_FIELD_IDS: string[] = [];

type SidebarState = {
    filterId: string;
    isNew: boolean;
    // The mode the edit was started in: it keeps writing that mode's filters
    // until the mode change has closed it
    isViewer: boolean;
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
    // The bar's drag moved the edited rule, so Discard puts back its place too
    isMoved: boolean;
};

// A date zoom being edited. Never beside a filter edit
type ZoomEditState = {
    controlUuid: string;
    isNew: boolean;
    snapshot: ZoomSnapshot;
};

// As for a filter: a new zoom with no tile yet has nothing to lose
const isZoomEditUnapplied = (
    edit: ZoomEditState,
    config: DateZoomConfig,
): boolean =>
    edit.isNew && getZoomTileUuids(config, edit.controlUuid).length === 0
        ? false
        : isZoomDirty(config, edit.snapshot.dateZoomConfig, edit.controlUuid);

// What Apply or Cancel would decide: a new filter with no field yet has
// nothing to lose
const isEditUnapplied = (
    state: SidebarState,
    isPlaceholder: boolean,
    dashboardFilters: DashboardFilters,
    toSaved: (rule: DashboardFilterRule) => DashboardFilterRule,
): boolean => {
    if (isPlaceholder) return !state.isNew;
    const { snapshot, filterId, touchedFilterIds, isMoved } = state;
    return (
        isFilterRuleDirty(
            snapshot.dashboardFilters,
            dashboardFilters,
            filterId,
            toSaved,
        ) ||
        haveOtherFilterRulesChanged(
            snapshot.dashboardFilters,
            dashboardFilters,
            touchedFilterIds,
            toSaved,
        ) ||
        (isMoved &&
            isFilterRuleMoved(
                snapshot.dashboardFilters,
                dashboardFilters,
                filterId,
            ))
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
    zoomEdit: ZoomEditState | null;
    // A pill clicked while the edit had unapplied changes, until answered
    pending: EditedControl | null;
    placeholder: DashboardFilterRule | null;
    // The filters the editor writes: the dashboard's in edit mode, the
    // viewer's own temporary ones in view mode
    dashboardFilters: DashboardFilters;
    // The other set, which shipped code writes: the temporary filters in edit
    // mode, the saved ones in view mode
    otherFilters: DashboardFilters;
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
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    track: TrackingContextType['track'];
    undo: ApplyUndo | null;
    waiting: Waiting | null;
    activeTabUuid: string | undefined;
    dateZoomConfig: DateZoomConfig;
    hasDateZoomConfigChanged: boolean;
    defaultDateZoomGranularity: ReturnType<
        typeof useDefaultDateZoomGranularity
    >;
    dateZoomGranularities: ReturnType<typeof useDashboardDateZoomGranularities>;
    setDateZoomConfig: DashboardContextType['setDateZoomConfig'];
    setHasDateZoomConfigChanged: DashboardContextType['setHasDateZoomConfigChanged'];
    setControlGranularity: DashboardContextType['setControlGranularity'];
};

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

const getZoomSnapshot = (current: Latest): ZoomSnapshot => ({
    dateZoomConfig: current.dateZoomConfig,
    hasDateZoomConfigChanged: current.hasDateZoomConfigChanged,
});

const getEditingRule = ({
    state,
    placeholder,
    dashboardFilters,
}: Pick<
    Latest,
    'state' | 'placeholder' | 'dashboardFilters'
>): DashboardFilterRule | null => {
    if (state === null) return null;
    return placeholder ?? findFilterRule(dashboardFilters, state.filterId);
};

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
    /** An embed's public class names on the rail (default none). */
    contractClasses?: RailContractClassNames | null;
}>;

export const ControlsSidebarProvider: FC<ProviderProps> = ({
    canAddFilters = true,
    isEditMode: isEditModeInput,
    contractClasses = null,
    children,
}) => {
    // A mode change closes the edit as Done does; in the app the header guard
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
    const dateZoomConfig = useDashboardDateZoomConfig();
    const hasDateZoomConfigChanged = useHasDateZoomConfigChanged();
    const defaultDateZoomGranularity = useDefaultDateZoomGranularity();
    const dateZoomGranularities = useDashboardDateZoomGranularities();
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const setHasDateZoomConfigChanged = useDashboardContext(
        (c) => c.setHasDateZoomConfigChanged,
    );
    const setControlGranularity = useDashboardContext(
        (c) => c.setControlGranularity,
    );
    const { track } = useTracking();
    const [dismissedLinks, setDismissedLinks] = useState<string[]>([]);

    const [state, setState] = useState<SidebarState | null>(null);
    // An edit writes the filters of the mode it started in, also in the render
    // where the mode has changed and before the change has closed it
    const isEditViewer = state?.isViewer ?? isViewer;
    const isOtherModeEdit = state !== null && state.isViewer !== isViewer;
    const dashboardFilters = isEditViewer ? rawTemporaryFilters : savedFilters;
    const setDashboardFilters = isEditViewer
        ? setTemporaryFilters
        : setSavedFilters;
    const otherFilters = isEditViewer
        ? savedFilters
        : dashboardTemporaryFilters;
    const [zoomEdit, setZoomEdit] = useState<ZoomEditState | null>(null);
    const [pending, setPending] = useState<EditedControl | null>(null);
    // Lives here, never in the dashboard filters, until it gets a mapping
    const [placeholder, setPlaceholder] = useState<DashboardFilterRule | null>(
        null,
    );
    const [activeSection, setActiveSection] =
        useState<ControlsSidebarSection | null>(null);
    const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(
        null,
    );
    const [undo, setUndo] = useState<ApplyUndo | null>(null);
    const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
    const [hoveredFilterId, setHoveredFilterId] = useState<string | null>(null);
    // The filter whose pill marked the tiles: only that pill clears them
    const tileHoverOwner = useRef<string | null>(null);
    const [waiting, setWaiting] = useState<Waiting | null>(null);

    const rendered: Latest = {
        state,
        zoomEdit,
        pending,
        placeholder,
        dashboardFilters,
        otherFilters,
        isViewer: isEditViewer,
        isPageViewer: isViewer,
        isEmbedded,
        haveFiltersChanged,
        filterableFieldsByTileUuid,
        dashboardTiles,
        controlSectionIds,
        highlightedFieldId,
        setDashboardFilters,
        setHaveFiltersChanged,
        track,
        undo,
        waiting,
        activeTabUuid,
        dateZoomConfig,
        hasDateZoomConfigChanged,
        defaultDateZoomGranularity,
        dateZoomGranularities,
        setDateZoomConfig,
        setHasDateZoomConfigChanged,
        setControlGranularity,
    };
    const latest = useRef(rendered);
    useLayoutEffect(() => {
        latest.current = rendered;
    });
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

    const writeFilters = useCallback(
        (update: (filters: DashboardFilters) => DashboardFilters) => {
            latest.current.dashboardFilters = update(
                latest.current.dashboardFilters,
            );
            latest.current.setDashboardFilters(update);
        },
        [],
    );

    // What the editor may lower again: only a flag it raised itself, with the
    // other filters as they were (shipped code raises it for those too)
    const ownRaise = useRef<{ otherFilters: DashboardFilters } | null>(null);
    const writeFiltersChanged = useCallback((changed: boolean) => {
        const current = latest.current;
        if (changed && !current.haveFiltersChanged && current.state !== null) {
            ownRaise.current = { otherFilters: current.otherFilters };
        }
        current.haveFiltersChanged = changed;
        current.setHaveFiltersChanged(changed);
    }, []);

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
                    current.dashboardFilters,
                    toSaved,
                )
            ) {
                writeFiltersChanged(true);
                return;
            }
            if (
                ownRaise.current !== null &&
                isEqual(ownRaise.current.otherFilters, current.otherFilters)
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

    const writePending = useCallback((next: EditedControl | null) => {
        latest.current.pending = next;
        setPending(next);
    }, []);

    const writeZoomEdit = useCallback((next: ZoomEditState | null) => {
        latest.current.zoomEdit = next;
        setZoomEdit(next);
    }, []);

    const writeZoomConfig = useCallback((next: DateZoomConfig) => {
        latest.current.dateZoomConfig = next;
        latest.current.setDateZoomConfig(next);
    }, []);

    const writeUndo = useCallback((next: ApplyUndo | null) => {
        latest.current.undo = next;
        setUndo(next);
    }, []);

    // Ends the edit, which closes the rail
    const reset = useCallback(() => {
        writeUndo(null);
        writeState(null);
        writeZoomEdit(null);
        writePending(null);
        writePlaceholder(null);
        setActiveSection(null);
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        setWaiting(null);
    }, [writeState, writeZoomEdit, writePending, writePlaceholder, writeUndo]);

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

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const openExisting = useCallback(
        (filterId: string) => {
            const current = latest.current;
            if (current.state?.filterId === filterId) return;
            // Only a filter of this mode: a viewer's saved ones keep the
            // bar's popover, and a pill removed meanwhile opens nothing
            if (findFilterRule(current.dashboardFilters, filterId) === null)
                return;
            writeUndo(null);
            focusReturn.current = null;
            ownRaise.current = null;
            writePending(null);
            writeZoomEdit(null);
            writePlaceholder(null);
            setActiveSection(null);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
            writeState({
                filterId,
                isNew: false,
                isViewer: current.isPageViewer,
                emptiedAt: null,
                snapshot: {
                    dashboardFilters: current.dashboardFilters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
                touchedFilterIds: [],
                isMoved: false,
            });
        },
        [writeState, writeZoomEdit, writePending, writePlaceholder, writeUndo],
    );

    const openPlaceholder = useCallback(
        (sectionId?: string) => {
            const current = latest.current;
            const rule = createPlaceholder(uuidv4(), sectionId);
            writeUndo(null);
            focusReturn.current = null;
            ownRaise.current = null;
            writePending(null);
            writeZoomEdit(null);
            writePlaceholder(rule);
            setActiveSection(null);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
            writeState({
                filterId: rule.id,
                isNew: true,
                isViewer: current.isPageViewer,
                emptiedAt: null,
                snapshot: {
                    dashboardFilters: current.dashboardFilters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
                touchedFilterIds: [],
                isMoved: false,
            });
        },
        [writeState, writeZoomEdit, writePending, writePlaceholder, writeUndo],
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
            writeFiltersChanged(true);
            writePlaceholder(null);
            if (editingState !== null && emptiedAt !== null) {
                writeState({ ...editingState, emptiedAt: null });
            }
        },
        [writeFilters, writeFiltersChanged, writePlaceholder, writeState],
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

    const addFirstFieldOnTile = useCallback(
        (field: DashboardFilterableField, tileUuid: string) => {
            const current = latest.current;
            if (current.placeholder === null) return;
            const fieldsByTile = current.filterableFieldsByTileUuid;
            // What each tile offers is not known: leaving them out would be blind
            if (fieldsByTile === undefined) return;
            const base = getFirstFieldRule(
                current.placeholder,
                field,
                fieldsByTile,
                current.isViewer,
            );
            // Every tile the rule would filter is left out, except the clicked
            // one, which is put on the field when the default does not do it
            const rule = (current.dashboardTiles ?? []).reduce(
                (next, tile) =>
                    tile.uuid === tileUuid
                        ? setTileField(next, tile, base.target, fieldsByTile)
                        : getTileField(next, tile, fieldsByTile) === null
                          ? next
                          : setTileField(next, tile, null, fieldsByTile),
                base,
            );
            writeFirstRule(rule, isMetric(field) ? 'metrics' : 'dimensions');
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
            const previous = findFilterRule(current.dashboardFilters, next.id);
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
            writeFilters((filters) => replaceFilterRule(filters, rule));
            writeFiltersChanged(true);
        },
        [
            writeFilters,
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
            const before = current.dashboardFilters;
            const waitingFieldIds =
                current.waiting?.filterId === filterId
                    ? current.waiting.fieldIds
                    : [];
            const isClicked = current.highlightedFieldId === apply.fieldId;
            updateFilter(next);
            const written = latest.current.dashboardFilters;
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
                current.dashboardFilters,
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
            const rule = findFilterRule(current.dashboardFilters, filterId);
            if (rule === null) return;
            const group: FilterGroup = current.dashboardFilters.metrics.some(
                (metric) => metric.id === filterId,
            )
                ? 'metrics'
                : 'dimensions';
            const index = current.dashboardFilters[group].findIndex(
                (candidate) => candidate.id === filterId,
            );
            writeState({
                ...current.state,
                emptiedAt: { group, index, fieldLabel },
            });
            writeFilters((filters) => removeFilterRule(filters, filterId));
            writeFiltersChanged(true);
            writePlaceholder({
                ...createPlaceholder(filterId),
                label: rule.label,
                lockedTabUuids: rule.lockedTabUuids,
                required: rule.required,
                requiredGroupId: rule.requiredGroupId,
                sectionId: rule.sectionId,
            });
            setActiveSection(null);
            current.highlightedFieldId = null;
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
        },
        [writeState, writeFilters, writeFiltersChanged, writePlaceholder],
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
            writeFiltersChanged(true);
        },
        [writeState, writeFilters, writeFiltersChanged, writeUndo],
    );

    // The bar's drag of the edited filter: an edit like its Section select,
    // so Discard puts back its section and its place
    const moveEditedFilter = useCallback(
        (over: RuleDropTarget, sections: DashboardControlSection[]) => {
            const { state: editingState, dashboardFilters: filters } =
                latest.current;
            if (editingState === null) return;
            const moved = moveRuleToSection(
                filters,
                editingState.filterId,
                over,
                sections,
            );
            if (moved === filters) return;
            writeUndo(null);
            writeState({ ...editingState, isMoved: true });
            writeFilters(() => moved);
            writeFiltersChanged(true);
        },
        [writeState, writeFilters, writeFiltersChanged, writeUndo],
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

    // The edited rule goes and the editor's writes to other rules are undone;
    // what was written from outside the editor stays, and keeps it changed
    const removeEdited = useCallback(() => {
        const { state: editingState } = latest.current;
        if (editingState === null) return;
        rememberFocusReturn();
        const { snapshot, filterId, touchedFilterIds } = editingState;
        writeFilters((filters) =>
            restoreFilterRules(
                removeFilterRule(filters, filterId),
                snapshot.dashboardFilters,
                touchedFilterIds,
            ),
        );
        settleFiltersChanged(snapshot);
        reset();
    }, [writeFilters, settleFiltersChanged, reset, rememberFocusReturn]);

    // The pill's X; on the edited filter it ends the edit as well
    const removeFilterById = useCallback(
        (filterId: string) => {
            if (latest.current.state?.filterId === filterId) {
                removeEdited();
                return;
            }
            writeFilters((filters) => removeFilterRule(filters, filterId));
            writeFiltersChanged(true);
        },
        [removeEdited, writeFilters, writeFiltersChanged],
    );

    // The edited rule goes back to its snapshot, or out when it was new, and
    // so do the other rules the editor wrote; outside writes are left alone
    const discardFilter = useCallback(() => {
        const { state: editingState } = latest.current;
        if (editingState === null) return;
        rememberFocusReturn();
        const { snapshot, filterId, touchedFilterIds, isMoved } = editingState;
        writeFilters((filters) =>
            restoreFilterRules(
                restoreFilterRule(
                    // Out first, so it goes back in at the snapshot's place
                    isMoved ? removeFilterRule(filters, filterId) : filters,
                    snapshot.dashboardFilters,
                    filterId,
                ),
                snapshot.dashboardFilters,
                touchedFilterIds,
            ),
        );
        settleFiltersChanged(snapshot);
        reset();
    }, [writeFilters, settleFiltersChanged, reset, rememberFocusReturn]);

    // A zoom's edit is done: the "changed" flag goes back to what it was when
    // the zoom opened, but only when the config is back to that too
    const settleZoomChanged = useCallback((snapshot: ZoomSnapshot) => {
        const current = latest.current;
        if (!isEqual(current.dateZoomConfig, snapshot.dateZoomConfig)) return;
        current.hasDateZoomConfigChanged = snapshot.hasDateZoomConfigChanged;
        current.setHasDateZoomConfigChanged(snapshot.hasDateZoomConfigChanged);
    }, []);

    // The edited zoom and the tiles it touched go back to the snapshot, or
    // out when it was new; every other write stays
    const discardZoom = useCallback(() => {
        const { zoomEdit: edit, dateZoomConfig: config } = latest.current;
        if (edit === null) return;
        focusReturn.current = {
            filterId: edit.isNew ? null : edit.controlUuid,
        };
        writeZoomConfig(
            restoreZoom(config, edit.snapshot.dateZoomConfig, edit.controlUuid),
        );
        settleZoomChanged(edit.snapshot);
        reset();
    }, [writeZoomConfig, settleZoomChanged, reset]);

    // Apply on a zoom: a new one with no tile is dropped, as a filter with no
    // field; an emptied name and zooms left with no tiles are settled
    const closeZoom = useCallback(() => {
        const { zoomEdit: edit, dateZoomConfig: config } = latest.current;
        if (edit === null) return;
        // Something outside took it away: that write is kept
        if (findZoomControl(config, edit.controlUuid) === null) {
            reset();
            return;
        }
        if (
            edit.isNew &&
            getZoomTileUuids(config, edit.controlUuid).length === 0
        ) {
            discardZoom();
            return;
        }
        focusReturn.current = { filterId: edit.controlUuid };
        const applied = applyZoomEdit(
            config,
            edit.snapshot.dateZoomConfig,
            edit.controlUuid,
        );
        if (applied !== config) writeZoomConfig(applied);
        settleZoomChanged(edit.snapshot);
        reset();
    }, [discardZoom, writeZoomConfig, settleZoomChanged, reset]);

    // As the X on an edited filter's pill: the zoom and its tiles leave the
    // draft and the edit ends. Tiles moved here go back to their zoom first.
    // A new zoom leaves through Cancel
    const removeZoom = useCallback(() => {
        const { zoomEdit: edit, dateZoomConfig: config } = latest.current;
        if (edit === null || edit.isNew) return;
        focusReturn.current = { filterId: null };
        writeZoomConfig(
            removeZoomControl(
                restoreZoom(
                    config,
                    edit.snapshot.dateZoomConfig,
                    edit.controlUuid,
                ),
                edit.controlUuid,
            ),
        );
        settleZoomChanged(edit.snapshot);
        reset();
    }, [writeZoomConfig, settleZoomChanged, reset]);

    const discard = useCallback(() => {
        if (latest.current.zoomEdit !== null) discardZoom();
        else discardFilter();
    }, [discardZoom, discardFilter]);

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
                      dashboardFilters,
                  }),
        [isOtherModeEdit, state, placeholder, dashboardFilters],
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

    // Apply: keeps the edits, which already live in the dashboard draft
    const closeFilter = useCallback(() => {
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
            else discardFilter();
            return;
        }
        // As the shipped Apply: a viewer's new filter needs a value to stay
        if (
            current.state.isNew &&
            current.state.isViewer &&
            !hasFilterValueSet(rule)
        ) {
            discardFilter();
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
        if (isDefaultValueIncomplete(rule)) {
            writeFilters((filters) =>
                replaceFilterRule(filters, { ...rule, disabled: true }),
            );
        }
        // An edit that was undone by hand leaves the dashboard unchanged
        settleFiltersChanged(snapshot);
        reset();
    }, [
        discardFilter,
        removeEdited,
        reset,
        writeFilters,
        settleFiltersChanged,
        rememberFocusReturn,
    ]);

    const close = useCallback(() => {
        if (latest.current.zoomEdit !== null) closeZoom();
        else closeFilter();
    }, [closeZoom, closeFilter]);

    // Entering or leaving edit mode closes whatever was edited as Apply
    // would, on the filters of the mode it started in.
    // The one effect that writes: Back, the URL and an embed's mode input
    // change the mode with no event here (the header guard closes first)
    const lastIsEditMode = useRef(isEditMode);
    useEffect(() => {
        if (lastIsEditMode.current === isEditMode) return;
        lastIsEditMode.current = isEditMode;
        close();
        // The bar of the other mode has other pills: focus stays put
        focusReturn.current = null;
        if (!isEditMode) setDismissedLinks([]);
    }, [isEditMode, close]);

    // Whatever is being edited is applied first. A new control with no field
    // yet stays as it is, label included; asked for from a section, it moves
    // there instead
    const openNew = useCallback(
        (sectionId?: string) => {
            const { state: editingState, placeholder: editingPlaceholder } =
                latest.current;
            if (editingState?.isNew && editingPlaceholder !== null) {
                if (sectionId !== undefined)
                    writePlaceholder({ ...editingPlaceholder, sectionId });
                return;
            }
            close();
            openPlaceholder(sectionId);
        },
        [close, openPlaceholder, writePlaceholder],
    );

    // The context's `isDirty`, read from `latest`
    const hasUnappliedChanges = useCallback(() => {
        const current = latest.current;
        const { state: editingState, placeholder: editingPlaceholder } =
            current;
        if (current.zoomEdit !== null)
            return isZoomEditUnapplied(
                current.zoomEdit,
                current.dateZoomConfig,
            );
        if (editingState === null) return false;
        return isEditUnapplied(
            editingState,
            editingPlaceholder !== null,
            current.dashboardFilters,
            toSavedNow,
        );
    }, [toSavedNow]);

    // A zoom from its snapshot of the config. Opening it drops the viewer's
    // grain for it, which would win over the one being edited
    const openZoomEdit = useCallback(
        (controlUuid: string, isNew: boolean, snapshot: ZoomSnapshot) => {
            writeUndo(null);
            focusReturn.current = null;
            ownRaise.current = null;
            writePending(null);
            writeState(null);
            writePlaceholder(null);
            setActiveSection(null);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
            writeZoomEdit({ controlUuid, isNew, snapshot });
            latest.current.setControlGranularity(controlUuid, undefined);
        },
        [writeUndo, writePending, writeState, writePlaceholder, writeZoomEdit],
    );

    // The edit's pill, filter or zoom, if it still has its control
    const getLiveEdit = useCallback((): EditedControl | null => {
        const current = latest.current;
        if (current.zoomEdit !== null)
            return findZoomControl(
                current.dateZoomConfig,
                current.zoomEdit.controlUuid,
            ) === null
                ? null
                : {
                      kind: 'dateZoom',
                      controlUuid: current.zoomEdit.controlUuid,
                  };
        if (current.state !== null && getEditingRule(current) !== null)
            return { kind: 'filter', filterId: current.state.filterId };
        return null;
    }, []);

    const openControl = useCallback(
        (target: EditedControl) => {
            switch (target.kind) {
                case 'filter':
                    openExisting(target.filterId);
                    return;
                case 'dateZoom':
                    if (
                        findZoomControl(
                            latest.current.dateZoomConfig,
                            target.controlUuid,
                        ) !== null
                    )
                        openZoomEdit(
                            target.controlUuid,
                            false,
                            getZoomSnapshot(latest.current),
                        );
                    return;
                default:
                    assertUnreachable(target, 'Unknown control');
            }
        },
        [openExisting, openZoomEdit],
    );

    // A pill: with nothing edited it opens. On the edited control it closes a
    // clean edit and hands focus to Apply otherwise; another control switches
    // a clean edit, else the footer asks first
    const switchTo = useCallback(
        (target: EditedControl) => {
            const live = getLiveEdit();
            if (live !== null) {
                const isOwn = isEqual(live, target);
                if (hasUnappliedChanges()) {
                    if (!isOwn) writePending(target);
                    focusApply();
                    return;
                }
                close();
                if (isOwn) return;
            } else {
                // A stale edit, its control taken away from outside
                close();
            }
            openControl(target);
        },
        [close, getLiveEdit, hasUnappliedChanges, openControl, writePending],
    );

    const open = useCallback(
        (filterId: string) => switchTo({ kind: 'filter', filterId }),
        [switchTo],
    );

    // Date zooms are the dashboard's: a viewer never edits one
    const openZoom = useCallback(
        (controlUuid: string) => {
            if (latest.current.isPageViewer) return;
            switchTo({ kind: 'dateZoom', controlUuid });
        },
        [switchTo],
    );

    // As `openNew`: whatever is edited is applied first, and a new zoom with
    // no tile yet stays as it is. Seeded as the shipped "Add date zoom" seeds
    // one, and in the config at once so its tiles can join it
    const openNewZoom = useCallback(() => {
        const {
            isPageViewer,
            zoomEdit: edit,
            dateZoomConfig: config,
        } = latest.current;
        if (isPageViewer) return;
        if (
            edit?.isNew &&
            findZoomControl(config, edit.controlUuid) !== null &&
            getZoomTileUuids(config, edit.controlUuid).length === 0
        )
            return;
        close();
        const snapshot = getZoomSnapshot(latest.current);
        const current = latest.current;
        const control = createZoomControl(
            uuidv4(),
            current.defaultDateZoomGranularity,
            current.dateZoomGranularities,
        );
        writeZoomConfig(addZoomControl(current.dateZoomConfig, control));
        openZoomEdit(control.uuid, true, snapshot);
    }, [close, openZoomEdit, writeZoomConfig]);

    // Live writes, so the tiles preview the zoom; only while one is edited
    const updateDateZoomConfig = useCallback(
        (next: DateZoomConfig) => {
            if (latest.current.zoomEdit === null) return;
            writeZoomConfig(next);
        },
        [writeZoomConfig],
    );

    // The footer's answer to a pending pill: Apply or Discard the edit, then
    // open the control that was clicked
    const resolvePending = useCallback(
        (isApply: boolean) => {
            const next = getPending(latest.current);
            if (next === null) return;
            if (isApply) close();
            else discard();
            openControl(next);
        },
        [close, discard, openControl],
    );

    // Escape: a pending question is withdrawn, else the edit is cancelled
    const dismiss = useCallback(() => {
        if (getPending(latest.current) === null) {
            discard();
            return;
        }
        writePending(null);
        focusApply();
    }, [discard, writePending]);

    // A zoom's edit belongs to edit mode: hidden once the mode has changed
    const editingZoom = useMemo(
        () =>
            zoomEdit === null || isViewer
                ? null
                : findZoomControl(dateZoomConfig, zoomEdit.controlUuid),
        [zoomEdit, isViewer, dateZoomConfig],
    );

    // Derived, not reset: a rule or zoom that left the dashboard closes the
    // sidebar, and the next open or Add starts over
    const isSidebarOpen =
        (state !== null && editingRule !== null) || editingZoom !== null;
    const livePending = getPending({
        pending,
        dashboardFilters,
        dateZoomConfig,
    });
    const pendingRule = useMemo(
        () =>
            livePending?.kind === 'filter'
                ? findFilterRule(dashboardFilters, livePending.filterId)
                : null,
        [livePending, dashboardFilters],
    );
    const pendingZoom = useMemo(
        () =>
            livePending?.kind === 'dateZoom'
                ? findZoomControl(dateZoomConfig, livePending.controlUuid)
                : null,
        [livePending, dateZoomConfig],
    );

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
    // The clicked field, while it is one: a field of the filter, a waiting
    // field, or the field of a live undo. A clear that took it off its last
    // tile leaves it clicked only as long as that undo
    const clickedFieldId = useMemo(
        () =>
            highlightedFieldId !== null &&
            editingRule !== null &&
            (getFilterFields(editingRule, dashboardTiles).includes(
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
        clearField: clearHighlightedField,
        dismiss,
    });

    // Its own memo so a hover does not hand selectors a new object
    const editingFilterId = isOtherModeEdit ? null : (state?.filterId ?? null);
    const editingZoomUuid = editingZoom?.uuid ?? null;
    const editing = useMemo<EditedControl | null>(() => {
        if (editingFilterId !== null)
            return { kind: 'filter', filterId: editingFilterId };
        if (editingZoomUuid !== null)
            return { kind: 'dateZoom', controlUuid: editingZoomUuid };
        return null;
    }, [editingFilterId, editingZoomUuid]);

    const value = useMemo<ControlsSidebarContextValue>(
        () => ({
            editing,
            isViewer,
            canAddFilters,
            isNew: state?.isNew ?? zoomEdit?.isNew ?? false,
            emptiedFieldLabel: state?.emptiedAt?.fieldLabel ?? null,
            isPlaceholder,
            editingRule,
            editingZoom,
            isSidebarOpen,
            pendingRule,
            pendingZoom,
            resolvePending,
            newTileUuids,
            dismissedLinks,
            dismissLink,
            activeSection,
            setActiveSection,
            open,
            openNew,
            openZoom,
            openNewZoom,
            updateDateZoomConfig,
            removeZoom,
            addFirstField,
            addFirstSqlColumn,
            addFirstFieldOnTile,
            removeLastField,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            highlightedFieldId: clickedFieldId,
            setHighlightedFieldId: selectField,
            clearHighlightedField,
            hoveredFieldId,
            setHoveredFieldId,
            hoveredFilterId,
            setHoveredFilterId,
            tileHoverOwner,
            activeFieldId: hoveredFieldId ?? clickedFieldId,
            updateFilter,
            applyWithUndo,
            undoApply,
            fieldUndo,
            updateOtherFilters,
            moveEditedFilter,
            removeFilterById,
            discard,
            close,
            // A new filter with no field yet has nothing to lose
            isDirty:
                zoomEdit !== null
                    ? isZoomEditUnapplied(zoomEdit, dateZoomConfig)
                    : state !== null &&
                      isEditUnapplied(
                          state,
                          isPlaceholder,
                          dashboardFilters,
                          toSavedRule,
                      ),
        }),
        [
            state,
            zoomEdit,
            dateZoomConfig,
            editingZoom,
            pendingZoom,
            openZoom,
            openNewZoom,
            updateDateZoomConfig,
            removeZoom,
            isViewer,
            canAddFilters,
            isSidebarOpen,
            pendingRule,
            resolvePending,
            editing,
            isPlaceholder,
            editingRule,
            activeSection,
            open,
            openNew,
            addFirstField,
            addFirstSqlColumn,
            addFirstFieldOnTile,
            removeLastField,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            clickedFieldId,
            clearHighlightedField,
            hoveredFieldId,
            hoveredFilterId,
            updateFilter,
            applyWithUndo,
            undoApply,
            fieldUndo,
            selectField,
            updateOtherFilters,
            moveEditedFilter,
            removeFilterById,
            discard,
            close,
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
