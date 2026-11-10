import {
    DashboardControlRefKind,
    DateGranularity,
    EMPTY_DATE_ZOOM_CONFIG,
    isSubDayGranularity,
    type AdditionalMetric,
    type Dashboard,
    type DashboardConfig,
    type DashboardControlRef,
    type DashboardControlSection,
    type DateZoomConfig,
} from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import { isEqual, sortBy } from 'es-toolkit/compat';

/**
 * An unsaved edit of a saved setting. It applies only while the saved value
 * still equals `basedOn`; a different saved value replaces it.
 */
type Draft<T> = { value: T; basedOn: T };

export type DashboardEditState = {
    /** Undefined until the page seeds it from the loaded dashboard */
    tiles: Dashboard['tiles'] | undefined;
    haveTilesChanged: boolean;
    /** Always sorted by `order` */
    tabs: Dashboard['tabs'];
    haveTabsChanged: boolean;
    activeTab: Dashboard['tabs'][number] | undefined;
    /** Staged registry of dashboard custom metrics */
    customMetrics: AdditionalMetric[];
    haveCustomMetricsChanged: boolean;
    isDateZoomDisabled: boolean;
    isAddFilterDisabled: boolean;
    /** Undefined falls back to the saved note */
    editedRequiredFiltersNote: string | undefined;
    dateZoomConfig: (Draft<DateZoomConfig> & { changed: boolean }) | null;
    dateZoomGranularities: Draft<(DateGranularity | string)[]> | null;
    haveDateZoomGranularitiesChanged: boolean;
    defaultDateZoomGranularity: Draft<
        DateGranularity | string | undefined
    > | null;
    hasDefaultDateZoomGranularityChanged: boolean;
    /** Staged sections of the controls rail, in display order */
    controlSections: DashboardControlSection[];
    haveControlSectionsChanged: boolean;
    /** The bar's order of every control: the saved one, or the editor's reorder */
    controlOrder: DashboardControlRef[] | undefined;
    hasControlOrderChanged: boolean;
};

export const initialDashboardEditState: DashboardEditState = {
    tiles: undefined,
    haveTilesChanged: false,
    tabs: [],
    haveTabsChanged: false,
    activeTab: undefined,
    customMetrics: [],
    haveCustomMetricsChanged: false,
    isDateZoomDisabled: false,
    isAddFilterDisabled: false,
    editedRequiredFiltersNote: undefined,
    dateZoomConfig: null,
    dateZoomGranularities: null,
    haveDateZoomGranularitiesChanged: false,
    defaultDateZoomGranularity: null,
    hasDefaultDateZoomGranularityChanged: false,
    controlSections: [],
    haveControlSectionsChanged: false,
    controlOrder: undefined,
    hasControlOrderChanged: false,
};

// Sub-day granularities are offered only when an editor enables them
const DEFAULT_DATE_ZOOM_GRANULARITIES = Object.values(DateGranularity).filter(
    (granularity) => !isSubDayGranularity(granularity),
);

/** Saved date zoom settings; references are stable for an unchanged config */
export type SavedDateZoomSettings = {
    dateZoomConfig: DateZoomConfig;
    dateZoomGranularities: (DateGranularity | string)[];
    defaultDateZoomGranularity: DateGranularity | string | undefined;
};

export const getSavedDateZoomSettings = (
    config: DashboardConfig | undefined,
): SavedDateZoomSettings => ({
    dateZoomConfig: config?.dateZoomConfig ?? EMPTY_DATE_ZOOM_CONFIG,
    dateZoomGranularities:
        config?.dateZoomGranularities ?? DEFAULT_DATE_ZOOM_GRANULARITIES,
    defaultDateZoomGranularity: config?.defaultDateZoomGranularity,
});

// The saved config is compared by content so a no-op refetch keeps the draft;
// the lists by reference, as react-query keeps unchanged ones
export const isDateZoomConfigDraftCurrent = (
    draft: DashboardEditState['dateZoomConfig'],
    saved: DateZoomConfig,
) => draft !== null && isEqual(draft.basedOn, saved);
export const isDraftCurrent = <T>(draft: Draft<T> | null, saved: T) =>
    draft !== null && draft.basedOn === saved;

export const dashboardEditActions = {
    setTiles: createAction<Dashboard['tiles'] | undefined>(
        'dashboardEdit/setTiles',
    ),
    setHaveTilesChanged: createAction<boolean>(
        'dashboardEdit/setHaveTilesChanged',
    ),
    setTabs: createAction<Dashboard['tabs']>('dashboardEdit/setTabs'),
    setHaveTabsChanged: createAction<boolean>(
        'dashboardEdit/setHaveTabsChanged',
    ),
    setActiveTab: createAction<Dashboard['tabs'][number] | undefined>(
        'dashboardEdit/setActiveTab',
    ),
    setCustomMetrics: createAction<AdditionalMetric[]>(
        'dashboardEdit/setCustomMetrics',
    ),
    /** Seeds the registry from the saved config unless it has staged edits */
    syncCustomMetrics: createAction<AdditionalMetric[]>(
        'dashboardEdit/syncCustomMetrics',
    ),
    setHaveCustomMetricsChanged: createAction<boolean>(
        'dashboardEdit/setHaveCustomMetricsChanged',
    ),
    setIsDateZoomDisabled: createAction<boolean>(
        'dashboardEdit/setIsDateZoomDisabled',
    ),
    setIsAddFilterDisabled: createAction<boolean>(
        'dashboardEdit/setIsAddFilterDisabled',
    ),
    setRequiredFiltersNote: createAction<string | undefined>(
        'dashboardEdit/setRequiredFiltersNote',
    ),
    setDateZoomConfig: createAction<{
        value: DateZoomConfig;
        changed: boolean;
        saved: DateZoomConfig;
    }>('dashboardEdit/setDateZoomConfig'),
    setDateZoomGranularities: createAction<{
        value: (DateGranularity | string)[];
        saved: (DateGranularity | string)[];
    }>('dashboardEdit/setDateZoomGranularities'),
    setHaveDateZoomGranularitiesChanged: createAction<boolean>(
        'dashboardEdit/setHaveDateZoomGranularitiesChanged',
    ),
    setDefaultDateZoomGranularity: createAction<{
        value: DateGranularity | string | undefined;
        saved: DateGranularity | string | undefined;
    }>('dashboardEdit/setDefaultDateZoomGranularity'),
    setHasDefaultDateZoomGranularityChanged: createAction<boolean>(
        'dashboardEdit/setHasDefaultDateZoomGranularityChanged',
    ),
    /** Drops drafts of settings whose saved value has changed since */
    dropStaleDrafts: createAction<SavedDateZoomSettings>(
        'dashboardEdit/dropStaleDrafts',
    ),
    /** Seeds the sections from the saved config unless they have staged edits */
    syncControlSections: createAction<DashboardControlSection[]>(
        'dashboardEdit/syncControlSections',
    ),
    setHaveControlSectionsChanged: createAction<boolean>(
        'dashboardEdit/setHaveControlSectionsChanged',
    ),
    /** `barOrder` is the bar's current order, from `selectOrderedControls` */
    addControlSection: createAction<{
        section: DashboardControlSection;
        barOrder: DashboardControlRef[];
    }>('dashboardEdit/addControlSection'),
    renameControlSection: createAction<DashboardControlSection>(
        'dashboardEdit/renameControlSection',
    ),
    removeControlSection: createAction<string>(
        'dashboardEdit/removeControlSection',
    ),
    /** The sections in a new order and lines (a drag or a keyboard move on the bar) */
    arrangeControlSections: createAction<DashboardControlSection[]>(
        'dashboardEdit/arrangeControlSections',
    ),
    /** Seeds the order from the saved config unless the editor reordered */
    syncControlOrder: createAction<DashboardControlRef[] | undefined>(
        'dashboardEdit/syncControlOrder',
    ),
    setHasControlOrderChanged: createAction<boolean>(
        'dashboardEdit/setHasControlOrderChanged',
    ),
    /** A reorder on the bar: a drag, a keyboard move or a section change */
    arrangeControls: createAction<DashboardControlRef[]>(
        'dashboardEdit/arrangeControls',
    ),
    /** `undefined` removes the key: the section follows the default again */
    setControlSectionCollapsed: createAction<{
        id: string;
        collapsed: boolean | undefined;
    }>('dashboardEdit/setControlSectionCollapsed'),
};

const withControlSections = (
    state: DashboardEditState,
    controlSections: DashboardControlSection[],
): DashboardEditState => ({
    ...state,
    controlSections,
    haveControlSectionsChanged: true,
});

const set = <K extends keyof DashboardEditState>(
    state: DashboardEditState,
    key: K,
    value: DashboardEditState[K],
): DashboardEditState =>
    state[key] === value ? state : { ...state, [key]: value };

export const dashboardEditReducer = (
    state: DashboardEditState = initialDashboardEditState,
    action: UnknownAction,
): DashboardEditState => {
    if (dashboardEditActions.setTiles.match(action)) {
        return set(state, 'tiles', action.payload);
    }
    if (dashboardEditActions.setHaveTilesChanged.match(action)) {
        return set(state, 'haveTilesChanged', action.payload);
    }
    if (dashboardEditActions.setTabs.match(action)) {
        return { ...state, tabs: sortBy(action.payload, 'order') };
    }
    if (dashboardEditActions.setHaveTabsChanged.match(action)) {
        return set(state, 'haveTabsChanged', action.payload);
    }
    if (dashboardEditActions.setActiveTab.match(action)) {
        return set(state, 'activeTab', action.payload);
    }
    if (dashboardEditActions.setCustomMetrics.match(action)) {
        return set(state, 'customMetrics', action.payload);
    }
    if (dashboardEditActions.syncCustomMetrics.match(action)) {
        return state.haveCustomMetricsChanged
            ? state
            : set(state, 'customMetrics', action.payload);
    }
    if (dashboardEditActions.setHaveCustomMetricsChanged.match(action)) {
        return set(state, 'haveCustomMetricsChanged', action.payload);
    }
    if (dashboardEditActions.setIsDateZoomDisabled.match(action)) {
        return set(state, 'isDateZoomDisabled', action.payload);
    }
    if (dashboardEditActions.setIsAddFilterDisabled.match(action)) {
        return set(state, 'isAddFilterDisabled', action.payload);
    }
    if (dashboardEditActions.setRequiredFiltersNote.match(action)) {
        return set(state, 'editedRequiredFiltersNote', action.payload);
    }
    if (dashboardEditActions.setDateZoomConfig.match(action)) {
        const { value, changed, saved } = action.payload;
        return {
            ...state,
            dateZoomConfig: { value, changed, basedOn: saved },
        };
    }
    if (dashboardEditActions.setDateZoomGranularities.match(action)) {
        const { value, saved } = action.payload;
        return {
            ...state,
            dateZoomGranularities: { value, basedOn: saved },
            haveDateZoomGranularitiesChanged: true,
        };
    }
    if (
        dashboardEditActions.setHaveDateZoomGranularitiesChanged.match(action)
    ) {
        return set(state, 'haveDateZoomGranularitiesChanged', action.payload);
    }
    if (dashboardEditActions.setDefaultDateZoomGranularity.match(action)) {
        const { value, saved } = action.payload;
        return {
            ...state,
            defaultDateZoomGranularity: { value, basedOn: saved },
            hasDefaultDateZoomGranularityChanged: true,
        };
    }
    if (
        dashboardEditActions.setHasDefaultDateZoomGranularityChanged.match(
            action,
        )
    ) {
        return set(
            state,
            'hasDefaultDateZoomGranularityChanged',
            action.payload,
        );
    }
    if (dashboardEditActions.dropStaleDrafts.match(action)) {
        const saved = action.payload;
        const dateZoomConfig = isDateZoomConfigDraftCurrent(
            state.dateZoomConfig,
            saved.dateZoomConfig,
        )
            ? state.dateZoomConfig
            : null;
        const dateZoomGranularities = isDraftCurrent(
            state.dateZoomGranularities,
            saved.dateZoomGranularities,
        )
            ? state.dateZoomGranularities
            : null;
        const defaultDateZoomGranularity = isDraftCurrent(
            state.defaultDateZoomGranularity,
            saved.defaultDateZoomGranularity,
        )
            ? state.defaultDateZoomGranularity
            : null;
        return dateZoomConfig === state.dateZoomConfig &&
            dateZoomGranularities === state.dateZoomGranularities &&
            defaultDateZoomGranularity === state.defaultDateZoomGranularity
            ? state
            : {
                  ...state,
                  dateZoomConfig,
                  dateZoomGranularities,
                  defaultDateZoomGranularity,
              };
    }
    if (dashboardEditActions.syncControlSections.match(action)) {
        return state.haveControlSectionsChanged
            ? state
            : set(state, 'controlSections', action.payload);
    }
    if (dashboardEditActions.setHaveControlSectionsChanged.match(action)) {
        return set(state, 'haveControlSectionsChanged', action.payload);
    }
    // A new section joins the line of the one before it, stored as an order;
    // the first starts one. A stored order ends the last line with it
    if (dashboardEditActions.addControlSection.match(action)) {
        const { section, barOrder } = action.payload;
        const withSection = withControlSections(state, [
            ...state.controlSections,
            section,
        ]);
        return state.controlSections.length > 0 &&
            (state.controlOrder?.length ?? 0) === 0
            ? {
                  ...withSection,
                  controlOrder: [
                      ...barOrder,
                      { kind: DashboardControlRefKind.SECTION, id: section.id },
                  ],
                  hasControlOrderChanged: true,
              }
            : withSection;
    }
    if (dashboardEditActions.renameControlSection.match(action)) {
        const { id, name } = action.payload;
        return withControlSections(
            state,
            state.controlSections.map((section) =>
                section.id === id ? { ...section, name } : section,
            ),
        );
    }
    if (dashboardEditActions.removeControlSection.match(action)) {
        return withControlSections(
            state,
            state.controlSections.filter(({ id }) => id !== action.payload),
        );
    }
    if (dashboardEditActions.setControlSectionCollapsed.match(action)) {
        const { id, collapsed } = action.payload;
        return withControlSections(
            state,
            state.controlSections.map((section) => {
                if (section.id !== id) return section;
                const { collapsed: previous, ...rest } = section;
                return collapsed === undefined ? rest : { ...rest, collapsed };
            }),
        );
    }
    if (dashboardEditActions.arrangeControlSections.match(action)) {
        return action.payload === state.controlSections
            ? state
            : withControlSections(state, action.payload);
    }
    if (dashboardEditActions.syncControlOrder.match(action)) {
        return state.hasControlOrderChanged
            ? state
            : set(state, 'controlOrder', action.payload);
    }
    if (dashboardEditActions.setHasControlOrderChanged.match(action)) {
        return set(state, 'hasControlOrderChanged', action.payload);
    }
    if (dashboardEditActions.arrangeControls.match(action)) {
        return {
            ...state,
            controlOrder: action.payload,
            hasControlOrderChanged: true,
        };
    }
    return state;
};
