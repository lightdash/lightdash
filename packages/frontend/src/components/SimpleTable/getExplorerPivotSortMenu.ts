export const getExplorerPivotSortMenu = <TMenu>({
    enableContextMenu,
    isEditMode,
    renderSortMenu,
}: {
    enableContextMenu: boolean;
    isEditMode: boolean;
    renderSortMenu: TMenu;
}): TMenu | undefined =>
    enableContextMenu && isEditMode ? renderSortMenu : undefined;
