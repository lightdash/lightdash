import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardParameterControl,
    type DashboardTile,
    type ParameterValue,
} from '@lightdash/common';
import { createContext, useContext } from 'react';
import { type ControlDraft } from './controlDraft';
import { getControlTypeWord, type ControlType } from './controlType';
import { type DisplayLabel, type LabelledItem } from './labels';
import {
    getMappableSummary,
    type ControlOverview,
    type OverviewTile,
} from './overview';
import { getControlTileKind } from './tiles';

export type ControlItem = { id: string; display: DisplayLabel };

// What one tile's mapping block shows for the control being edited
export type ControlTileState =
    | { status: 'loading' }
    | { status: 'none' }
    // No field of its own: the tile takes the control or not
    | { status: 'switch'; isOn: boolean }
    | { status: 'unmapped'; options: ControlItem[] }
    | {
          status: 'mapped';
          itemId: string;
          display: DisplayLabel;
          options: ControlItem[];
      };

export type TileRunValue = {
    text: string;
    isMissing: boolean;
    // Taking a tile out reaches its query only once the dashboard is saved
    isAppliedOnSave: boolean;
};

// The draft seen through its mappings: counts for the panel, the tab bar and
// the mapping blocks on the tiles, with the changes each of them can make
export type ControlModel = {
    noun: 'field' | 'parameter';
    // Fields or parameter references still loading: nothing can be mapped yet
    isLoading: boolean;
    overview: ControlOverview;
    overviewTiles: OverviewTile[];
    // Every field or parameter in play, by id
    items: Record<string, LabelledItem>;
    // How the mapped and suggested ones read, as one set
    rowLabels: Record<string, DisplayLabel>;
    tileStates: Record<string, ControlTileState>;
    // The field a filter control's settings are driven by
    field: DashboardFilterableField | undefined;
    // Maps every unmapped tile that has it
    addItem: (id: string) => void;
    // Unmaps every tile mapped to it
    removeItem: (id: string) => void;
    // Maps or unmaps one tile
    setTileItem: (tileUuid: string, id: string | null) => void;
    // Switches a tile with no field of its own on or off
    setTileOn: (tileUuid: string, isOn: boolean) => void;
    // The field behind an id, for filter controls; none for SQL columns
    getField: (id: string) => DashboardFilterableField | undefined;
    // Whether an id is a SQL chart's column: it has no field behind it
    isSqlColumn: (id: string) => boolean;
    // The value a tile runs with, for parameter controls
    getTileRunValue: (tileUuid: string) => TileRunValue | null;
};

export type ControlTab = { uuid: string; name: string };

export type MapsTo = 'filter' | 'parameter';

export type ControlPopoverTab = 'settings' | 'mapsTo';

// One tile to bring into view; a new object for every click that asks
export type ScrollRequest = { tileUuid: string };

export type DashboardControlsContextType = {
    isEnabled: boolean;
    isEditMode: boolean;
    // View mode with the surface on: a control is a temporary filter, drafted
    // and applied for the visit only
    draftsTemporaryFilters: boolean;
    draft: ControlDraft | null;
    model: ControlModel | null;
    // The existing control being edited, if any
    selectedId: string | null;
    tabs: ControlTab[];
    // A new control with nothing chosen: the popover asks what it filters by
    isChoosing: boolean;
    // The parameters that first step offers beside the fields; none while
    // viewing, where a control is a temporary filter
    choiceParameterModel: ControlModel | null;
    // Answers the first step with a field or a parameter
    choose: (kind: MapsTo, id: string) => void;
    // Where the focus goes after a choice, once: the value input or the tab
    takeChoiceFocus: () => 'value' | 'tab' | null;
    openNew: (controlType: ControlType) => void;
    // The open control's popover: open, or shrunk to its footer. Either way
    // the control stays open with its draft.
    isPopoverOpen: boolean;
    // "Apply or cancel first": something else was pressed while the draft
    // has changes. Ends with the next change or press inside the popover.
    isGuardNoticeShown: boolean;
    clearGuardNotice: () => void;
    popoverTab: ControlPopoverTab;
    setPopoverTab: (tab: ControlPopoverTab) => void;
    isSubPopoverOpen: boolean;
    subPopoverProps: { onOpen: () => void; onClose: () => void };
    hidePopover: () => void;
    showPopover: () => void;
    // Shrinks it for a press outside or Escape; a press on a dashboard tab
    // is not one
    dismissPopover: () => void;
    togglePopover: () => void;
    // True when the draft has changes: the popover opens instead of whatever
    // was about to take the control's place
    holdOpenControl: () => boolean;
    toggleFilter: (filterId: string) => void;
    toggleParameter: (controlId: string) => void;
    // A new parameter control with one tile and one parameter in its draft
    openForTileParameter: (tileUuid: string, key: string) => void;
    // Whether the draft differs from what the control started as
    hasChanges: boolean;
    // The settings tab's changes to the draft
    setLabel: (label: string) => void;
    setFilterSettings: (rule: DashboardFilterRule) => void;
    setParameterValue: (value: ParameterValue | null) => void;
    // Writes the whole draft to the dashboard's unsaved edit state and closes
    apply: () => void;
    // Drops the draft and closes
    cancel: () => void;
    parameterControls: DashboardParameterControl[];
    removeParameterControl: (controlId: string) => void;
    // Puts a tile's parameter under an existing control
    mapTileToParameterControl: (
        controlId: string,
        tileUuid: string,
        key: string,
    ) => void;
    // Tiles showing their chart under their mapping
    previewTileUuids: string[];
    togglePreview: (tileUuid: string) => void;
    // Shown tiles and the ones hovered, outlined alike
    highlightedTileUuids: string[];
    // The field or parameter whose tile count was clicked, and its tiles on
    // every dashboard tab; kept until clicked again or the mappings change
    shownItemId: string | null;
    // That line as the popover names it
    shownItemName: string | null;
    shownTileUuids: string[];
    showTiles: (
        itemId: string,
        name: string,
        tileUuids: string[],
        scrollToTileUuid: string,
    ) => void;
    clearShownTiles: () => void;
    scrollRequest: ScrollRequest | null;
    // True the first time a request is taken: it scrolls once
    takeScrollRequest: (request: ScrollRequest) => boolean;
    // Hovering highlights until the pointer leaves
    hoverTiles: (tileUuids: string[]) => void;
    // Starts loading the parameter references of tiles that have not reported them
    requestParameterReferences: () => void;
};

const noop = () => {};

// Outside the dashboard page (embeds, minimal views) the surface is off
const DISABLED: DashboardControlsContextType = {
    isEnabled: false,
    isEditMode: false,
    draftsTemporaryFilters: false,
    draft: null,
    model: null,
    selectedId: null,
    tabs: [],
    isChoosing: false,
    choiceParameterModel: null,
    choose: noop,
    takeChoiceFocus: () => null,
    openNew: noop,
    isPopoverOpen: false,
    isGuardNoticeShown: false,
    clearGuardNotice: noop,
    popoverTab: 'settings',
    setPopoverTab: noop,
    isSubPopoverOpen: false,
    subPopoverProps: { onOpen: noop, onClose: noop },
    hidePopover: noop,
    showPopover: noop,
    dismissPopover: noop,
    togglePopover: noop,
    holdOpenControl: () => false,
    toggleFilter: noop,
    toggleParameter: noop,
    openForTileParameter: noop,
    hasChanges: false,
    setLabel: noop,
    setFilterSettings: noop,
    setParameterValue: noop,
    apply: noop,
    cancel: noop,
    parameterControls: [],
    removeParameterControl: noop,
    mapTileToParameterControl: noop,
    previewTileUuids: [],
    togglePreview: noop,
    highlightedTileUuids: [],
    shownItemId: null,
    shownItemName: null,
    shownTileUuids: [],
    showTiles: noop,
    clearShownTiles: noop,
    scrollRequest: null,
    takeScrollRequest: () => false,
    hoverTiles: noop,
    requestParameterReferences: noop,
};

export const DashboardControlsContext =
    createContext<DashboardControlsContextType>(DISABLED);

export const useDashboardControls = () => useContext(DashboardControlsContext);

// What the "M" of the open control's "N of M" counts, on the whole dashboard
// or on one of its tabs
export const useMappableSummary = (tabUuid: string | null): string => {
    const { draft, model } = useDashboardControls();
    if (!draft || !model) return '';
    return getMappableSummary({
        tiles: model.overviewTiles,
        tabUuid,
        typeWord: getControlTypeWord(draft.controlType),
        noun: model.noun,
    });
};

// Whether dashboard tabs keep room for the open control's count: wherever a
// control can be opened
export const useHasControlTabSlot = (): boolean => {
    const { isEnabled, isEditMode, draftsTemporaryFilters } =
        useDashboardControls();
    return isEnabled && (isEditMode || draftsTemporaryFilters);
};

export const useIsControlTileHighlighted = (tileUuid: string): boolean =>
    useDashboardControls().highlightedTileUuids.includes(tileUuid);

// Whether the tile shows a control's mapping instead of its chart
export const useIsTileHostingControl = (
    tile: Pick<DashboardTile, 'type'>,
): boolean => {
    const { draft } = useDashboardControls();
    return draft !== null && getControlTileKind(tile) !== null;
};
