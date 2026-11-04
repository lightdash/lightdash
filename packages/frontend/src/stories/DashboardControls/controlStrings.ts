// The prototype's editor-only copy, literal as the shipped editor's. Copy
// viewers see is in `DEFAULT_UI_STRINGS` (`controls.*`), read through
// `useUiStrings`. If these ever get keys:
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
    projectGroup: 'Project',
} as const;
