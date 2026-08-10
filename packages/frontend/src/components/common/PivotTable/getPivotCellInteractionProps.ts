type PivotCellInteractionOptions<TMenu> = {
    enabled: boolean;
    withInteractions: boolean | undefined;
    withMenu: TMenu;
};

export const getPivotCellInteractionProps = <TMenu>({
    enabled,
    withInteractions,
    withMenu,
}: PivotCellInteractionOptions<TMenu>): {
    withInteractions: boolean | undefined;
    withMenu: TMenu | undefined;
} => ({
    withInteractions: enabled ? withInteractions : undefined,
    withMenu: enabled ? withMenu : undefined,
});
