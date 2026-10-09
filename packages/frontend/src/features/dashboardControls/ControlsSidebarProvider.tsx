import {
    createDashboardFilterRuleFromField,
    createDashboardFilterRuleFromSqlColumn,
    FilterOperator,
    isMetric,
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
    type SetStateAction,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type TrackingContextType } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { getLinkKey } from './linkCandidates';
import { getFilterFields, getTileField, setTileField } from './peers';
import { isLockedRequiredMissingValue } from './requirements';
import {
    canKeepFilterRule,
    findFilterRule,
    haveFiltersChangedSince,
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
    type ControlsSidebarContextValue,
    type ControlsSidebarSection,
} from './useControlsSidebar';
import { EDITOR_ATTRIBUTE, useEditorDismiss } from './useEditorDismiss';

// The bar's "Add", and the pill of the control being edited: the pressed
// button nearest to "Add" that is not in the editor or on a tile
const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
const EDITED_PILL_SELECTOR = 'button[aria-pressed="true"]';
const NOT_A_PILL_SELECTOR = `[${EDITOR_ATTRIBUTE}], [data-tile-uuid]`;

const findEditedPill = (
    scope: Element | null = document.querySelector(ADD_SELECTOR),
): HTMLElement | null => {
    if (scope === null) return null;
    const pill = [
        ...scope.querySelectorAll<HTMLElement>(EDITED_PILL_SELECTOR),
    ].find((button) => button.closest(NOT_A_PILL_SELECTOR) === null);
    return pill ?? findEditedPill(scope.parentElement);
};

type FilterGroup = 'dimensions' | 'metrics';

const NO_FIELD_IDS: string[] = [];

type SidebarState = {
    filterId: string;
    isNew: boolean;
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
    placeholder: DashboardFilterRule | null;
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    haveFiltersChanged: boolean;
    filterableFieldsByTileUuid: DashboardContextType['filterableFieldsByTileUuid'];
    dashboardTiles: DashboardContextType['dashboardTiles'];
    highlightedFieldId: string | null;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    track: TrackingContextType['track'];
};

// `written` is the rule a first field just made: it stands in until the
// dashboard filters hold it, so "not visible yet" never reads as "gone"
const getEditingRule = (
    {
        state,
        placeholder,
        dashboardFilters,
    }: Pick<Latest, 'state' | 'placeholder' | 'dashboardFilters'>,
    written: DashboardFilterRule | null,
): DashboardFilterRule | null => {
    if (state === null) return null;
    return (
        placeholder ??
        findFilterRule(dashboardFilters, state.filterId) ??
        (written?.id === state.filterId ? written : null)
    );
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

const getFirstFieldRule = (
    placeholder: DashboardFilterRule,
    field: DashboardFilterableField,
    filterableFieldsByTileUuid: Latest['filterableFieldsByTileUuid'],
): DashboardFilterRule =>
    adoptPlaceholder(
        placeholder,
        createDashboardFilterRuleFromField({
            field,
            availableTileFilters: filterableFieldsByTileUuid ?? {},
            isTemporary: false,
        }),
    );

export const ControlsSidebarProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const savedTiles = useDashboardContext((c) => c.dashboard?.tiles);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const { track } = useTracking();
    const [dismissedLinks, setDismissedLinks] = useState<string[]>([]);

    const [state, setState] = useState<SidebarState | null>(null);
    // Lives here, never in the dashboard filters, until it gets a mapping
    const [placeholder, setPlaceholder] = useState<DashboardFilterRule | null>(
        null,
    );
    const [activeSection, setActiveSection] =
        useState<ControlsSidebarSection>('fields');
    const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(
        null,
    );
    const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
    // Keyed by filter so a stale entry never leaks into another filter
    const [waiting, setWaiting] = useState<{
        filterId: string;
        fieldIds: string[];
    } | null>(null);
    // The rule a first field wrote, until the dashboard filters hold it
    const [writtenRule, setWrittenRule] = useState<DashboardFilterRule | null>(
        null,
    );
    if (
        writtenRule !== null &&
        findFilterRule(dashboardFilters, writtenRule.id) !== null
    ) {
        setWrittenRule(null);
    }

    const rendered: Latest = {
        state,
        placeholder,
        dashboardFilters,
        dashboardTemporaryFilters,
        haveFiltersChanged,
        filterableFieldsByTileUuid,
        dashboardTiles,
        highlightedFieldId,
        setDashboardFilters,
        setHaveFiltersChanged,
        track,
    };
    const latest = useRef(rendered);
    useLayoutEffect(() => {
        latest.current = rendered;
    });

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
    // temporary filters as they were (shipped code raises it for those too)
    const ownRaise = useRef<{ temporaryFilters: DashboardFilters } | null>(
        null,
    );
    const writeFiltersChanged = useCallback((changed: boolean) => {
        const current = latest.current;
        if (changed && !current.haveFiltersChanged && current.state !== null) {
            ownRaise.current = {
                temporaryFilters: current.dashboardTemporaryFilters,
            };
        }
        current.haveFiltersChanged = changed;
        current.setHaveFiltersChanged(changed);
    }, []);

    // Once the editor is done: changed when the filters differ from the
    // snapshot; unchanged only when the flag was the editor's own to lower
    const settleFiltersChanged = useCallback(
        (snapshot: ControlsSidebarSnapshot) => {
            const current = latest.current;
            if (haveFiltersChangedSince(snapshot, current.dashboardFilters)) {
                writeFiltersChanged(true);
                return;
            }
            if (
                ownRaise.current !== null &&
                isEqual(
                    ownRaise.current.temporaryFilters,
                    current.dashboardTemporaryFilters,
                )
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

    const reset = useCallback(() => {
        writeState(null);
        writePlaceholder(null);
        setActiveSection('fields');
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        setWaiting(null);
        setWrittenRule(null);
    }, [writeState, writePlaceholder]);

    // Unclicks the field and drops its hover, so the tiles go back at once
    const clearHighlightedField = useCallback(() => {
        const clicked = latest.current.highlightedFieldId;
        if (clicked === null) return;
        latest.current.highlightedFieldId = null;
        setHighlightedFieldId(null);
        setHoveredFieldId((hovered) => (hovered === clicked ? null : hovered));
    }, []);

    // Where focus goes once the editor is gone: the pill when it is still
    // there, else "Add". Null while nothing asked for it
    const focusReturn = useRef<{ pill: HTMLElement | null } | null>(null);
    const rememberFocusReturn = useCallback(() => {
        // A control with no field yet was never on the bar
        focusReturn.current = {
            pill: latest.current.placeholder === null ? findEditedPill() : null,
        };
    }, []);

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const openExisting = useCallback(
        (filterId: string) => {
            const current = latest.current;
            if (current.state?.filterId === filterId) return;
            focusReturn.current = null;
            ownRaise.current = null;
            writePlaceholder(null);
            setActiveSection('fields');
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setWaiting(null);
            writeState({
                filterId,
                isNew: false,
                emptiedAt: null,
                snapshot: {
                    dashboardFilters: current.dashboardFilters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
                touchedFilterIds: [],
            });
        },
        [writeState, writePlaceholder],
    );

    const openPlaceholder = useCallback(() => {
        const current = latest.current;
        const rule = createPlaceholder(uuidv4());
        focusReturn.current = null;
        ownRaise.current = null;
        writePlaceholder(rule);
        setActiveSection('fields');
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        setWaiting(null);
        writeState({
            filterId: rule.id,
            isNew: true,
            emptiedAt: null,
            snapshot: {
                dashboardFilters: current.dashboardFilters,
                haveFiltersChanged: current.haveFiltersChanged,
            },
            touchedFilterIds: [],
        });
    }, [writeState, writePlaceholder]);

    // The moment a filter is created, which is what the shipped bar tracks.
    // A control that lost its last field goes back where it was, untracked
    const writeFirstRule = useCallback(
        (rule: DashboardFilterRule, group: FilterGroup) => {
            const { state: editingState, track: trackEvent } = latest.current;
            const emptiedAt = editingState?.emptiedAt ?? null;
            if (emptiedAt === null) {
                trackEvent({
                    name: EventName.ADD_FILTER_CLICKED,
                    properties: { mode: 'edit' },
                });
            }
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
            setWrittenRule(rule);
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
                adoptPlaceholder(
                    current.placeholder,
                    createDashboardFilterRuleFromSqlColumn({
                        column,
                        availableTileColumns,
                        isTemporary: false,
                    }),
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
            const base = getFirstFieldRule(
                current.placeholder,
                field,
                fieldsByTile,
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
            const current = latest.current;
            if (
                current.placeholder !== null &&
                current.placeholder.id === next.id
            ) {
                writePlaceholder(next);
                return;
            }
            // A field that just lost its last tile stays listed, waiting
            const previous = findFilterRule(current.dashboardFilters, next.id);
            const tiles = current.dashboardTiles;
            const kept = new Set(getFilterFields(next, tiles));
            const dropped = (
                previous === null ? [] : getFilterFields(previous, tiles)
            ).filter((fieldId) => !kept.has(fieldId));
            if (dropped.length > 0) {
                setWaiting((waitingNow) => ({
                    filterId: next.id,
                    fieldIds: [
                        ...new Set([
                            ...(waitingNow?.filterId === next.id
                                ? waitingNow.fieldIds
                                : []),
                            ...dropped,
                        ]),
                    ],
                }));
            }
            writeFilters((filters) => replaceFilterRule(filters, next));
            writeFiltersChanged(true);
        },
        [writeFilters, writeFiltersChanged, writePlaceholder],
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
            setActiveSection('fields');
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
        [writeState, writeFilters, writeFiltersChanged],
    );

    const addWaitingField = useCallback((fieldId: string) => {
        if (latest.current.state === null) return;
        const { filterId } = latest.current.state;
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
        (fieldId: string) =>
            setWaiting((current) =>
                current === null
                    ? null
                    : {
                          ...current,
                          fieldIds: current.fieldIds.filter(
                              (id) => id !== fieldId,
                          ),
                      },
            ),
        [],
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
    const removeFilter = useCallback(() => {
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

    // The edited rule goes back to its snapshot, or out when it was new, and
    // so do the other rules the editor wrote; outside writes are left alone
    const discard = useCallback(() => {
        const { state: editingState } = latest.current;
        if (editingState === null) return;
        rememberFocusReturn();
        const { snapshot, filterId, touchedFilterIds } = editingState;
        writeFilters((filters) =>
            restoreFilterRules(
                restoreFilterRule(filters, snapshot.dashboardFilters, filterId),
                snapshot.dashboardFilters,
                touchedFilterIds,
            ),
        );
        settleFiltersChanged(snapshot);
        reset();
    }, [writeFilters, settleFiltersChanged, reset, rememberFocusReturn]);

    const isPlaceholder = state !== null && placeholder !== null;

    // The dashboard's own Save or Cancel ends the edit; nothing is restored
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    useEffect(() => {
        if (!isEditMode) {
            reset();
            setDismissedLinks([]);
        }
    }, [isEditMode, reset]);

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

    const editingRule = useMemo(
        () =>
            getEditingRule(
                { state, placeholder, dashboardFilters },
                writtenRule,
            ),
        [state, placeholder, dashboardFilters, writtenRule],
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

    // Keeps the edits, which already live in the dashboard draft
    const close = useCallback(() => {
        const current = latest.current;
        if (current.state === null) return;
        const { snapshot } = current.state;
        const rule = getEditingRule(current, null);
        if (rule === null || !canKeepFilterRule(rule)) {
            // An existing control left with no field goes as "Remove filter"
            if (rule !== null && !current.state.isNew) removeFilter();
            else discard();
            return;
        }
        rememberFocusReturn();
        if (isDefaultValueIncomplete(rule)) {
            writeFilters((filters) =>
                replaceFilterRule(filters, { ...rule, disabled: true }),
            );
        }
        // An edit that was undone by hand leaves the dashboard unchanged
        settleFiltersChanged(snapshot);
        reset();
    }, [
        discard,
        removeFilter,
        reset,
        writeFilters,
        settleFiltersChanged,
        rememberFocusReturn,
    ]);

    // Whatever is being edited is closed first, as "Done" would. A new
    // control with no field yet stays as it is, label included
    const openNew = useCallback(() => {
        const { state: editingState, placeholder: editingPlaceholder } =
            latest.current;
        if (editingState?.isNew && editingPlaceholder !== null) return;
        close();
        openPlaceholder();
    }, [close, openPlaceholder]);

    // The control that is open stays as it is. Any other one is closed
    // first, as "Done" would, new or not
    const open = useCallback(
        (filterId: string) => {
            if (latest.current.state?.filterId === filterId) return;
            close();
            openExisting(filterId);
        },
        [close, openExisting],
    );

    // Derived, not reset: a rule that left the dashboard filters closes the
    // sidebar, and the next open or Add starts over
    const isSidebarOpen = state !== null && editingRule !== null;
    useEditorDismiss({
        isOpen: isSidebarOpen,
        isFieldClicked: highlightedFieldId !== null,
        clearField: clearHighlightedField,
        close,
    });

    // Focus is a DOM matter: it moves once the editor has left the page
    useEffect(() => {
        if (isSidebarOpen || focusReturn.current === null) return;
        const { pill } = focusReturn.current;
        focusReturn.current = null;
        // A pill disabled by a refetch cannot take it
        (pill?.isConnected && !pill.hasAttribute('disabled')
            ? pill
            : document.querySelector<HTMLElement>(ADD_SELECTOR)
        )?.focus();
    }, [isSidebarOpen]);

    // Its own memo so a hover does not hand selectors a new object
    const editingFilterId = state?.filterId ?? null;
    const editing = useMemo(
        () => (editingFilterId === null ? null : { filterId: editingFilterId }),
        [editingFilterId],
    );

    const value = useMemo<ControlsSidebarContextValue>(
        () => ({
            editing,
            isNew: state?.isNew ?? false,
            emptiedFieldLabel: state?.emptiedAt?.fieldLabel ?? null,
            isPlaceholder,
            editingRule,
            isSidebarOpen,
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
            highlightedFieldId,
            setHighlightedFieldId,
            clearHighlightedField,
            hoveredFieldId,
            setHoveredFieldId,
            activeFieldId: hoveredFieldId ?? highlightedFieldId,
            updateFilter,
            updateOtherFilters,
            removeFilter,
            removeFilterById,
            discard,
            close,
            isDirty:
                state !== null &&
                (isPlaceholder ||
                    isFilterRuleDirty(
                        state.snapshot.dashboardFilters,
                        dashboardFilters,
                        state.filterId,
                    )),
        }),
        [
            state,
            isSidebarOpen,
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
            highlightedFieldId,
            clearHighlightedField,
            hoveredFieldId,
            updateFilter,
            updateOtherFilters,
            removeFilter,
            removeFilterById,
            discard,
            close,
            dashboardFilters,
            newTileUuids,
            dismissedLinks,
            dismissLink,
        ],
    );

    return (
        <ControlsSidebarContext.Provider value={value}>
            {children}
        </ControlsSidebarContext.Provider>
    );
};
