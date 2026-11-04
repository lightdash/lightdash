// The prototype's editor-only copy, literal as the shipped editor's. Copy
// viewers see is in `DEFAULT_UI_STRINGS` (`controls.*`), read through
// `useUiStrings`. If these ever get keys:
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
    // Apply's reason at no tiles, as the filter's: an editor's, and a viewer's
    // that does not point at Choose tiles, which a viewer does not have
    notAppliedToAnyTiles: 'This parameter is not applied to any tiles',
    projectGroup: 'Project',
} as const;
