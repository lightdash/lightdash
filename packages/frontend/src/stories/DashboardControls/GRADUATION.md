# Graduation: copies of unexported shipped code

The prototype reuses shipped components where it can. Where a shipped helper
is not exported (or is bound to the controls sidebar provider), the prototype
holds a copy. At graduation, export each shipped original (a pure move) and
delete the copy here. Fix behaviour in the shipped piece, never in a copy.

| Copy in this folder                                        | Shipped original                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ControlPicker.tsx` row heights, list height, virtual list | `src/features/dashboardFilters/FilterConfiguration/FilterFieldSelect/index.tsx` |
| `usePickerSearch.ts` 150 ms debounce                       | `src/features/dashboardFilters/FilterConfiguration/FilterFieldSelect/index.tsx` |

Copy that viewers see is in `DEFAULT_UI_STRINGS` (`controls.*`); `controlStrings.ts`
holds the editor-only literals.

The shipped `ParameterInput`'s clear X is Mantine's, `aria-hidden` and
unlabelled (Backspace clears for keyboard users). Labelling it with the
existing `parameters.clear` key needs `clearButtonProps` on the shipped input.

Graduated: `ParameterControlPopover` is now
`src/features/dashboardControls/ParameterControlPopover.tsx` (the stories
render it through `StatefulPopovers.tsx`), and its date display is the shipped
pill's, exported as `features/parameters/utils/parameterDisplayValue.ts`.
