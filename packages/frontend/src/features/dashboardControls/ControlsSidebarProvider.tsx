import {
    createDashboardFilterRuleFromField,
    FilterOperator,
    isMetric,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFilterFields } from './peers';
import {
    findFilterRule,
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

type SidebarState = {
    filterId: string;
    isNew: boolean;
    snapshot: ControlsSidebarSnapshot;
};

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

    const close = useCallback(() => {
        setState(null);
        setPlaceholder(null);
        setActiveSection('fields');
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
    }, []);

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const open = useCallback(
        (filterId: string) => {
            if (state !== null && (state.isNew || state.filterId === filterId))
                return;
            setPlaceholder(null);
            setActiveSection('fields');
            setHighlightedFieldId(null);
            setHoveredFieldId(null);
            setState({
                filterId,
                isNew: false,
                snapshot: { dashboardFilters, haveFiltersChanged },
            });
        },
        [state, dashboardFilters, haveFiltersChanged],
    );

    const openNew = useCallback(() => {
        if (state !== null) return;
        const rule: DashboardFilterRule = {
            id: uuidv4(),
            target: PLACEHOLDER_TARGET,
            operator: FilterOperator.EQUALS,
            values: [],
            label: undefined,
            tileTargets: {},
            disabled: true,
        };
        setPlaceholder(rule);
        setActiveSection('fields');
        setState({
            filterId: rule.id,
            isNew: true,
            snapshot: { dashboardFilters, haveFiltersChanged },
        });
    }, [state, dashboardFilters, haveFiltersChanged]);

    const addFirstField = useCallback(
        (field: DashboardFilterableField) => {
            if (placeholder === null) return;
            // Operator, values and tile targets come from the field; identity,
            // label and settings come from the placeholder
            const rule: DashboardFilterRule = {
                ...createDashboardFilterRuleFromField({
                    field,
                    availableTileFilters: filterableFieldsByTileUuid ?? {},
                    isTemporary: false,
                }),
                id: placeholder.id,
                label: placeholder.label,
                lockedTabUuids: placeholder.lockedTabUuids,
                required: placeholder.required,
                requiredGroupId: placeholder.requiredGroupId,
                singleValue: placeholder.singleValue,
            };
            setDashboardFilters((filters) =>
                isMetric(field)
                    ? { ...filters, metrics: [...filters.metrics, rule] }
                    : { ...filters, dimensions: [...filters.dimensions, rule] },
            );
            setHaveFiltersChanged(true);
            setPlaceholder(null);
        },
        [
            placeholder,
            filterableFieldsByTileUuid,
            setDashboardFilters,
            setHaveFiltersChanged,
        ],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            if (placeholder !== null && placeholder.id === next.id) {
                setPlaceholder(next);
                return;
            }
            // A field that just lost its last tile stays listed, waiting
            const previous = findFilterRule(dashboardFilters, next.id);
            const kept = new Set(getFilterFields(next));
            const dropped = (
                previous === null ? [] : getFilterFields(previous)
            ).filter((fieldId) => !kept.has(fieldId));
            if (dropped.length > 0) {
                setWaiting((current) => ({
                    filterId: next.id,
                    fieldIds: [
                        ...new Set([
                            ...(current?.filterId === next.id
                                ? current.fieldIds
                                : []),
                            ...dropped,
                        ]),
                    ],
                }));
            }
            setDashboardFilters((filters) => replaceFilterRule(filters, next));
            setHaveFiltersChanged(true);
        },
        [
            placeholder,
            dashboardFilters,
            setDashboardFilters,
            setHaveFiltersChanged,
        ],
    );

    const addWaitingField = useCallback(
        (fieldId: string) => {
            if (state === null) return;
            const { filterId } = state;
            setWaiting((current) => ({
                filterId,
                fieldIds: [
                    ...new Set([
                        ...(current?.filterId === filterId
                            ? current.fieldIds
                            : []),
                        fieldId,
                    ]),
                ],
            }));
        },
        [state],
    );

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

    const clearFields = useCallback(() => {
        if (state === null || placeholder !== null) return;
        const rule = findFilterRule(dashboardFilters, state.filterId);
        if (rule === null) return;
        setPlaceholder({
            ...rule,
            target: PLACEHOLDER_TARGET,
            tileTargets: {},
            values: [],
            disabled: true,
        });
        setDashboardFilters((filters) => removeFilterRule(filters, rule.id));
        setHaveFiltersChanged(true);
        setHighlightedFieldId(null);
        setHoveredFieldId(null);
    }, [
        state,
        placeholder,
        dashboardFilters,
        setDashboardFilters,
        setHaveFiltersChanged,
    ]);

    const removeFilterById = useCallback(
        (filterId: string) => {
            setDashboardFilters((filters) =>
                removeFilterRule(filters, filterId),
            );
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters, setHaveFiltersChanged],
    );

    // Starts from the snapshot so the edits made in this session are not kept
    const removeFilter = useCallback(() => {
        if (state === null) return;
        if (state.isNew) {
            setDashboardFilters(state.snapshot.dashboardFilters);
            setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        } else {
            setDashboardFilters(
                removeFilterRule(
                    state.snapshot.dashboardFilters,
                    state.filterId,
                ),
            );
            setHaveFiltersChanged(true);
        }
        close();
    }, [state, setDashboardFilters, setHaveFiltersChanged, close]);

    const cancel = useCallback(() => {
        if (state === null) return;
        setDashboardFilters(state.snapshot.dashboardFilters);
        setHaveFiltersChanged(state.snapshot.haveFiltersChanged);
        close();
    }, [state, setDashboardFilters, setHaveFiltersChanged, close]);

    const isPlaceholder = state !== null && placeholder !== null;

    const apply = useCallback(() => {
        if (isPlaceholder) return;
        close();
    }, [isPlaceholder, close]);

    // The dashboard's own Save or Cancel ends the edit; nothing is restored
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    useEffect(() => {
        if (!isEditMode) close();
    }, [isEditMode, close]);

    const editingRule = useMemo(
        () =>
            state === null
                ? null
                : (placeholder ??
                  findFilterRule(dashboardFilters, state.filterId)),
        [state, placeholder, dashboardFilters],
    );

    const waitingFieldIds = useMemo(() => {
        if (state === null || waiting?.filterId !== state.filterId) return [];
        const current = new Set(
            editingRule === null ? [] : getFilterFields(editingRule),
        );
        return waiting.fieldIds.filter((fieldId) => !current.has(fieldId));
    }, [state, waiting, editingRule]);

    const value = useMemo<ControlsSidebarContextValue>(
        () => ({
            editing: state === null ? null : { filterId: state.filterId },
            isNew: state?.isNew ?? false,
            isPlaceholder,
            editingRule,
            isSidebarOpen: state !== null,
            activeSection,
            setActiveSection,
            open,
            openNew,
            addFirstField,
            clearFields,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            highlightedFieldId,
            setHighlightedFieldId,
            hoveredFieldId,
            setHoveredFieldId,
            activeFieldId: hoveredFieldId ?? highlightedFieldId,
            updateFilter,
            removeFilter,
            removeFilterById,
            cancel,
            apply,
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
            isPlaceholder,
            editingRule,
            activeSection,
            open,
            openNew,
            addFirstField,
            clearFields,
            waitingFieldIds,
            addWaitingField,
            removeWaitingField,
            highlightedFieldId,
            hoveredFieldId,
            updateFilter,
            removeFilter,
            removeFilterById,
            cancel,
            apply,
            dashboardFilters,
        ],
    );

    return (
        <ControlsSidebarContext.Provider value={value}>
            {children}
        </ControlsSidebarContext.Provider>
    );
};
