/** Where the Data apps settings group lands: a page this user can reach. */
export const getDataAppsSettingsLanding = ({
    canManageOrganization,
    canManageThemes,
}: {
    canManageOrganization: boolean;
    canManageThemes: boolean;
}): string | null => {
    if (canManageOrganization) return '/generalSettings/dataApps/general';
    if (canManageThemes) return '/generalSettings/dataApps/themes';
    return null;
};
