import {
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
    selectDashboardFilters,
    selectDashboardTiles,
    selectHaveFiltersChanged,
    selectRawTemporaryFilters,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import {
    getFilterRuleWithDisabledState,
    hasFilterValueSet,
    isLockedRequiredMissingValue,
} from '../dashboardFilters/FilterConfiguration/utils';
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
import {
    canKeepFilterRule,
    findFilterRule,
    haveFiltersChangedSince,
    haveOtherFilterRulesChanged,
    isDefaultValueIncomplete,
    isFilterRuleDirty,
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

// The bar's "Add", and the pills, which carry their filter id. The pills are
// off the bar while the editor is open, so the pill is found once it is back
const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
// `FilterPill` sets it
const PILL_ATTRIBUTE = 'data-controls-pill';

// `FilterRow` sets it, on the rail's closed rows
const ROW_ATTRIBUTE = 'data-controls-row';

const findByAttribute = (
    attribute: string,
    filterId: string,
): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>(`[${attribute}]`)].find(
        (element) => element.getAttribute(attribute) === filterId,
    ) ?? null;

// inRail: the rail stays open, so focus goes to a row there. filterIds are
// tried in order: the filter's own, then its neighbours in the rail
type FocusTarget = { filterIds: string[]; inRail: boolean };

// Focus is a DOM matter: it moves once the editor has left the page and the
// bar has its pills again. The bar reads the context through selectors, which
// update after the provider's own effects, so this is a reader too
const FocusReturn: FC<{ target: RefObject<FocusTarget | null> }> = ({
    target,
}) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    useEffect(() => {
        const current = target.current;
        if (current === null) return;
        if (current.inRail ? isSidebarOpen : isRailOpen) return;
        target.current = null;
        const attribute = current.inRail ? ROW_ATTRIBUTE : PILL_ATTRIBUTE;
        // A pill or row disabled by a refetch cannot take it. "Add" is the
        // rail's while it is open, since the bar's is hidden then
        const element = current.filterIds
            .map((filterId) => findByAttribute(attribute, filterId))
            .find(
                (candidate) =>
                    candidate !== null && !candidate.hasAttribute('disabled'),
            );
        (element ?? document.querySelector<HTMLElement>(ADD_SELECTOR))?.focus();
    }, [isSidebarOpen, isRailOpen, target]);
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
};

const createPlaceholder = (id: string): DashboardFilterRule => ({
    id,
    target: PLACEHOLDER_TARGET,
    operator: FilterOperator.EQUALS,
    values: [],
    label: undefined,
    tileTargets: {},
    disabled: true,
});

// What the callbacks read. Kept in a ref so their identity never changes, and
// written eagerly so two calls in one event (commit a label, then close) agree.
type Latest = {
    state: SidebarState | null;
    isRailOpen: boolean;
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
    haveFiltersChanged: boolean;
    filterableFieldsByTileUuid: DashboardContextType['filterableFieldsByTileUuid'];
    dashboardTiles: Dashboard['tiles'] | undefined;
    highlightedFieldId: string | null;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    track: TrackingContextType['track'];
    undo: ApplyUndo | null;
    waiting: Waiting | null;
    activeTabUuid: string | undefined;
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
    // The rail can be open with no filter edited: every filter is a row
    const [isRailOpen, setIsRailOpen] = useState(false);
    const [hoveredFilterId, setHoveredFilterId] = useState<string | null>(null);
    const clearHoveredFilterId = useCallback((filterId: string) => {
        setHoveredFilterId((hovered) =>
            hovered === filterId ? null : hovered,
        );
    }, []);
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
    const [waiting, setWaiting] = useState<Waiting | null>(null);

    const rendered: Latest = {
        state,
        isRailOpen,
        placeholder,
        dashboardFilters,
        otherFilters,
        isViewer: isEditViewer,
        isPageViewer: isViewer,
        haveFiltersChanged,
        filterableFieldsByTileUuid,
        dashboardTiles,
        highlightedFieldId,
        setDashboardFilters,
        setHaveFiltersChanged,
        track,
        undo,
        waiting,
        activeTabUuid,
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

    const writeRailOpen = useCallback((next: boolean) => {
        latest.current.isRailOpen = next;
        setIsRailOpen(next);
    }, []);

    const writeUndo = useCallback((next: ApplyUndo | null) => {
        latest.current.undo = next;
        setUndo(next);
    }, []);

    // Ends the edit; the rail stays open on its rows
    const resetEdit = useCallback(() => {
        writeUndo(null);
        writeState(null);
        writePlaceholder(null);
        setActiveSection(null);
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        setWaiting(null);
    }, [writeState, writePlaceholder, writeUndo]);

    const reset = useCallback(() => {
        resetEdit();
        writeRailOpen(false);
        setHoveredFilterId(null);
    }, [resetEdit, writeRailOpen]);

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
    // is back on the bar, else "Add". In the rail: its row, else the next
    // row, else the one before, else "Add". Null while nothing asked for it
    const focusReturn = useRef<FocusTarget | null>(null);
    const rememberFocusReturn = useCallback((inRail: boolean) => {
        const {
            placeholder: rule,
            state: editingState,
            dashboardFilters: filters,
        } = latest.current;
        // A control with no field yet was never on the bar or a row
        const filterId =
            rule === null ? (editingState?.filterId ?? null) : null;
        if (filterId === null) {
            focusReturn.current = { filterIds: [], inRail };
            return;
        }
        const ids = [...filters.dimensions, ...filters.metrics].map(
            (filter) => filter.id,
        );
        const index = ids.indexOf(filterId);
        focusReturn.current = {
            filterIds:
                inRail && index !== -1
                    ? [
                          filterId,
                          ...ids.slice(index + 1),
                          ...ids.slice(0, index).reverse(),
                      ]
                    : [filterId],
            inRail,
        };
    }, []);

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const openExisting = useCallback(
        (filterId: string) => {
            const current = latest.current;
            if (current.state?.filterId === filterId) return;
            // A viewer edits only their own filters; saved ones keep the bar's popover
            if (
                current.isPageViewer &&
                findFilterRule(current.dashboardFilters, filterId) === null
            )
                return;
            writeUndo(null);
            focusReturn.current = null;
            ownRaise.current = null;
            writePlaceholder(null);
            setActiveSection(null);
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
            setHoveredFilterId(null);
            writeRailOpen(true);
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
            });
        },
        [writeState, writePlaceholder, writeRailOpen, writeUndo],
    );

    const openPlaceholder = useCallback(() => {
        const current = latest.current;
        const rule = createPlaceholder(uuidv4());
        writeUndo(null);
        focusReturn.current = null;
        ownRaise.current = null;
        writePlaceholder(rule);
        setActiveSection(null);
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        setWaiting(null);
        setHoveredFilterId(null);
        writeRailOpen(true);
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
        });
    }, [writeState, writePlaceholder, writeRailOpen, writeUndo]);

    // A control that lost its last field goes back where it was
    const writeFirstRule = useCallback(
        (rule: DashboardFilterRule, group: FilterGroup) => {
            const { state: editingState } = latest.current;
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

    const removeFilterById = useCallback(
        (filterId: string) => {
            writeFilters((filters) => removeFilterRule(filters, filterId));
            writeFiltersChanged(true);
        },
        [writeFilters, writeFiltersChanged],
    );

    // The edited rule goes and the editor's writes to other rules are undone;
    // what was written from outside the editor stays, and keeps it changed
    // keepRail: the rail stays open on its rows, else it closes too
    const removeEdited = useCallback(
        (keepRail: boolean) => {
            const { state: editingState } = latest.current;
            if (editingState === null) return;
            rememberFocusReturn(keepRail);
            const { snapshot, filterId, touchedFilterIds } = editingState;
            writeFilters((filters) =>
                restoreFilterRules(
                    removeFilterRule(filters, filterId),
                    snapshot.dashboardFilters,
                    touchedFilterIds,
                ),
            );
            settleFiltersChanged(snapshot);
            if (keepRail) resetEdit();
            else reset();
        },
        [
            writeFilters,
            settleFiltersChanged,
            reset,
            resetEdit,
            rememberFocusReturn,
        ],
    );
    // The rail stays open on the rows that are left
    const removeFilter = useCallback(() => removeEdited(true), [removeEdited]);

    // The edited rule goes back to its snapshot, or out when it was new, and
    // so do the other rules the editor wrote; outside writes are left alone
    const discardEdited = useCallback(
        (keepRail: boolean) => {
            const { state: editingState } = latest.current;
            if (editingState === null) return;
            rememberFocusReturn(keepRail);
            const { snapshot, filterId, touchedFilterIds } = editingState;
            writeFilters((filters) =>
                restoreFilterRules(
                    restoreFilterRule(
                        filters,
                        snapshot.dashboardFilters,
                        filterId,
                    ),
                    snapshot.dashboardFilters,
                    touchedFilterIds,
                ),
            );
            settleFiltersChanged(snapshot);
            if (keepRail) resetEdit();
            else reset();
        },
        [
            writeFilters,
            settleFiltersChanged,
            reset,
            resetEdit,
            rememberFocusReturn,
        ],
    );
    const discard = useCallback(() => discardEdited(true), [discardEdited]);

    const isPlaceholder =
        state !== null && placeholder !== null && !isOtherModeEdit;
    // The shipped bar's modes for ADD_FILTER_CLICKED, the edit's own
    const trackingMode = !isEditViewer
        ? 'edit'
        : isEmbedded
          ? 'embed'
          : 'viewer';

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

    // Keeps the edits, which already live in the dashboard draft. keepRail:
    // the filter collapses to its row and the rail stays open
    const closeEdited = useCallback(
        (keepRail: boolean) => {
            const current = latest.current;
            if (current.state === null) {
                // Nothing is edited: Done, the X and Escape close the rail itself
                if (!keepRail && current.isRailOpen) {
                    focusReturn.current = { filterIds: [], inRail: false };
                    reset();
                }
                return;
            }
            const { snapshot } = current.state;
            const rule = getEditingRule(current);
            // Something outside took the rule away: that write is kept, and
            // nothing of this edit is put back
            if (rule === null) {
                if (keepRail) resetEdit();
                else reset();
                return;
            }
            if (!canKeepFilterRule(rule)) {
                // An existing control left with no field goes as "Remove filter"
                if (!current.state.isNew) removeEdited(keepRail);
                else discardEdited(keepRail);
                return;
            }
            // As the shipped Apply: a viewer's new filter needs a value to stay
            if (
                current.state.isNew &&
                current.state.isViewer &&
                !hasFilterValueSet(rule)
            ) {
                discardEdited(keepRail);
                return;
            }
            rememberFocusReturn(keepRail);
            // A new filter is created once it is kept, as the shipped bar tracks it
            if (current.state.isNew) {
                current.track({
                    name: EventName.ADD_FILTER_CLICKED,
                    properties: { mode: trackingMode },
                });
            }
            if (isDefaultValueIncomplete(rule)) {
                writeFilters((filters) =>
                    replaceFilterRule(filters, { ...rule, disabled: true }),
                );
            }
            // An edit that was undone by hand leaves the dashboard unchanged
            settleFiltersChanged(snapshot);
            if (keepRail) resetEdit();
            else reset();
        },
        [
            discardEdited,
            removeEdited,
            reset,
            resetEdit,
            writeFilters,
            settleFiltersChanged,
            rememberFocusReturn,
            trackingMode,
        ],
    );
    const close = useCallback(() => closeEdited(false), [closeEdited]);
    const collapse = useCallback(() => closeEdited(true), [closeEdited]);

    // Entering or leaving edit mode closes whatever was edited as "Done"
    // would, on the filters of the mode it started in, and the rail with it
    const lastIsEditMode = useRef(isEditMode);
    useEffect(() => {
        if (lastIsEditMode.current === isEditMode) return;
        lastIsEditMode.current = isEditMode;
        closeEdited(false);
        // The bar of the other mode has other pills: focus stays put
        focusReturn.current = null;
        if (!isEditMode) setDismissedLinks([]);
    }, [isEditMode, closeEdited]);

    // Whatever is being edited is closed first, as "Done" would. A new
    // control with no field yet stays as it is, label included
    const openNew = useCallback(() => {
        const { state: editingState, placeholder: editingPlaceholder } =
            latest.current;
        if (editingState?.isNew && editingPlaceholder !== null) return;
        collapse();
        openPlaceholder();
    }, [collapse, openPlaceholder]);

    // The control that is open stays as it is. Any other one is closed
    // first, as "Done" would, new or not
    const open = useCallback(
        (filterId: string) => {
            if (latest.current.state?.filterId === filterId) return;
            collapse();
            openExisting(filterId);
        },
        [collapse, openExisting],
    );

    // Derived, not reset: a rule that left the dashboard filters closes the
    // sidebar, and the next open or Add starts over
    const isSidebarOpen = state !== null && editingRule !== null;

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
        isOpen: isRailOpen,
        isFieldClicked: clickedFieldId !== null,
        clearField: clearHighlightedField,
        close,
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
            isRailOpen,
            hoveredFilterId,
            setHoveredFilterId,
            clearHoveredFilterId,
            newTileUuids,
            dismissedLinks,
            dismissLink,
            activeSection,
            setActiveSection,
            open,
            openNew,
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
            activeFieldId: hoveredFieldId ?? clickedFieldId,
            updateFilter,
            applyWithUndo,
            undoApply,
            fieldUndo,
            updateOtherFilters,
            removeFilter,
            removeFilterById,
            discard,
            close,
            collapse,
            isDirty:
                state !== null &&
                (isPlaceholder ||
                    isFilterRuleDirty(
                        state.snapshot.dashboardFilters,
                        dashboardFilters,
                        state.filterId,
                        toSavedRule,
                    ) ||
                    haveOtherFilterRulesChanged(
                        state.snapshot.dashboardFilters,
                        dashboardFilters,
                        state.touchedFilterIds,
                        toSavedRule,
                    )),
        }),
        [
            state,
            isViewer,
            canAddFilters,
            isSidebarOpen,
            isRailOpen,
            hoveredFilterId,
            clearHoveredFilterId,
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
            updateFilter,
            applyWithUndo,
            undoApply,
            fieldUndo,
            selectField,
            updateOtherFilters,
            removeFilter,
            removeFilterById,
            discard,
            close,
            collapse,
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
