// The prototype's genuinely new copy. Existing registry keys are reused as
// they are through `useUiStrings` (Add, Add filter, Search fields, tile counts,
// Choose tiles, Applies to, Cancel, Apply); Rename, Settings and No section stay
// literal, as in the shipped `FilterEditor.tsx`.
//
// Viewers and embeds see these, so each needs a `DEFAULT_UI_STRINGS` key (and
// both locale bundles) at graduation. Proposed keys sit under `controls.*`,
// clear of the existing `controls.*` names:
//   onTheBar                 -> controls.onTheBar
//   operatorLabel            -> controls.operatorLabel
//   sets                     -> controls.sets (twin of controls.appliesTo)
//   setsNoTiles              -> controls.setsNoTiles
//   clearedUsesDefault       -> controls.parameter.clearedUsesDefault
//   clearedUsesOwnValue      -> controls.parameter.clearedUsesOwnValue
//
// Editor-only, literal for now; if they ever get keys:
//   kindFilter, kindFilterHelper, kindParameter, kindParameterHelper,
//   projectGroup, allowMultipleValues, multipleValuesHelper, oneValueHelper,
//   labelForField, filterLabel (the name input's placeholder),
//   notAppliedToAnyTiles     -> controls.parameter.notAppliedToAnyTiles
//                               (twin of filters.notAppliedToAnyTiles)
//   searchParameters         -> controls.searchParameters
//                               (twin of controls.searchFields)
//   noMatchingParameters     -> controls.noMatchingParameters
//                               (twin of filters.config.noMatchingFields)
export const CONTROL_STRINGS = {
    kindFilter: 'Filter',
    kindFilterHelper: 'Narrow the data in tiles by a field',
    kindParameter: 'Parameter',
    kindParameterHelper: 'Set a value that tiles use',
    searchParameters: 'Search parameters',
    noMatchingParameters: 'No matching parameters',
    onTheBar: 'On the bar',
    operatorLabel: 'Operator: {operator}',
    allowMultipleValues: 'Allow multiple values',
    multipleValuesHelper: 'Viewers can pick multiple values',
    oneValueHelper: 'Viewers pick one value',
    sets: 'Sets {tiles}',
    // Apply's reason at no tiles, as the filter's: an editor's, and a viewer's
    // that does not point at Choose tiles, which a viewer does not have
    notAppliedToAnyTiles: 'This parameter is not applied to any tiles',
    setsNoTiles: 'Sets no tiles',
    projectGroup: 'Project',
    labelForField: 'Label for {field}',
    filterLabel: 'Filter label',
    clearedUsesDefault: 'If cleared, tiles use the default, {value}.',
    clearedUsesOwnValue: 'If cleared, each tile uses its own value.',
} as const;
