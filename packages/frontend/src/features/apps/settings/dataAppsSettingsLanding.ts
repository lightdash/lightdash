/** Where the Data apps settings group lands: a page this user can reach. */
export const getDataAppsSettingsLanding = ({
    canOpenGeneral,
    canManageThemes,
}: {
    canOpenGeneral: boolean;
    canManageThemes: boolean;
}): string | null => {
    if (canOpenGeneral) return '/generalSettings/dataApps/general';
    if (canManageThemes) return '/generalSettings/dataApps/themes';
    return null;
};
