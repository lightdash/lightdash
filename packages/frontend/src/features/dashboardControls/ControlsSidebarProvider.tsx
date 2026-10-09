import {
    type DashboardFilterRule,
    type DashboardFilters,
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
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    findFilterRule,
    isFilterRuleDirty,
    removeFilterRule,
    replaceFilterRule,
    type ControlsSidebarSnapshot,
} from './sidebarState';
import {
    ControlsSidebarContext,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';
import { useEditorDismiss } from './useEditorDismiss';

type SidebarState = {
    filterId: string;
    snapshot: ControlsSidebarSnapshot;
};

// What the callbacks read. Kept in a ref so their identity never changes, and
// written eagerly so two calls in one event (commit a label, then close) agree.
type Latest = {
    state: SidebarState | null;
    dashboardFilters: DashboardFilters;
    haveFiltersChanged: boolean;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
};

const getEditingRule = ({
    state,
    dashboardFilters,
}: Pick<Latest, 'state' | 'dashboardFilters'>): DashboardFilterRule | null =>
    state === null ? null : findFilterRule(dashboardFilters, state.filterId);

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

    const [state, setState] = useState<SidebarState | null>(null);

    const rendered: Latest = {
        state,
        dashboardFilters,
        haveFiltersChanged,
        setDashboardFilters,
        setHaveFiltersChanged,
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

    const writeState = useCallback((next: SidebarState | null) => {
        latest.current.state = next;
        setState(next);
    }, []);

    const reset = useCallback(() => {
        writeState(null);
    }, [writeState]);

    // Opening another filter keeps the current edits (they only live in the
    // dashboard draft until Save) and starts a fresh snapshot for the new one.
    const openExisting = useCallback(
        (filterId: string) => {
            const current = latest.current;
            if (current.state?.filterId === filterId) return;
            writeState({
                filterId,
                snapshot: {
                    dashboardFilters: current.dashboardFilters,
                    haveFiltersChanged: current.haveFiltersChanged,
                },
            });
        },
        [writeState],
    );

    const updateFilter = useCallback(
        (next: DashboardFilterRule) => {
            writeFilters((filters) => replaceFilterRule(filters, next));
            writeFiltersChanged(true);
        },
        [writeFilters, writeFiltersChanged],
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
        const { snapshot, filterId } = editingState;
        writeFilters(() =>
            removeFilterRule(snapshot.dashboardFilters, filterId),
        );
        writeFiltersChanged(true);
        reset();
    }, [writeFilters, writeFiltersChanged, reset]);

    const discard = useCallback(() => {
        const current = latest.current;
        if (current.state === null) return;
        const { snapshot } = current.state;
        writeFilters(() => snapshot.dashboardFilters);
        writeFiltersChanged(snapshot.haveFiltersChanged);
        reset();
    }, [writeFilters, writeFiltersChanged, reset]);

    // The dashboard's own Save or Cancel ends the edit; nothing is restored
    const { mode } = useParams<{ mode?: string }>();
    const isEditMode = mode === 'edit';
    useEffect(() => {
        if (!isEditMode) {
            reset();
        }
    }, [isEditMode, reset]);

    const editingRule = useMemo(
        () => getEditingRule({ state, dashboardFilters }),
        [state, dashboardFilters],
    );

    // Keeps the edits, which already live in the dashboard draft
    const close = useCallback(() => {
        const current = latest.current;
        if (current.state === null) return;
        const rule = getEditingRule(current);
        if (rule === null) {
            discard();
            return;
        }
        reset();
    }, [discard, reset]);

    const open = useCallback(
        (filterId: string) => {
            openExisting(filterId);
        },
        [openExisting],
    );

    const isSidebarOpen = state !== null;
    useEditorDismiss({
        isOpen: isSidebarOpen,
        close,
    });

    // Its own memo so a hover does not hand selectors a new object
    const editingFilterId = state?.filterId ?? null;
    const editing = useMemo(
        () => (editingFilterId === null ? null : { filterId: editingFilterId }),
        [editingFilterId],
    );

    const value = useMemo<ControlsSidebarContextValue>(
        () => ({
            editing,
            editingRule,
            isSidebarOpen,
            open,
            updateFilter,
            removeFilter,
            removeFilterById,
            discard,
            close,
            isDirty:
                state !== null &&
                isFilterRuleDirty(
                    state.snapshot.dashboardFilters,
                    dashboardFilters,
                    state.filterId,
                ),
        }),
        [
            state,
            isSidebarOpen,
            editing,
            editingRule,
            open,
            updateFilter,
            removeFilter,
            removeFilterById,
            discard,
            close,
            dashboardFilters,
        ],
    );

    return (
        <ControlsSidebarContext.Provider value={value}>
            {children}
        </ControlsSidebarContext.Provider>
    );
};
