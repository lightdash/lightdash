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
import {
    canKeepFilterRule,
    findFilterRule,
    isDefaultValueIncomplete,
    isFilterRuleDirty,
    PLACEHOLDER_TARGET,
    removeFilterRule,
    replaceFilterRule,
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

type SidebarState = {
    filterId: string;
    isNew: boolean;
    snapshot: ControlsSidebarSnapshot;
};

// What the callbacks read. Kept in a ref so their identity never changes, and
// written eagerly so two calls in one event (commit a label, then close) agree.
type Latest = {
    state: SidebarState | null;
    placeholder: DashboardFilterRule | null;
    dashboardFilters: DashboardFilters;
    haveFiltersChanged: boolean;
    filterableFieldsByTileUuid: DashboardContextType['filterableFieldsByTileUuid'];
    dashboardTiles: DashboardContextType['dashboardTiles'];
    highlightedFieldId: string | null;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    track: TrackingContextType['track'];
};

const getEditingRule = ({
    state,
    placeholder,
    dashboardFilters,
}: Pick<
    Latest,
    'state' | 'placeholder' | 'dashboardFilters'
>): DashboardFilterRule | null =>
    state === null
        ? null
        : (placeholder ?? findFilterRule(dashboardFilters, state.filterId));

// Operator, values and tile targets come from the field or SQL column;
// identity, label and settings come from the placeholder
const adoptPlaceholder = (
    placeholder: DashboardFilterRule,
    created: DashboardFilterRule,
): DashboardFilterRule => ({
    ...created,
    id: placeholder.id,
    label: placeholder.label,
    lockedTabUuids: placeholder.lockedTabUuids,
    required: placeholder.required,
    requiredGroupId: placeholder.requiredGroupId,
    singleValue: placeholder.singleValue,
});

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

    const rendered: Latest = {
        state,
        placeholder,
        dashboardFilters,
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

    const writeFiltersChanged = useCallback((changed: boolean) => {
        latest.current.haveFiltersChanged = changed;
        latest.current.setHaveFiltersChanged(changed);
    }, []);

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
            writePlaceholder(null);
            setActiveSection('fields');
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            writeState({
                filterId,
                isNew: false,
                snapshot: {
                    dashboardFilters: current.dashboardFilters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
            });
        },
        [writeState, writePlaceholder],
    );

    const openPlaceholder = useCallback(() => {
        const current = latest.current;
        const rule: DashboardFilterRule = {
            id: uuidv4(),
            target: PLACEHOLDER_TARGET,
            operator: FilterOperator.EQUALS,
            values: [],
            label: undefined,
            tileTargets: {},
            disabled: true,
        };
        focusReturn.current = null;
        writePlaceholder(rule);
        setActiveSection('fields');
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
        writeState({
            filterId: rule.id,
            isNew: true,
            snapshot: {
                dashboardFilters: current.dashboardFilters,
                haveFiltersChanged: current.haveFiltersChanged,
            },
        });
    }, [writeState, writePlaceholder]);

    // The moment a filter is created, which is what the shipped bar tracks
    const writeFirstRule = useCallback(
        (rule: DashboardFilterRule, group: 'dimensions' | 'metrics') => {
            latest.current.track({
                name: EventName.ADD_FILTER_CLICKED,
                properties: { mode: 'edit' },
            });
            writeFilters((filters) => ({
                ...filters,
                [group]: [...filters[group], rule],
            }));
            writeFiltersChanged(true);
            writePlaceholder(null);
        },
        [writeFilters, writeFiltersChanged, writePlaceholder],
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
            const kept = new Set(getFilterFields(next));
            const dropped = (
                previous === null ? [] : getFilterFields(previous)
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

    // Starts from the snapshot so the edits made in this session are not kept
    const removeFilter = useCallback(() => {
        const { state: editingState } = latest.current;
        if (editingState === null) return;
        rememberFocusReturn();
        const { snapshot, filterId } = editingState;
        if (editingState.isNew) {
            writeFilters(() => snapshot.dashboardFilters);
            writeFiltersChanged(snapshot.haveFiltersChanged);
        } else {
            writeFilters(() =>
                removeFilterRule(snapshot.dashboardFilters, filterId),
            );
            writeFiltersChanged(true);
        }
        reset();
    }, [writeFilters, writeFiltersChanged, reset, rememberFocusReturn]);

    const discard = useCallback(() => {
        const current = latest.current;
        if (current.state === null) return;
        rememberFocusReturn();
        const { snapshot } = current.state;
        writeFilters(() => snapshot.dashboardFilters);
        writeFiltersChanged(snapshot.haveFiltersChanged);
        reset();
    }, [writeFilters, writeFiltersChanged, reset, rememberFocusReturn]);

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
        () => getEditingRule({ state, placeholder, dashboardFilters }),
        [state, placeholder, dashboardFilters],
    );

    const waitingFieldIds = useMemo(() => {
        if (state === null || waiting?.filterId !== state.filterId) return [];
        const current = new Set(
            editingRule === null ? [] : getFilterFields(editingRule),
        );
        return waiting.fieldIds.filter((fieldId) => !current.has(fieldId));
    }, [state, waiting, editingRule]);

    // Keeps the edits, which already live in the dashboard draft
    const close = useCallback(() => {
        const current = latest.current;
        if (current.state === null) return;
        const rule = getEditingRule(current);
        if (rule === null || !canKeepFilterRule(rule)) {
            discard();
            return;
        }
        rememberFocusReturn();
        if (isDefaultValueIncomplete(rule)) {
            writeFilters((filters) =>
                replaceFilterRule(filters, { ...rule, disabled: true }),
            );
        }
        reset();
    }, [discard, reset, writeFilters, rememberFocusReturn]);

    // A new control is closed first, as "Done" would: kept when it can be,
    // dropped otherwise. Edits to an existing control are simply kept
    const closeNew = useCallback(() => {
        const current = latest.current;
        if (current.state?.isNew) close();
    }, [close]);

    // Whatever is being edited is closed first, as "Done" would. A new
    // control with no field yet stays as it is, label included
    const openNew = useCallback(() => {
        const { state: editingState, placeholder: editingPlaceholder } =
            latest.current;
        if (editingState?.isNew && editingPlaceholder !== null) return;
        close();
        openPlaceholder();
    }, [close, openPlaceholder]);

    const open = useCallback(
        (filterId: string) => {
            closeNew();
            openExisting(filterId);
        },
        [closeNew, openExisting],
    );

    const isSidebarOpen = state !== null;
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
        (pill?.isConnected
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
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            highlightedFieldId,
            clearHighlightedField,
            hoveredFieldId,
            updateFilter,
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
