import {
    DashboardControlRefKind,
    FilterInteractivityValues,
    getFilterInteractivityValue,
    isDashboardControlOrder,
    reconcileDashboardControlOrder,
    type Dashboard,
    type DashboardConfig,
    type DashboardControlRef,
    type DashboardControlSection,
    type DashboardFilters,
    type DashboardParameterControl,
    type DashboardTab,
    type DashboardTile,
    type DashboardUnversionedFields,
    type DashboardVersionedFields,
    type DateGranularity,
    type DateZoomConfig,
    type InteractivityOptions,
} from '@lightdash/common';
import {
    getSavedDateZoomSettings,
    selectAreParameterControlsSaved,
    selectControlOrder,
    selectControlSections,
    selectDateZoomGranularities,
    selectDefaultDateZoomGranularity,
    selectHasControlOrderChanged,
    selectHasDefaultDateZoomGranularityChanged,
    selectHaveControlSectionsChanged,
    selectHaveDateZoomGranularitiesChanged,
    selectHaveParameterControlsChanged,
    selectParameterControls,
    selectParameterPicks,
    type DashboardStoreState,
} from '../../../../../features/dashboard/store';
import {
    selectDateZoomConfig,
    selectEditedRequiredFiltersNote,
    selectHasDateZoomConfigChanged,
} from '../../../../../features/dashboard/store/dashboardEditSelectors';
import { type ParameterPicks } from '../../../../../features/dashboard/store/parameterControls';
import { getDimensionFiltersToSave } from '../../../../../features/dashboardFilters/FilterConfiguration/utils';
import { getEmbedHiddenFilters } from '../../../../../providers/Dashboard/embedFilterInteractivity';
import {
    buildDashboardConfig,
    getControlsToSave,
    getDateZoomConfigToSave,
} from '../../../../../utils/dashboardConfig';
import {
    restoreFilterLabelOverrides,
    type DashboardFilterLabelOverrides,
} from '../filterLabelOverrides';

/** The controls bar's drafts, as the dashboard store holds them */
export type EmbedControlDrafts = {
    controlOrder: DashboardControlRef[] | undefined;
    hasControlOrderChanged: boolean;
    controlSections: DashboardControlSection[];
    haveControlSectionsChanged: boolean;
    parameterControls: DashboardParameterControl[] | null;
    areParameterControlsSaved: boolean;
    haveParameterControlsChanged: boolean;
    parameterPicks: ParameterPicks;
    dateZoomConfig: DateZoomConfig;
    hasDateZoomConfigChanged: boolean;
    dateZoomGranularities: (DateGranularity | string)[];
    haveDateZoomGranularitiesChanged: boolean;
    defaultDateZoomGranularity: DateGranularity | string | undefined;
    hasDefaultDateZoomGranularityChanged: boolean;
    requiredFiltersNote: string | undefined;
    /** False where the token allows no parameters: they are saved as loaded */
    areParametersAllowed: boolean;
    /** False where the token hides the filters: their rules keep their loaded order */
    areFiltersShown: boolean;
};

/** The control kinds the embed token lets this bar show */
export type EmbedTokenAllows = {
    dateZoom: boolean;
    parameters: boolean;
    /** The bar shows the filter area */
    filters: boolean;
};

export type EmbedFiltersInteractivity = NonNullable<
    InteractivityOptions['dashboardFiltersInteractivity']
>;

type Args = {
    /** The dashboard as loaded */
    dashboard: Pick<Dashboard, 'filters' | 'config' | 'parameters'>;
    name: string;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    /** Saved and temporary rules, labels as shown */
    filters: DashboardFilters;
    filterLabelOverrides: DashboardFilterLabelOverrides;
    /** The token's filter interactivity; null where it carries none */
    filtersInteractivity: EmbedFiltersInteractivity | null;
    isAddFilterDisabled: boolean;
    /** The editor's choice; null where the store was not seeded with it: as loaded */
    isDateZoomDisabled: boolean | null;
    /** Null with the controls off: the save as it was before them */
    controlDrafts: EmbedControlDrafts | null;
};

// A kind the token does not allow has no control on the bar: whatever the
// store holds for it, the save and "changed" read it as saved
export const getEmbedControlDrafts = (
    state: DashboardStoreState,
    config: DashboardConfig | undefined,
    allows: EmbedTokenAllows,
): EmbedControlDrafts => {
    const saved = getSavedDateZoomSettings(config);
    const drafts: EmbedControlDrafts = {
        controlOrder: selectControlOrder(state),
        hasControlOrderChanged: selectHasControlOrderChanged(state),
        controlSections: selectControlSections(state),
        haveControlSectionsChanged: selectHaveControlSectionsChanged(state),
        parameterControls: selectParameterControls(state),
        areParameterControlsSaved: selectAreParameterControlsSaved(state),
        haveParameterControlsChanged: selectHaveParameterControlsChanged(state),
        parameterPicks: selectParameterPicks(state),
        dateZoomConfig: selectDateZoomConfig(state, saved.dateZoomConfig),
        hasDateZoomConfigChanged: selectHasDateZoomConfigChanged(
            state,
            saved.dateZoomConfig,
        ),
        dateZoomGranularities: selectDateZoomGranularities(
            state,
            saved.dateZoomGranularities,
        ),
        haveDateZoomGranularitiesChanged:
            selectHaveDateZoomGranularitiesChanged(state),
        defaultDateZoomGranularity: selectDefaultDateZoomGranularity(
            state,
            saved.defaultDateZoomGranularity,
        ),
        hasDefaultDateZoomGranularityChanged:
            selectHasDefaultDateZoomGranularityChanged(state),
        // An unsaved edit wins over the saved note
        requiredFiltersNote:
            selectEditedRequiredFiltersNote(state) ??
            config?.requiredFiltersNote,
        areParametersAllowed: allows.parameters,
        areFiltersShown: allows.filters,
    };
    return {
        ...drafts,
        ...(!allows.dateZoom && {
            dateZoomConfig: saved.dateZoomConfig,
            hasDateZoomConfigChanged: false,
            dateZoomGranularities: saved.dateZoomGranularities,
            haveDateZoomGranularitiesChanged: false,
            defaultDateZoomGranularity: saved.defaultDateZoomGranularity,
            hasDefaultDateZoomGranularityChanged: false,
        }),
        ...(!allows.parameters && {
            parameterControls: config?.parameterControls ?? null,
            areParameterControlsSaved: config?.parameterControls !== undefined,
            haveParameterControlsChanged: false,
            parameterPicks: {},
        }),
    };
};

export const haveEmbedControlsChanged = (
    dashboard: Pick<Dashboard, 'config'>,
    drafts: EmbedControlDrafts,
): boolean =>
    drafts.hasControlOrderChanged ||
    drafts.haveControlSectionsChanged ||
    drafts.haveParameterControlsChanged ||
    drafts.hasDateZoomConfigChanged ||
    drafts.haveDateZoomGranularitiesChanged ||
    drafts.hasDefaultDateZoomGranularityChanged ||
    (dashboard.config?.requiredFiltersNote || undefined) !==
        (drafts.requiredFiltersNote || undefined);

// The ids of the loaded rules the token keeps out of the store
const getHiddenFilterIds = (
    loaded: DashboardFilters,
    interactivity: EmbedFiltersInteractivity | null,
): Set<string> =>
    new Set(
        getEmbedHiddenFilters({
            filters: loaded,
            dashboardFiltersInteractivity: interactivity ?? undefined,
        }).map(({ id }) => id),
    );

// The store only holds the rules the token allows (`applyEmbedFilterInteractivity`):
// the loaded rules it trimmed go back into the save, where they were
const keepHiddenFilters = (
    filters: DashboardFilters,
    loaded: DashboardFilters,
    interactivity: EmbedFiltersInteractivity | null,
): DashboardFilters => {
    const value = interactivity
        ? getFilterInteractivityValue(interactivity.enabled)
        : FilterInteractivityValues.none;
    if (value === FilterInteractivityValues.none) return loaded;
    if (value !== FilterInteractivityValues.some) return filters;

    const hiddenIds = getHiddenFilterIds(loaded, interactivity);
    // The editor's rules fill the allowed rules' slots, in the editor's order
    const edited = filters.dimensions.filter(({ id }) => !hiddenIds.has(id));
    const slots = loaded.dimensions.flatMap((rule) =>
        hiddenIds.has(rule.id) ? [rule] : edited.splice(0, 1),
    );
    return { ...filters, dimensions: [...slots, ...edited] };
};

const withoutNewLine = ({ kind, id }: DashboardControlRef) => ({ kind, id });

// A written order holds only the controls the editor sees: the hidden rules'
// refs go back at their loaded slots, the editor's refs fill the others
const keepHiddenRefs = (
    order: DashboardControlRef[] | null,
    loadedOrder: unknown,
    hiddenIds: Set<string>,
    isOnBar: (ref: DashboardControlRef) => boolean,
): DashboardControlRef[] | null => {
    if (order === null || !isDashboardControlOrder(loadedOrder)) return order;
    const isHidden = ({ kind, id }: DashboardControlRef) =>
        kind === DashboardControlRefKind.FILTER && hiddenIds.has(id);
    const edited = order.filter((ref) => !isHidden(ref));
    const refs = [
        ...loadedOrder.flatMap((ref) =>
            isHidden(ref) ? [ref] : edited.splice(0, 1),
        ),
        ...edited,
    ];
    // The editor's bar reads a hidden ref's line start on the next bar control:
    // that control's own is dropped, or the hidden one's where it has none
    let lineStarts: number[] = [];
    refs.forEach((ref, index) => {
        if (isHidden(ref)) {
            if (ref.newLine) lineStarts.push(index);
        } else if (isOnBar(ref)) {
            if (ref.newLine && lineStarts.length > 0) {
                refs[index] = withoutNewLine(ref);
            } else {
                lineStarts.forEach((hiddenIndex) => {
                    refs[hiddenIndex] = withoutNewLine(refs[hiddenIndex]);
                });
            }
            lineStarts = [];
        }
    });
    return refs;
};

/** What an embed editor's Save sends */
export const buildEmbedDashboardUpdate = ({
    dashboard,
    name,
    tiles,
    tabs,
    filters,
    filterLabelOverrides,
    filtersInteractivity,
    isAddFilterDisabled,
    isDateZoomDisabled: editedIsDateZoomDisabled,
    controlDrafts,
}: Args): DashboardVersionedFields & DashboardUnversionedFields => {
    const isDateZoomDisabled =
        editedIsDateZoomDisabled ??
        dashboard.config?.isDateZoomDisabled ??
        false;
    if (controlDrafts === null) {
        return {
            tiles,
            filters: keepHiddenFilters(
                restoreFilterLabelOverrides(
                    filters,
                    dashboard.filters,
                    filterLabelOverrides,
                ),
                dashboard.filters,
                filtersInteractivity,
            ),
            name,
            tabs,
            config: {
                ...dashboard.config,
                isDateZoomDisabled,
                isAddFilterDisabled,
            },
            parameters: dashboard.parameters,
        };
    }

    const dateZoomConfigToSave = getDateZoomConfigToSave({
        existingConfig: dashboard.config,
        dateZoomConfig: controlDrafts.dateZoomConfig,
        hasDateZoomConfigChanged: controlDrafts.hasDateZoomConfigChanged,
    });
    const controlsToSave = getControlsToSave({
        controlOrder: controlDrafts.controlOrder,
        hasControlOrderChanged: controlDrafts.hasControlOrderChanged,
        dimensions: getDimensionFiltersToSave(filters.dimensions, true),
        metrics: filters.metrics,
        controlSections: controlDrafts.controlSections,
        haveControlSectionsChanged: controlDrafts.haveControlSectionsChanged,
        dateZoomConfigToSave,
        parameterInputs: {
            parameterControls: controlDrafts.parameterControls,
            areParameterControlsSaved: controlDrafts.areParameterControlsSaved,
            haveParameterControlsChanged:
                controlDrafts.haveParameterControlsChanged,
            existingParameterControls:
                dashboard.config?.parameterControls ?? null,
            parameterPicks: controlDrafts.parameterPicks,
            // Without controls to write, the parameters stay as loaded
            appliedParameters: dashboard.parameters ?? {},
            savedParameters: dashboard.parameters ?? {},
        },
    });

    // The controls the written order places outside every section
    const barKeys = new Set(
        reconcileDashboardControlOrder({
            controlOrder: controlsToSave.controlOrderToSave ?? undefined,
            filters: {
                dimensions: controlsToSave.dimensions,
                metrics: controlsToSave.metrics,
            },
            parameterControls: controlDrafts.parameterControls ?? [],
            sections: controlsToSave.controlSections,
            dateZoomControls: dateZoomConfigToSave?.controls ?? [],
        })
            .filter(({ sectionId }) => sectionId === null)
            .map(({ kind, id }) => `${kind}:${id}`),
    );

    return {
        tiles,
        filters: keepHiddenFilters(
            restoreFilterLabelOverrides(
                {
                    // A reorder (another kind's move) never rearranges hidden rules
                    dimensions: controlDrafts.areFiltersShown
                        ? controlsToSave.dimensions
                        : filters.dimensions,
                    metrics: controlDrafts.areFiltersShown
                        ? controlsToSave.metrics
                        : filters.metrics,
                    tableCalculations: filters.tableCalculations,
                },
                dashboard.filters,
                filterLabelOverrides,
            ),
            dashboard.filters,
            filtersInteractivity,
        ),
        name,
        tabs,
        config: {
            ...dashboard.config,
            ...buildDashboardConfig({
                existingConfig: dashboard.config,
                isDateZoomDisabled,
                isAddFilterDisabled,
                pinnedParameters: [],
                parameterOrder: [],
                hasParameterOrderChanged: false,
                dateZoomGranularities: controlDrafts.dateZoomGranularities,
                haveDateZoomGranularitiesChanged:
                    controlDrafts.haveDateZoomGranularitiesChanged,
                defaultDateZoomGranularity:
                    controlDrafts.defaultDateZoomGranularity,
                hasDefaultDateZoomGranularityChanged:
                    controlDrafts.hasDefaultDateZoomGranularityChanged,
                dateZoomConfig: controlDrafts.dateZoomConfig,
                hasDateZoomConfigChanged:
                    controlDrafts.hasDateZoomConfigChanged,
                requiredFiltersNote: controlDrafts.requiredFiltersNote,
                controlSections: controlsToSave.controlSections,
                haveControlSectionsChanged:
                    controlsToSave.haveControlSectionsChanged,
                // Null carries the loaded list forward, in its loaded order
                parameterControlsToSave: controlDrafts.areParametersAllowed
                    ? controlsToSave.parameterControlsToSave
                    : null,
                controlOrderToSave: keepHiddenRefs(
                    controlsToSave.controlOrderToSave,
                    dashboard.config?.controlOrder,
                    getHiddenFilterIds(dashboard.filters, filtersInteractivity),
                    ({ kind, id }) => barKeys.has(`${kind}:${id}`),
                ),
            }),
            // Never seeded in the embed's store: as loaded
            pinnedParameters: dashboard.config?.pinnedParameters,
        },
        parameters: controlDrafts.areParametersAllowed
            ? controlsToSave.parameters
            : dashboard.parameters,
    };
};
