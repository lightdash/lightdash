# Dependency Status Scope Filter Design

## Goal

Let custom-role authors filter the visible permissions by dependency completion status using the existing footer counts, and restore the “Role type” wording.

## Interaction

- The `full`, `partial`, and `empty` dependency counts become accessible toggle buttons.
- At most one status is active.
- Clicking an inactive status activates it, clicking another status switches the filter, and clicking the active status clears it.
- The active status remains selected when the Role Type changes; the visible permissions and counts recompute for the new type.
- Dependency status and permission text search combine with AND semantics.
- Counts always show totals for the current Role Type and do not change in response to text or status filters.
- If no permission matches both filters, the existing empty-result presentation is shown.

## Implementation Shape

`RoleBuilder` owns the active dependency-status filter because it renders the footer controls. It passes the selected status into `ScopeSelector`, which composes the status predicate with its existing debounced text filter. Status classification reuses the existing `full | partial | empty` utility semantics so counts and filtering cannot drift.

The footer controls expose their selected state with `aria-pressed` and retain the existing status icon, label, and count. The role-selection heading and locked-role hint change from “Role scope” to “Role type.”

## State and Data Flow

1. `RoleBuilder` computes dependency counts from the current Role Type and selected scopes as it does today.
2. A footer click updates the single optional status filter.
3. `ScopeSelector` receives the status and derives visible permissions by applying both the debounced search term and dependency-status predicate.
4. Role form values remain unchanged; filtering affects presentation only.

## Error and Edge Cases

- Permissions without dependencies remain `full`, matching the existing count behavior.
- A status with a zero count remains clickable and produces the normal empty-result state when selected.
- Switching Role Type may produce zero matches while retaining the active status; clearing the toggle restores all permissions for that type.
- Filtering must not mutate selections or leave the selected group and visible permission panel inconsistent.

## Testing

- Unit-test status filtering for `full`, `partial`, and `empty`, including permissions without dependencies.
- Test selecting, switching, and clearing the single active status.
- Test AND composition with text search and the zero-result case.
- Test that changing Role Type preserves the filter while recomputing results.
- Test that filtering does not modify form selections and that counts remain unfiltered totals.
- Verify “Role type” appears in both the editable heading and locked-role hint.
