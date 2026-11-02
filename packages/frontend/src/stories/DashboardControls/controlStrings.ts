// The prototype's new copy in one place. Viewers and embeds see some of it,
// and those strings need a `DEFAULT_UI_STRINGS` key (and both locale bundles)
// at graduation; the rest is editor-only and stays literal, as the rail's.
//
// Viewer-visible, proposed keys:
//   onTheBar             -> filters.picker.onTheBar
//   noTiles              -> filters.rail.noTiles
//   operatorLabel        -> filters.rail.operatorLabel
//   sets                 -> parameters.control.sets
//   setsNoTiles          -> parameters.control.setsNoTiles
//   clearedUsesDefault   -> parameters.control.clearedUsesDefault
//   clearedUsesOwnValue  -> parameters.control.clearedUsesOwnValue
// "Add filter" and "Search fields" already have keys (`filters.addFilter`,
// `filters.rail.searchFields`) and are read through `useUiStrings`.
export const CONTROL_STRINGS = {
    add: 'Add',
    kindFilter: 'Filter',
    kindFilterHelper: 'Narrow the data in tiles by a field',
    kindParameter: 'Parameter',
    kindParameterHelper: 'Set a value that tiles use',
    searchParameters: 'Search parameters',
    noMatchingParameters: 'No matching parameters',
    onTheBar: 'On the bar',
    noTiles: 'no tiles',
    operatorLabel: 'Operator: {operator}',
    allowSeveralValues: 'Allow several values',
    severalValuesHelper: 'Viewers can pick several values',
    oneValueHelper: 'Viewers pick one value',
    sets: 'Sets {tiles}',
    // Apply's reason at no tiles: an editor can choose some, a viewer cannot
    chooseAtLeastOneTile: 'Choose at least one tile',
    setsNoTiles: 'Sets no tiles',
    projectGroup: 'Project',
    clearedUsesDefault: 'If cleared, tiles use the default, {value}.',
    clearedUsesOwnValue: 'If cleared, each tile uses its own value.',
} as const;
