// Selectors the rail and the provider move focus with; the elements set the
// attributes

/** The rail header's "Add" menu button (`EditorShell`). */
export const RAIL_ADD_SELECTOR = '[data-controls-new-section]';
/** The expanded filter's label (`FilterEditor`). */
export const RAIL_LABEL_SELECTOR = '[data-controls-label]';
/** A closed row (`FilterRow`). */
export const railRowSelector = (filterId: string) =>
    `[data-controls-row="${filterId}"]`;
/** A section header's menu button (`SectionHeader`). */
export const sectionMenuSelector = (sectionId: string) =>
    `[data-controls-section="${sectionId}"] [data-controls-section-menu]`;
