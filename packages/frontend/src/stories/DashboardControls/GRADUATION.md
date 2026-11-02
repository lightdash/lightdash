# Graduation: copies of unexported shipped code

The prototype reuses shipped components where it can. Where a shipped helper
is not exported (or is bound to the controls sidebar provider), the prototype
holds a copy. At graduation, export each shipped original (a pure move) and
delete the copy here. Fix behaviour in the shipped piece, never in a copy.

| Copy in this folder                                                                          | Shipped original                                                                                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `focus.ts` `focusValue`, `focusValueOnMount`, `focusStringValueOnMount`                      | `src/features/dashboardControls/FilterSettings.tsx` (`focusValue`, `focusValueOnMount`, `focusStringValueOnMount`)           |
| `focus.ts` `focusAnswerOnMount`, `focusStartOnMount`                                         | `src/features/dashboardControls/FilterEditor.tsx`                                                                            |
| `FilterPopover.tsx` `getInputs`, `useRuleEdits`, `ValueBody` (value rules, refusal, refocus) | `src/features/dashboardControls/FilterValueSettings.tsx`                                                                     |
| `FilterPopover.tsx` `ValueBody` viewer clear X                                               | `src/features/dashboardFilters/FilterConfiguration/FilterValueSection.tsx`                                                   |
| `MoveButtons.tsx`                                                                            | `src/features/dashboardControls/FilterSettings.tsx` (`MoveButtons`, bound to `useControlsSidebarSelector`)                   |
| `settingsSummary.ts` `isMissingRequiredValue`                                                | `src/features/dashboardControls/useApplyBlockedReason.ts`                                                                    |
| `settingsSummary.ts` `getSettingsSummary` and its lock and required summaries                | `src/features/dashboardControls/railSummaries.ts` as it shipped before the popover replaced the rail (no longer in the tree) |
| `ParameterControlPopover.tsx` `formatValue` (date display)                                   | `src/features/parameters/components/Parameter.tsx` (`displayValue`)                                                          |
| `ControlPicker.tsx` row heights, list height, virtual list                                   | `src/features/dashboardFilters/FilterConfiguration/FilterFieldSelect/index.tsx`                                              |
| `usePickerSearch.ts` 150 ms debounce                                                         | `src/features/dashboardFilters/FilterConfiguration/FilterFieldSelect/index.tsx`                                              |

New copy that viewers see needs `DEFAULT_UI_STRINGS` keys: see `controlStrings.ts`.
