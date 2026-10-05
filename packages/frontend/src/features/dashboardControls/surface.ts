// Whether view mode drafts temporary filters as controls. Embeds keep
// today's popover, and so does the compact bar: its drawer covers the tiles.
// A control that is open keeps the surface when the window narrows.
export const getDraftsTemporaryFilters = ({
    isEnabled,
    isEditMode,
    isEmbedded,
    isCompact,
    hasOpenControl,
}: {
    isEnabled: boolean;
    isEditMode: boolean;
    isEmbedded: boolean;
    isCompact: boolean;
    hasOpenControl: boolean;
}): boolean =>
    isEnabled && !isEditMode && !isEmbedded && (!isCompact || hasOpenControl);

// Whether a filter pill opens as a control (draft, popover, tile pickers)
// rather than today's filter popover: saved filters while editing, temporary
// ones while viewing
export const opensAsControl = ({
    isEnabled,
    draftsTemporaryFilters,
    isEditMode,
    isTemporary,
}: {
    isEnabled: boolean;
    draftsTemporaryFilters: boolean;
    isEditMode: boolean;
    isTemporary: boolean;
}): boolean =>
    isEditMode
        ? isEnabled && !isTemporary
        : draftsTemporaryFilters && isTemporary;
